<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Icon } from '@iconify/vue';
import AmountInput from '@/components/common/amount-input.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import { useRoute, useRouter } from 'vue-router';
import { formatAmount } from '@shared';
import DepositMeter from '@/components/buyer/deposit-meter.vue';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailDrawer from '@/components/wallet/txn-detail-drawer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as realBuyerApi from '@/service/api/buyer';
import * as realOrderApi from '@/service/api/order';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { submitDepositOperation } from '@/utils/financial-submission';
import { resolvePageSize } from '@/service/api/page';
import { requestPayPassword } from '@/utils/pay-password';

const userStore = useUserStore();
const walletStore = useWalletStore();
const route = useRoute();
const router = useRouter();
const current = ref(1);
const pageSize = ref(20);
const total = ref(0);

function readPageQuery() {
  const rawPage = route.query.page;
  const page = typeof rawPage === 'string' ? Number(rawPage) : NaN;
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return rawPage !== undefined && (Array.isArray(rawPage) || !Number.isSafeInteger(page) || page <= 0);
}

function syncPageQuery(replace = false) {
  const before = route.fullPath;
  void (replace ? router.replace : router.push)({ query: { ...route.query,
    page: current.value > 1 ? String(current.value) : undefined } }).then(() => {
    if (route.fullPath === before) void loadAll();
  });
}

