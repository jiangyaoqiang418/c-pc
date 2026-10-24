<script setup lang="ts">
import { saveWithdrawDraft, takeWithdrawDraft } from '@/utils/prerequisite-navigation';
import UmIcon from '@/components/common/um-icon.vue';
import WalletOperationDialog from '@/components/wallet/wallet-operation-dialog.vue';
import WalletAssetTabs from '@/components/wallet/wallet-asset-tabs.vue';
import V47VaultDialog from '@/components/finance/v47-vault-dialog.vue';
import WalletHome from './index.vue';
import BuyerWallet from '@/views/buyer/wallet.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { exactAssetAmount, compareDecimalAmount, floorDecimalAmount } from '@/components/wallet/decimal-amount';
import DescriptionList from '@/components/common/description-list.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
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
const asset = computed<Api.RealWallet.Asset>(() => route.query.asset === 'USDC' ? 'USDC' : 'USDT');
async function selectAsset(next: Api.RealWallet.Asset) {
  if (submitting.value || next === asset.value) return;
  await router.replace({ query: { ...route.query, asset: next, page: undefined, id: undefined } });
}
type WithdrawForm = Omit<Api.RealWallet.WithdrawCreateParams, 'payPassword'>;
const restoredDraft = takeWithdrawDraft(userStore.currentUser?.id, userStore.sessionVersion, asset.value);
const form = reactive<WithdrawForm>({ asset: asset.value, chain: restoredDraft?.chain || 'TRON', toAddress: restoredDraft?.toAddress || '', amount: restoredDraft?.amount || '' });
const amountDraft = ref(restoredDraft?.amount || '');
const amountValidation = computed(() => exactAssetAmount(amountDraft.value));
watch(amountDraft, () => { form.amount = amountValidation.value.value ?? ''; });
const submitting = ref(false);
const operationView = ref<'form' | 'records'>('form');
const walletReturn = computed(() => userStore.isBuyerActive ? '/buyer/wallet' : `/wallet?asset=${asset.value}`);
function closeOperation() { if (!submitting.value) void router.replace(walletReturn.value); }
onBeforeRouteLeave(to => {
  if (submitting.value && to.path !== '/profile/pay-password') { Message.warning('正在处理本次申请，请稍候'); return false; }
  const owner = userStore.currentUser?.id;
  if (owner !== undefined && ['/kyc', '/profile/pay-password'].includes(to.path) && to.query.redirect === route.fullPath) {
    saveWithdrawDraft(owner, userStore.sessionVersion, { asset: asset.value, chain: form.chain, toAddress: form.toAddress, amount: amountDraft.value });
  }
});
onBeforeRouteUpdate(to => {
  if (submitting.value && to.query.asset !== route.query.asset) {
    Message.warning('正在处理本次申请，请稍候再切换资产');
    return false;
  }
});
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
const detailExpectedSnapshot = ref<FinancialSnapshot>();
const loadError = ref('');
const recordError = ref('');
const detailError = ref('');
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${asset.value}`);
const recordsGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${asset.value}`);
const detailGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
let writeVersion = 0;

const chainOptions = ref<Api.RealWallet.WithdrawChainVO[]>([]);
const chainLoading = ref(false);
const chainError = ref('');
const selectedChain = computed(() => chainOptions.value.find(item => item.chain === form.chain));
const overview = computed(() => walletStore.getOverview(asset.value));
const walletLoading = computed(() => !!walletStore.loadingByAsset[asset.value]);
const available = computed(() => overview.value?.account.available);
const walletReady = computed(() => !walletLoading.value && !loadError.value && !!overview.value
  && String(overview.value.account.userId) === String(userStore.currentUser?.id));
