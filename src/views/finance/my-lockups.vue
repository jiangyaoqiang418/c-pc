<script setup lang="ts">
import V47VaultHeader from '@/components/finance/v47-vault-header.vue';
import { formatAmount } from '@shared';
import { Skeleton } from '@/components/ui/skeleton';
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
import { sumPaymentAmounts } from '@/utils/checkout';
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
const allCounts = ref<Partial<Record<Api.RealFinance.OrderStatus, number>>>({});
const overview = ref<Api.RealFinance.FinanceOverviewVO>();
const accumulatedInterest = computed(() => financeApi.financeAccumulatedInterest(overview.value));
const overviewError = ref(false);
const overviewReading = ref(false);
const unlockModalOpen = ref(false);
const unlockTarget = ref<Api.RealFinance.FinanceOrderVO>();
const unlocking = ref(false);
const redemptionPending = ref(false);
const redeemedOrderIds = new Set<string>();
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const countsGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
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
  overviewReading.value = true;
  const [counts, summary] = await Promise.allSettled([
    Promise.all(TABS.map(t => financeApi.fetchFinanceOrders(
      { pageNo: 1, pageSize: 1, status: t.key }, { signal: isCurrent.signal }
    ).then(r => ({ key: t.key, total: r.total })))),
    financeApi.fetchFinanceOverview({ signal: isCurrent.signal, showError: false })
  ]);
  if (!isCurrent() || !userStore.currentUser) return;
  allCounts.value = counts.status === 'fulfilled'
    ? Object.fromEntries(counts.value.map(item => [item.key, item.total])) : {};
  overview.value = summary.status === 'fulfilled' ? summary.value : undefined;
  overviewError.value = summary.status === 'rejected' || counts.status === 'rejected';
  overviewReading.value = false;
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
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], ([next, nextSession], [previous, previousSession]) => {
  if (disposed) return;
  if (String(next) === String(previous) && nextSession === previousSession) return;
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
  allCounts.value = {};
  overview.value = undefined;
  overviewError.value = false;
  overviewReading.value = false;
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
      if (!financialSubmissionIssue(requestedUserId, `finance-redeem:${order.id}`)) {
        const latest = await financeApi.fetchFinanceOrderDetail(order.id, { showError:false });
        if (!isCurrentWrite()) return;
        const fields = ['principal', 'redeemFee', 'redeemableInterest'] as const;
        if (String(latest.id) !== String(order.id) || financeApi.financeRedemptionIssue(latest)
          || fields.some(field => sumPaymentAmounts([latest[field] ?? '']) !== sumPaymentAmounts([order[field] ?? '']))) {
          unlockModalOpen.value = false;
          Message.warning('赎回报价或状态已变化，请重新核对后确认');
          await load();
          return;
        }
      }
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




</script>

<template>
  <div class="vault-workspace">
    <V47VaultHeader section="holdings" :holding-count="overview?.holdingCount" />
    <div v-if="overviewError" class="status-banner vault-production-notice" role="alert"><span>部分锁仓概览未能读取，列表仍可查看。</span><button class="outline" :disabled="overviewReading" @click="loadCounts">重新读取概览</button></div>
    <div class="vault-holdings-summary"><span>锁仓本金<strong>{{ formatAmount(overview?.holdingPrincipal) }} <small>USDT</small></strong></span><span>累计利息<strong class="positive">{{ accumulatedInterest === undefined ? '—' : '+ ' + formatAmount(accumulatedInterest, { decimals: 4 }) }} <small>USDT</small></strong></span></div>
    <div class="vault-status-tabs" role="group" aria-label="锁仓状态"><button v-for="t in TABS" :key="t.key" :class="{ active: activeKey === t.key }" :aria-pressed="activeKey === t.key" @click="changeTab(t.key)">{{ t.label }}<span v-if="allCounts[t.key] !== undefined">{{ allCounts[t.key] }}</span></button></div>
    <div v-if="loading" aria-busy="true" aria-label="正在读取锁仓列表"><Skeleton v-for="n in 3" :key="n" class="vault-lockup-skeleton" /></div>
    <EmptyState v-else-if="loadError" title="锁仓列表加载失败" :description="loadError" action-text="重新读取" @action="load" />
    <div v-else-if="orders.length" class="vault-position-list"><LockupCard v-for="o in orders" :key="o.id" :order="o" @unlock="onUnlock" /></div>
    <EmptyState v-else title="该状态下没有锁仓" description="在这里查看每笔锁仓的进度与结算。" action-text="浏览锁仓产品" @action="handleEmptyAction" />
    <BusinessPagination v-if="!loading && !loadError && total > pageSize" :current="current" :page-size="pageSize" :total="total" @change="changePage" />
    <EarlyUnlockModal v-model:visible="unlockModalOpen" :order="unlockTarget" :submitting="unlocking" :pending="redemptionPending" @confirm="confirmUnlock" />
  </div>
</template>

<style scoped src="./v47-vault.css"></style>
