<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { Message } from '@/lib/feedback';
import OrderCard from '@/components/order/order-card.vue';
import UmIcon from '@/components/common/um-icon.vue';
import { useUserStore } from '@/stores';
import * as orderApi from '@/service/api/order';
import * as reviewApi from '@/service/api/review';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { resolveOrderView } from '@/utils/order';

const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.OrderStatus[];
}

const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款', statuses: ['PENDING_PAYMENT'] },
  { key: 'shipping', label: '待发货', statuses: ['PROCURING', 'PROCURED'] },
  { key: 'receiving', label: '待收货', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY'] },
  { key: 'aftersale', label: '售后中', statuses: ['IN_AFTERSALE'] },
  { key: 'refunded', label: '已退款', statuses: ['REFUNDED'] },
  { key: 'archived', label: '已归档', statuses: ['ARCHIVED', 'CANCELLED'] }
];

const activeKey = ref('all');
const orders = ref<Api.RealOrder.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(8);
const loading = ref(false);
const loadError = ref('');
const counts = ref<Record<string, number>>({});
const reviewableOrderIds = ref(new Set<string>());
const reviewableError = ref('');
const reviewableLoading = ref(false);
const ordersGuard = createLatestRequestGuard();
const countsGuard = createLatestRequestGuard();
const reviewableGuard = createLatestRequestGuard();

const orderView = ref<'buy' | 'sell'>('buy');
const role = computed(() => (orderView.value === 'sell' ? 'shopper' : 'customer'));

function syncFromQuery() {
  const view = route.query.view;
  orderView.value = resolveOrderView(view, userStore.canSwitchToBuyer, userStore.currentAudience);
  userStore.setAudience(orderView.value === 'sell' ? 'buyer' : 'customer');
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  const validTab = TABS.some(item => item.key === tab);
  activeKey.value = validTab ? String(tab) : 'all';
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(rawPage);
  const validPage = Number.isInteger(page) && page > 0;
  current.value = validPage ? page : 1;
  if (view !== orderView.value) {
    if (view === 'sell' && orderView.value === 'buy') current.value = 1;
    syncQuery(true);
    return false;
  }
  if ((route.query.tab !== undefined && (Array.isArray(route.query.tab) || !validTab))
    || (route.query.page !== undefined && (Array.isArray(route.query.page) || !validPage))) {
    syncQuery(true);
    return false;
  }
  return true;
}

function currentQuery() {
  return {
    view: orderView.value,
    ...(activeKey.value !== 'all' ? { tab: activeKey.value } : {}),
    ...(current.value > 1 ? { page: String(current.value) } : {})
  };
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const navigation = replace ? router.replace({ query: currentQuery() }) : router.push({ query: currentQuery() });
  void navigation.then(() => {
    if (route.fullPath === before) void load();
  });
}

