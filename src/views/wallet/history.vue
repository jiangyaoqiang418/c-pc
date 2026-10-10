<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { parseDateValue } from '@/utils/date-range';
import { resolvePageSize } from '@/service/api/page';
import { enums } from '@shared';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as walletApi from '@/service/api/wallet';
import { walletLedgerCsv } from '@/utils/wallet-csv';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const list = ref<Api.RealWallet.Ledger[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(20);
const loading = ref(false);
const loadError = ref('');
const drawerTxn = ref<Api.RealWallet.DisplayLedger>();
const drawerOpen = ref(false);
const requestGuard = createLatestRequestGuard();

const TYPE_GROUPS: { label: string; types: Api.Wallet.TxnType[] }[] = [
  { label: '链上', types: ['DEPOSIT_IN', 'WITHDRAW_OUT'] },
  { label: '内部', types: ['INTERNAL_PAY', 'INTERNAL_RECEIVE', 'INTERNAL_REFUND'] },
  { label: '小金库', types: ['FINANCE_LOCK', 'FINANCE_UNLOCK', 'INTEREST_ACCRUE'] },
  { label: '押金', types: ['DEPOSIT_PLEDGE', 'DEPOSIT_FREEZE', 'DEPOSIT_UNFREEZE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'] },
  { label: '订单', types: ['ORDER_FREEZE', 'ORDER_SETTLE'] },
  { label: '风控', types: ['RISK_FREEZE', 'RISK_UNFREEZE'] },
  { label: '调整', types: ['ADJUST_PLUS', 'ADJUST_MINUS', 'FEE_DEDUCT'] }
];

const BUCKET_OPTIONS: { value?: Api.Wallet.Bucket; label: string }[] = [
  { value: undefined, label: '全部桶' },
  { value: 'available', label: '可用余额' },
  { value: 'nonWithdrawable', label: '不可提现' },
  { value: 'lockedFinance', label: '小金库锁仓' },
  { value: 'frozenOrder', label: '订单冻结' },
  { value: 'frozenRisk', label: '风控冻结' },
  { value: 'depositAvailable', label: '可担保押金' },
  { value: 'depositGuaranteed', label: '已担保押金' }
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
  [() => userStore.currentAudience, () => userStore.currentUser?.id],
  ([nextAudience, nextUserId], [previousAudience, previousUserId]) => {
    if (nextAudience === previousAudience && String(nextUserId) === String(previousUserId)) return;
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
  link.download = `油宝资金流水-第${current.value}页-${list.value.length}条-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleEmptyAction() {
  if (loadError.value) { void load(); return; }
  router.push('/wallet');
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
  <div class="history-page shop-container">
    <header class="page-head"><div><span class="eyebrow">WALLET TRANSACTIONS</span><h1>资金流水</h1><p v-if="!loading && !loadError">共 {{ total }} 条；导出范围为当前页。</p></div><Button variant="outline" @click="router.push('/wallet')">返回钱包</Button></header>
    <form class="filter-card" novalidate @submit.prevent="queryRecords" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
      <div class="filter-fields">
        <div class="field"><span class="field-label">类型</span><DropdownMenu><DropdownMenuTrigger as-child><Button type="button" variant="outline" class="type-trigger" aria-label="选择资金流水类型"><span>{{ filter.types.length ? `已选 ${filter.types.length} 种类型` : '全部类型' }}</span><Icon icon="lucide:chevron-down" width="15" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" class="type-menu"><DropdownMenuItem @select="filter.types = []">不限 · 清除全部类型</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuGroup v-for="g in TYPE_GROUPS" :key="g.label"><DropdownMenuLabel>{{ g.label }}</DropdownMenuLabel><DropdownMenuCheckboxItem v-for="t in g.types" :key="t" :model-value="filter.types.includes(t)" @update:model-value="setType(t, $event)" @select.prevent>{{ enums.TXN_TYPE_META[t]?.label || '未知类型' }}</DropdownMenuCheckboxItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
        <div class="field"><Label for="ledger-bucket">资产桶</Label><Select v-model="bucketFilter"><SelectTrigger id="ledger-bucket"><SelectValue placeholder="全部桶" /></SelectTrigger><SelectContent><SelectItem v-for="b in BUCKET_OPTIONS" :key="b.value || 'all'" :value="b.value || 'all'">{{ b.label }}</SelectItem></SelectContent></Select></div>
        <div class="field date-field"><span class="field-label">日期</span><div class="date-range"><Input v-model="fromDate" type="date" aria-label="开始日期" :max="toDate || undefined" /><span>—</span><Input v-model="toDate" type="date" aria-label="结束日期" :min="fromDate || undefined" /></div></div>
        <div class="field"><Label for="ledger-keyword">关键字</Label><Input id="ledger-keyword" v-model="filter.keyword" placeholder="哈希 / 引用 / 备注" /></div>
      </div>
      <div v-if="filter.types.length" class="type-chips"><button v-for="t in filter.types" :key="t" type="button" :aria-label="`取消筛选：${enums.TXN_TYPE_META[t]?.label || t}`" @click="setType(t, false)">{{ enums.TXN_TYPE_META[t]?.label || t }}<Icon icon="lucide:x" width="12" /></button></div>
      <footer class="filter-actions"><Button type="submit" :disabled="loading">查询</Button><Button type="button" variant="outline" :disabled="loading" @click="reset">重置</Button><Button type="button" variant="outline" class="export" :disabled="loading || !!loadError || !list.length" @click="exportCsv"><Icon icon="lucide:download" width="16" />导出当前页（{{ list.length }} 条）</Button></footer>
    </form>
    <section class="list-card" :aria-busy="loading" aria-label="资金流水列表"><div v-if="loading && !list.length" class="skeletons"><Skeleton v-for="n in 5" :key="n" class="h-20" /></div><div v-else-if="list.length" :class="{ refreshing: loading }"><TxnRow v-for="t in list" :key="t.id" :txn="t" @detail="openDetail" /></div><EmptyState v-else :title="loadError || '暂无符合条件的流水'" :description="loadError ? '不会展示不完整的流水数据。' : '充值、提现、订单支付或退款后会生成资金流水'" :action-text="loadError ? '重新加载' : '查看钱包'" @action="handleEmptyAction" /></section>
    <BusinessPagination v-if="total > size" :total="total" :current="current" :page-size="size" :loading="loading" @change="changePage" />
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.history-page { padding-top:32px; padding-bottom:48px; }.page-head { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:24px; }.eyebrow { color:var(--yb-gold); letter-spacing:2px; font-size:11px; }h1 { margin:5px 0 8px; font-size:28px; font-weight:650; }.page-head p { margin:0; color:var(--yb-muted); font-size:13px; }.filter-card,.list-card { background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; margin-bottom:24px; padding:24px; }.filter-fields { display:grid; grid-template-columns:1fr 1fr 1.8fr 1.2fr; gap:20px; }.field { display:grid; gap:10px; min-width:0; }.field-label { font-size:14px; font-weight:500; }.type-trigger { justify-content:space-between; }.type-menu { max-height:min(400px,70dvh); overflow-y:auto; min-width:230px; }.date-range { display:flex; align-items:center; gap:8px; }.date-range input { min-width:0; }.date-range>span { color:var(--yb-muted); }.filter-actions { display:flex; gap:12px; margin-top:24px; }.export { margin-left:auto; }.type-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }.type-chips button { display:flex; align-items:center; gap:6px; padding:4px 9px; border:0; border-radius:4px; background:var(--yb-primary-soft); color:var(--yb-brand-primary); font-size:12px; cursor:pointer; }.type-chips button:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.list-card { padding:12px 20px; }.skeletons { display:grid; gap:12px; padding:12px 0; }.refreshing { opacity:.65; }@media(max-width:1100px) { .filter-fields { grid-template-columns:1fr 1fr; } }@media(max-width:700px) { .filter-actions { flex-wrap:wrap; }.export { margin-left:0; }.date-field { grid-column:1/-1; } }
</style>
