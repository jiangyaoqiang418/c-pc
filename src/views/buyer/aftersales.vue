<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as refundApi from '@/service/api/refund';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { setImageFallback } from '@/utils/image-placeholder';
import { resolvePageSize } from '@/service/api/page';

const router = useRouter();
const route = useRoute();
let syncingQuery = false;
const userStore = useUserStore();
const activeKey = ref('all');
const orderNo = ref('');
const refunds = ref<Api.RealRefund.RefundDTO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(10);
const total = ref(0);
const requestGuard = createLatestRequestGuard();

const statusDefs = [
  { key: 'all', label: '全部' },
  { key: 'APPLYING', label: '待平台审核' },
  { key: 'AGREED', label: '已同意' },
  { key: 'REJECTED', label: '已驳回' },
  { key: 'CANCELED', label: '已撤销' }
];
const statusColor: Record<string, string> = { APPLYING: 'orange', AGREED: 'green', REJECTED: 'red', CANCELED: 'gray' };
const activeStatus = computed(() => activeKey.value === 'all' ? undefined : activeKey.value as Api.RealRefund.RefundStatus);

function readQuery() {
  syncingQuery = true;
  activeKey.value = statusDefs.find(item => item.key === route.query.status)?.key || 'all';
  orderNo.value = typeof route.query.orderNo === 'string' ? route.query.orderNo : '';
  const page = Number(route.query.page);
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  void (replace ? router.replace : router.push)({ query: { ...route.query,
    status: activeStatus.value, orderNo: orderNo.value.trim() || undefined,
    page: current.value > 1 ? String(current.value) : undefined } }).then(() => {
    if (route.fullPath === before) void load();
  });
}

function statusLabel(row: Api.RealRefund.RefundDTO) {
  return row.statusText || ({ APPLYING: '待平台审核', AGREED: '平台已同意退款', REJECTED: '平台已驳回', CANCELED: '买家已撤销' }[String(row.status)] || row.status || '—');
}

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
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
    const response = await refundApi.fetchSoldRefunds({
      pageNo: current.value,
      pageSize: pageSize.value,
      orderNo: orderNo.value.trim() || undefined,
      status: activeStatus.value
    }, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    pageSize.value = resolvePageSize(response, pageSize.value);
    const maxPage = Math.max(1, Math.ceil(response.total / pageSize.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    refunds.value = response.records || [];
    total.value = response.total;
  } catch {
    if (!isCurrent()) return;
    refunds.value = [];
    total.value = 0;
    loadError.value = '卖出商品售后加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function search() {
  current.value = 1;
  syncQuery();
}

function reset() {
  orderNo.value = '';
  current.value = 1;
  syncQuery();
}

onMounted(() => { readQuery(); void load(); });
onBeforeUnmount(requestGuard.invalidate);
watch(activeKey, () => {
  if (syncingQuery) return;
  current.value = 1;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.query, () => { readQuery(); void load(); });
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  requestGuard.invalidate();
  refunds.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  syncQuery(true);
});
</script>

<template>
  <div class="buyer-aftersales-page shop-container">
    <div class="page-header">
      <div>
        <h1 class="page-title">卖出商品售后</h1>
        <p>平台负责审核与退款处理，买手可在此查看申请原因、凭证和审核结果。</p>
      </div>
      <a-button @click="router.push('/buyer/orders')">返回买手订单</a-button>
    </div>

    <a-card :bordered="false" class="filter-card">
      <a-tabs v-model:active-key="activeKey">
        <a-tab-pane v-for="item in statusDefs" :key="item.key" :title="item.label" />
      </a-tabs>
      <div class="filter-row">
        <a-input v-model="orderNo" allow-clear placeholder="按订单号精确查询" @press-enter="search" />
        <a-space>
          <a-button type="primary" @click="search">查询</a-button>
          <a-button @click="reset">重置</a-button>
        </a-space>
      </div>
    </a-card>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="refunds.length" class="refund-list">
        <a-card v-for="row in refunds" :key="row.refundId" :bordered="false" class="refund-card">
          <div class="card-head">
            <div class="product-summary">
              <img v-if="row.productImage" :src="row.productImage" :alt="row.productTitle || '商品图片'" @error="setImageFallback" />
              <div class="product-text">
                <strong>{{ row.productTitle || '仅退款申请' }}</strong>
                <span>订单号：{{ row.orderNo || '—' }}</span>
              </div>
            </div>
            <a-tag :color="statusColor[String(row.status)]">{{ statusLabel(row) }}</a-tag>
          </div>

          <a-descriptions
            class="details"
            :column="2"
            :data="[
              { label: '买家', value: row.buyerName || (row.buyerId ? String(row.buyerId) : '—') },
              { label: '退款金额', value: 'U ' + (row.amount ?? '—') },
              { label: '申请时间', value: formatTime(row.appliedAt || row.createdAt) },
              { label: '审核时间', value: formatTime(row.reviewedAt) }
            ]"
          />
          <div class="reason"><span>申请原因：</span>{{ row.reason || '—' }}</div>
          <div v-if="row.evidenceImages?.length" class="evidence">
            <span>凭证：</span>
            <a-image-preview-group>
              <a-image v-for="url in row.evidenceImages" :key="url" :src="url" width="72" height="72" fit="cover" />
            </a-image-preview-group>
          </div>
          <div v-if="row.reviewRemark" class="review-remark"><span>平台审核说明：</span>{{ row.reviewRemark }}</div>
        </a-card>
      </div>
      <EmptyState
        v-else-if="!loading"
        :title="loadError || '暂无卖出商品售后'"
        :description="loadError ? '不会把请求失败误显示为没有售后。' : '买家提交仅退款申请后，会在这里显示平台审核进度。'"
        :action-text="loadError ? '重新加载' : undefined"
        @action="load"
      />
    </a-spin>

    <div v-if="total > pageSize" class="pagination">
      <a-pagination :current="current" :total="total" :page-size="pageSize" @change="(page: number) => { current = page; syncQuery(); }" />
    </div>
  </div>
