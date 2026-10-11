<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import EmptyState from '@/components/common/empty-state.vue';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';

const route = useRoute(); const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const refund = ref<Api.RealRefund.RefundDTO>(); const loading = ref(false); const loadError = ref(''); const cancelling = ref(false); const cancellationPending = ref(false);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
const labels: Record<string, string> = { APPLYING: '待平台审核', AGREED: '平台已同意退款', REJECTED: '平台已驳回', CANCELED: '买家已撤销' };
const canCancel = computed(() => String(refund.value?.status) === 'APPLYING');
const formatTime = (value?: string | number) => formatDateValue(value);
async function load() {
  const isCurrent = requestGuard.begin();
  const requestedId = id.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    refund.value = undefined;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const nextRefund = await refundApi.fetchRefundDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    refund.value = nextRefund;
  } catch {
    if (!isCurrent()) return;
    refund.value = undefined;
    loadError.value = '退款申请详情加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load); onBeforeUnmount(() => { writeVersion += 1; confirmationModal?.close(); requestGuard.invalidate(); });
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
  refund.value = undefined;
  cancelling.value = false;
  cancellationPending.value = false;
  void load();
});
function cancel() {
  if (!refund.value || !canCancel.value || loading.value || cancelling.value || cancellationPending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const refundId = refund.value.refundId;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(refund.value?.refundId) === String(refundId);
  cancellationPending.value = true;
  confirmationModal = Modal.confirm({
    title: '撤销仅退款申请？',
    content: '撤销后订单将恢复到申请前状态。',
    okButtonProps: { status: 'danger' },
    onCancel() { if (!isCurrentWrite()) return; writeVersion += 1; cancellationPending.value = false; },
    async onOk() {
      if (!isCurrentWrite() || !canCancel.value || loading.value) {
        if (operation === writeVersion) cancellationPending.value = false;
        return;
      }
      cancelling.value = true;
      try {
        await refundApi.cancelRefund(refundId);
        if (!isCurrentWrite()) return;
        Message.success('已撤销退款申请');
        await load();
      } catch {
        if (isCurrentWrite()) Message.error('撤销退款申请失败，请稍后重试');
      } finally {
        if (operation === writeVersion) {
          cancelling.value = false;
          cancellationPending.value = false;
        }
      }
    }
  });
}


const previewOpen = ref(false);
const previewIndex = ref(0);
watch([id, () => userStore.currentUser?.id], () => { previewOpen.value = false; });
</script>

<template>
  <div class="aftersale-detail-page shop-container">
    <div class="aftersale-detail-content" :aria-busy="loading">
      <template v-if="refund">
        <nav class="bread" aria-label="面包屑"><RouterLink to="/aftersale">我的仅退款</RouterLink><span>/</span><strong>{{ refund.orderNo || refund.refundId }}</strong></nav>
        <header class="hero-card"><div><span class="eyebrow">REFUND DETAILS</span><h1>仅退款申请</h1><p>订单 {{ refund.orderNo || '—' }} · 申请于 {{ formatTime(refund.appliedAt || refund.createdAt) }}</p></div><span class="status" :class="String(refund.status).toLowerCase()">{{ refund.statusText || labels[String(refund.status)] || refund.status }}</span></header>
        <section class="step-card"><h2>退款信息</h2><dl><div><dt>退款金额</dt><dd class="amount">U {{ refund.amount ?? '—' }}</dd></div><div><dt>退款业务号</dt><dd>{{ refund.refundBizNo || '—' }}</dd></div><div><dt>订单申请前状态</dt><dd>{{ refund.orderStatusBefore || '—' }}</dd></div><div><dt>审核时间</dt><dd>{{ formatTime(refund.reviewedAt) }}</dd></div></dl></section>
        <section class="step-card"><h2>退款原因</h2><p class="reason">{{ refund.reason || '—' }}</p><div v-if="refund.evidenceImages?.length" class="evidence"><button v-for="(url, index) in refund.evidenceImages" :key="`${url}:${index}`" type="button" :aria-label="`预览退款凭证 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="url" :alt="`退款凭证 ${index + 1}`" @error="setImageFallback" /></button></div></section>
        <section v-if="refund.reviewRemark" class="step-card"><h2>平台审核说明</h2><p class="reason">{{ refund.reviewRemark }}</p></section>
        <footer class="actions"><Button variant="outline" @click="router.push({ name: 'order-detail', params: { id: String(refund.orderId) } })">查看订单</Button><Button v-if="canCancel" variant="outline" class="danger" :disabled="cancelling || cancellationPending || loading" @click="cancel">{{ cancelling ? '撤销中…' : '撤销申请' }}</Button></footer>
        <ImagePreview v-model="previewOpen" :images="refund.evidenceImages || []" :start-index="previewIndex" title="退款凭证" />
      </template>
      <div v-else-if="loading" class="skeletons"><Skeleton class="h-36" /><Skeleton class="h-52" /><Skeleton class="h-52" /></div>
      <EmptyState v-else :title="loadError || '退款申请不存在'" :action-text="loadError ? '重新加载' : '返回售后列表'" @action="loadError ? load() : router.push('/aftersale')" />
    </div>
  </div>
</template>

<style scoped>
.aftersale-detail-page { padding-top:32px; padding-bottom:48px; }.aftersale-detail-content { width:100%; max-width:800px; margin:0 auto; }.bread { display:flex; align-items:center; gap:14px; margin-bottom:24px; color:var(--yb-muted); font-size:13px; overflow-wrap:anywhere; }.bread a:hover { color:var(--yb-brand-primary); }.bread strong { color:var(--yb-ink); font-weight:500; }.hero-card { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:28px; margin-bottom:20px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-paper); }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:6px 0 8px; font-size:26px; font-weight:650; }.hero-card p { margin:0; color:var(--yb-muted); font-size:13px; }.step-card { padding:28px; margin-bottom:18px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-paper); }h2 { margin:0 0 22px; font-size:18px; font-weight:600; }dl { margin:0; display:grid; grid-template-columns:1fr 1fr; gap:22px 28px; }dl>div { min-width:0; }dt { color:var(--yb-muted); font-size:13px; margin-bottom:6px; }dd { margin:0; overflow-wrap:anywhere; font-size:15px; }.amount { font-size:23px; font-weight:600; }.reason { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--yb-ink-2); line-height:1.8; }.evidence { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }.evidence button { overflow:hidden; border:1px solid var(--yb-hairline); border-radius:6px; padding:0; background:var(--yb-fill); cursor:zoom-in; }.evidence img { display:block; width:100px; height:100px; object-fit:cover; transition:transform .2s; }.evidence button:hover img { transform:scale(1.03); }.evidence button:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.actions { display:flex; justify-content:flex-end; gap:16px; margin-top:26px; }.danger { color:var(--destructive); }.status { padding:5px 10px; border-radius:5px; background:var(--yb-fill); color:var(--yb-muted); font-size:13px; white-space:nowrap; }.status.applying { background:#fff3df; color:#9a5709; }.status.agreed { background:#e9f3eb; color:#326b43; }.status.rejected { background:#fcecea; color:#ad453e; }.skeletons { display:grid; gap:18px; }@media(max-width:700px) { .hero-card { flex-wrap:wrap; }dl { grid-template-columns:1fr; }.step-card { padding:22px; } }@media(prefers-reduced-motion:reduce) { .evidence img { transition:none; }.evidence button:hover img { transform:none; } }
</style>
