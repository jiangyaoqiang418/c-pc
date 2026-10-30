<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import EmptyState from '@/components/common/empty-state.vue';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
import { isDefinitiveRejection } from '@/service/request/type';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { resolvePageSize } from '@/service/api/page';

const router = useRouter();
const route = useRoute();
let syncingQuery = false;
const userStore = useUserStore();
const activeKey = ref('all');
const activeStatus = computed(() => activeKey.value === 'all' ? undefined : activeKey.value);
const refunds = ref<Api.RealRefund.RefundDTO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(30);
const total = ref(0);
const cancellingId = ref<string | number>();
const cancellationPending = ref(false);
const statusDefs = [
  { key: 'all', label: '全部' }, { key: 'CONFIRMING', label: '待买手确认' }, { key: 'APPLYING', label: '待平台审核' },
  { key: 'AGREED', label: '已同意' }, { key: 'REJECTED', label: '已驳回' }, { key: 'CANCELED', label: '已撤销' }
];
const statusColor: Record<string, string> = { CONFIRMING: 'orange', APPLYING: 'orange', AGREED: 'green', REJECTED: 'red', CANCELED: 'gray' };
const unknownCancellations = ref(new Set<string>());
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const statusLabel = (row: Api.RealRefund.RefundDTO) => row.statusText || ({ CONFIRMING: '待买手确认', APPLYING: '待平台审核', AGREED: '已同意退款', REJECTED: '已驳回', CANCELED: '已撤销' }[String(row.status)] || row.status || '—');
const canCancel = (row: Api.RealRefund.RefundDTO) => userStore.currentUser?.id !== undefined
  && String(row.buyerId) === String(userStore.currentUser.id) && ['CONFIRMING', 'APPLYING'].includes(String(row.status));
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

function readQuery() {
  syncingQuery = true;
  const matchedStatus = typeof route.query.status === 'string'
    ? statusDefs.find(item => item.key === route.query.status)
    : undefined;
  activeKey.value = matchedStatus?.key || 'all';
  const page = Number(route.query.page);
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
  return route.query.status !== undefined && !matchedStatus;
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  void (replace ? router.replace : router.push)({ query: { ...route.query,
    status: activeStatus.value, page: current.value > 1 ? String(current.value) : undefined } }).then(() => {
    if (route.fullPath === before) void load();
  });
}

