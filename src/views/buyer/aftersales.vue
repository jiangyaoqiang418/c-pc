<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import * as refundApi from '@/service/api/refund';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { refundStatusDefs, refundStatusLabels, refundTypeLabel } from '@/utils/refund';
import { formatDateValue } from '@/utils/date-range';
import { setImageFallback } from '@/utils/image-placeholder';
import { resolvePageSize } from '@/service/api/page';
import { useNotifyStore } from '@/stores/notify';
import LoadingStatus from '@/components/common/loading-status.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();
const route = useRoute();
const user = useUserStore();
const activeKey = ref('all');
const orderNo = ref('');
const refunds = ref<Api.RealRefund.RefundDTO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(10);
const total = ref(0);
const statusDefs = refundStatusDefs;
const activeStatus = computed(() => activeKey.value === 'all' ? undefined : activeKey.value);
const guard = createLatestRequestGuard(() => `${String(user.currentUser?.id)}:${user.sessionVersion}`);
function readQuery() {
  activeKey.value = statusDefs.some(item => item.key === route.query.status) ? String(route.query.status) : 'all';
  orderNo.value = typeof route.query.orderNo === 'string' ? route.query.orderNo : '';
  const page = Number(route.query.page); current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
}
function search(status = activeKey.value, page = 1) {
  activeKey.value = status; current.value = page;
  const before = route.fullPath;
  void router.push({ query: { ...route.query, status: activeStatus.value, orderNo: orderNo.value.trim() || undefined, page: page > 1 ? String(page) : undefined } }).then(() => { if (before === route.fullPath) void load(); });
}
async function load() {
  const valid = guard.begin();
  if (user.currentUser?.id === undefined || !user.isBuyerActive) { refunds.value = []; total.value = 0; loading.value = false; return; }
  loading.value = true; loadError.value = '';
  try {
    const result = await refundApi.fetchSoldRefunds({ pageNo: current.value, pageSize: pageSize.value, orderNo: orderNo.value.trim() || undefined, status: activeStatus.value }, { signal: valid.signal });
    if (!valid()) return;
    pageSize.value = resolvePageSize(result, pageSize.value);
    const last = Math.max(1, Math.ceil(result.total / pageSize.value));
    if (current.value > last) { search(activeKey.value, last); return; }
    refunds.value = result.records; total.value = result.total;
  } catch { if (valid()) { refunds.value = []; total.value = 0; loadError.value = '卖出商品售后加载失败，请稍后重试'; } }
  finally { if (valid()) loading.value = false; }
}
function open(row: Api.RealRefund.RefundDTO) { void router.push({ name: 'aftersale-detail', params: { id: String(row.refundId) } }); }
onMounted(() => { readQuery(); void load(); });
watch(() => route.query, () => { readQuery(); void load(); });
watch(() => [user.currentUser?.id, user.sessionVersion, user.isBuyerActive], () => { guard.invalidate(); refunds.value = []; total.value = 0; void load(); });
useNotifyStore().subscribe(event => { if (event.type === 'SYNC' || event.type === 'IM_MESSAGE' && ['AFTERSALE_UPDATED', 'AFTERSALE_COMPLETED'].includes(event.payload.eventType || '')) void load(); });
onBeforeUnmount(guard.invalidate);
</script>

<template>
  <div class="buyer-aftersales-page shop-container">
    <header class="buyer-page-top"><div><h1>卖出商品售后</h1><p>跟进售后方案、退换货与赔偿处理进度。</p></div><button type="button" class="outline" @click="router.push('/buyer/orders')"><UmIcon name="return" />返回买手订单</button></header>
    <div class="buyer-info"><UmIcon name="shield" /><span>请进入具体售后单处理。退款和赔偿以实际资金记录为准，支付中不代表已到账。</span></div>
    <div class="buyer-tabs" role="group" aria-label="售后状态"><button v-for="item in statusDefs" :key="item.key" type="button" :class="{ active: activeKey === item.key }" :aria-pressed="activeKey === item.key" @click="search(item.key)">{{ item.label }}</button></div>
    <form class="buyer-filter" @submit.prevent="search()"><label><UmIcon name="search" /><input v-model="orderNo" aria-label="按订单号查询售后" placeholder="按订单号查询" /></label><button type="submit" :disabled="loading">查询</button><button type="button" @click="orderNo = ''; search()">重置</button></form>
    <LoadingStatus v-if="loading" block label="正在更新售后记录…" />
    <template v-if="refunds.length"><article v-for="row in refunds" :key="String(row.refundId)" class="paper buyer-aftersale"><div class="buyer-section-title"><b>{{ row.orderNo || '—' }}</b><span class="buyer-status">{{ row.statusText || refundStatusLabels[String(row.status)] || '状态待确认' }}</span></div><div class="buyer-order-product"><img v-if="row.productImage" :src="row.productImage" :alt="row.productTitle || '商品图片'" @error="setImageFallback" /><span><b>{{ row.productTitle || '售后申请' }}</b><small>{{ refundTypeLabel(row.preferredType || row.refundType) }} · {{ formatDateValue(row.appliedAt || row.createdAt) }}</small><strong>订单金额 {{ row.amount ?? '—' }} USDT</strong><small>买家：{{ row.buyerName || '—' }}</small></span></div><p>申请原因：{{ row.reason || '—' }}</p><p v-if="row.status === 'PAYING'" role="status">赔偿支付中，请勿重复支付。{{ row.paymentError }}</p><div class="button-row"><button type="button" class="primary" @click="open(row)">查看及处理售后</button></div></article></template>
    <EmptyState v-else-if="!loading" :title="loadError || '暂无卖出商品售后'" :action-text="loadError ? '重新加载' : undefined" @action="load" />
    <BusinessPagination v-if="total > pageSize" :current="current" :total="total" :page-size="pageSize" :loading="loading" @change="(page: number) => search(activeKey, page)" />
  </div>
</template>

<style scoped>
.buyer-tabs { flex-wrap:wrap; }.buyer-aftersale p { white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
