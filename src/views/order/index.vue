<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
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
</script>

<template>
  <div class="order-list-page shop-container">
    <div class="page-head">
      <h1 class="page-title">我的订单 · {{ orderView === 'sell' ? '卖出' : '买入' }}</h1>
      <a-space v-if="userStore.canSwitchToBuyer" role="group" aria-label="订单视角">
        <a-button :type="orderView === 'buy' ? 'primary' : 'outline'" :aria-pressed="orderView === 'buy'" @click="changeView('buy')">买入订单</a-button>
        <a-button :type="orderView === 'sell' ? 'primary' : 'outline'" :aria-pressed="orderView === 'sell'" @click="changeView('sell')">卖出订单</a-button>
      </a-space>
    </div>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load @change="onTabChange">
        <a-tab-pane v-for="t in TABS" :key="t.key">
          <template #title>
            {{ t.label }}
            <a-badge v-if="t.statuses && countOfTab(t)" :count="countOfTab(t)" :max-count="99" class="badge" />
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <div class="orders">
      <a-alert v-if="reviewableError" type="warning">
        {{ reviewableError }}
        <template #action><a-button :loading="reviewableLoading" @click="loadReviewableOrders">重新核对</a-button></template>
      </a-alert>
      <p v-else-if="reviewableLoading">正在核对评价资格…</p>
      <a-spin :loading="loading" style="width: 100%">
        <div v-if="orders.length">
          <OrderCard v-for="o in orders" :key="o.id" :order="o" :reviewable="reviewableOrderIds.has(String(o.id))" @changed="onChanged" />
        </div>
        <EmptyState
          v-else
          :title="loadError || '该状态下没有订单'"
          :description="loadError ? '不会展示不完整的订单数据。' : '直接购买或求购成交后会生成真实订单'"
          :action-text="loadError ? '重新加载' : '发起求购'"
          @action="handleEmptyAction"
        />
      </a-spin>
    </div>

    <div v-if="total > size" class="pagination-bar">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="changePage"
      />
    </div>
  </div>
</template>

<style scoped>
.order-list-page {
  padding-top: 16px;
}
.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.badge {
  margin-left: 4px;
}
.orders {
  margin-top: 16px;
}
.pagination-bar {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
@media (max-width: 640px) {
  .order-list-page { padding-top: 10px; }
  .page-head { align-items: flex-start; flex-direction: column; gap: 6px; }
  :deep(.arco-tabs-nav-tab) { padding-left: 10px; padding-right: 10px; }
}
</style>
