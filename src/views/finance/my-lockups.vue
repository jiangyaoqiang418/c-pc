<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Icon } from '@iconify/vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import * as financeApi from '@/service/api/finance';
import { requestPayPassword } from '@/utils/pay-password';
import LockupCard from '@/components/finance/lockup-card.vue';
import EarlyUnlockModal from '@/components/finance/early-unlock-modal.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { resolvePageSize } from '@/service/api/page';
import { financialSubmissionIssue } from '@/utils/financial-submission';

const userStore = useUserStore();
const walletStore = useWalletStore();
const router = useRouter();
const route = useRoute();

const activeKey = ref<Api.RealFinance.OrderStatus>('HOLDING');
const orders = ref<Api.RealFinance.FinanceOrderVO[]>([]);
const current = ref(1);
const pageSize = ref(20);
const total = ref(0);
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
const redemptionPending = ref(false);
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

function readQuery() {
  const matchedTab = typeof route.query.tab === 'string'
    ? TABS.find(tab => tab.key === route.query.tab)
    : undefined;
  activeKey.value = matchedTab?.key || 'HOLDING';
  const rawPage = route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return (route.query.tab !== undefined && !matchedTab)
    || (rawPage !== undefined && (Array.isArray(rawPage) || !Number.isSafeInteger(page) || page <= 0));
}

function syncQuery(replace = false) {
  const before = route.fullPath;
  const location = { query: { ...route.query, tab: activeKey.value, page: current.value > 1 ? String(current.value) : undefined } };
  void (replace ? router.replace(location) : router.push(location)).then(() => {
    if (!disposed && route.fullPath === before) void load();
  });
}

function changeTab(key: string | number) {
  activeKey.value = TABS.find(tab => tab.key === key)?.key || 'HOLDING';
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

async function load() {
  if (disposed) return;
  const isCurrent = requestGuard.begin();
  if (!userStore.currentUser || disposed) {
    loading.value = false;
    orders.value = [];
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const r = await financeApi.fetchFinanceOrders({ pageNo: current.value, pageSize: pageSize.value, status: activeKey.value }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = resolvePageSize(r, pageSize.value);
    const maxPage = Math.max(1, Math.ceil(r.total / pageSize.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery(true);
      return;
    }
    total.value = r.total;
    orders.value = r.records.map(order => redeemedOrderIds.has(String(order.id))
      ? { ...order, canRedeem: false }
      : order);
  } catch {
    if (!isCurrent()) return;
    orders.value = [];
    total.value = 0;
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
  if (readQuery()) void router.replace({ query: { ...route.query, tab: activeKey.value, page: current.value > 1 ? String(current.value) : undefined } });
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
  current.value = 1;
  total.value = 0;
  redeemedOrderIds.clear();
  unlocking.value = false;
  unlockModalOpen.value = false;
  unlockTarget.value = undefined;
  allCounts.value = { HOLDING: 0, SETTLED: 0, REDEEMED: 0, CANCELED: 0 };
  syncQuery(true);
  void loadCounts();
});
watch(() => route.fullPath, () => {
  if (disposed) return;
  if (readQuery()) {
    void router.replace({ query: { ...route.query, tab: activeKey.value, page: current.value > 1 ? String(current.value) : undefined } });
    return;
  }
  void load();
});

function onUnlock(order: Api.RealFinance.FinanceOrderVO) {
  if (unlocking.value || redeemedOrderIds.has(String(order.id))) return;
  redemptionPending.value = !!financialSubmissionIssue(userStore.currentUser?.id, `finance-redeem:${order.id}`);
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
      const payPassword = await requestPayPassword();
      if (!payPassword || !isCurrentWrite()) return;
      await financeApi.redeemFinanceWithReadback(requestedUserId, order.id, payPassword);
    } catch (error) {
      if (isCurrentWrite()) {
        redemptionPending.value = !!financialSubmissionIssue(requestedUserId, `finance-redeem:${order.id}`);
        Message.error(error instanceof Error ? error.message : '赎回未取得确定结果，请核实后再操作');
      }
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

  <div class="my-lockups-page">
    <header class="page-heading"><div><span class="eyebrow">YOUR LOCKED VAULT</span><h1>我的锁仓</h1><p>查看每笔锁仓的进度与结算。</p></div><Button variant="outline" @click="router.push('/finance')">浏览锁仓产品<Icon icon="lucide:arrow-right" width="16" /></Button></header>
    <nav class="page-links" aria-label="小金库导航"><RouterLink to="/finance">锁仓产品</RouterLink><RouterLink to="/finance/my-lockups" aria-current="page">我的锁仓</RouterLink></nav>
    <Tabs :model-value="activeKey" @update:model-value="changeTab"><TabsList class="status-tabs"><TabsTrigger v-for="t in TABS" :key="t.key" :value="t.key">{{ t.label }}<span v-if="tabBadgeCount(t.key) > 0" class="tab-count">{{ tabBadgeCount(t.key) }}</span></TabsTrigger></TabsList><TabsContent :value="activeKey" class="list-wrap">
      <div v-if="loading" aria-busy="true" aria-label="正在读取锁仓列表"><Skeleton v-for="n in 3" :key="n" class="lockup-skeleton" /></div>
      <EmptyState v-else-if="loadError" title="锁仓列表加载失败" :description="loadError" action-text="重新加载" @action="load" />
      <div v-else-if="orders.length" class="lockup-list"><LockupCard v-for="o in orders" :key="o.id" :order="o" @unlock="onUnlock" /></div>
      <EmptyState v-else title="该状态下没有锁仓" description="在这里查看每笔锁仓的进度与结算。" action-text="浏览锁仓产品" @action="handleEmptyAction" />
      <BusinessPagination v-if="!loading && !loadError && total > pageSize" :current="current" :page-size="pageSize" :total="total" @change="changePage" />
    </TabsContent></Tabs>
    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="unlockTarget" :submitting="unlocking" :pending="redemptionPending" @confirm="confirmUnlock" />
  </div>

</template>

<style scoped>

.my-lockups-page { padding-bottom:32px; }.page-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:24px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.page-heading h1 { font-size:30px; font-weight:650; margin:6px 0; }.page-heading p { font-size:14px; color:var(--yb-muted); margin:0; }.page-links { display:flex; gap:28px; margin-bottom:24px; border-bottom:1px solid var(--yb-hairline); }.page-links a { padding-bottom:13px; font-size:14px; color:var(--yb-muted); text-decoration:none; }.page-links [aria-current] { color:var(--yb-brand-primary); border-bottom:2px solid var(--yb-brand-primary); }.status-tabs { width:100%; height:auto; justify-content:flex-start; gap:8px; padding:8px; border:1px solid var(--yb-hairline); background:var(--yb-surface); border-radius:16px; }.status-tabs :deep(button) { padding:10px 20px; }.tab-count { margin-left:6px; font-size:12px; color:var(--yb-brand-primary); }.list-wrap { margin-top:24px; }.lockup-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin-bottom:24px; }.lockup-skeleton { height:260px; border-radius:20px; margin-bottom:20px; }

</style>
