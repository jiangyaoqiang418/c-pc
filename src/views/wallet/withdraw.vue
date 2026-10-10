<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import BusinessPagination from '@/components/common/business-pagination.vue';
import AmountInput from '@/components/common/amount-input.vue';
import DescriptionList from '@/components/common/description-list.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { formatAmount } from '@shared';
import * as realWalletApi from '@/service/api/wallet';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { financialSubmissionIssue, financialSubmissionSnapshot, submitKeyedFinancialOperation, type FinancialSnapshot } from '@/utils/financial-submission';
import { requestPayPassword } from '@/utils/pay-password';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const walletStore = useWalletStore();
type WithdrawForm = Omit<Api.RealWallet.WithdrawCreateParams, 'payPassword'>;
const form = reactive<WithdrawForm>({ chain: 'TRON', toAddress: '', amount: 0 });
const submitting = ref(false);
const modalOpen = ref(false);
const confirmedParams = ref<WithdrawForm>();
const submissionIssue = ref('');
const pendingSnapshot = ref<FinancialSnapshot>();
function refreshSubmissionIssue() {
  submissionIssue.value = financialSubmissionIssue(userStore.currentUser?.id, 'withdraw');
  pendingSnapshot.value = financialSubmissionSnapshot(userStore.currentUser?.id, 'withdraw');
}
const loadingRecords = ref(false);
const recentWithdrawals = ref<Api.RealWallet.WithdrawVO[]>([]);
const recordCurrent = ref(1);
const recordSize = ref(10);
const recordTotal = ref(0);
const recordStatus = ref<Api.RealWallet.WithdrawStatus>();

function readRecordsQuery() {
  const page = Number(route.query.page);
  recordCurrent.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const status = typeof route.query.status === 'string' && ['REVIEWING', 'APPROVED', 'SUCCESS', 'REJECTED'].includes(route.query.status)
    ? route.query.status as Api.RealWallet.WithdrawStatus : undefined;
  recordStatus.value = status;
  return route.query.status !== undefined && !status;
}

async function syncRecordsQuery(replace = false) {
  const before = route.fullPath;
  await (replace ? router.replace : router.push)({ query: { ...route.query,
    page: recordCurrent.value > 1 ? String(recordCurrent.value) : undefined, status: recordStatus.value } });
  if (route.fullPath === before) await loadRecords();
}
const createdWithdrawal = ref<Api.RealWallet.WithdrawVO>();
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.RealWallet.WithdrawVO>();
const detailTargetId = ref<string | number>();
const loadError = ref('');
const recordError = ref('');
const detailError = ref('');
const requestGuard = createLatestRequestGuard();
const recordsGuard = createLatestRequestGuard();
const detailGuard = createLatestRequestGuard();
let writeVersion = 0;

const chainOptions = [
  { value: 'TRON', label: 'TRC20（USDT-TRON）' },
  { value: 'ETH', label: 'ERC20（USDT-ETH）' },
  { value: 'BSC', label: 'BEP20（USDT-BSC）' }
] as const;

const available = computed(() => walletStore.account?.available === undefined ? undefined : Number(walletStore.account.available));
const walletReady = computed(() => !walletStore.loading && !loadError.value && !!walletStore.lastFetchedAt
  && !!walletStore.account && String(walletStore.account.userId) === String(userStore.currentUser?.id));
const availableForSubmit = computed(() => walletReady.value ? walletStore.account?.available : undefined);
const errMsg = computed(() => realWalletApi.prepareWithdrawal(form, availableForSubmit.value).error);
const canSubmit = computed(() => !submitting.value && !errMsg.value && !submissionIssue.value);
const kycTipNeeded = computed(() => userStore.currentUser && userStore.currentUser.kycStatus !== 'approved');

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatMoney(value?: string | number) {
  return value === undefined || value === null ? '—' : `U ${formatAmount(value)}`;
}

let activePayPassword = '';
const withdrawalIntentApi = {
  lookup: realWalletApi.fetchWithdrawByKey,
  submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => realWalletApi.createWithdraw({
    chain: snapshot.chain as Api.RealWallet.WithdrawCreateParams['chain'], toAddress: snapshot.toAddress!, amount: Number(snapshot.amount), idempotencyKey, payPassword: activePayPassword
  }, { showError: false })
};

