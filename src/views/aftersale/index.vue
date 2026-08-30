<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as refundApi from '@/service/api/refund';
import { useUserStore } from '@/stores';
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
  { key: 'all', label: '全部' }, { key: 'APPLYING', label: '待平台审核' },
  { key: 'AGREED', label: '已同意' }, { key: 'REJECTED', label: '已驳回' }, { key: 'CANCELED', label: '已撤销' }
];
const statusColor: Record<string, string> = { APPLYING: 'orange', AGREED: 'green', REJECTED: 'red', CANCELED: 'gray' };
const requestGuard = createLatestRequestGuard();
const statusLabel = (row: Api.RealRefund.RefundDTO) => row.statusText || ({ APPLYING: '待平台审核', AGREED: '已同意退款', REJECTED: '已驳回', CANCELED: '已撤销' }[String(row.status)] || row.status || '—');
const canCancel = (row: Api.RealRefund.RefundDTO) => String(row.status) === 'APPLYING';
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

function readQuery() {
  syncingQuery = true;
  activeKey.value = statusDefs.find(item => item.key === route.query.status)?.key || 'all';
  const page = Number(route.query.page);
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
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
onMounted(() => { readQuery(); void load(); });
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
  readQuery();
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
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

function cancel(row: Api.RealRefund.RefundDTO) {
  if (cancellingId.value || cancellationPending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const refundId = row.refundId;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancellationPending.value = true;
  confirmationModal = Modal.confirm({ title: '撤销仅退款申请？', content: '撤销后订单会恢复到申请前状态。', okButtonProps: { status: 'danger' }, onCancel() { if (!isCurrentWrite()) return; writeVersion += 1; cancellationPending.value = false; }, async onOk() {
    if (!isCurrentWrite()) return;
    cancellingId.value = refundId;
    try { await refundApi.cancelRefund(refundId); if (!isCurrentWrite()) return; Message.success('已撤销退款申请'); await load(); }
    catch { if (isCurrentWrite()) Message.error('撤销退款申请失败，请稍后重试'); }
    finally { if (operation === writeVersion) { cancellingId.value = undefined; cancellationPending.value = false; } }
  }});
}
</script>

<template>
  <div class="aftersale-list-page shop-container">
    <h1 class="page-title">我的仅退款</h1>
    <a-tabs v-model:active-key="activeKey"><a-tab-pane v-for="item in statusDefs" :key="item.key" :title="item.label" /></a-tabs>
    <a-spin :loading="loading" style="width:100%"><template v-if="refunds.length"><a-card v-for="row in refunds" :key="row.refundId" class="case-card" :bordered="false" role="button" tabindex="0" :aria-label="`打开仅退款申请 ${row.orderNo || row.refundId}`" @click="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})" @keydown.enter.self="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})" @keydown.space.prevent.self="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})">
      <div class="head"><strong>{{ row.productTitle || '仅退款申请' }}</strong><a-tag :color="statusColor[String(row.status)]">{{ statusLabel(row) }}</a-tag></div>
      <div class="meta">订单号：{{ row.orderNo || '—' }} · 退款金额：U {{ row.amount ?? '—' }}</div><p>{{ row.reason }}</p>
      <div class="actions" @click.stop><a-button size="small" @click="router.push({name:'aftersale-detail',params:{id:String(row.refundId)}})">详情</a-button><a-button v-if="canCancel(row)" size="small" status="danger" :loading="cancellingId === row.refundId" @click="cancel(row)">撤销</a-button></div>
    </a-card></template><EmptyState v-else :title="loadError || '暂无仅退款申请'" :description="loadError ? '不会展示不完整的售后数据。' : '可在待发货或待收货订单中申请仅退款'" :action-text="loadError ? '重新加载' : undefined" @action="loadError && load()" /></a-spin>
    <a-pagination v-if="total > pageSize" v-model:current="current" :total="total" :page-size="pageSize" :disabled="loading || cancellationPending" show-total @change="syncQuery()" />
  </div>
</template>

<style scoped>
.aftersale-list-page { padding-top:16px; }.page-title { font-size:20px; margin:0; }.case-card { margin-top:12px; cursor:pointer; }.case-card:focus-visible { outline:2px solid var(--bw-brand-primary); outline-offset:2px; }.head,.actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }.meta { font-size:12px; color:#86909c; margin-top:8px; }.case-card p { font-size:13px; margin:10px 0; color:#4e5969; }.actions { justify-content:flex-end; }
@media (max-width: 640px) { .aftersale-list-page { padding-top: 10px; } .head { align-items:flex-start; } .head strong,.meta { overflow-wrap:anywhere; } }
</style>
