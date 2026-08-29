<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
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
  { label: '押金', types: ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'] },
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
  const types = (value('types') || value('type') || '')
    .split(',')
    .filter((type): type is Api.Wallet.TxnType => TYPE_GROUPS.some(group => group.types.includes(type as Api.Wallet.TxnType)));
  const bucket = value('bucket') as Api.Wallet.Bucket | undefined;
  const from = value('from');
  const to = value('to');
  const page = Number(value('page'));

  filter.types = types;
  filter.bucket = BUCKET_OPTIONS.some(option => option.value === bucket) ? bucket : undefined;
  filter.dateRange = from || to ? [from || '', to || ''] : undefined;
  filter.keyword = value('keyword') || '';
  current.value = Number.isInteger(page) && page > 0 ? page : 1;
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
  if (!userStore.currentUser) return;
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const r = await walletApi.fetchWalletLedger({
      current: current.value,
      size: size.value,
      types: filter.types.length ? filter.types : undefined,
      signal: isCurrent.signal
    });
    if (!isCurrent()) return;
    const maxPage = Math.max(1, Math.ceil(r.total / size.value));
    if (current.value > maxPage) {
      current.value = maxPage;
      syncQuery();
      return;
    }
    let records = r.records;
    if (filter.bucket) records = records.filter(t => t.bucketFrom === filter.bucket || t.bucketTo === filter.bucket);
    if (filter.dateRange?.[0]) records = records.filter(t => t.createdAt >= filter.dateRange![0]);
    if (filter.dateRange?.[1]) records = records.filter(t => t.createdAt <= filter.dateRange![1]);
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      records = records.filter(
        t =>
          (t.remark || '').toLowerCase().includes(kw) ||
          (t.refId || '').toLowerCase().includes(kw) ||
          (t.chainTxHash || '').toLowerCase().includes(kw)
      );
    }
    list.value = records;
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
  applyQueryParams();
  void load();
});
onBeforeUnmount(requestGuard.invalidate);

watch(() => route.query, () => {
  applyQueryParams();
  void load();
});

watch(
  [() => userStore.currentAudience, () => userStore.currentUser?.id],
  ([nextAudience, nextUserId], [previousAudience, previousUserId]) => {
    if (nextAudience === previousAudience && String(nextUserId) === String(previousUserId)) return;
    current.value = 1;
    list.value = [];
    total.value = 0;
    loadError.value = '';
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
  if (!list.value.length) {
    Message.info('暂无可导出的流水');
    return;
  }
  const blob = new Blob([walletLedgerCsv(list.value)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `油宝资金流水-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleEmptyAction() {
  if (loadError.value) { void load(); return; }
  router.push('/wallet');
}
</script>

<template>
  <div class="history-page shop-container">
    <h1 class="page-title">资金流水</h1>

    <a-card class="filter-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <a-form :model="filter" layout="vertical">
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12" :lg="9">
            <a-form-item label="类型">
              <a-select v-model="filter.types" placeholder="全部类型" multiple allow-clear>
                <a-optgroup v-for="g in TYPE_GROUPS" :key="g.label" :label="g.label">
                  <a-option v-for="t in g.types" :key="t" :value="t">{{ t }}</a-option>
                </a-optgroup>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :lg="5">
            <a-form-item label="资产桶">
              <a-select v-model="filter.bucket" placeholder="全部" allow-clear>
                <a-option v-for="b in BUCKET_OPTIONS" :key="String(b.value)" :value="b.value">{{ b.label }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :lg="6">
            <a-form-item label="日期">
              <a-range-picker v-model="filter.dateRange" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :lg="4">
            <a-form-item label="关键字">
              <a-input v-model="filter.keyword" placeholder="哈希 / 引用 / 备注" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <div class="filter-actions">
          <a-button type="primary" @click="queryRecords">查询</a-button>
          <a-button @click="reset">重置</a-button>
          <a-button :disabled="!list.length" @click="exportCsv">导出 CSV</a-button>
        </div>
      </a-form>
    </a-card>

    <a-card :body-style="{ padding: 0 }" :bordered="false" class="list-card">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="list.length">
          <TxnRow v-for="t in list" :key="t.id" :txn="t" @detail="openDetail" />
        </template>
        <EmptyState
          v-else
          :title="loadError || '暂无符合条件的流水'"
          :description="loadError ? '不会展示不完整的流水数据。' : '充值、提现、订单支付或退款后会生成资金流水'"
          :action-text="loadError ? '重新加载' : '查看钱包'"
          @action="handleEmptyAction"
        />
      </a-spin>
    </a-card>

    <div v-if="total > size" class="pagination-bar">
      <a-pagination
        :total="total"
        :current="current"
        :page-size="size"
        show-total
        @change="changePage"
      />
    </div>

    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
  </div>
</template>

<style scoped>
.history-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: #1d2129;
}
.filter-card,
.list-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  margin-bottom: 16px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
@media (max-width: 640px) {
  .history-page { padding-top: 10px; }
  .filter-card :deep(.arco-card-body) { padding-left: 16px !important; padding-right: 16px !important; }
  .filter-actions { flex-wrap: wrap; }
}
</style>