async function restoreWithdrawal() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined || submitting.value) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentWrite()) return;
    activePayPassword = payPassword;
    const id = await submitKeyedFinancialOperation(userId, 'withdraw', undefined, withdrawalIntentApi, true);
    if (!isCurrentWrite()) return;
    refreshSubmissionIssue();
    await openDetail(id);
    if (operation === writeVersion) await loadAll();
  } catch (error) {
    if (operation === writeVersion) Message.warning(error instanceof Error ? error.message : '原申请核对失败');
  } finally {
    activePayPassword = '';
    if (operation === writeVersion) { submitting.value = false; refreshSubmissionIssue(); }
  }
}

async function loadRecords() {
  const isCurrent = recordsGuard.begin();
  loadingRecords.value = true;
  recordError.value = '';
  try {
    const result = await realWalletApi.fetchWithdrawPage({
      pageNo: recordCurrent.value,
      pageSize: recordSize.value,
      status: recordStatus.value
    }, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    recordSize.value = resolvePageSize(result, recordSize.value);
    const maxPage = Math.max(1, Math.ceil(result.total / recordSize.value));
    if (recordCurrent.value > maxPage) {
      recordCurrent.value = maxPage;
      await syncRecordsQuery(true);
      return;
    }
    recentWithdrawals.value = result.records;
    recordTotal.value = result.total;
  } catch {
    if (!isCurrent()) return;
    recentWithdrawals.value = [];
    recordTotal.value = 0;
    recordError.value = '转出申请加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loadingRecords.value = false;
  }
}

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    recordsGuard.invalidate();
    detailGuard.invalidate();
    recentWithdrawals.value = [];
    recordTotal.value = 0;
    createdWithdrawal.value = undefined;
    detail.value = undefined;
    loadError.value = '';
    loadingRecords.value = false;
    detailLoading.value = false;
    recordError.value = '';
    detailError.value = '';
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loadError.value = '';
  const [wallet] = await Promise.allSettled([walletStore.fetchWallet(userId), loadRecords()]);
  if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
  if (wallet.status === 'rejected') loadError.value = '钱包余额加载失败，请稍后重试';
}

function fillAll() {
  if (!walletReady.value || available.value === undefined) return;
  form.amount = Math.max(0, available.value);
}

function openConfirm() {
  refreshSubmissionIssue();
  if (!canSubmit.value) {
    Message.warning(submissionIssue.value || errMsg.value || '请完善表单');
    return;
  }
  confirmedParams.value = realWalletApi.prepareWithdrawal(form, availableForSubmit.value).params;
  modalOpen.value = true;
}

async function confirm() {
  if (submitting.value || !modalOpen.value || !confirmedParams.value) return;
  refreshSubmissionIssue();
  if (submissionIssue.value) {
    Message.warning(submissionIssue.value);
    return;
  }
  const prepared = realWalletApi.prepareWithdrawal(confirmedParams.value, availableForSubmit.value);
  if (prepared.error) {
    Message.warning(prepared.error);
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentWrite()) return;
    activePayPassword = payPassword;
    const id = await submitKeyedFinancialOperation(requestedUserId, 'withdraw', prepared.params, withdrawalIntentApi);
    if (!isCurrentWrite()) return;
    refreshSubmissionIssue();
    let nextWithdrawal: Api.RealWallet.WithdrawVO | undefined;
    let detailReadFailed = false;
    if (!nextWithdrawal) {
      try {
        nextWithdrawal = await realWalletApi.fetchWithdrawDetail(id);
      } catch {
        // 申请已经创建成功，详情回读失败不能把成功写入误报为提交失败。
        detailReadFailed = true;
      }
    }
    if (!isCurrentWrite()) return;
    createdWithdrawal.value = nextWithdrawal;
    modalOpen.value = false;
    Message.success('转出申请已提交，请等待平台审核');
    recordCurrent.value = 1;
    const [walletRefresh] = await Promise.allSettled([walletStore.refetch(), syncRecordsQuery(true)]);
    if (!isCurrentWrite()) return;
    if (detailReadFailed || walletRefresh.status === 'rejected') {
      Message.warning('转出申请已提交，但部分数据刷新失败，请稍后重新加载');
    }
  } catch (error) {
    if (isCurrentWrite()) {
      refreshSubmissionIssue();
      if (submissionIssue.value) {
        modalOpen.value = false;
        Message.warning(submissionIssue.value);
      } else {
        Message.error(error instanceof Error ? error.message : '转出申请未能提交');
      }
    }
  } finally {
    activePayPassword = '';
    if (operation === writeVersion) submitting.value = false;
  }
}

