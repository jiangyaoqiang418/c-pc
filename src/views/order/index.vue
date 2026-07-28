<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { orderApi } from '@shared';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

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
  { key: 'archived', label: '已归档', statuses: ['ARCHIVED', 'CANCELLED'] }
];

const activeKey = ref('all');
const orders = ref<Api.Order.OrderRecord[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(8);
const loading = ref(false);
const counts = ref<Record<string, number>>({});

const role = computed(() => (userStore.isBuyerActive ? 'shopper' : 'customer'));

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const params: Parameters<typeof orderApi.fetchMyOrders>[0] = {
      current: current.value,
      size: size.value,
      statuses: tab?.statuses
    };
    if (role.value === 'shopper') params.shopperId = userStore.currentUser.id;
    else params.customerId = userStore.currentUser.id;
    const r = await orderApi.fetchMyOrders(params);
    orders.value = r.records;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

async function loadCounts() {
  if (!userStore.currentUser) return;
  if (role.value === 'shopper') return;
  counts.value = await orderApi.countMyOrdersByStatus(userStore.currentUser.id);
}

onMounted(async () => {
  await load();
  await loadCounts();
});

watch(activeKey, () => {
  current.value = 1;
  load();
});

watch(
  () => userStore.currentAudience,
  () => {
    current.value = 1;
    load();
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
</script>

<template>
  <div class="order-list-page shop-container">
    <div class="page-head">
      <h1 class="page-title">我的订单</h1>
      <span v-if="userStore.isBuyerActive" class="role-tag">买手视角 · 显示您接单的订单</span>
    </div>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
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
          <OrderCard v-for="o in orders" :key="o.id" :order="o" @changed="onChanged" />
        </div>
        <EmptyState v-else title="该状态下没有订单" description="去首页看看吧" />
      </a-spin>
    </div>

    <div v-if="total > size" class="pagination-bar">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="(p: number) => { current = p; load(); }"
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
</style>
