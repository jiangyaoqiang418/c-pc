<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as orderApi from '@/service/api/order';
import * as reviewApi from '@/service/api/review';
import { createLatestRequestGuard } from '@/utils/latest-request';

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
const ordersGuard = createLatestRequestGuard();
const countsGuard = createLatestRequestGuard();
const reviewableGuard = createLatestRequestGuard();

const role = computed(() => (userStore.isBuyerActive ? 'shopper' : 'customer'));

function syncFromQuery() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  activeKey.value = TABS.some(item => item.key === tab) ? String(tab) : 'all';
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(rawPage);
  current.value = Number.isInteger(page) && page > 0 ? page : 1;
}

function currentQuery() {
  return {
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
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    orders.value = r.records;
    total.value = r.total;
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
  if (!userStore.currentUser || role.value === 'shopper') {
    reviewableOrderIds.value = new Set();
    return;
  }
  try {
    const result = await reviewApi.fetchReviewableOrders({ pageNo: 1, pageSize: 100 }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    reviewableOrderIds.value = new Set(result.records.map(item => String(item.orderId)));
  } catch {
    if (!isCurrent()) return;
    reviewableOrderIds.value = new Set();
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
  syncFromQuery();
  await Promise.all([load(), loadCounts(), loadReviewableOrders()]);
});
onBeforeUnmount(() => {
  ordersGuard.invalidate();
  countsGuard.invalidate();
  reviewableGuard.invalidate();
});

watch(() => route.fullPath, () => {
  syncFromQuery();
  void load();
});

function onTabChange() {
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

watch(
  [() => userStore.currentAudience, () => userStore.currentUser?.id],
  ([nextAudience, nextUserId], [previousAudience, previousUserId]) => {
    if (String(nextAudience) === String(previousAudience) && String(nextUserId) === String(previousUserId)) return;
    ordersGuard.invalidate();
    countsGuard.invalidate();
    reviewableGuard.invalidate();
    orders.value = [];
    total.value = 0;
    counts.value = {};
    reviewableOrderIds.value = new Set();
    current.value = 1;
    syncQuery(true);
    void loadCounts();
    void loadReviewableOrders();
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
      <h1 class="page-title">我的订单</h1>
      <span v-if="userStore.isBuyerActive" class="role-tag">买手视角 · 显示您接单的订单</span>
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
.role-tag {
  font-size: 12px;
  color: #ff7d00;
  background: #fff7e6;
  padding: 2px 8px;
  border-radius: 4px;
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