async function showDetail(record: Api.RealWallet.WithdrawVO) {
  await openDetail(record.id);
}

async function openDetail(id: string | number) {
  detailTargetId.value = id;
  const isCurrent = detailGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  detailError.value = '';
  try {
    const next = await realWalletApi.fetchWithdrawDetail(id, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (String(next.id) !== String(id)) throw new Error('转出详情对象不一致');
    detail.value = next;
  } catch {
    if (isCurrent()) detailError.value = '转出申请详情加载失败，请稍后重试';
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
}

watch(detailOpen, visible => {
  if (!visible) {
    detailGuard.invalidate();
    detailLoading.value = false;
    detailTargetId.value = undefined;
  }
});

function queryRecords() {
  recordCurrent.value = 1;
  void syncRecordsQuery();
}

onMounted(() => {
  refreshSubmissionIssue();
  window.addEventListener('storage', refreshSubmissionIssue);
  window.addEventListener('focus', refreshSubmissionIssue);
  if (readRecordsQuery()) void router.replace({ query: { ...route.query, status: undefined } });
  void loadAll();
});
watch([() => route.query.page, () => route.query.status], () => {
  if (readRecordsQuery()) {
    void router.replace({ query: { ...route.query, status: undefined } });
    return;
  }
  void loadRecords();
});
onBeforeUnmount(() => {
  window.removeEventListener('storage', refreshSubmissionIssue);
  window.removeEventListener('focus', refreshSubmissionIssue);
  writeVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  detailGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  refreshSubmissionIssue();
  writeVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  detailGuard.invalidate();
  submitting.value = false;
  modalOpen.value = false;
  confirmedParams.value = undefined;
  Object.assign(form, { chain: 'TRON', toAddress: '', amount: 0 });
  recentWithdrawals.value = [];
  recordTotal.value = 0;
  createdWithdrawal.value = undefined;
  detail.value = undefined;
  detailTargetId.value = undefined;
  detailOpen.value = false;
  void loadAll();
});
watch(() => route.query.id, id => {
  if (id) void openDetail(String(id));
}, { immediate: true });
watch(modalOpen, visible => { if (!visible) confirmedParams.value = undefined; });

const statusFilter = computed({
  get: () => recordStatus.value || 'all',
  set: (value: string) => {
    recordStatus.value = value === 'all' ? undefined : value as Api.RealWallet.WithdrawStatus;
    queryRecords();
  }
});
</script>

<template>
  <div class="withdraw-page shop-container">
    <header class="page-head"><div><span class="eyebrow">WALLET WITHDRAWAL</span><h1>钱包转出</h1><p class="hint">将平台可用余额提取到链上 USDT 钱包，到账状态以平台审核和链上确认结果为准。</p></div><Button variant="outline" @click="router.push('/wallet')">返回钱包</Button></header>
    <Alert v-if="submissionIssue" class="notice warning"><Icon icon="lucide:triangle-alert" /><AlertDescription>{{ submissionIssue }}。恢复时先查原单，仅明确未落地才使用原键、原参数重试；旧无键记录只读核实。<p v-if="pendingSnapshot">待核对申请：{{ pendingSnapshot.chain }} · U {{ formatAmount(pendingSnapshot.amount) }} · {{ pendingSnapshot.toAddress }}</p><div class="notice-actions"><Button variant="outline" :disabled="submitting" @click="restoreWithdrawal">{{ submitting ? '正在核对…' : '恢复原申请' }}</Button><Button variant="outline" :disabled="loadingRecords" @click="loadRecords">刷新申请记录</Button></div></AlertDescription></Alert>
    <Alert v-if="loadError" variant="destructive" class="notice"><Icon icon="lucide:circle-alert" /><AlertDescription>{{ loadError }}<div class="notice-actions"><Button variant="outline" @click="loadAll">重新加载</Button></div></AlertDescription></Alert>
    <Alert v-else-if="walletReady && available === undefined" class="notice warning"><Icon icon="lucide:triangle-alert" /><AlertDescription>可用余额尚未取得，暂不可转出；已填写金额和地址保持不变。<div class="notice-actions"><Button variant="outline" :disabled="walletStore.loading || submitting" @click="loadAll">重新读取余额</Button></div></AlertDescription></Alert>
    <div class="withdraw-layout">
      <form class="panel form-panel" novalidate @submit.prevent="openConfirm" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <header class="balance-row"><span class="balance-label">可用余额</span><Skeleton v-if="walletStore.loading" class="h-9 w-40" /><strong v-else class="balance-amount">{{ walletReady && available !== undefined ? 'U ' + formatAmount(available) : '—' }}</strong></header>
        <div class="fields"><div class="field"><Label for="withdraw-chain">选择链 / 币种</Label><Select v-model="form.chain" :disabled="submitting"><SelectTrigger id="withdraw-chain"><SelectValue placeholder="请选择转出链" /></SelectTrigger><SelectContent><SelectItem v-for="option in chainOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select></div><div class="field"><Label for="withdraw-amount">转出金额 (USDT)</Label><div class="amount-field"><AmountInput id="withdraw-amount" v-model="form.amount" :min="20" :max="available" :precision="2" placeholder="请输入转出金额" :disabled="submitting" /><Button type="button" variant="ghost" :disabled="submitting || !walletReady || available === undefined" @click="fillAll">全部</Button></div></div></div>
        <div class="field"><Label for="withdraw-address">目标地址</Label><Input id="withdraw-address" v-model="form.toAddress" placeholder="请输入所选链对应的 USDT 地址" :disabled="submitting" autocomplete="off" /></div>
        <p v-if="errMsg" class="form-error" role="status">{{ errMsg }}</p>
        <footer class="submit-row"><Tooltip><TooltipTrigger as-child><span tabindex="0"><Button type="submit" :disabled="!canSubmit">{{ submitting ? '正在提交…' : '提交转出申请' }}</Button></span></TooltipTrigger><TooltipContent v-if="!canSubmit">{{ submitting ? '申请正在提交，请稍候' : submissionIssue || errMsg || '请完善表单' }}</TooltipContent></Tooltip></footer>
      </form>
      <aside class="withdraw-notes">
        <section class="panel"><Icon icon="lucide:shield-check" width="26" class="note-icon" /><h2>提交前核对</h2><p>请确认目标地址与所选链一致。申请提交后进入平台审核，不能将“已提交”视为链上到账。</p><p>确认申请后，还需要输入支付密码。</p></section>
        <Alert v-if="kycTipNeeded" class="notice warning"><Icon icon="lucide:triangle-alert" /><AlertDescription>您尚未完成 KYC 认证，实际审核结果请以后台规则为准。<div class="notice-actions"><Button variant="outline" @click="router.push('/kyc')">前往 KYC</Button></div></AlertDescription></Alert>
      </aside>
    </div>
    <section v-if="createdWithdrawal" class="panel result-panel"><h2>最新转出申请</h2><DescriptionList :columns="2" :items="[{ label: '申请编号', value: String(createdWithdrawal.id) }, { label: '状态', value: createdWithdrawal.statusText || createdWithdrawal.status || 'REVIEWING' }, { label: '转出金额', value: formatMoney(createdWithdrawal.amount) }, { label: '手续费', value: formatMoney(createdWithdrawal.fee) }, { label: '扣费后金额', value: formatMoney(createdWithdrawal.actualAmount) }, { label: '创建时间', value: formatTime(createdWithdrawal.createdAt) }]" /></section>
    <section class="panel record-panel" :aria-busy="loadingRecords">
      <header class="records-head"><h2>转出申请</h2><Select v-model="statusFilter"><SelectTrigger class="status-filter" aria-label="筛选转出申请状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="REVIEWING">审核中</SelectItem><SelectItem value="APPROVED">已通过</SelectItem><SelectItem value="SUCCESS">已完成</SelectItem><SelectItem value="REJECTED">已驳回</SelectItem></SelectContent></Select></header>
      <div v-if="loadingRecords && !recentWithdrawals.length" class="skeletons"><Skeleton v-for="n in 3" :key="n" class="h-16" /></div>
      <div v-else-if="recentWithdrawals.length" class="table-scroll" :class="{ refreshing: loadingRecords }"><table><thead><tr><th scope="col">申请编号</th><th scope="col">链</th><th scope="col">转出金额</th><th scope="col">扣费后金额</th><th scope="col">状态</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody><tr v-for="record in recentWithdrawals" :key="record.id"><td>{{ record.id }}</td><td>{{ record.chain }}</td><td class="money">{{ formatMoney(record.amount) }}</td><td class="money">{{ formatMoney(record.actualAmount) }}</td><td><span class="status" :class="record.status === 'SUCCESS' ? 'green' : record.status === 'REJECTED' ? 'red' : 'orange'">{{ record.statusText || record.status || 'REVIEWING' }}</span></td><td>{{ formatTime(record.createdAt) }}</td><td><Button variant="link" @click="showDetail(record)">详情</Button></td></tr></tbody></table></div>
      <EmptyState v-else :title="recordError || '暂无转出申请'" :action-text="recordError ? '重新加载' : undefined" @action="recordError && loadRecords()" />
      <BusinessPagination v-if="recordTotal > recordSize" :total="recordTotal" :current="recordCurrent" :page-size="recordSize" :loading="loadingRecords" @change="(page: number) => { recordCurrent = page; syncRecordsQuery(); }" />
    </section>
    <a-modal v-model:visible="modalOpen" title="确认提交转出申请" :ok-loading="submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting" ok-text="确认提交" :on-before-ok="() => { void confirm(); return false; }">
      <Alert class="notice warning"><Icon icon="lucide:triangle-alert" /><AlertDescription>请确认目标地址与所选链一致，提交后将进入平台审核。</AlertDescription></Alert><DescriptionList :items="[{ label: '链 / 币种', value: confirmedParams?.chain || '—' }, { label: '转出金额', value: 'U ' + formatAmount(confirmedParams?.amount) }, { label: '目标地址', value: confirmedParams?.toAddress || '—' }]" />
    </a-modal>
    <Sheet v-model:open="detailOpen"><SheetContent side="right" class="withdraw-sheet"><SheetHeader><SheetTitle>转出申请详情</SheetTitle><SheetDescription>平台审核及链上打款记录</SheetDescription></SheetHeader><div class="detail-body"><div v-if="detailLoading" class="skeletons"><Skeleton v-for="n in 6" :key="n" class="h-12" /></div><DescriptionList v-else-if="detail" :items="[{ label: '申请编号', value: String(detail.id) }, { label: '链', value: detail.chain }, { label: '目标地址', value: detail.toAddress }, { label: '转出金额', value: formatMoney(detail.amount) }, { label: '手续费', value: formatMoney(detail.fee) }, { label: '扣费后金额', value: formatMoney(detail.actualAmount) }, { label: '状态', value: detail.statusText || detail.status || 'REVIEWING' }, { label: '审核意见', value: detail.reviewComment || '—' }, { label: '失败原因', value: detail.failReason || '—' }, { label: '交易哈希', value: detail.txHash || '—' }, { label: '创建时间', value: formatTime(detail.createdAt) }, { label: '打款时间', value: formatTime(detail.paidAt) }, { label: '确认时间', value: formatTime(detail.confirmedAt) }]" /><EmptyState v-else-if="detailError" :title="detailError" action-text="重新加载" @action="detailTargetId !== undefined && openDetail(detailTargetId)" /></div></SheetContent></Sheet>
  </div>
</template>

<style scoped>
.page-head { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:26px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { font-size:28px; font-weight:650; margin:5px 0 10px; }.hint { margin:0; color:var(--yb-muted); font-size:14px; max-width:880px; }.panel { padding:28px; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; }.notice { margin:0 0 20px; }.notice.warning { background:var(--yb-warning-soft, #fff7e6); border-color:var(--yb-warning-soft, #fff7e6); }.notice.info { background:var(--yb-primary-soft); }.notice-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:14px; }.fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; margin-bottom:26px; }.field { display:grid; gap:10px; min-width:0; }.address-block { padding:24px; background:var(--yb-fill); border:1px solid var(--yb-hairline); border-radius:6px; margin:22px 0; }.address-head { display:flex; justify-content:space-between; gap:24px; align-items:start; }.address-head>div { min-width:0; }.address-label { color:var(--yb-muted); font-size:13px; margin:0 0 8px; }.address-value { font-family:var(--yb-font-mono); font-size:14px; overflow-wrap:anywhere; margin-bottom:12px; }.minimum-hint { font-size:13px; color:var(--yb-muted); margin-top:10px; }.record-panel { margin-top:28px; }.records-head { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:24px; }.records-head h2 { margin:0; font-size:20px; font-weight:600; }.status-filter { width:160px; }.table-scroll { overflow-x:auto; }table { width:100%; min-width:780px; border-collapse:collapse; text-align:left; }th { padding:14px 16px; background:var(--yb-fill); color:var(--yb-muted); font-size:13px; font-weight:500; }td { padding:20px 16px; border-bottom:1px solid var(--yb-hairline); font-size:14px; }tbody tr:last-child td { border-bottom:0; }.record-actions { display:flex; align-items:center; gap:12px; white-space:nowrap; }.record-actions button { padding-left:0; padding-right:0; }.money { font-variant-numeric:tabular-nums; white-space:nowrap; }.status { display:inline-flex; padding:4px 9px; border-radius:4px; font-size:12px; white-space:nowrap; background:#fff3df; color:#9a5709; }.status.green { background:#e9f3eb; color:#326b43; }.status.red { background:#fcecea; color:#ad453e; }.skeletons { display:grid; gap:16px; }.refreshing { opacity:.65; }.detail-body { margin-top:28px; }.detail-body .skeletons { margin-top:24px; }@media(max-width:700px) { .fields { grid-template-columns:1fr; }.panel { padding:20px; }.page-head,.address-head { align-items:stretch; flex-direction:column; } }
.withdraw-page { padding-top:32px; padding-bottom:48px; }.withdraw-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:28px; align-items:start; }.balance-row { display:flex; align-items:center; justify-content:space-between; gap:24px; padding-bottom:26px; margin-bottom:26px; border-bottom:1px solid var(--yb-hairline); }.balance-label { color:var(--yb-muted); font-size:14px; }.balance-amount { font-size:28px; color:var(--yb-brand-primary); font-weight:600; font-variant-numeric:tabular-nums; }.amount-field { display:flex; gap:8px; }.amount-field input { min-width:0; }.form-error { color:var(--yb-danger); margin:16px 0; font-size:13px; }.submit-row { display:flex; justify-content:flex-end; margin-top:28px; }.withdraw-notes { display:grid; gap:20px; position:sticky; top:24px; }.withdraw-notes h2,.result-panel h2 { font-size:19px; font-weight:600; margin:16px 0; }.withdraw-notes p { font-size:13px; line-height:1.8; color:var(--yb-muted); }.note-icon { color:var(--yb-brand-primary); }.result-panel { margin-top:28px; }.result-panel h2 { margin-top:0; }:global(.withdraw-sheet) { width:min(520px,calc(100vw - 32px)); padding:28px; background:var(--yb-paper); }@media(max-width:1100px) { .withdraw-layout { grid-template-columns:1fr; }.withdraw-notes { position:static; grid-template-columns:1fr 1fr; } }@media(max-width:700px) { .withdraw-notes { grid-template-columns:1fr; } }

</style>