const availableForSubmit = computed(() => walletReady.value ? available.value : undefined);
const errMsg = computed(() => chainLoading.value ? '正在读取可用网络' : chainError.value || (!selectedChain.value ? '暂无可用提现网络' : amountValidation.value.error || realWalletApi.prepareWithdrawal(form, availableForSubmit.value, selectedChain.value).error));
const canSubmit = computed(() => !submitting.value && !errMsg.value && !submissionIssue.value);
const kycTipNeeded = computed(() => userStore.currentUser && userStore.currentUser.kycStatus !== 'approved');
const feePreview = ref<Api.RealWallet.WithdrawFeePreviewVO>();
const feeLoading = ref(false);
const feeError = ref('');
const feeGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}:${asset.value}`);
const now = ref(Date.now());
let feeClock: ReturnType<typeof setInterval> | undefined;
let feeDebounce: ReturnType<typeof setTimeout> | undefined;
const feeExpired = computed(() => !!feePreview.value && Number(feePreview.value.expiresAt) <= now.value);
function clearFeePreview() {
  feeGuard.invalidate();
  feePreview.value = undefined;
  feeError.value = '';
  feeLoading.value = false;
  if (feeClock) clearInterval(feeClock);
  if (feeDebounce) clearTimeout(feeDebounce);
  feeClock = undefined;
  feeDebounce = undefined;
}
async function previewFee() {
  if (!canSubmit.value || feeLoading.value) return;
  if (feeDebounce) clearTimeout(feeDebounce);
  if (feeClock) clearInterval(feeClock);
  const current = feeGuard.begin();
  const snapshot = { chain: form.chain, tokenSymbol: asset.value, toAddress: form.toAddress.trim(), amount: String(form.amount) };
  feeLoading.value = true;
  feePreview.value = undefined;
  feeError.value = '';
  try {
    const result = await realWalletApi.fetchWithdrawFeePreview(snapshot, { signal: current.signal, showError: false });
    if (!current()) return;
    feePreview.value = result;
    now.value = Date.now();
    feeClock = setInterval(() => { now.value = Date.now(); }, 1000);
  } catch (error) {
    if (current()) feeError.value = error instanceof Error ? error.message : '网络费暂不可用，请重试';
  } finally {
    if (current()) feeLoading.value = false;
  }
}
watch([asset, () => form.chain, () => form.toAddress, amountDraft], () => {
  clearFeePreview();
  if (!submitting.value) { modalOpen.value = false; confirmedParams.value = undefined; }
  feeDebounce = setTimeout(() => { void previewFee(); }, 500);
}, { flush: 'sync' });

function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatMoney(value?: string | number, currency: string = asset.value) {
  return value === undefined || value === null ? '暂不可用' : `${String(value)} ${currency}`;
}

function createWithdrawalIntentApi(payPassword: string, isCurrentWrite: () => boolean) {
  return {
    lookup: (key: string, snapshot: FinancialSnapshot) => realWalletApi.fetchWithdrawByKey(key, snapshot.asset ?? 'USDT'),
    submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => {
      if (!isCurrentWrite()) throw new Error('页面或账号已变化，原申请保留待核对');
      const amount = exactAssetAmount(snapshot.amount);
      if (amount.value === undefined) throw new Error('原转出金额无法准确提交，请联系平台核对');
      return realWalletApi.createWithdraw({
        asset: snapshot.asset ?? 'USDT', chain: snapshot.chain as Api.RealWallet.WithdrawCreateParams['chain'], toAddress: snapshot.toAddress!, amount: amount.value, idempotencyKey, payPassword
      }, { showError: false });
    }
  };
}

async function restoreWithdrawal() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined || submitting.value) return;
  const snapshot = financialSubmissionSnapshot(userId, 'withdraw');
  if (!snapshot?.chain || !snapshot.toAddress) { Message.warning('原申请快照无法核对，请联系平台核实'); return; }
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrentWrite()) return;
    const id = await submitKeyedFinancialOperation(userId, 'withdraw', undefined, createWithdrawalIntentApi(payPassword, isCurrentWrite), true);
    if (!isCurrentWrite()) return;
    refreshSubmissionIssue();
    await openDetail(id, snapshot);
    if (operation === writeVersion) await loadAll();
  } catch (error) {
    if (isCurrentWrite()) Message.warning(error instanceof Error ? error.message : '原申请核对失败');
  } finally {
    if (operation === writeVersion) { submitting.value = false; refreshSubmissionIssue(); }
  }
}

async function loadRecords() {
  const isCurrent = recordsGuard.begin();
  loadingRecords.value = true;
  recordError.value = '';
  try {
    const result = await realWalletApi.fetchWithdrawPage({
      asset: asset.value,
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
  const selectedAsset = asset.value;
  chainLoading.value = true;
  chainError.value = '';
  const [wallet, chains] = await Promise.allSettled([
    walletStore.fetchWallet(userId, selectedAsset),
    realWalletApi.fetchWithdrawChains(selectedAsset, { signal: isCurrent.signal, showError: false }),
    loadRecords()
  ]);
  if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
  if (wallet.status === 'rejected') loadError.value = '钱包余额加载失败，请稍后重试';
  chainLoading.value = false;
  if (chains.status === 'fulfilled') {
    chainOptions.value = chains.value;
    if (!chainOptions.value.some(item => item.chain === form.chain && item.enabled)) {
      form.chain = chainOptions.value.find(item => item.enabled)?.chain ?? chainOptions.value[0]?.chain ?? 'TRON';
    }
  } else {
    chainOptions.value = [];
    chainError.value = '可提现网络读取失败，请重试';
  }
}

function fillAll() {
  if (!walletReady.value || available.value === undefined) return;
  if (!selectedChain.value?.enabled) return;
  amountDraft.value = floorDecimalAmount(String(availableForSubmit.value ?? ''), Math.min(8, selectedChain.value.decimals));
}

function openConfirm() {
  refreshSubmissionIssue();
  if (!canSubmit.value) {
    Message.warning(submissionIssue.value || errMsg.value || '请完善表单');
    return;
  }
  confirmedParams.value = realWalletApi.prepareWithdrawal(form, availableForSubmit.value, selectedChain.value).params;
  modalOpen.value = true;
}

async function confirm() {
  if (submitting.value || !modalOpen.value || !confirmedParams.value) return;
  refreshSubmissionIssue();
  if (submissionIssue.value) {
    Message.warning(submissionIssue.value);
    return;
  }
  const prepared = realWalletApi.prepareWithdrawal(confirmedParams.value, availableForSubmit.value, selectedChain.value);
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
    const latestChains = await realWalletApi.fetchWithdrawChains(prepared.params.asset ?? 'USDT', { showError: false });
    if (!isCurrentWrite()) return;
    const latest = latestChains.find(item => item.chain === prepared.params.chain);
    if (!latest) throw new Error('所选网络已变化，请重新读取后确认');
    const validation = realWalletApi.prepareWithdrawal(prepared.params, availableForSubmit.value, latest);
    if (validation.error) throw new Error(validation.error);
    const id = await submitKeyedFinancialOperation(requestedUserId, 'withdraw', prepared.params, createWithdrawalIntentApi(payPassword, isCurrentWrite));
    if (!isCurrentWrite()) return;
    refreshSubmissionIssue();
    let nextWithdrawal: Api.RealWallet.WithdrawVO | undefined;
    let detailReadFailed = false;
    if (!nextWithdrawal) {
      try {
        const next = await realWalletApi.fetchWithdrawDetail(id, { asset: prepared.params.asset ?? 'USDT' });
        validateWithdrawalDetail(next, id, prepared.params);
        nextWithdrawal = next;
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
    const [walletRefresh] = await Promise.allSettled([walletStore.refetch(asset.value), syncRecordsQuery(true)]);
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
    if (operation === writeVersion) submitting.value = false;
  }
}

async function showDetail(record: Api.RealWallet.WithdrawVO) {
  await openDetail(record.id, { asset: record.asset === 'USDC' ? 'USDC' : 'USDT', chain:record.chain, toAddress:record.toAddress, amount:record.amount });
}

function validateWithdrawalDetail(next: Api.RealWallet.WithdrawVO, id: string | number, expected?: FinancialSnapshot) {
  if (String(next.id) !== String(id) || (expected && (!expected.chain || !expected.toAddress
    || (next.asset ?? 'USDT') !== (expected.asset ?? 'USDT') || next.chain !== expected.chain || next.toAddress !== expected.toAddress || compareDecimalAmount(next.amount, expected.amount) !== 0))) {
    throw new Error('转出详情与原网络、金额或收款地址不一致，请核对原申请');
  }
}

async function openDetail(id: string | number, expected?: FinancialSnapshot) {
  detailTargetId.value = id;
  detailExpectedSnapshot.value = expected && { ...expected };
  const isCurrent = detailGuard.begin();
  const requestedUserId = userStore.currentUser?.id;
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  detailError.value = '';
  try {
    const next = await realWalletApi.fetchWithdrawDetail(id, { signal: isCurrent.signal, asset: expected?.asset ?? asset.value });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    validateWithdrawalDetail(next, id, expected);
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
    detailExpectedSnapshot.value = undefined;
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
  clearFeePreview();
  requestGuard.invalidate();
  recordsGuard.invalidate();
  detailGuard.invalidate();
});
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], ([next, nextSession], [previous, previousSession]) => {
  if (String(next) === String(previous) && nextSession === previousSession) return;
  refreshSubmissionIssue();
  writeVersion += 1;
  clearFeePreview();
  requestGuard.invalidate();
  recordsGuard.invalidate();
  detailGuard.invalidate();
  submitting.value = false;
  modalOpen.value = false;
  confirmedParams.value = undefined;
  Object.assign(form, { asset: asset.value, chain: 'TRON', toAddress: '', amount: '' });
  amountDraft.value = '';
  recentWithdrawals.value = [];
  recordTotal.value = 0;
  createdWithdrawal.value = undefined;
  detail.value = undefined;
  detailTargetId.value = undefined;
  detailExpectedSnapshot.value = undefined;
  detailOpen.value = false;
  void loadAll();
});
watch(() => route.query.id, id => {
  if (typeof id === 'string' && id.trim()) void openDetail(id);
  else detailOpen.value = false;
}, { immediate: true });
watch(modalOpen, visible => { if (!visible) confirmedParams.value = undefined; });
watch(asset, () => {
  writeVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  detailGuard.invalidate();
  clearFeePreview();
  Object.assign(form, { asset: asset.value, chain: 'TRON', toAddress: '', amount: '' });
  amountDraft.value = '';
  chainOptions.value = [];
  recentWithdrawals.value = [];
  createdWithdrawal.value = undefined;
  detail.value = undefined;
  detailOpen.value = false;
  recordCurrent.value = 1;
  void loadAll();
});

const statusFilter = computed({
  get: () => recordStatus.value || 'all',
  set: (value: string) => {
    recordStatus.value = value === 'all' ? undefined : value as Api.RealWallet.WithdrawStatus;
    queryRecords();
  }
});
</script>

<template>
  <div class="wallet-operation-page">
  <component :is="userStore.isBuyerActive ? BuyerWallet : WalletHome" />
  <WalletOperationDialog :visible="true" :title="`转出 ${asset}`" description="选择网络，核对收款地址与金额。" :busy="submitting" @dismiss="closeOperation">
    <WalletAssetTabs :model-value="asset" :disabled="submitting" @update:model-value="selectAsset" />
    <div v-if="submissionIssue" class="deposit-hint" role="alert"><UmIcon name="shield" /><span>{{ submissionIssue }}。请先核实原申请结果。<small v-if="pendingSnapshot">待核对：{{ pendingSnapshot.chain }} · {{ String(pendingSnapshot.amount) }} {{ pendingSnapshot.asset ?? 'USDT' }} · {{ pendingSnapshot.toAddress }}</small><button class="outline wallet-note-action" :disabled="submitting" @click="restoreWithdrawal">{{ submitting ? '正在核对…' : '恢复原申请' }}</button></span></div>
    <div v-if="loadError || chainError || (walletReady && available === undefined)" class="deposit-hint" role="alert"><UmIcon name="return" /><span>{{ loadError || chainError || '可用余额尚未取得，暂不可转出。' }}<button class="outline wallet-note-action" :disabled="walletLoading || chainLoading || submitting" @click="loadAll">重新读取</button></span></div>
    <div class="deposit-subline"><span>转出至 {{ asset }} 钱包</span><button @click="operationView = operationView === 'form' ? 'records' : 'form'">{{ operationView === 'form' ? '申请记录' : '返回申请' }}<UmIcon name="chevron" /></button></div>
    <template v-if="operationView === 'form'">
      <div class="withdraw-balance"><span><span class="coin-icon usdt">{{ asset === 'USDT' ? '₮' : '$' }}</span>可用余额</span><Skeleton v-if="walletLoading" class="h-8 w-32" /><strong v-else>{{ walletReady && available !== undefined ? String(available) : '暂不可用' }} <small>{{ asset }}</small></strong></div>
      <form novalidate @submit.prevent="openConfirm" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div class="field"><label for="withdraw-network">网络</label><Select v-model="form.chain" :disabled="submitting || chainLoading || !chainOptions.length"><SelectTrigger id="withdraw-network" class="app-select-trigger wallet-network-trigger h-[46px]"><SelectValue :placeholder="chainLoading ? '正在读取网络' : '暂无开放网络'" /></SelectTrigger><SelectContent><SelectItem v-for="option in chainOptions" :key="option.chain" :value="option.chain" :disabled="!option.enabled">{{ option.label }} · {{ option.asset }}{{ option.enabled ? '' : '（暂不可用）' }}</SelectItem></SelectContent></Select></div>
        <div class="field"><label for="withdraw-address">收款地址</label><input id="withdraw-address" v-model="form.toAddress" :placeholder="`请输入所选链对应的 ${asset} 地址`" :disabled="submitting" autocomplete="off" /></div>
        <div class="field"><label for="withdraw-amount">转出数量 · {{ asset }}</label><div class="wallet-amount-row"><input id="withdraw-amount" v-model="amountDraft" inputmode="decimal" autocomplete="off" placeholder="0.00" :disabled="submitting" /><button type="button" class="text-link" :disabled="submitting || !walletReady || available === undefined || !selectedChain?.enabled" @click="fillAll">全部</button></div></div>
        <p v-if="selectedChain" class="wallet-operation-note">最多 {{ Math.min(8, selectedChain.decimals) }} 位小数<span v-if="selectedChain.minAmount != null"> · 最低 {{ selectedChain.minAmount }} {{ asset }}</span><span v-if="selectedChain.maxAmount != null"> · 最高 {{ selectedChain.maxAmount }} {{ asset }}</span></p>
        <div class="deposit-hint" aria-live="polite"><UmIcon name="info" /><span><template v-if="feeLoading">正在预览网络费…</template><template v-else-if="feePreview">预估网络费 {{ feePreview.estimatedNetworkFee == null ? '暂不可用' : `${feePreview.estimatedNetworkFee} ${feePreview.networkFeeSymbol}` }}<small>{{ feeExpired ? '报价已过期，请重新预览。' : '仅为原生币网络费预估，不含平台业务手续费，不代表已锁费或已建单。' }}</small></template><template v-else>{{ feeError || '填写网络、地址和金额后预览网络费。' }}</template><button type="button" class="text-link wallet-note-action" :disabled="!canSubmit || feeLoading" @click="previewFee">重新预览</button></span></div>
        <p v-if="errMsg" class="deposit-error" role="status">{{ errMsg }}</p>
        <button type="submit" class="gold full" :disabled="!canSubmit">{{ submitting ? '正在提交…' : '核对转出信息' }}</button><button type="button" class="text-link full wallet-dismiss" :disabled="submitting" @click="closeOperation">返回钱包</button>
      </form>
      <div v-if="kycTipNeeded" class="deposit-hint"><UmIcon name="shield" /><span>您尚未完成实名认证，实际审核结果以平台规则为准。<button class="text-link wallet-note-action" @click="router.push({ name: 'kyc', query: { redirect: route.fullPath } })">前往实名认证</button></span></div>
      <p class="wallet-operation-note">确认申请后需输入支付密码。申请提交后进入平台审核，到账状态以平台和链上确认结果为准；手续费、限额及可用网络以平台接口为准。</p>
      <section v-if="createdWithdrawal" class="deposit-record"><div><strong>{{ formatMoney(createdWithdrawal.amount, createdWithdrawal.asset) }}</strong><span>{{ createdWithdrawal.statusText || createdWithdrawal.status || '待确认' }}</span></div><p>最新转出申请 · {{ createdWithdrawal.chain }}</p><small>{{ createdWithdrawal.id }}<br />{{ formatTime(createdWithdrawal.createdAt) }}</small><button @click="showDetail(createdWithdrawal)">查看申请详情</button></section>
    </template>
    <section v-else class="deposit-panel" :aria-busy="loadingRecords">
      <div class="deposit-record-heading"><button @click="operationView = 'form'"><UmIcon name="arrow" />返回申请</button><h3>转出申请</h3></div>
      <Select v-model="statusFilter"><SelectTrigger class="app-select-trigger wallet-record-filter h-11" aria-label="筛选转出申请状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="REVIEWING">审核中</SelectItem><SelectItem value="APPROVED">已通过</SelectItem><SelectItem value="SUCCESS">已完成</SelectItem><SelectItem value="REJECTED">已驳回</SelectItem></SelectContent></Select>
      <div v-if="loadingRecords && !recentWithdrawals.length" class="wallet-skeletons"><Skeleton v-for="n in 3" :key="n" class="h-16" /></div>
      <div v-else-if="recentWithdrawals.length" :class="{ 'wallet-refreshing': loadingRecords }"><article v-for="record in recentWithdrawals" :key="record.id" class="deposit-record"><div><strong>{{ formatMoney(record.amount, record.asset) }}</strong><span>{{ record.statusText || record.status || '待确认' }}</span></div><p>{{ record.chain }} · 扣费后 {{ formatMoney(record.actualAmount, record.asset) }}</p><small>{{ formatTime(record.createdAt) }}<br />{{ record.id }}</small><button @click="showDetail(record)">查看详情</button></article></div>
      <EmptyState v-else :title="recordError || '暂无转出申请'" :action-text="recordError ? '重新读取' : undefined" @action="recordError && loadRecords()" />
      <BusinessPagination v-if="recordTotal > recordSize" :total="recordTotal" :current="recordCurrent" :page-size="recordSize" :loading="loadingRecords" @change="(page: number) => { recordCurrent = page; syncRecordsQuery(); }" />
    </section>
  </WalletOperationDialog>
  <V47VaultDialog v-model:visible="modalOpen" title="确认提交转出申请" description="请确认收款地址与所选链一致，提交后将进入平台审核。" icon="shield" :busy="submitting"><DescriptionList :items="[{ label: '网络 / 币种', value: `${confirmedParams?.chain || '—'} / ${confirmedParams?.asset || asset}` }, { label: '转出金额', value: `${confirmedParams?.amount ?? '—'} ${confirmedParams?.asset || asset}` }, { label: '收款地址', value: confirmedParams?.toAddress || '—' }]" /><button class="primary full wallet-note-action" :disabled="submitting" @click="confirm">{{ submitting ? '正在提交…' : '确认提交' }}</button></V47VaultDialog>
  <V47VaultDialog v-model:visible="detailOpen" title="转出申请详情" description="平台审核及链上打款记录" icon="wallet"><div v-if="detailLoading" class="wallet-skeletons"><Skeleton v-for="n in 6" :key="n" class="h-12" /></div><DescriptionList v-else-if="detail" :items="[{ label: '申请编号', value: String(detail.id) }, { label: '资产', value: detail.asset ?? 'USDT' }, { label: '网络', value: detail.chain }, { label: '收款地址', value: detail.toAddress }, { label: '转出金额', value: formatMoney(detail.amount, detail.asset) }, { label: '手续费', value: formatMoney(detail.fee, detail.asset) }, { label: '扣费后金额', value: formatMoney(detail.actualAmount, detail.asset) }, { label: '状态', value: detail.statusText || detail.status || '待确认' }, { label: '审核意见', value: detail.reviewComment || '—' }, { label: '失败原因', value: detail.failReason || '—' }, { label: '交易哈希', value: detail.txHash || '—' }, { label: '创建时间', value: formatTime(detail.createdAt) }, { label: '打款时间', value: formatTime(detail.paidAt) }, { label: '确认时间', value: formatTime(detail.confirmedAt) }]" /><EmptyState v-else-if="detailError" :title="detailError" action-text="重新读取" @action="detailTargetId !== undefined && openDetail(detailTargetId, detailExpectedSnapshot)" /></V47VaultDialog>
  </div>
</template>

<style scoped src="./v47-wallet-operation.css"></style>
