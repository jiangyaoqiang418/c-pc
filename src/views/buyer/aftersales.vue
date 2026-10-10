<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@iconify/vue';
import DescriptionList from '@/components/common/description-list.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import ImagePreview from '@/components/common/image-preview.vue';
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
const activeStatus = computed(() => activeKey.value === 'all' ? undefined : activeKey.value as Api.RealRefund.RefundStatus);

function readQuery() {
  syncingQuery = true;
  const matchedStatus = typeof route.query.status === 'string'
    ? statusDefs.find(item => item.key === route.query.status)
    : undefined;
  activeKey.value = matchedStatus?.key || 'all';
  orderNo.value = typeof route.query.orderNo === 'string' ? route.query.orderNo : '';
  const page = Number(route.query.page);
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  syncingQuery = false;
  return route.query.status !== undefined && !matchedStatus;
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

onMounted(() => {
  if (readQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void load();
});
onBeforeUnmount(requestGuard.invalidate);
watch(activeKey, () => {
  if (syncingQuery) return;
  current.value = 1;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.query, () => {
  if (readQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  requestGuard.invalidate();
  refunds.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  syncQuery(true);
});

const previewOpen = ref(false);
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
function openEvidence(images: string[], index: number) {
  previewImages.value = [...images];
  previewIndex.value = index;
  previewOpen.value = true;
}
watch(() => userStore.currentUser?.id, () => {
  previewOpen.value = false;
  previewImages.value = [];
});
</script>

<template>
  <div class="buyer-aftersales-page shop-container">
    <header class="page-heading"><div><span class="eyebrow">UMAOMAO / AFTERSALES</span><h1>卖出商品售后</h1><p>平台负责审核与退款处理，买手可查看申请进度。</p></div><Button variant="outline" @click="router.push('/buyer/orders')"><Icon icon="lucide:arrow-left" />返回买手订单</Button></header>
    <Alert><AlertDescription>买手可查看申请原因、凭证和审核结果；退款决定与资金处理由平台完成。</AlertDescription></Alert>
    <Tabs v-model="activeKey"><TabsList class="status-tabs"><TabsTrigger v-for="item in statusDefs" :key="item.key" :value="item.key">{{ item.label }}</TabsTrigger></TabsList></Tabs>
    <form class="filter-row" @submit.prevent="search"><Input v-model="orderNo" aria-label="按订单号精确查询" placeholder="按订单号精确查询" /><Button type="submit" :disabled="loading">查询</Button><Button type="button" variant="outline" @click="reset">重置</Button></form>
    <div v-if="refunds.length" class="refund-list"><article v-for="row in refunds" :key="row.refundId" class="refund-card"><header class="card-head"><div class="product-summary"><img v-if="row.productImage" :src="row.productImage" :alt="row.productTitle || '商品图片'" @error="setImageFallback" /><div class="product-text"><h2>{{ row.productTitle || '仅退款申请' }}</h2><span>订单号：{{ row.orderNo || '—' }}</span></div></div><span class="refund-status" :class="String(row.status)">{{ statusLabel(row) }}</span></header><DescriptionList :columns="2" :items="[{ label: '买家', value: row.buyerName || (row.buyerId ? String(row.buyerId) : '—') },{ label: '退款金额', value: 'U ' + (row.amount ?? '—') },{ label: '申请时间', value: formatTime(row.appliedAt || row.createdAt) },{ label: '审核时间', value: formatTime(row.reviewedAt) }]" /><div class="reason"><h3>申请原因</h3><p>{{ row.reason || '—' }}</p></div><div v-if="row.evidenceImages?.length" class="evidence"><h3>申请凭证</h3><div><button v-for="(url,index) in row.evidenceImages" :key="url" type="button" :aria-label="'查看第 ' + (index + 1) + ' 张申请凭证'" @click="openEvidence(row.evidenceImages!, index)"><img :src="url" alt="申请凭证" @error="setImageFallback" /></button></div></div><div v-if="row.reviewRemark" class="review-remark"><h3>平台审核说明</h3><p>{{ row.reviewRemark }}</p></div></article></div>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取卖出商品售后"><Skeleton v-for="n in 3" :key="n" class="refund-skeleton" /></div>
    <EmptyState v-else :title="loadError || '暂无卖出商品售后'" :description="loadError ? '请稍后重试。' : '买家提交仅退款申请后，会在这里显示平台审核进度。'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
    <BusinessPagination v-if="total > pageSize" :current="current" :total="total" :page-size="pageSize" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" /><ImagePreview v-model="previewOpen" :images="previewImages" :start-index="previewIndex" title="退款申请凭证" />
  </div>
</template>

<style scoped>
.buyer-aftersales-page { display:grid; gap:24px; }.page-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; }.eyebrow { font-size:10px; letter-spacing:1.8px; color:var(--yb-gold); }.page-heading h1 { font-size:28px; font-weight:650; margin:8px 0; }.page-heading p { color:var(--yb-muted); font-size:13px; margin:0; }.status-tabs { display:flex; width:100%; justify-content:flex-start; height:auto; padding:6px; gap:4px; overflow-x:auto; }.status-tabs :deep(button) { padding:10px 14px; flex-shrink:0; }.filter-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; background:var(--yb-surface); padding:20px; border:1px solid var(--yb-hairline); border-radius:10px; }.refund-list,.loading-list { display:grid; gap:20px; }.refund-card { padding:28px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:12px; }.card-head { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:18px; }.product-summary { display:flex; align-items:center; gap:16px; min-width:0; }.product-summary img { width:72px; height:72px; border-radius:6px; object-fit:cover; flex-shrink:0; }.product-text { display:grid; gap:9px; min-width:0; }.product-text h2 { font-size:17px; font-weight:600; margin:0; overflow-wrap:anywhere; }.product-text span { color:var(--yb-muted); font-size:12px; overflow-wrap:anywhere; }.refund-status { color:var(--yb-gold); background:var(--yb-champagne); padding:5px 9px; border-radius:5px; font-size:12px; white-space:nowrap; flex-shrink:0; }.refund-status.AGREED { color:var(--yb-success); background:var(--yb-success-soft); }.refund-status.REJECTED { color:var(--yb-danger); background:var(--yb-danger-soft); }.refund-status.CANCELED { color:var(--yb-muted); background:var(--yb-fill); }.reason,.evidence,.review-remark { margin-top:24px; }h3 { font-size:13px; font-weight:500; color:var(--yb-muted); margin:0 0 10px; }.reason p,.review-remark p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; line-height:1.9; }.evidence>div { display:flex; gap:12px; flex-wrap:wrap; }.evidence button { border:0; background:var(--yb-fill); border-radius:6px; padding:0; overflow:hidden; cursor:pointer; }.evidence img { width:86px; height:86px; object-fit:cover; }.review-remark { padding:18px; background:var(--yb-fill); border-radius:7px; }.refund-skeleton { height:330px; }@media(max-width:900px) { .page-heading { flex-wrap:wrap; }.card-head { align-items:flex-start; }.refund-card { padding:22px; } }
</style>
