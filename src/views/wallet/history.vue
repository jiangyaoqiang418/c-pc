<script setup lang="ts">
import { computed } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import DateRangePicker from '@/components/common/date-range-picker.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { formatDateValue, parseDateValue } from '@/utils/date-range';
import { resolvePageSize } from '@/service/api/page';
import { enums } from '@shared';
import { displayWalletAmount as formatAmount } from '@/components/wallet/wallet-amount';
import WalletAssetTabs from '@/components/wallet/wallet-asset-tabs.vue';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as walletApi from '@/service/api/wallet';
import { walletLedgerCsv } from '@/utils/wallet-csv';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const asset = computed<Api.RealWallet.Asset>(() => route.query.asset === 'USDC' ? 'USDC' : 'USDT');
function selectAsset(value: Api.RealWallet.Asset) {
  requestGuard.invalidate();
  list.value = [];
  total.value = 0;
  drawerOpen.value = false;
  drawerTxn.value = undefined;
  void router.replace({ query: { ...currentQuery(), asset: value, page: undefined } });
}
function returnWallet() { void router.push({ path: userStore.isBuyerActive ? '/buyer/wallet' : '/wallet', query: { asset: asset.value } }); }
const userStore = useUserStore();

const list = ref<Api.RealWallet.Ledger[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const loadError = ref('');
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${asset.value}`);

const TYPE_GROUPS: { label: string; types: Api.Wallet.TxnType[] }[] = [
  { label: '链上', types: ['DEPOSIT_IN', 'WITHDRAW_OUT'] },
  { label: '内部', types: ['INTERNAL_PAY', 'INTERNAL_RECEIVE', 'INTERNAL_REFUND'] },
  { label: '小金库', types: ['FINANCE_LOCK', 'FINANCE_UNLOCK', 'INTEREST_ACCRUE'] },
  { label: '保证金', types: ['DEPOSIT_PLEDGE', 'DEPOSIT_FREEZE', 'DEPOSIT_UNFREEZE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'] },
  { label: '订单', types: ['ORDER_FREEZE', 'ORDER_SETTLE'] },
  { label: '风控', types: ['RISK_FREEZE', 'RISK_UNFREEZE'] },
  { label: '调整', types: ['ADJUST_PLUS', 'ADJUST_MINUS', 'FEE_DEDUCT'] }
];

const BUCKET_OPTIONS: { value?: Api.Wallet.Bucket; label: string }[] = [
  { value: undefined, label: '全部桶' },
  { value: 'available', label: '可用余额' },
  { value: 'nonWithdrawable', label: '不可转出' },
  { value: 'lockedFinance', label: '小金库锁仓' },
  { value: 'frozenOrder', label: '订单冻结' },
  { value: 'frozenRisk', label: '风控冻结' },
  { value: 'depositAvailable', label: '可担保保证金' },
  { value: 'depositGuaranteed', label: '已担保保证金' }
];

const filter = reactive<{
  types: Api.Wallet.TxnType[];
  bucket?: Api.Wallet.Bucket;
  dateRange?: string[];
  keyword: string;
}>({ types: [], keyword: '' });

function applyQueryParams() {
  const value = (key: string) => {
    const query = route.query[key];
    return Array.isArray(query) ? query[0] : query;
  };
  const rawTypes = value('types') || value('type') || '';
  const typeValues = rawTypes.split(',').filter(Boolean);
  const types = typeValues
    .filter((type): type is Api.Wallet.TxnType => TYPE_GROUPS.some(group => group.types.includes(type as Api.Wallet.TxnType)));
  const bucket = value('bucket') as Api.Wallet.Bucket | undefined;
  const from = value('from');
  const to = value('to');
  const page = Number(value('page'));

  filter.types = types;
  const validBucket = BUCKET_OPTIONS.some(option => option.value === bucket);
  filter.bucket = validBucket ? bucket : undefined;
  filter.dateRange = from || to ? [from || '', to || ''] : undefined;
  filter.keyword = value('keyword') || '';
  current.value = Number.isInteger(page) && page > 0 ? page : 1;
  const rawTypesQuery = route.query.types ?? route.query.type;
  const hasInvalidTypes = rawTypesQuery !== undefined && (Array.isArray(rawTypesQuery)
    || typeValues.some(type => !TYPE_GROUPS.some(group => group.types.includes(type as Api.Wallet.TxnType))));
  return hasInvalidTypes || (route.query.bucket !== undefined && (!validBucket || Array.isArray(route.query.bucket)));
}

function currentQuery() {
  return {
    asset: asset.value,
    ...(filter.types.length ? { types: filter.types.join(',') } : {}),
    ...(filter.bucket ? { bucket: filter.bucket } : {}),
    ...(filter.dateRange?.[0] ? { from: filter.dateRange[0] } : {}),
    ...(filter.dateRange?.[1] ? { to: filter.dateRange[1] } : {}),
    ...(filter.keyword.trim() ? { keyword: filter.keyword.trim() } : {}),
    ...(current.value > 1 ? { page: String(current.value) } : {})
  };
}

function syncQuery() {
  const before = route.fullPath;
  void router.replace({ query: currentQuery() }).then(() => {
    if (route.fullPath === before) void load();
  });
}

async function load() {
  const isCurrent = requestGuard.begin();
  list.value = [];
  drawerTxn.value = undefined;
  drawerOpen.value = false;
  if (!userStore.currentUser) {
    loading.value = false;
    list.value = [];
    total.value = 0;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const r = await walletApi.fetchWalletLedger({
      currency: asset.value,
      current: current.value,
      size: size.value,
      types: filter.types.length ? filter.types : undefined,
      bucket: filter.bucket,
      keyword: filter.keyword,
      fromAt: filter.dateRange?.[0],
      toAt: filter.dateRange?.[1],
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    size.value = resolvePageSize(r, size.value);
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery();
      return;
    }
    list.value = r.records;
    total.value = r.total;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    total.value = 0;
    loadError.value = '资金流水加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(() => {
  if (applyQueryParams()) {
    syncQuery();
    return;
  }
  void load();
});
onBeforeUnmount(requestGuard.invalidate);

watch(() => route.query, () => {
  if (applyQueryParams()) {
    syncQuery();
    return;
  }
  void load();
});

watch(
  [() => userStore.currentAudience, () => userStore.currentUser?.id, () => userStore.sessionVersion],
  ([nextAudience, nextUserId, nextSession], [previousAudience, previousUserId, previousSession]) => {
    if (nextAudience === previousAudience && String(nextUserId) === String(previousUserId) && nextSession === previousSession) return;
    requestGuard.invalidate();
    // URL 是分页来源；身份切换不再偷偷显示第一页，也不在其他页面导航守卫中另发导航。
    applyQueryParams();
    list.value = [];
    total.value = 0;
    loadError.value = '';
    drawerTxn.value = undefined;
    drawerOpen.value = false;
    void load();
  }
);

function reset() {
  filter.types = [];
  filter.bucket = undefined;
  filter.dateRange = undefined;
  filter.keyword = '';
  current.value = 1;
  syncQuery();
}

function queryRecords() {
  if (filter.dateRange?.[0] && filter.dateRange?.[1] && filter.dateRange[0] > filter.dateRange[1]) {
    Message.warning('开始日期不能晚于结束日期');
    return;
  }
  current.value = 1;
  syncQuery();
}

function changePage(page: number) {
  current.value = page;
  syncQuery();
}

function openDetail(t: Api.RealWallet.DisplayLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}

function exportCsv() {
  if (loading.value || loadError.value) return;
  if (!list.value.length) {
    Message.info('暂无可导出的流水');
    return;
  }
  const blob = new Blob([walletLedgerCsv(list.value)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Umaomao-${asset.value}资金流水-第${current.value}页-${list.value.length}条-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleEmptyAction() {
  if (loadError.value) { void load(); return; }
  returnWallet();
}


const bucketFilter = computed({
  get: () => filter.bucket || 'all',
  set: (value: string) => {
    if (value === 'all') filter.bucket = undefined;
    else if (BUCKET_OPTIONS.some(option => option.value === value)) filter.bucket = value as Api.Wallet.Bucket;
  }
});
function setType(type: Api.Wallet.TxnType, checked: boolean | 'indeterminate') {
  filter.types = checked === true ? [...filter.types.filter(value => value !== type), type] : filter.types.filter(value => value !== type);
}
function dateInputValue(value?: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = parseDateValue(value);
  if (timestamp === undefined) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const fromDate = computed({
  get: () => dateInputValue(filter.dateRange?.[0]),
  set: (value: string) => { filter.dateRange = value || filter.dateRange?.[1] ? [value, filter.dateRange?.[1] || ''] : undefined; }
});
const toDate = computed({
  get: () => dateInputValue(filter.dateRange?.[1]),
  set: (value: string) => { filter.dateRange = value || filter.dateRange?.[0] ? [filter.dateRange?.[0] || '', value] : undefined; }
});
</script>

<template>
  <div class="history-page">
    <div class="page-heading compact"><h1>资金流水</h1><WalletAssetTabs :model-value="asset" @update:model-value="selectAsset" /><span v-if="!loading && !loadError" class="heading-meta">共 {{ total }} 条 · 导出范围为当前页</span><button class="outline" @click="returnWallet()">返回钱包</button></div>
    <form class="paper ledger-filter" novalidate @submit.prevent="queryRecords" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
      <div class="ledger-filter-fields">
        <div class="field"><label for="ledger-type" class="ledger-field-label">类型</label><DropdownMenu><DropdownMenuTrigger as-child><button id="ledger-type" type="button" class="ledger-type-trigger" aria-label="选择资金流水类型"><span>{{ filter.types.length ? `已选 ${filter.types.length} 种类型` : '全部类型' }}</span><UmIcon name="chevron" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" :collision-padding="8" class="ledger-type-menu"><DropdownMenuItem @select="filter.types = []">不限 · 清除全部类型</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuGroup v-for="g in TYPE_GROUPS" :key="g.label"><DropdownMenuLabel>{{ g.label }}</DropdownMenuLabel><DropdownMenuCheckboxItem v-for="t in g.types" :key="t" :model-value="filter.types.includes(t)" @update:model-value="setType(t, $event)" @select.prevent>{{ enums.TXN_TYPE_META[t]?.label || t }}</DropdownMenuCheckboxItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
        <div class="field"><label for="ledger-bucket" class="ledger-field-label">资产桶</label><Select v-model="bucketFilter"><SelectTrigger id="ledger-bucket" class="app-select-trigger"><SelectValue placeholder="请选择账户类型" /></SelectTrigger><SelectContent><SelectItem v-for="b in BUCKET_OPTIONS" :key="b.value || 'all'" :value="b.value || 'all'">{{ b.label }}</SelectItem></SelectContent></Select></div>
        <div class="field ledger-date-field"><label for="ledger-date" class="ledger-field-label">日期</label><DateRangePicker id="ledger-date" v-model:from="fromDate" v-model:to="toDate" /></div>
        <div class="field"><label for="ledger-keyword" class="ledger-field-label">关键字</label><input id="ledger-keyword" v-model="filter.keyword" placeholder="哈希 / 引用 / 备注" /></div>
      </div>
      <div v-if="filter.types.length" class="ledger-type-chips"><button v-for="t in filter.types" :key="t" type="button" :aria-label="`取消筛选：${enums.TXN_TYPE_META[t]?.label || t}`" @click="setType(t, false)">{{ enums.TXN_TYPE_META[t]?.label || t }}<UmIcon name="close" /></button></div>
      <footer class="button-row ledger-filter-actions"><button type="submit" class="primary" :disabled="loading">查询</button><button type="button" class="outline" :disabled="loading" @click="reset">重置</button><button type="button" class="outline ledger-export" :disabled="loading || !!loadError || !list.length" @click="exportCsv">导出当前页（{{ list.length }} 条）</button></footer>
    </form>
    <section class="paper" :aria-busy="loading" aria-label="资金流水列表"><div v-if="loading && !list.length" class="ledger-skeletons"><Skeleton v-for="n in 5" :key="n" class="h-20" /></div><div v-else-if="list.length" :class="{ 'ledger-refreshing': loading }"><button v-for="t in list" :key="t.id" class="transaction wallet-transaction" :aria-label="'查看流水 ' + t.id" @click="openDetail(t)"><UmIcon :name="t.type === 'DEPOSIT_IN' || t.type === 'WITHDRAW_OUT' ? 'wallet' : t.type.startsWith('FINANCE') || t.type === 'INTEREST_ACCRUE' ? 'clock' : 'bag'" /><span class="transaction-copy"><b>{{ t.bizTypeText || enums.TXN_TYPE_META[t.type]?.label || '资金变动' }} · {{ t.refId || t.id }}</b><small>{{ formatDateValue(t.createdAt) }}</small><small v-if="t.remark" class="ledger-caption">{{ t.remark }}</small><small v-if="t.bucketFrom || t.bucketTo" class="ledger-caption">{{ t.bucketFrom ? enums.BUCKET_META[t.bucketFrom]?.label || t.bucketFrom : '' }}{{ t.bucketFrom && t.bucketTo ? ' → ' : '' }}{{ t.bucketTo ? enums.BUCKET_META[t.bucketTo]?.label || t.bucketTo : '' }}</small></span><b>{{ t.direction === 'in' ? '+' : '−' }} {{ formatAmount(t.amount) }} {{ t.currency || 'USDT' }}</b></button></div><EmptyState v-else :title="loadError || '暂无资金流水'" :description="loadError ? '请检查网络后重新加载。' : '充值、转出、订单支付或退款后会生成资金流水。'" :action-text="loadError ? '重新加载' : '返回钱包'" @action="handleEmptyAction" /></section>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="changePage" />
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped src="../../components/wallet/v47-wallet.css"></style>
<style scoped>
.history-page { padding-bottom:48px; }
.ledger-filter-fields { display:grid; grid-template-columns:1fr 1fr 1.8fr 1.2fr; gap:18px; }
.ledger-filter .field { display:flex; flex-direction:column; gap:8px; min-width:0; margin:0; }
.ledger-filter .ledger-field-label { display:block; margin:0; font-size:12px; font-weight:500; line-height:20px; color:var(--ink); }
.ledger-filter .field > input, .ledger-filter .ledger-type-trigger, .ledger-filter .app-select-trigger, .ledger-filter :deep(.date-range-trigger) { height:46px; min-height:46px; padding:0 14px; border-radius:8px; font-size:16px; font-weight:400; line-height:1.55; }
.ledger-type-trigger { display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--line); background:var(--paper); color:var(--ink); text-align:left; }
.ledger-type-trigger:focus-visible { outline:2px solid var(--focus-ring,var(--green)); outline-offset:2px; }
.ledger-type-trigger svg { width:15px; height:15px; transform:rotate(90deg); }
:global(.ledger-type-menu) { max-height:min(400px,70dvh,var(--reka-dropdown-menu-content-available-height,70dvh)); overflow:auto; min-width:min(230px,calc(100vw - 32px)); }
.ledger-filter-actions { margin-top:20px; }
.ledger-export { margin-left:auto; }
.ledger-type-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
.ledger-type-chips button { display:flex; align-items:center; gap:6px; padding:4px 9px; border:1px solid var(--line); border-radius:6px; background:var(--soft); color:var(--green); font-size:12px; }
.ledger-type-chips svg { width:12px; height:12px; }
.ledger-skeletons { display:grid; gap:12px; }
.ledger-refreshing { opacity:.65; }
@media(max-width:1100px) { .ledger-filter-fields { grid-template-columns:1fr 1fr; } }
@media(max-width:700px) { .ledger-export { margin-left:0; }.ledger-date-field { grid-column:1/-1; } }
</style>