const txns = ref<Api.RealBuyer.DepositLedger[]>([]);
const orderCounts = ref<Record<string, number>>({});
const orderCountsLoaded = ref(false);
const loading = ref(false);
const loadError = ref('');
const drawerOpen = ref(false);
const drawerTxn = ref<Api.RealBuyer.DepositLedger>();
const account = computed(() => walletStore.account);
const summary = ref<Api.RealBuyer.DepositSummary>();
const transferOpen = ref(false);
const transferKind = ref<'pay' | 'refund'>('pay');
const transferAmount = ref<number>();
const transferring = ref(false);
const requestGuard = createLatestRequestGuard();
let writeVersion = 0;
const maxTransferAmount = computed(() => {
  const value = transferKind.value === 'pay' ? account.value?.available : summary.value?.depositAvailable;
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    txns.value = [];
    summary.value = undefined;
    total.value = 0;
    orderCounts.value = {};
    orderCountsLoaded.value = false;
    loadError.value = '';
    loading.value = false;
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loading.value = true;
  orderCountsLoaded.value = false;
  loadError.value = '';
  try {
    const [walletResult, summaryResult, txnResult, countsResult] = await Promise.allSettled([
      walletStore.fetchWallet(userId),
      realBuyerApi.fetchBuyerDepositSummary({ signal: isCurrent.signal, showError: false }),
      realBuyerApi.fetchBuyerDepositLedger({ pageNo: current.value, pageSize: pageSize.value }, { signal: isCurrent.signal }),
      realOrderApi.countMySoldOrdersByStatus({ showError: false, signal: isCurrent.signal })
    ]);
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    summary.value = summaryResult.status === 'fulfilled' ? summaryResult.value : undefined;
    txns.value = txnResult.status === 'fulfilled' ? txnResult.value.records : [];
    total.value = txnResult.status === 'fulfilled' ? txnResult.value.total : 0;
    if (txnResult.status === 'fulfilled') {
      pageSize.value = resolvePageSize(txnResult.value, pageSize.value);
      const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
      if (current.value > maxPage) {
        current.value = maxPage;
        syncPageQuery(true);
        return;
      }
    }
    orderCountsLoaded.value = countsResult.status === 'fulfilled';
    orderCounts.value = countsResult.status === 'fulfilled' ? countsResult.value : {};
    if (walletResult.status === 'rejected' || walletStore.account === undefined || summaryResult.status === 'rejected') {
      loadError.value = '押金账户加载失败，请检查网络后重试。';
    } else if (txnResult.status === 'rejected' || countsResult.status === 'rejected') {
      loadError.value = '押金流水或订单统计加载失败，请检查网络后重试。';
    }
  } catch {
    if (!isCurrent()) return;
    txns.value = [];
    total.value = 0;
    orderCounts.value = {};
    orderCountsLoaded.value = false;
    loadError.value = '押金信息加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}
onMounted(() => {
  const hasInvalidPage = readPageQuery();
  if (hasInvalidPage) syncPageQuery(true);
  else void loadAll();
});
watch(() => route.query.page, () => {
  if (readPageQuery()) {
    syncPageQuery(true);
    return;
  }
  void loadAll();
});
onBeforeUnmount(() => {
  writeVersion += 1;
  requestGuard.invalidate();
});
watch([() => userStore.currentUser?.id, () => userStore.currentAudience], ([nextUserId, nextAudience], [previousUserId, previousAudience]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience) return;
  writeVersion += 1;
  transferring.value = false;
  transferOpen.value = false;
  drawerOpen.value = false;
  drawerTxn.value = undefined;
  txns.value = [];
  summary.value = undefined;
  total.value = 0;
  current.value = 1;
  orderCounts.value = {};
  orderCountsLoaded.value = false;
  syncPageQuery(true);
});

const guaranteedOrderCount = computed(() => {
  if (!orderCountsLoaded.value) return undefined;
  const values = ['PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM', 'IN_AFTERSALE']
    .map(status => Number(orderCounts.value[status]));
  if (values.some(value => !Number.isFinite(value) || value < 0)) return undefined;
  return values.reduce((sum, value) => sum + Math.floor(value), 0);
});
const depositUtilization = computed(() => summary.value?.usageRate === undefined || summary.value.usageRate === null
  ? undefined : `${summary.value.usageRate}%`);

function openDepositTransfer(kind: 'pay' | 'refund') {
  if (transferring.value) return;
  writeVersion += 1;
  transferKind.value = kind;
  transferAmount.value = undefined;
  transferOpen.value = true;
}

async function submitDepositTransfer() {
  if (transferring.value) return;
  const amount = transferAmount.value;
  const kind = transferKind.value;
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    Message.warning('请输入正确的保证金金额');
    return;
  }
  if (loading.value || !account.value || maxTransferAmount.value === undefined) {
    Message.warning('请等待押金账户读取完成后再提交');
    return;
  }
  if (amount > maxTransferAmount.value) {
    Message.warning(transferKind.value === 'pay' ? '缴纳金额不能超过钱包可用余额' : '退还金额不能超过可用保证金');
    return;
  }

  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive;
  transferring.value = true;
  try {
    try {
      const payPassword = kind === 'pay' ? await requestPayPassword(route.fullPath) : undefined;
      if ((kind === 'pay' && !payPassword) || !isCurrentWrite()) return;
      await submitDepositOperation(requestedUserId, kind, amount, operation => {
        const params = { amount: operation.amount, idempotencyKey: operation.idempotencyKey, ...(operation.kind === 'pay' ? { payPassword } : {}) };
        return operation.kind === 'pay'
          ? realBuyerApi.payBuyerDeposit(params, { showError: false })
          : realBuyerApi.refundBuyerDeposit(params, { showError: false });
      });
      if (!isCurrentWrite()) return;
      Message.success(kind === 'pay' ? '保证金缴纳成功' : '保证金已退还至钱包');
      transferOpen.value = false;
      await loadAll();
    } catch (error) {
      if (isCurrentWrite()) {
        Message.error(error instanceof Error ? error.message : '押金操作未完成，请重新核对');
      }
    }
  } finally {
    if (operation === writeVersion) transferring.value = false;
  }
}

function openTxn(t: Api.RealBuyer.DepositLedger) {
  drawerTxn.value = t;
  drawerOpen.value = true;
}


</script>

<template>
  <div class="deposit-page shop-container">
    <header class="page-heading"><span class="eyebrow">UMAOMAO / BUYER DEPOSIT</span><h1>押金管理</h1><p>保证金从钱包划入或退回，订单占用部分不可退。</p></header>
    <Alert v-if="loadError" variant="destructive"><AlertDescription class="notice-row"><span>{{ loadError }}</span><Button variant="outline" size="sm" :disabled="loading || transferring" @click="loadAll">重新加载</Button></AlertDescription></Alert>
    <Alert v-if="account && (account.available === undefined || summary?.depositBalance === undefined || summary?.depositFrozen === undefined || summary?.depositAvailable === undefined)"><AlertDescription class="notice-row"><span>部分余额尚未取得，“—”不代表零；只能使用已确认的可用余额操作。</span><Button variant="outline" size="sm" :disabled="loading || transferring" @click="loadAll">重新读取余额</Button></AlertDescription></Alert>
    <section v-if="account" class="paper deposit-summary"><DepositMeter :balance="summary?.depositBalance" :frozen="summary?.depositFrozen" :available="summary?.depositAvailable" :usage-rate="summary?.usageRate" size="lg" /><div class="transfer-actions"><Button :disabled="transferring || loading" @click="openDepositTransfer('pay')">缴纳保证金</Button><Button variant="outline" :disabled="transferring || loading" @click="openDepositTransfer('refund')">退还至钱包</Button><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="sm"><Icon icon="lucide:book-open" />规则说明</Button></TooltipTrigger><TooltipContent class="rules-tooltip">上架资格由保证金汇总与免押资格决定；订单完成后占用保证金自动释放。</TooltipContent></Tooltip></div><Alert><AlertDescription>保证金从钱包可用余额划入或退还；提交后将刷新余额和流水。</AlertDescription></Alert></section>
    <Skeleton v-else-if="loading" class="summary-skeleton" aria-label="正在加载押金账户" />
    <EmptyState v-else :title="loadError ? '押金信息加载失败' : '暂无押金账户'" :description="loadError" :action-text="loadError ? '重新加载' : undefined" @action="loadAll" />
    <section v-if="account" class="paper"><h2>担保中订单</h2><dl class="stat-grid"><div><dt>担保中订单数</dt><dd>{{ guaranteedOrderCount ?? '—' }} <small>笔</small></dd></div><div><dt>订单占用</dt><dd>U {{ formatAmount(summary?.depositFrozen) }}</dd></div><div><dt>担保利用率</dt><dd>{{ depositUtilization ?? '—' }}</dd></div></dl></section>
    <section class="paper"><div class="section-heading"><h2>押金流水</h2><Button variant="ghost" size="sm" :disabled="loading" @click="loadAll"><Icon icon="lucide:refresh-cw" />刷新</Button></div><div v-if="txns.length"><TxnRow v-for="txn in txns" :key="txn.id" :txn="txn" @detail="openTxn" /></div><div v-else-if="loading" class="loading-list" aria-busy="true"><Skeleton v-for="n in 3" :key="n" class="row-skeleton" /></div><EmptyState v-else :title="loadError || '暂无押金流水'" :description="loadError ? '请稍后重试。' : undefined" :action-text="loadError ? '重新加载' : undefined" @action="loadError && loadAll()" /><BusinessPagination v-if="total > pageSize" :total="total" :current="current" :page-size="pageSize" :loading="loading" @change="(page: number) => { current = page; syncPageQuery(); }" /></section>
    <TxnDetailDrawer v-model:visible="drawerOpen" :txn="drawerTxn" />
    <a-modal v-model:visible="transferOpen" :title="transferKind === 'pay' ? '缴纳保证金' : '退还保证金至钱包'" :ok-loading="transferring" :closable="!transferring" :mask-closable="!transferring" :esc-to-close="!transferring" :on-before-cancel="() => !transferring" :on-before-ok="() => { void submitDepositTransfer(); return false; }">
      <div class="transfer-form"><Label for="buyer-deposit-amount">金额（USDT）<span class="required"> *</span></Label><AmountInput id="buyer-deposit-amount" v-model="transferAmount" :min="0.01" :max="maxTransferAmount" :disabled="transferring" :precision="2" placeholder="请输入金额" /><p class="available-hint">{{ transferKind === 'pay' ? '钱包可用余额' : '可退保证金' }}：U {{ maxTransferAmount === undefined ? '—' : formatAmount(maxTransferAmount) }}</p><Alert><AlertDescription>{{ transferKind === 'pay' ? '将从钱包可用余额划入保证金，需输入支付密码确认。' : '将从可用保证金退还至钱包余额。' }}</AlertDescription></Alert></div>
    </a-modal>
  </div>
</template>

<style scoped>
.deposit-page { display:grid; gap:24px; }.eyebrow { font-size:10px; color:var(--yb-gold); letter-spacing:1.8px; }.page-heading h1 { font-size:28px; font-weight:650; margin:8px 0; }.page-heading p { color:var(--yb-muted); font-size:13px; margin:0; }.notice-row,.section-heading { display:flex; justify-content:space-between; align-items:center; gap:18px; }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:12px; padding:28px; }.paper h2 { font-size:21px; font-weight:600; margin:0 0 24px; }.section-heading h2 { margin:0; }.section-heading { margin-bottom:24px; }.transfer-actions { display:flex; align-items:center; gap:12px; padding:26px 0; margin-top:24px; border-top:1px solid var(--yb-hairline); flex-wrap:wrap; }.rules-tooltip { max-width:300px; line-height:1.8; }.stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:26px; margin:0; }.stat-grid dt { color:var(--yb-muted); font-size:12px; }.stat-grid dd { font-size:26px; font-family:var(--yb-font-mono); margin:12px 0 0; font-weight:550; }.stat-grid small { font-size:14px; }.transfer-form { display:grid; gap:12px; }.required { color:var(--yb-danger); }.available-hint { font-size:12px; color:var(--yb-muted); margin:0 0 8px; }.loading-list { display:grid; gap:14px; }.row-skeleton { height:66px; }.summary-skeleton { height:335px; }@media(max-width:700px) { .paper { padding:20px; }.stat-grid { grid-template-columns:1fr; } }
</style>
