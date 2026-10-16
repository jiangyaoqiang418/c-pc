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
import { isDefinitiveRejection } from '@/service/request/type';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';

const route = useRoute(); const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const refund = ref<Api.RealRefund.RefundDTO>(); const loading = ref(false); const loadError = ref(''); const cancelling = ref(false); const cancellationPending = ref(false);
const unknownCancellations = new Set<string>();
const cancellationUnknown = ref(false);
const requestGuard = createLatestRequestGuard(() => `${id.value}:${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
const labels: Record<string, string> = { CONFIRMING: '待买手确认', APPLYING: '待平台审核', AGREED: '平台已同意退款', REJECTED: '平台已驳回', CANCELED: '买家已撤销' };
const canCancel = computed(() => userStore.currentUser?.id !== undefined
  && String(refund.value?.buyerId) === String(userStore.currentUser.id) && ['CONFIRMING', 'APPLYING'].includes(String(refund.value?.status)));
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
    if (String(nextRefund.refundId) !== requestedId) throw new Error('退款详情对象不一致');
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
watch([() => route.params.id, () => userStore.currentUser?.id, () => userStore.sessionVersion, () => userStore.currentAudience], ([nextId, nextUserId, nextSession, nextAudience], [prevId, prevUserId, prevSession, prevAudience]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId) && nextSession === prevSession && nextAudience === prevAudience) return;
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
  cancellationUnknown.value = unknownCancellations.has(`${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${id.value}`);
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
  const orderId = refund.value.orderId;
  const operation = ++writeVersion;
  const requestedSession = userStore.sessionVersion;
  const pendingKey = `${String(requestedUserId)}:${requestedSession}:${String(refundId)}`;
  const isCurrentWrite = () => operation === writeVersion && userStore.sessionVersion === requestedSession
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && String(refund.value?.refundId) === String(refundId);
  const validDetail = (next: Api.RealRefund.RefundDTO) => String(next.refundId) === String(refundId)
    && String(next.buyerId) === String(requestedUserId) && String(next.orderId) === String(orderId);
  async function recoverCancellation() {
    unknownCancellations.add(pendingKey);
    cancellationUnknown.value = true;
    try {
      const latest = await refundApi.fetchRefundDetail(refundId);
      if (!isCurrentWrite()) return;
      if (!validDetail(latest) || !['CONFIRMING', 'APPLYING', 'CANCELED', 'AGREED', 'REJECTED'].includes(String(latest.status))) throw new Error('原退款申请状态未确认');
      refund.value = latest;
      unknownCancellations.delete(pendingKey);
      cancellationUnknown.value = false;
      if (latest.status === 'CANCELED') Message.success('已核对到撤销结果');
      else if (canCancel.value) Message.warning('尚未核对到撤销结果；原申请仍可撤销，请重新核对后确认');
      else Message.warning('原申请状态已更新，当前不可撤销，请查看处理进度');
    } catch {
      if (isCurrentWrite()) Message.warning('撤销结果待核实，请先核对原申请，暂不重复提交');
    }
  }
  if (unknownCancellations.has(pendingKey)) {
    cancelling.value = true;
    void recoverCancellation().finally(() => { if (isCurrentWrite()) cancelling.value = false; });
    return;
  }
  cancellationPending.value = true;
  confirmationModal = Modal.confirm({
    title: '撤销仅退款申请？',
    content: '撤销后订单将恢复到申请前状态。',
    okButtonProps: { status: 'danger' },
    onCancel() { if (!isCurrentWrite()) return; writeVersion += 1; cancellationPending.value = false; },
    async onOk() {
      if (!isCurrentWrite() || !canCancel.value || loading.value) {
        if (operation === writeVersion && userStore.sessionVersion === requestedSession) cancellationPending.value = false;
        return;
      }
      cancelling.value = true;
      let submitted = false;
      try {
        const latest = await refundApi.fetchRefundDetail(refundId);
        if (!isCurrentWrite()) return;
        if (!validDetail(latest) || !['CONFIRMING', 'APPLYING'].includes(String(latest.status))) {
          if (validDetail(latest)) refund.value = latest;
          Message.warning('退款申请状态或归属已变化，请重新核对');
          return;
        }
        submitted = true;
        const canceledId = await refundApi.cancelRefund(refundId);
        if (!isCurrentWrite()) return;
        if (String(canceledId) !== String(refundId)) throw new Error('撤销回执尚未核对');
        Message.success('已撤销退款申请');
        await load();
      } catch (error) {
        if (!isCurrentWrite()) return;
        if (!submitted) Message.warning('原申请读取失败，本次尚未提交撤销，请重新核对');
        else if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '撤销申请未被接受');
        else await recoverCancellation();
      } finally {
        if (operation === writeVersion && userStore.sessionVersion === requestedSession) {
          cancelling.value = false;
          cancellationPending.value = false;
        }
      }
    }
  });
}


const previewOpen = ref(false);
const previewIndex = ref(0);
watch([id, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => { previewOpen.value = false; });
</script>

<template>
  <div class="aftersale-detail-page">
    <div class="aftersale-detail-content paper narrow" :aria-busy="loading">
      <template v-if="refund">
        <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/aftersale">我的仅退款</RouterLink><span>/</span><strong>{{ refund.orderNo || refund.refundId }}</strong></nav>
        <header class="refund-heading"><div><h1>售后处理进度</h1><p>订单 {{ refund.orderNo || '—' }} · 申请于 {{ formatTime(refund.appliedAt || refund.createdAt) }}</p></div><span class="pill status" :class="String(refund.status).toLowerCase()">{{ refund.statusText || labels[String(refund.status)] || refund.status }}</span></header>
        <section class="refund-section"><h2>退款信息</h2><dl><div><dt>退款金额</dt><dd class="amount">U {{ refund.amount ?? '—' }}</dd></div><div><dt>退款业务号</dt><dd>{{ refund.refundBizNo || '—' }}</dd></div><div><dt>订单申请前状态</dt><dd>{{ refund.orderStatusBefore || '—' }}</dd></div><div><dt>审核时间</dt><dd>{{ formatTime(refund.reviewedAt) }}</dd></div></dl></section>
        <section class="refund-section"><h2>退款原因</h2><p class="reason">{{ refund.reason || '—' }}</p><div v-if="refund.evidenceImages?.length" class="evidence"><button v-for="(url, index) in refund.evidenceImages" :key="`${url}:${index}`" type="button" :aria-label="`预览退款凭证 ${index + 1}`" @click="previewIndex = index; previewOpen = true"><img :src="url" :alt="`退款凭证 ${index + 1}`" @error="setImageFallback" /></button></div></section>
        <section v-if="refund.sellerConfirmedAt" class="refund-section"><h2>买手确认意见</h2><p class="reason">{{ refund.sellerAgree === true ? '同意退款' : refund.sellerAgree === false ? '不同意退款' : '—' }} · {{ refund.sellerRemark || '—' }}<br />{{ formatTime(refund.sellerConfirmedAt) }}</p></section><section v-if="refund.reviewRemark" class="refund-section"><h2>平台审核说明</h2><p class="reason">{{ refund.reviewRemark }}</p></section>
        <footer class="button-row actions"><button type="button" class="outline"  @click="router.push({ name: 'order-detail', params: { id: String(refund.orderId) } })">查看订单</button><button type="button" v-if="canCancel"  class="danger outline" :disabled="cancelling || cancellationPending || loading" @click="cancel">{{ cancelling ? cancellationUnknown ? '正在核对…' : '撤销中…' : cancellationUnknown ? '核对撤销结果' : '撤销申请' }}</button></footer>
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
