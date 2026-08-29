<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute(); const router = useRouter();
const userStore = useUserStore();
const id = computed(() => String(route.params.id || ''));
const refund = ref<Api.RealRefund.RefundDTO>(); const loading = ref(false); const loadError = ref(''); const cancelling = ref(false); const cancellationPending = ref(false);
const requestGuard = createLatestRequestGuard();
const labels: Record<string, string> = { APPLYING: '待平台审核', AGREED: '平台已同意退款', REJECTED: '平台已驳回', CANCELED: '买家已撤销' };
const canCancel = computed(() => String(refund.value?.status) === 'APPLYING');
const formatTime = (value?: string | number) => value ? new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value).toLocaleString() : '—';
async function load() {
  const isCurrent = requestGuard.begin();
  const requestedId = id.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  loading.value = true;
  loadError.value = '';
  try {
    refund.value = await refundApi.fetchRefundDetail(requestedId, { signal: isCurrent.signal });
    if (!isCurrent() || id.value !== requestedId || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
  } catch {
    if (!isCurrent()) return;
    refund.value = undefined;
    loadError.value = '退款申请详情加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(load); onBeforeUnmount(requestGuard.invalidate);
watch([() => route.params.id, () => userStore.currentUser?.id], ([nextId, nextUserId], [prevId, prevUserId]) => {
  if (String(nextId) === String(prevId) && String(nextUserId) === String(prevUserId)) return;
  requestGuard.invalidate();
  refund.value = undefined;
  cancellationPending.value = false;
  void load();
});
function cancel() { if (!refund.value || cancelling.value || cancellationPending.value) return; cancellationPending.value = true; Modal.confirm({ title:'撤销仅退款申请？', content:'撤销后订单将恢复到申请前状态。', okButtonProps:{status:'danger'}, onCancel(){ cancellationPending.value = false; }, async onOk(){ cancelling.value = true; try { await refundApi.cancelRefund(refund.value!.refundId); Message.success('已撤销退款申请'); await load(); } catch { Message.error('撤销退款申请失败，请稍后重试'); } finally { cancelling.value = false; cancellationPending.value = false; } } }); }
</script>

<template>
  <div class="aftersale-detail-page shop-container"><a-spin :loading="loading"><template v-if="refund">
    <a-breadcrumb class="bread"><a-breadcrumb-item @click="router.push('/aftersale')">我的仅退款</a-breadcrumb-item><a-breadcrumb-item>{{ refund.orderNo || refund.refundId }}</a-breadcrumb-item></a-breadcrumb>
    <a-card class="hero-card" :bordered="false"><div class="hero"><div><h2>仅退款申请</h2><div class="muted">订单 {{ refund.orderNo || '—' }} · 申请于 {{ formatTime(refund.appliedAt || refund.createdAt) }}</div></div><a-tag :color="String(refund.status) === 'AGREED' ? 'green' : String(refund.status) === 'REJECTED' ? 'red' : 'orange'">{{ refund.statusText || labels[String(refund.status)] || refund.status }}</a-tag></div></a-card>
    <a-card class="step-card" :bordered="false"><div class="section-title">退款信息</div><a-descriptions :column="2" :data="[{label:'退款金额',value:'U ' + (refund.amount ?? '—')},{label:'退款业务号',value:refund.refundBizNo || '—'},{label:'订单申请前状态',value:refund.orderStatusBefore || '—'},{label:'审核时间',value:formatTime(refund.reviewedAt)}]" /></a-card>
    <a-card class="step-card" :bordered="false"><div class="section-title">退款原因</div><p class="reason">{{ refund.reason || '—' }}</p><div v-if="refund.evidenceImages?.length" class="evidence"><img v-for="(url, index) in refund.evidenceImages" :key="url" :src="url" :alt="`退款凭证 ${index + 1}`" /></div></a-card>
    <a-card v-if="refund.reviewRemark" class="step-card" :bordered="false"><div class="section-title">平台审核说明</div><p class="reason">{{ refund.reviewRemark }}</p></a-card>
    <a-space><a-button @click="router.push({name:'order-detail',params:{id:String(refund.orderId)}})">查看订单</a-button><a-button v-if="canCancel" status="danger" :loading="cancelling" @click="cancel">撤销申请</a-button></a-space>
  </template><EmptyState v-else-if="!loading" :title="loadError || '退款申请不存在'" :action-text="loadError ? '重新加载' : '返回售后列表'" @action="loadError ? load() : router.push('/aftersale')" /></a-spin></div>
</template>

<style scoped>
.aftersale-detail-page { max-width:960px; margin:0 auto; padding-top:16px; }.bread,.hero-card,.step-card { margin-bottom:12px; }.hero { display:flex; justify-content:space-between; align-items:center; gap:16px; }.hero h2 { margin:0 0 8px; font-size:18px; }.muted { color:#86909c; font-size:12px; }.section-title { font-weight:600; margin-bottom:12px; padding-left:8px; border-left:3px solid var(--bw-brand-primary); }.reason { white-space:pre-wrap; color:#4e5969; line-height:1.7; }.evidence { display:flex; flex-wrap:wrap; gap:8px; }.evidence img { width:120px; height:120px; object-fit:cover; border-radius:4px; }
@media (max-width: 640px) { .aftersale-detail-page { padding-top: 10px; } .hero { align-items:flex-start; flex-direction:column; gap:8px; } .evidence img { width:88px; height:88px; } }
</style>
