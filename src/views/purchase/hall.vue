<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AmountInput from '@/components/common/amount-input.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { formatAmount } from '@shared';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const list = ref<Api.RealPurchase.Record[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(15);
const loading = ref(false);
const keyword = ref('');
const minBudget = ref<number>();
const maxBudget = ref<number>();
const expDaysFilter = ref<number | undefined>();
const claimingId = ref<string | number>();
const loadError = ref('');
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;

function queryValue(key: string) {
  const value = route.query[key];
  return Array.isArray(value) ? value[0] : value;
}

function positiveNumber(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function syncFromQuery() {
  keyword.value = queryValue('keyword') || '';
  const rawMinBudget = Array.isArray(route.query.minBudget) ? route.query.minBudget[0] : route.query.minBudget;
  const rawMaxBudget = Array.isArray(route.query.maxBudget) ? route.query.maxBudget[0] : route.query.maxBudget;
  const parsedMinBudget = typeof rawMinBudget === 'string' ? positiveNumber(rawMinBudget) : undefined;
  const parsedMaxBudget = typeof rawMaxBudget === 'string' ? positiveNumber(rawMaxBudget) : undefined;
  minBudget.value = parsedMinBudget;
  maxBudget.value = parsedMaxBudget;
  const rawDays = Array.isArray(route.query.expectedDays) ? route.query.expectedDays[0] : route.query.expectedDays;
  const days = typeof rawDays === 'string' ? positiveNumber(rawDays) : undefined;
  const validDays = days !== undefined && [7, 15, 30].includes(days);
  expDaysFilter.value = validDays ? days : undefined;
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  const validPage = Number.isSafeInteger(page) && page > 0;
  current.value = validPage ? page : 1;
  return (route.query.minBudget !== undefined && (Array.isArray(route.query.minBudget) || parsedMinBudget === undefined))
    || (route.query.maxBudget !== undefined && (Array.isArray(route.query.maxBudget) || parsedMaxBudget === undefined))
    || (route.query.expectedDays !== undefined && (!validDays || Array.isArray(route.query.expectedDays)))
    || (route.query.page !== undefined && (Array.isArray(route.query.page) || !validPage));
}

function currentQuery() {
  return {
    ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
    ...(minBudget.value !== undefined ? { minBudget: String(minBudget.value) } : {}),
    ...(maxBudget.value !== undefined ? { maxBudget: String(maxBudget.value) } : {}),
    ...(expDaysFilter.value !== undefined ? { expectedDays: String(expDaysFilter.value) } : {}),
    ...(current.value > 1 ? { page: String(current.value) } : {})
  };
}

function syncQuery() {
  const before = route.fullPath;
  void router.push({ query: currentQuery() }).then(() => {
    if (route.fullPath === before) void load();
  });
}

const canClaim = computed(() => {
  if (!userStore.currentUser) return false;
  return userStore.isBuyerActive;
});

async function load() {
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const r = await purchaseApi.fetchHall({
      current: current.value,
      size: size.value,
      keyword: keyword.value || undefined,
      minBudget: minBudget.value,
      maxBudget: maxBudget.value,
      maxDeliveryDays: expDaysFilter.value,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      void router.replace({ query: currentQuery() });
      return;
    }
    list.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '求购大厅加载失败，请检查登录状态或网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(() => {
  if (syncFromQuery()) {
    void router.replace({ query: currentQuery() });
    return;
  }
  void load();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch(() => route.fullPath, () => {
  if (syncFromQuery()) {
    void router.replace({ query: currentQuery() });
    return;
  }
  void load();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  claimingId.value = undefined;
  list.value = [];
  total.value = 0;
  void load();
});

async function onClaim(req: Api.RealPurchase.Record) {
  if (claimingId.value !== undefined) return;
  if (!userStore.currentUser) {
    Message.warning('请先登录后再接单');
    router.push({ name: 'login', query: { redirect: '/purchase/hall' } });
    return;
  }
  const requestedUserId = userStore.currentUser.id;
  const requestedRequestId = req.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive
    && String(req.id) === String(requestedRequestId);
  claimingId.value = req.id;
  try {
    const r = await purchaseApi.claimRequest(requestedRequestId);
    if (!isCurrentWrite()) return;
    if (r.ok) {
      Message.success('接单成功');
      await load();
      if (!isCurrentWrite()) return;
      router.push({ name: 'purchase-detail', params: { id: String(requestedRequestId) } });
    } else {
      Message.error(r.message || '接单失败');
    }
  } catch {
    // 请求层已展示错误，保留当前求购供用户重试。
  } finally {
    if (operation === writeVersion) claimingId.value = undefined;
  }
}

function finiteBudget(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const totalBudget = computed<string | undefined>(() => {
  let sum = 0;
  for (const record of list.value) {
    const budget = finiteBudget(record.budgetAmount);
    if (budget === undefined) return undefined;
    sum += budget;
  }
  return sum.toFixed(2);
});
const avgBudget = computed<string | undefined>(() => {
  if (!list.value.length) return '0.00';
  if (totalBudget.value === undefined) return undefined;
  const total = Number(totalBudget.value);
  return Number.isFinite(total) ? (total / list.value.length).toFixed(2) : undefined;
});

function reset() {
  keyword.value = '';
  minBudget.value = undefined;
  maxBudget.value = undefined;
  expDaysFilter.value = undefined;
  current.value = 1;
  syncQuery();
}

function queryRecords() {
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}


const minBudgetField = computed({
  get: () => minBudget.value,
  set: (value: number) => { minBudget.value = Number.isFinite(value) ? value : undefined; }
});
const maxBudgetField = computed({
  get: () => maxBudget.value,
  set: (value: number) => { maxBudget.value = Number.isFinite(value) ? value : undefined; }
});
function selectExpectedDays(value: unknown) {
  expDaysFilter.value = value === '7' ? 7 : value === '15' ? 15 : value === '30' ? 30 : undefined;
}

</script>

<template>

  <div class="hall-page">
    <div class="page-heading compact"><h1>求购大厅</h1><button type="button" class="primary" @click="router.push('/purchase/create')">发起求购 <UmIcon name="plus" /></button></div>
    <div class="tabs"><button type="button" class="active" @click="router.push('/purchase/hall')">求购大厅</button><button type="button" @click="router.push('/purchase')">我的求购</button></div>
    <section class="paper demand-filters">
      <form @submit.prevent="queryRecords">
        <div class="field keyword"><label for="demand-keyword">关键词</label><Input id="demand-keyword" v-model="keyword" placeholder="搜索商品标题" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }" /></div>
        <div class="field budget-field"><span id="demand-budget-label">预算区间 · USDT</span><div class="range" aria-labelledby="demand-budget-label"><AmountInput v-model="minBudgetField" :min="0" :precision="8" aria-label="最低预算" placeholder="最低" /><span>—</span><AmountInput v-model="maxBudgetField" :min="0" :precision="8" aria-label="最高预算" placeholder="最高" /></div></div>
        <div class="field days"><label for="demand-days">期望天数</label><Select :model-value="expDaysFilter === undefined ? 'all' : String(expDaysFilter)" @update:model-value="selectExpectedDays"><SelectTrigger id="demand-days" class="h-11 text-[15px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">不限</SelectItem><SelectItem value="7">≤ 7 天</SelectItem><SelectItem value="15">≤ 15 天</SelectItem><SelectItem value="30">≤ 30 天</SelectItem></SelectContent></Select></div>
        <div class="button-row"><button type="submit" class="h-11 text-[15px] primary"><Icon icon="lucide:search" width="16" />查询</button><button type="button"  class="h-11 text-[15px] outline" @click="reset">重置</button></div>
      </form>
    </section>
    <div v-if="!canClaim && userStore.isLoggedIn" class="status-banner">
      <Icon icon="lucide:info" width="20" /><p><strong>仅已审核通过的买手可接单。</strong><span>{{ userStore.canSwitchToBuyer ? '可进入买手工作台接单' : '提交买手申请并等待平台审核' }}</span></p><button type="button" class="outline"  @click="userStore.canSwitchToBuyer ? router.push('/buyer/dashboard') : router.push('/buyer/apply')">{{ userStore.canSwitchToBuyer ? '进入买手工作台' : '申请成为买手' }}</button>
    </div>
    <section class="market-summary" aria-label="当前筛选结果">
      <div><small>符合当前条件</small><strong>{{ loading || loadError ? '—' : total }} <span>条求购</span></strong></div>
      <div><small>当前页预算总额</small><strong>{{ loading || loadError ? '—' : formatAmount(totalBudget) }} <span>USDT</span></strong></div>
      <div><small>当前页平均预算</small><strong>{{ loading || loadError ? '—' : formatAmount(avgBudget) }} <span>USDT</span></strong></div>
    </section>
    <div v-if="loading" class="request-grid" aria-busy="true" aria-label="正在读取求购列表"><Skeleton v-for="n in 6" :key="n" class="request-skeleton" /></div>
    <EmptyState v-else-if="loadError" :title="loadError" description="未展示不完整的求购数据，请重新加载。" action-text="重新加载" @action="load" />
    <div v-else-if="list.length" class="request-grid"><PurchaseRequestCard v-for="r in list" :key="r.id" :request="r" mode="hall" :can-claim="canClaim" :claiming="String(claimingId) === String(r.id)" @claim="onClaim" /></div>
    <EmptyState v-else icon="lucide:search" title="暂无符合条件的求购" description="尝试调整筛选条件，或发起你的求购。" action-text="重置筛选" @action="reset" />
    <BusinessPagination v-if="!loading && !loadError && total > size" :total="total" :current="current" :page-size="size" @change="changePage" />
  </div>

</template>

<style scoped>
.demand-filters form { display:grid; grid-template-columns:1.2fr 1.4fr .8fr auto; gap:20px; align-items:end; }
.demand-filters .field { margin:0; min-width:0; }.range { display:flex; gap:10px; align-items:center; }.range > :not(span) { min-width:0; width:100%; }
.status-banner p { flex:1; }.status-banner p span { display:block; font-size:13px; }
.market-summary { display:flex; gap:32px; margin:20px 0; flex-wrap:wrap; }.market-summary div { display:grid; gap:4px; }.market-summary strong { font-size:24px; font-family:var(--yb-font-mono); }.market-summary strong span { font-size:13px; color:var(--muted); }.request-skeleton { height:300px; border-radius:10px; }
@media (max-width:1100px) { .demand-filters form { grid-template-columns:1fr 1fr; } }
@media (max-width:700px) { .demand-filters form { grid-template-columns:1fr; }.status-banner { flex-wrap:wrap; } }
</style>
