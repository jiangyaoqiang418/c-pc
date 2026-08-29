<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import * as financeApi from '@/service/api/finance';
import LockupCard from '@/components/finance/lockup-card.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const userStore = useUserStore();
const walletStore = useWalletStore();
const router = useRouter();

const activeKey = ref<Api.RealFinance.OrderStatus>('HOLDING');
const orders = ref<Api.RealFinance.FinanceOrderVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const allCounts = ref<Record<Api.RealFinance.OrderStatus, number>>({
  HOLDING: 0,
  SETTLED: 0,
  REDEEMED: 0,
  CANCELED: 0
});
const unlockModalOpen = ref(false);
const unlockTarget = ref<Api.RealFinance.FinanceOrderVO>();
const unlocking = ref(false);
const redeemedOrderIds = new Set<string>();
const requestGuard = createLatestRequestGuard();
const countsGuard = createLatestRequestGuard();
let writeVersion = 0;
let disposed = false;

const TABS: { key: Api.RealFinance.OrderStatus; label: string }[] = [
  { key: 'HOLDING', label: '持仓中' },
  { key: 'SETTLED', label: '已到期' },
  { key: 'REDEEMED', label: '提前赎回' },
  { key: 'CANCELED', label: '已取消' }
];

async function load() {
  if (disposed) return;
  const isCurrent = requestGuard.begin();
  if (!userStore.currentUser || disposed) return;
  loading.value = true;
  loadError.value = '';
  try {
    const r = await financeApi.fetchFinanceOrders({ pageNo: 1, pageSize: 50, status: activeKey.value }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    orders.value = r.records.map(order => redeemedOrderIds.has(String(order.id))
      ? { ...order, canRedeem: false }
      : order);
  } catch {
    if (!isCurrent()) return;
    orders.value = [];
    loadError.value = '锁仓列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadCounts() {
  if (disposed) return;
  const isCurrent = countsGuard.begin();
  if (!userStore.currentUser || disposed) return;
  try {
    const all = await Promise.all(
      TABS.map(t => financeApi.fetchFinanceOrders(
        { pageNo: 1, pageSize: 1, status: t.key },
        { signal: isCurrent.signal }
      ).then(r => ({ key: t.key, total: r.total })))
    );
    if (!isCurrent() || !userStore.currentUser) return;
    all.forEach(({ key, total }) => {
      allCounts.value[key] = total;
    });
  } catch {
    // 数量徽标加载失败不影响当前列表的浏览与切换。
  }
}

onMounted(async () => {
  await load();
  if (disposed) return;
  await loadCounts();
});
onBeforeUnmount(() => {
  disposed = true;
  writeVersion += 1;
  requestGuard.invalidate();
  countsGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  requestGuard.invalidate();
  countsGuard.invalidate();
  orders.value = [];
  redeemedOrderIds.clear();
  unlocking.value = false;
  unlockModalOpen.value = false;
  unlockTarget.value = undefined;
  allCounts.value = { HOLDING: 0, SETTLED: 0, REDEEMED: 0, CANCELED: 0 };
  void load();
  void loadCounts();
});
watch(activeKey, () => {
  if (!disposed) void load();
});

function onUnlock(order: Api.RealFinance.FinanceOrderVO) {
  if (redeemedOrderIds.has(String(order.id))) return;
  unlockTarget.value = order;
  unlockModalOpen.value = true;
}

async function confirmUnlock(order: Api.RealFinance.FinanceOrderVO) {
  const orderId = String(order.id);
  if (unlocking.value || redeemedOrderIds.has(orderId)) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  unlocking.value = true;
  try {
    try {
      await financeApi.redeemFinance({ id: order.id });
    } catch {
      if (isCurrentWrite()) Message.error('解锁失败，请稍后重试');
      return;
    }
    if (!isCurrentWrite()) return;
    redeemedOrderIds.add(orderId);
    orders.value = orders.value.map(item => String(item.id) === orderId
      ? { ...item, canRedeem: false }
      : item);
    Message.success('提前赎回申请成功，本金已返回可用余额');
    unlockModalOpen.value = false;
    unlockTarget.value = undefined;
    try {
      await walletStore.refetch();
    } catch {
      if (isCurrentWrite()) Message.warning('赎回已成功，钱包余额刷新失败，请稍后刷新查看');
    }
    if (!isCurrentWrite()) return;
    await load();
    if (!isCurrentWrite() || disposed) return;
    await loadCounts();
  } finally {
    if (operation === writeVersion) unlocking.value = false;
  }
}

function handleEmptyAction() {
  if (loadError.value) {
    load();
    return;
  }
  router.push('/finance');
}

const tabBadgeCount = computed(() => (k: Api.RealFinance.OrderStatus) => allCounts.value[k]);
</script>

<template>
  <div class="my-lockups-page shop-container">
    <h1 class="page-title">我的锁仓</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane v-for="t in TABS" :key="t.key">
          <template #title>
            {{ t.label }}
            <a-badge v-if="tabBadgeCount(t.key) > 0" :count="tabBadgeCount(t.key)" :max-count="99" class="badge" />
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <div class="list-wrap">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="orders.length">
          <LockupCard v-for="o in orders" :key="o.id" :order="o" @unlock="onUnlock" />
        </template>
        <EmptyState
          v-else
          :title="loadError ? '锁仓列表加载失败' : '该状态下没有锁仓'"
          :description="loadError || '先去小金库看看吧'"
          :action-text="loadError ? '重新加载' : '去小金库'"
          @action="handleEmptyAction"
        />
      </a-spin>
    </div>

    <EarlyUnlockModal
      v-model:visible="unlockModalOpen"
      :order="unlockTarget"
      :submitting="unlocking"
      @confirm="confirmUnlock"
    />
  </div>
</template>

<style scoped>
.my-lockups-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.list-wrap {
  margin-top: 16px;
}
.badge {
  margin-left: 4px;
}
@media (max-width: 640px) {
  .my-lockups-page :deep(.arco-tabs-nav-tab) { padding-right: 10px; padding-left: 10px; }
}
</style>
