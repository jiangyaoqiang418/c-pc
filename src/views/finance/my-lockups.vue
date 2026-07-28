<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { financeApi } from '@shared';
import LockupCard from '@/components/finance/lockup-card.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();

const activeKey = ref<Api.FinanceProduct.LockupStatus>('active');
const orders = ref<Api.FinanceProduct.LockupOrder[]>([]);
const loading = ref(false);
const allCounts = ref<Record<Api.FinanceProduct.LockupStatus, number>>({
  active: 0,
  matured: 0,
  early_unlocked: 0,
  cancelled: 0
});
const unlockModalOpen = ref(false);
const unlockTarget = ref<Api.FinanceProduct.LockupOrder>();

const TABS: { key: Api.FinanceProduct.LockupStatus; label: string }[] = [
  { key: 'active', label: '持仓中' },
  { key: 'matured', label: '已到期' },
  { key: 'early_unlocked', label: '提前解锁' },
  { key: 'cancelled', label: '已取消' }
];

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const r = await financeApi.fetchMyLockups(userStore.currentUser.id, activeKey.value);
    orders.value = r.records;
  } finally {
    loading.value = false;
  }
}

async function loadCounts() {
  if (!userStore.currentUser) return;
  const all = await Promise.all(
    TABS.map(t => financeApi.fetchMyLockups(userStore.currentUser!.id, t.key).then(r => ({ key: t.key, total: r.total })))
  );
  all.forEach(({ key, total }) => {
    allCounts.value[key] = total;
  });
}

onMounted(async () => {
  await load();
  await loadCounts();
});
watch(activeKey, load);

function onUnlock(order: Api.FinanceProduct.LockupOrder) {
  unlockTarget.value = order;
  unlockModalOpen.value = true;
}

async function confirmUnlock(order: Api.FinanceProduct.LockupOrder) {
  const r = await financeApi.earlyUnlockMock(order.id);
  if (r.ok) {
    Message.success('提前解锁成功，本金已返回可用余额');
    unlockModalOpen.value = false;
    await walletStore.refetch();
    await load();
    await loadCounts();
  } else {
    Message.error(r.message || '解锁失败');
  }
}

const tabBadgeCount = computed(() => (k: Api.FinanceProduct.LockupStatus) => allCounts.value[k]);
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
        <EmptyState v-else title="该状态下没有锁仓" description="先去小金库看看吧" action-text="去小金库" @action="$router.push('/finance')" />
      </a-spin>
    </div>

    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="unlockTarget" @confirm="confirmUnlock" />
  </div>
</template>

<style scoped>
.my-lockups-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.list-wrap {
  margin-top: 16px;
}
.badge {
  margin-left: 4px;
}
</style>