async function load() {
  reviewableGuard.invalidate();
  reviewableOrderIds.value = new Set();
  reviewableError.value = '';
  reviewableLoading.value = false;
  const isCurrent = ordersGuard.begin();
  const user = userStore.currentUser;
  if (!user) {
    loading.value = false;
    orders.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const params: Api.RealOrder.ListQuery = {
      current: current.value,
      size: size.value,
      statuses: tab?.statuses
    };
    if (role.value === 'shopper') params.shopperId = user.id;
    else params.customerId = user.id;
    const r = await orderApi.fetchMyOrders({ ...params, signal: isCurrent.signal });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    orders.value = r.records;
    total.value = r.total;
    void loadReviewableOrders();
  } catch {
    if (!isCurrent()) return;
    orders.value = [];
    total.value = 0;
    loadError.value = '订单列表加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadReviewableOrders() {
  const isCurrent = reviewableGuard.begin();
  reviewableError.value = '';
  reviewableLoading.value = false;
  if (!userStore.currentUser || role.value === 'shopper') {
    reviewableOrderIds.value = new Set();
    return;
  }
  reviewableLoading.value = true;
  try {
    const targets = orders.value.filter(order => ['COMPLETED', 'WARRANTY'].includes(order.status)).map(order => order.id);
    const result = await reviewApi.findReviewableOrderIds(targets, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    reviewableOrderIds.value = result;
  } catch {
    if (!isCurrent()) return;
    reviewableOrderIds.value = new Set();
    reviewableError.value = '评价资格读取失败，不能据此判断订单不可评价';
  } finally {
    if (isCurrent()) reviewableLoading.value = false;
  }
}

async function loadCounts() {
  const isCurrent = countsGuard.begin();
  if (!userStore.currentUser) {
    counts.value = {};
    return;
  }
  if (role.value === 'shopper') {
    counts.value = {};
    return;
  }
  try {
    const next = await orderApi.countMyOrdersByStatus({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    counts.value = next;
  } catch {
    if (!isCurrent()) return;
    counts.value = {};
  }
}

onMounted(async () => {
  if (!syncFromQuery()) return;
  await Promise.all([load(), loadCounts()]);
});
onBeforeUnmount(() => {
  ordersGuard.invalidate();
  countsGuard.invalidate();
  reviewableGuard.invalidate();
});

watch(() => route.fullPath, () => {
  if (route.name !== 'order-list') return;
  const previousView = orderView.value;
  if (!syncFromQuery()) return;
  if (previousView !== orderView.value) orders.value = [];
  void load();
  if (previousView !== orderView.value || !Object.keys(counts.value).length) {
    counts.value = {};
    void loadCounts();
  }
});

function changeView(view: 'buy' | 'sell') {
  if (view === orderView.value || (view === 'sell' && !userStore.canSwitchToBuyer)) return;
  void router.push({ query: { ...currentQuery(), view, page: undefined } });
}

function onTabChange() {
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

watch(
  [() => userStore.canSwitchToBuyer, () => userStore.currentUser?.id],
  ([nextPermission, nextUserId], [previousPermission, previousUserId]) => {
    if (nextPermission === previousPermission && String(nextUserId) === String(previousUserId)) return;
    ordersGuard.invalidate();
    countsGuard.invalidate();
    reviewableGuard.invalidate();
    orders.value = [];
    total.value = 0;
    counts.value = {};
    reviewableOrderIds.value = new Set();
    current.value = 1;
    orderView.value = resolveOrderView(route.query.view, userStore.canSwitchToBuyer, userStore.currentAudience);
    syncQuery(true);
    void loadCounts();
  }
);

function countOfTab(t: TabDef): number {
  if (!t.statuses) return orders.value.length ? total.value : 0;
  return t.statuses.reduce((s, st) => s + (counts.value[st] || 0), 0);
}

function onChanged() {
  Message.info('订单状态已更新');
  load();
  loadCounts();
}

function handleEmptyAction() {
  if (loadError.value) {
    void load();
    return;
  }
  router.push('/purchase/create');
}
function changeTab(value: string | number) {
  const key = String(value);
  if (key === activeKey.value || !TABS.some(tab => tab.key === key)) return;
  activeKey.value = key;
  onTabChange();
}
</script>

<template>
  <div class="order-list-page customer-orders">
    <header class="page-heading compact"><h1>我的订单</h1><span class="heading-meta">{{ orderView === 'sell' ? '卖出' : '买入' }}</span><div v-if="userStore.canSwitchToBuyer" class="view-switch" role="group" aria-label="订单视角"><button type="button" :class="orderView === 'buy' ? 'primary' : 'outline'" :aria-pressed="orderView === 'buy'" @click="changeView('buy')">买入订单</button><button type="button" :class="orderView === 'sell' ? 'primary' : 'outline'" :aria-pressed="orderView === 'sell'" @click="changeView('sell')">卖出订单</button></div></header>
    <div class="tabs" role="tablist" aria-label="订单状态"><button v-for="tab in TABS" :key="tab.key" type="button" role="tab" :aria-selected="activeKey === tab.key" :class="{ active: activeKey === tab.key }" @click="changeTab(tab.key)">{{ tab.label }}<span v-if="tab.statuses && countOfTab(tab)" class="tab-count">{{ countOfTab(tab) > 99 ? '99+' : countOfTab(tab) }}</span></button></div>
    <section class="orders" :aria-busy="loading">
      <Alert v-if="reviewableError" class="review-notice"><AlertDescription>{{ reviewableError }}</AlertDescription><button type="button" class="outline" :disabled="reviewableLoading" @click="loadReviewableOrders"><Icon v-if="reviewableLoading" icon="lucide:loader-circle" width="14" class="animate-spin" />重新核对</button></Alert>
      <p v-else-if="reviewableLoading" class="review-loading" role="status"><Icon icon="lucide:loader-circle" width="14" class="animate-spin" />正在核对评价资格…</p>
      <div v-if="loading && !orders.length" class="order-skeletons" aria-label="正在读取订单"><Skeleton v-for="i in 3" :key="i" class="order-skeleton" /></div>
      <div v-else-if="orders.length" :class="{ reading: loading }"><div class="order-table-labels" aria-hidden="true"><span>商品信息</span><span>订单金额</span><span>操作</span></div><OrderCard v-for="order in orders" :key="order.id" :order="order" :reviewable="reviewableOrderIds.has(String(order.id))" @changed="onChanged" /></div>
      <div v-else class="empty paper"><UmIcon name="box" /><h2>{{ loadError || '该状态下没有订单' }}</h2><p>{{ loadError ? '请稍后重试。' : '完成第一笔订单，开启好物旅程。' }}</p><button type="button" class="primary" @click="handleEmptyAction">{{ loadError ? '重新加载' : '发起求购' }}</button></div>
    </section>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="changePage" />
  </div>
</template>

<style scoped>
.view-switch { display:flex; gap:8px; margin-left:auto; }
.tab-count { margin-left:6px; font-size:12px; }
.order-skeletons { display:grid; gap:16px; }.order-skeleton { height:210px; }
.review-notice { margin-bottom:16px; }.review-notice button { margin-top:10px; }
.review-loading { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:13px; }
.reading { opacity:.55; }
</style>
