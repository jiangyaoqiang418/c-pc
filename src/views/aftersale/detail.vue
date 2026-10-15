<script setup lang="ts">
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
  <div class="aftersale-detail-page">
    <div class="aftersale-detail-content paper narrow" :aria-busy="loading">
      <template v-if="refund">
        <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/aftersale">我的仅退款</RouterLink><span>/</span><strong>{{ refund.orderNo || refund.refundId }}</strong></nav>
        <header class="refund-heading"><div><h1>售后处理进度</h1><p>订单 {{ refund.orderNo || '—' }} · 申请于 {{ formatTime(refund.appliedAt || refund.createdAt) }}</p></div><span class="pill status" :class="String(refund.status).toLowerCase()">{{ refund.statusText || labels[String(refund.status)] || refund.status }}</span></header>
        <section class="refund-section"><h2>退款信息</h2><dl><div><dt>退款金额</dt><dd class="amount">U {{ refund.amount ?? '—' }}</dd></div><div><dt>退款业务号</dt><dd>{{ refund.refundBizNo || '—' }}</dd></div><div><dt>订单申请前状态</dt><dd>{{ refund.orderStatusBefore || '—' }}</dd></div><div><dt>审核时间</dt><dd>{{ formatTime(refund.reviewedAt) }}</dd></div></dl></section>
        <section class="refund-section"><h2>退款原因</h2><p class="reason">{{ refund.reason || '—' }}</p><div v-if="refund.evidenceImages?.length" class="evidence"><button v-for="(url, index) in refund.evidenceImages" :key="`${url}:${index}`" type="button" :aria-label="`预览退款凭证 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="url" :alt="`退款凭证 ${index + 1}`" @error="setImageFallback" /></button></div></section>
        <section v-if="refund.reviewRemark" class="refund-section"><h2>平台审核说明</h2><p class="reason">{{ refund.reviewRemark }}</p></section>
        <footer class="button-row actions"><button type="button" class="outline"  @click="router.push({ name: 'order-detail', params: { id: String(refund.orderId) } })">查看订单</button><button type="button" v-if="canCancel"  class="danger outline" :disabled="cancelling || cancellationPending || loading" @click="cancel">{{ cancelling ? '撤销中…' : '撤销申请' }}</button></footer>
        <ImagePreview v-model="previewOpen" :images="refund.evidenceImages || []" :start-index="previewIndex" title="退款凭证" />
      </template>
      <div v-else-if="loading" class="skeletons"><Skeleton class="h-36" /><Skeleton class="h-52" /><Skeleton class="h-52" /></div>
      <EmptyState v-else :title="loadError || '退款申请不存在'" :action-text="loadError ? '重新加载' : '返回售后列表'" @action="loadError ? load() : router.push('/aftersale')" />
    </div>
  </div>
</template>

<style scoped>
.refund-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; }
.refund-heading p { margin-top:12px; }.refund-section { margin:24px 0; padding-top:20px; border-top:1px solid var(--line); }
.refund-section h2 { margin-bottom:16px; }dl { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:0; }dt { font-size:13px; color:var(--muted); }dd { margin:4px 0 0; overflow-wrap:anywhere; }.amount { font-size:24px; }
.reason { white-space:pre-wrap; overflow-wrap:anywhere; }.evidence { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }.evidence button { border:1px solid var(--line); border-radius:6px; padding:0; overflow:hidden; cursor:zoom-in; }.evidence img { width:100px; height:100px; object-fit:cover; }
.actions { justify-content:flex-end; }.danger { color:var(--yb-danger); }.skeletons { display:grid; gap:18px; }
@media (max-width:700px) { dl { grid-template-columns:1fr; } }
</style>