</template>

<style scoped>
.buyer-aftersales-page { padding-top: 16px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.page-header p { margin: 6px 0 0; color: #86909c; font-size: 12px; }
.filter-card, .refund-card { border-radius: var(--bw-card-radius); }
.filter-row { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }
.filter-row :deep(.arco-input-wrapper) { width: 260px; }
.refund-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.product-summary { display: flex; min-width: 0; gap: 12px; }
.product-summary img { width: 52px; height: 52px; flex: 0 0 auto; border-radius: 4px; object-fit: cover; }
.product-text { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
.product-text strong { overflow-wrap: anywhere; color: #1d2129; font-size: 14px; }
.product-text span, .reason, .review-remark { color: #86909c; font-size: 12px; }
.details { margin-top: 14px; padding-top: 14px; border-top: 1px solid #f2f3f5; }
.reason, .review-remark { margin-top: 10px; line-height: 1.65; color: #4e5969; overflow-wrap: anywhere; }
.reason span, .review-remark span, .evidence > span { color: #86909c; }
.evidence { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; color: #4e5969; font-size: 12px; }
.pagination { display: flex; justify-content: center; margin: 20px 0 32px; }
@media (max-width: 640px) {
  .page-header { align-items: flex-start; flex-direction: column; }
  .filter-row { align-items: stretch; flex-direction: column; }
  .filter-row :deep(.arco-input-wrapper) { width: 100%; }
  .filter-row :deep(.arco-space) { display: flex; }
  .filter-row :deep(.arco-space-item) { flex: 1; }
  .filter-row :deep(.arco-btn) { width: 100%; }
  .card-head { gap: 10px; }
  .details :deep(.arco-descriptions-item) { min-width: 100%; }
}
</style>
