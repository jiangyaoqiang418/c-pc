<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Message } from '@/lib/feedback';
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
import * as orderApi from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { getOrderCapabilities } from '@/utils/order';
import { sameBusinessId } from '@/utils/im';

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
const confirmableIds = ref<string[]>([]);
const confirmOpen = ref(false);
const confirmSubmitting = ref(false);
const confirmRow = ref<Api.RealRefund.RefundDTO>();
const confirmAgree = ref<boolean | undefined>();
const confirmRemark = ref('');
let confirmVersion = 0;

const statusDefs = [
  { key: 'all', label: '全部' },
  { key: 'CONFIRMING', label: '待买手确认' },
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
  return row.statusText || ({ CONFIRMING: '待买手确认', APPLYING: '待平台审核', AGREED: '平台已同意退款', REJECTED: '平台已驳回', CANCELED: '买家已撤销' }[String(row.status)] || row.status || '—');
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
  confirmableIds.value = [];
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
    const eligible = await Promise.all(refunds.value.filter(row => row.status === 'CONFIRMING').map(async row => {
      try {
        const order = await orderApi.fetchOrderDetail(row.orderId, { signal: isCurrent.signal });
        return sameBusinessId(order.id, row.orderId) && sameBusinessId(row.sellerId, requestedUserId) && sameBusinessId(order.refundId, row.refundId)
          && getOrderCapabilities(order, requestedUserId).confirmAftersale ? String(row.refundId) : undefined;
      } catch { return undefined; }
    }));
    if (isCurrent() && sameBusinessId(userStore.currentUser?.id, requestedUserId)) {
      confirmableIds.value = eligible.filter((id): id is string => id !== undefined);
    }
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
onBeforeUnmount(() => { requestGuard.invalidate(); confirmVersion += 1; });
watch(activeKey, () => {
  if (syncingQuery) return;
  current.value = 1;
  syncQuery();
}, { flush: 'sync' });
watch(() => route.query, () => {
  confirmVersion += 1;
  confirmOpen.value = false;
  confirmSubmitting.value = false;
  confirmRow.value = undefined;
  if (readQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void load();
});
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion, () => userStore.currentAudience, () => userStore.isBuyerActive], () => {
  requestGuard.invalidate();
  confirmVersion += 1;
  confirmOpen.value = false;
  confirmRow.value = undefined;
  confirmRemark.value = '';
  confirmableIds.value = [];
  confirmSubmitting.value = false;
  refunds.value = [];
  total.value = 0;
  current.value = 1;
  loadError.value = '';
  syncQuery(true);
});

function openConfirmation(row: Api.RealRefund.RefundDTO) {
  if (!confirmableIds.value.includes(String(row.refundId)) || confirmSubmitting.value) return;
  confirmVersion += 1;
  confirmRow.value = row;
  confirmAgree.value = undefined;
  confirmRemark.value = '';
  confirmOpen.value = true;
}

async function confirmAftersale() {
  if (confirmSubmitting.value || !confirmRow.value) return false;
  if (typeof confirmAgree.value !== 'boolean' || !confirmRemark.value.trim() || confirmRemark.value.trim().length > 500) {
    Message.warning('请选择意见并填写500字以内的确认说明');
    return false;
  }
  const row = confirmRow.value;
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return false;
  const version = ++confirmVersion;
  const session = getAccessToken();
  const expectedRoute = route.fullPath;
  const requestedSession = userStore.sessionVersion;
  const currentWrite = () => version === confirmVersion && userStore.sessionVersion === requestedSession && userStore.isBuyerActive && sameBusinessId(userStore.currentUser?.id, userId)
    && getAccessToken() === session && route.fullPath === expectedRoute;
  const params = { refundId: row.refundId, agree: confirmAgree.value, remark: confirmRemark.value.trim() };
  confirmSubmitting.value = true;
  try {
    const [refund, order] = await Promise.all([refundApi.fetchRefundDetail(row.refundId), orderApi.fetchOrderDetail(row.orderId)]);
    if (!currentWrite()) return false;
    if (!sameBusinessId(refund.refundId, row.refundId) || !sameBusinessId(refund.orderId, order.id)
      || !sameBusinessId(refund.sellerId, userId) || refund.status !== 'CONFIRMING'
      || !sameBusinessId(order.refundId, refund.refundId) || !getOrderCapabilities(order, userId).confirmAftersale) {
      Message.warning('售后状态或操作资格已变化，请刷新后核对');
      await load();
      return false;
    }
    await refundApi.confirmRefund(params);
    if (!currentWrite()) return false;
    Message.success('买手意见已提交，等待平台审核');
    await load();
    return currentWrite();
  } catch {
    // 保留意见供原单核对；结果未知时不自动重复提交。
    return false;
  } finally { if (currentWrite()) confirmSubmitting.value = false; }
}

const previewOpen = ref(false);
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
function openEvidence(images: string[], index: number) {
  previewImages.value = [...images];
  previewIndex.value = index;
  previewOpen.value = true;
}
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  previewOpen.value = false;
  previewImages.value = [];
});
</script>