async function load() {
  const isCurrent = requestGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    refunds.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const result = await refundApi.fetchMyRefunds({ pageNo: current.value, pageSize: pageSize.value, status: activeStatus.value }, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    pageSize.value = resolvePageSize(result, pageSize.value);
    total.value = result.total;
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    refunds.value = result.records;
  } catch {
    if (isCurrent()) { refunds.value = []; total.value = 0; loadError.value = '退款申请加载失败，请检查网络后重试'; }
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(() => {
  if (readQuery()) void router.replace({ query: { ...route.query, status: undefined } });
  void load();
});
onBeforeUnmount(() => { writeVersion += 1; confirmationModal?.close(); requestGuard.invalidate(); });
watch(activeKey, () => {
  if (syncingQuery) return;
  current.value = 1;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.query, () => {
  writeVersion += 1;
  confirmationModal?.close();
  cancellingId.value = undefined;
  cancellationPending.value = false;
  if (readQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void load();
});
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion, () => userStore.currentAudience], () => {
  writeVersion += 1;
  confirmationModal?.close();
  requestGuard.invalidate();
  refunds.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  cancellingId.value = undefined;
  cancellationPending.value = false;
  syncQuery(true);
});

function cancellationKey(refundId: string | number) { return `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${String(refundId)}`; }

function cancel(row: Api.RealRefund.RefundDTO) {
  if (cancellingId.value || cancellationPending.value || loading.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const refundId = row.refundId;
  const orderId = row.orderId;
  const operation = ++writeVersion;
  const requestedSession = userStore.sessionVersion;
  const pendingKey = cancellationKey(refundId);
  const isCurrentWrite = () => operation === writeVersion && userStore.sessionVersion === requestedSession && String(userStore.currentUser?.id) === String(requestedUserId);
  const validDetail = (next: Api.RealRefund.RefundDTO) => String(next.refundId) === String(refundId)
    && String(next.buyerId) === String(requestedUserId) && String(next.orderId) === String(orderId);
  async function recoverCancellation() {
    unknownCancellations.value.add(pendingKey);
    try {
      const latest = await refundApi.fetchRefundDetail(refundId);
      if (!isCurrentWrite()) return;
      if (!validDetail(latest) || !['CONFIRMING', 'APPLYING', 'CANCELED', 'AGREED', 'REJECTED'].includes(String(latest.status))) throw new Error('原退款申请状态未确认');
      refunds.value = refunds.value.map(item => String(item.refundId) === String(refundId) ? latest : item);
      unknownCancellations.value.delete(pendingKey);
      if (latest.status === 'CANCELED') Message.success('已核对到撤销结果');
      else if (canCancel(latest)) Message.warning('尚未核对到撤销结果；原申请仍可撤销，请重新核对后确认');
      else Message.warning('原申请状态已更新，当前不可撤销，请查看处理进度');
      await load();
    } catch {
      if (isCurrentWrite()) Message.warning('撤销结果待核实，请先核对原申请，暂不重复提交');
    }
  }
  if (unknownCancellations.value.has(pendingKey)) {
    cancellingId.value = refundId;
    void recoverCancellation().finally(() => { if (isCurrentWrite()) cancellingId.value = undefined; });
    return;
  }
  cancellationPending.value = true;
  confirmationModal = Modal.confirm({ title: '撤销仅退款申请？', content: '撤销后订单会恢复到申请前状态。', okButtonProps: { status: 'danger' }, onCancel() { if (!isCurrentWrite()) return; writeVersion += 1; cancellationPending.value = false; }, async onOk() {
    if (!isCurrentWrite()) return;
    cancellingId.value = refundId;
    let submitted = false;
    try {
      const latest = await refundApi.fetchRefundDetail(refundId);
      if (!isCurrentWrite()) return;
      if (!validDetail(latest) || !canCancel(latest)) {
        Message.warning('退款申请状态或归属已变化，请重新核对');
        await load();
        return;
      }
      submitted = true;
      const canceledId = await refundApi.cancelRefund(refundId);
      if (!isCurrentWrite()) return;
      if (String(canceledId) !== String(refundId)) throw new Error('撤销结果待核实，请先刷新售后状态');
      Message.success('已撤销退款申请');
      await load();
    } catch (error) {
      if (!isCurrentWrite()) return;
      if (!submitted) Message.warning('原申请读取失败，本次尚未提交撤销，请重新核对');
      else if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '撤销申请未被接受');
      else await recoverCancellation();
    } finally { if (operation === writeVersion && userStore.sessionVersion === requestedSession) { cancellingId.value = undefined; cancellationPending.value = false; } }
  }});
}


function changeTab(value: string | number) {
  if (statusDefs.some(item => item.key === String(value))) activeKey.value = String(value);
}
</script>

<template>
  <div class="aftersale-list-page">
    <header class="page-heading compact"><h1>我的售后</h1><button type="button" class="outline"  @click="router.push('/order')">查看订单</button></header>
    <div class="tabs" role="tablist" aria-label="售后状态"><button v-for="item in statusDefs" :key="item.key" type="button" role="tab" :class="{ active:activeKey === item.key }" :aria-selected="activeKey === item.key" @click="changeTab(item.key)">{{ item.label }}</button></div>
    <section class="case-list" :aria-busy="loading" aria-label="仅退款申请列表">
      <div v-if="loading && !refunds.length" class="loading-list"><Skeleton v-for="n in 3" :key="n" class="case-skeleton" /></div>
      <template v-else-if="refunds.length">
        <article v-for="row in refunds" :key="row.refundId" class="paper case-card" :class="{ refreshing: loading }" role="link" tabindex="0" :aria-label="`打开仅退款申请 ${row.orderNo || row.refundId}`" @click="router.push({ name: 'aftersale-detail', params: { id: String(row.refundId) } })" @keydown.enter.self="router.push({ name: 'aftersale-detail', params: { id: String(row.refundId) } })" @keydown.space.self.prevent="router.push({ name: 'aftersale-detail', params: { id: String(row.refundId) } })">
          <header class="section-heading case-head"><h2>{{ row.productTitle || '仅退款申请' }}</h2><span class="pill status" :class="statusColor[String(row.status)]">{{ statusLabel(row) }}</span></header>
          <div class="case-body"><div><small>订单号：{{ row.orderNo || '—' }}</small><p>{{ row.reason || '—' }}</p></div><div class="amount"><small>申请退款金额</small><strong>U {{ row.amount ?? '—' }}</strong></div></div>
          <footer class="button-row actions" @click.stop><button type="button" class="outline"  @click="router.push({ name: 'aftersale-detail', params: { id: String(row.refundId) } })">查看详情</button><button type="button" v-if="canCancel(row)"  class="danger outline" :disabled="!!cancellingId || cancellationPending || loading" @click="cancel(row)">{{ cancellingId === row.refundId ? unknownCancellations.has(cancellationKey(row.refundId)) ? '正在核对…' : '撤销中…' : unknownCancellations.has(cancellationKey(row.refundId)) ? '核对撤销结果' : '撤销申请' }}</button></footer>
        </article>
      </template>
      <EmptyState v-else :title="loadError || '暂无仅退款申请'" :description="loadError ? '不会展示不完整的售后数据。' : '可在待发货或待收货订单中申请仅退款'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && load()" />
    </section>
    <BusinessPagination v-if="total > pageSize" :current="current" :total="total" :page-size="pageSize" :loading="loading || cancellationPending" @change="current = $event; syncQuery()" />
  </div>
</template>

<style scoped>
.case-card { cursor:pointer; }
.case-body { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.case-body p { white-space:pre-wrap; overflow-wrap:anywhere; }
.amount { text-align:right; }.amount strong { display:block; font-size:24px; }
.actions { justify-content:flex-end; margin-top:20px; }
.refreshing { opacity:.65; }.loading-list { display:grid; gap:16px; }.case-skeleton { height:210px; border-radius:10px; }
@media (max-width:700px) { .case-body { flex-wrap:wrap; }.amount { text-align:left; } }
</style>
