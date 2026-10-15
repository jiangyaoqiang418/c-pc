<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import UmIcon from '@/components/common/um-icon.vue';
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
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>卖出商品售后</h1><p>平台负责审核与退款处理，买手可查看申请进度。</p></div><Button class="outline" variant="outline" @click="router.push('/buyer/orders')"><UmIcon name="return" />返回买手订单</Button></header>
    <div class="buyer-info"><UmIcon name="shield" /><span>买手可查看申请原因、凭证和审核结果。退款决定与资金处理由平台完成。</span></div>
    <div class="buyer-tabs" role="group" aria-label="售后状态"><button v-for="item in statusDefs" :key="item.key" type="button" :class="{ active:activeKey === item.key }" :aria-pressed="activeKey === item.key" @click="activeKey = item.key">{{ item.label }}</button></div>
    <form class="buyer-filter" @submit.prevent="current = 1; syncQuery()"><label><UmIcon name="search" /><input v-model="orderNo" aria-label="按订单号精确查询售后" placeholder="按订单号精确查询" /></label><button type="submit" :disabled="loading">查询</button><button type="button" @click="reset">重置</button></form>
    <template v-if="refunds.length"><article v-for="row in refunds" :key="row.refundId" class="paper buyer-aftersale"><div class="buyer-section-title"><b>{{ row.orderNo || '—' }}</b><span class="buyer-status" :class="String(row.status)">{{ statusLabel(row) }}</span></div><div class="buyer-order-product"><img v-if="row.productImage" :src="row.productImage" :alt="row.productTitle || '商品图片'" @error="setImageFallback" /><span><b>{{ row.productTitle || '仅退款申请' }}</b><small>仅退款申请 · {{ formatTime(row.appliedAt || row.createdAt) }}</small><strong>{{ row.amount ?? '—' }} USDT</strong><small>买家：{{ row.buyerName || (row.buyerId ? String(row.buyerId) : '—') }}</small></span></div><p><b>申请原因</b><br />{{ row.reason || '—' }}</p><details><summary>申请凭证与审核记录</summary><div class="buyer-evidence"><button v-for="(url,index) in row.evidenceImages || []" :key="url" type="button" :aria-label="'查看第 ' + (index + 1) + ' 张申请凭证'" @click="openEvidence(row.evidenceImages!, index)"><img :src="url" alt="申请凭证" @error="setImageFallback" /></button><p v-if="!row.evidenceImages?.length">没有提交图片凭证</p></div><p><b>平台审核说明</b><br />{{ row.reviewRemark || '—' }}</p><small>审核时间：{{ formatTime(row.reviewedAt) }}</small></details></article></template>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取卖出商品售后"><Skeleton v-for="n in 3" :key="n" class="refund-skeleton" /></div>
    <EmptyState v-else :title="loadError || '暂无卖出商品售后'" :description="loadError ? '请稍后重试。' : '买家提交仅退款申请后，会在这里显示平台审核进度。'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
    <BusinessPagination v-if="total > pageSize" :current="current" :total="total" :page-size="pageSize" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" /><ImagePreview v-model="previewOpen" :images="previewImages" :start-index="previewIndex" title="退款申请凭证" />
  </div>
</template>

<style scoped>
.loading-list { display:grid; gap:16px; }
.refund-skeleton { height:260px; }
.buyer-aftersale p { white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