<template>
  <div class="buyer-aftersales-page shop-container">
    <header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>卖出商品售后</h1><p>确认售后意见，跟进平台审核与退款进度。</p></div><Button class="outline" variant="outline" @click="router.push('/buyer/orders')"><UmIcon name="return" />返回买手订单</Button></header>
    <div class="buyer-info"><UmIcon name="shield" /><span>买手提交同意或不同意的意见后，均由平台继续审核。最终退款决定与资金处理由平台完成。</span></div>
    <div class="buyer-tabs" role="group" aria-label="售后状态"><button v-for="item in statusDefs" :key="item.key" type="button" :class="{ active:activeKey === item.key }" :aria-pressed="activeKey === item.key" @click="activeKey = item.key">{{ item.label }}</button></div>
    <form class="buyer-filter" @submit.prevent="current = 1; syncQuery()"><label><UmIcon name="search" /><input v-model="orderNo" aria-label="按订单号精确查询售后" placeholder="按订单号精确查询" /></label><button type="submit" :disabled="loading">查询</button><button type="button" @click="reset">重置</button></form>
    <template v-if="refunds.length"><article v-for="row in refunds" :key="row.refundId" class="paper buyer-aftersale"><div class="buyer-section-title"><b>{{ row.orderNo || '—' }}</b><span class="buyer-status" :class="String(row.status)">{{ statusLabel(row) }}</span></div><div class="buyer-order-product"><img v-if="row.productImage" :src="row.productImage" :alt="row.productTitle || '商品图片'" @error="setImageFallback" /><span><b>{{ row.productTitle || '仅退款申请' }}</b><small>仅退款申请 · {{ formatTime(row.appliedAt || row.createdAt) }}</small><strong>{{ row.amount ?? '—' }} USDT</strong><small>买家：{{ row.buyerName || (row.buyerId ? String(row.buyerId) : '—') }}</small></span></div><p><b>申请原因</b><br />{{ row.reason || '—' }}</p><details><summary>申请凭证与审核记录</summary><div class="buyer-evidence"><button v-for="(url,index) in row.evidenceImages || []" :key="url" type="button" :aria-label="'查看第 ' + (index + 1) + ' 张申请凭证'" @click="openEvidence(row.evidenceImages!, index)"><img :src="url" alt="申请凭证" @error="setImageFallback" /></button><p v-if="!row.evidenceImages?.length">没有提交图片凭证</p></div><p v-if="row.sellerConfirmedAt"><b>买手确认意见</b><br />{{ row.sellerAgree === true ? '同意退款' : row.sellerAgree === false ? '不同意退款' : '—' }} · {{ row.sellerRemark || '—' }}<br />{{ formatTime(row.sellerConfirmedAt) }}</p><p><b>平台审核说明</b><br />{{ row.reviewRemark || '—' }}</p><small>审核时间：{{ formatTime(row.reviewedAt) }}</small></details><div v-if="row.status === 'CONFIRMING'" class="button-row"><button type="button" class="primary" :disabled="loading || confirmSubmitting || !confirmableIds.includes(String(row.refundId))" @click="openConfirmation(row)">确认售后意见</button></div></article></template>
    <div v-else-if="loading" class="loading-list" aria-busy="true" aria-label="正在读取卖出商品售后"><Skeleton v-for="n in 3" :key="n" class="refund-skeleton" /></div>
    <EmptyState v-else :title="loadError || '暂无卖出商品售后'" :description="loadError ? '请稍后重试。' : '买家提交仅退款申请后，会在这里显示平台审核进度。'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
    <BusinessPagination v-if="total > pageSize" :current="current" :total="total" :page-size="pageSize" :loading="loading" @change="(page: number) => { current = page; syncQuery(); }" /><a-modal v-model:visible="confirmOpen" content-class="buyer-dialog" title="确认售后意见" ok-text="提交平台审核" :ok-loading="confirmSubmitting" :closable="!confirmSubmitting" :mask-closable="!confirmSubmitting" :esc-to-close="!confirmSubmitting" :on-before-cancel="() => !confirmSubmitting" :on-before-ok="confirmAftersale"><div class="price-form"><p>订单 {{ confirmRow?.orderNo || '—' }}。无论选择同意或不同意，均转交平台审核，本次操作不直接退款。</p><div class="buyer-field"><Label>买手意见 <span>*</span></Label><div class="buyer-tabs" role="group" aria-label="买手意见"><button type="button" :class="{ active: confirmAgree === true }" :aria-pressed="confirmAgree === true" :disabled="confirmSubmitting" @click="confirmAgree = true">同意退款</button><button type="button" :class="{ active: confirmAgree === false }" :aria-pressed="confirmAgree === false" :disabled="confirmSubmitting" @click="confirmAgree = false">不同意退款</button></div></div><div class="buyer-field"><Label for="seller-refund-remark">确认说明 <span>*</span></Label><Textarea id="seller-refund-remark" v-model="confirmRemark" :disabled="confirmSubmitting" maxlength="500" :rows="4" placeholder="请填写核实情况和意见说明" /></div></div></a-modal><ImagePreview v-model="previewOpen" :images="previewImages" :start-index="previewIndex" title="退款申请凭证" />
  </div>
</template>

<style scoped>
.loading-list { display:grid; gap:16px; }
.refund-skeleton { height:260px; }
.buyer-aftersale p { white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
