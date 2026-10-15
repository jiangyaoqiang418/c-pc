<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import WalletOperationDialog from '@/components/wallet/wallet-operation-dialog.vue';
import V47VaultDialog from '@/components/finance/v47-vault-dialog.vue';
import V47DepositQr from '@/components/wallet/v47-deposit-qr.vue';
import WalletHome from './index.vue';
import BuyerWallet from '@/views/buyer/wallet.vue';
import { Skeleton } from '@/components/ui/skeleton';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { exactNumericAmount, compareDecimalAmount } from '@/components/wallet/decimal-amount';
import DescriptionList from '@/components/common/description-list.vue';
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { formatFinanceAmount as formatAmount } from '@/components/finance/v47-interest-math';
import * as realWalletApi from '@/service/api/wallet';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { isDefinitiveRejection } from '@/service/request/type';
import { financialSubmissionIssue, financialSubmissionSnapshot, submitKeyedFinancialOperation, type FinancialSnapshot } from '@/utils/financial-submission';
import { fetchWalletPayChains, type WalletPayChain } from '@/service/api/wallet-pay';
import { availableWallets, connectPaymentWallet, walletRequestRejected } from '@/utils/wallet-pay-provider';

const userStore = useUserStore();
const walletStore = useWalletStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref<'create' | 'address' | 'wallet'>('create');
const depositMethod = ref<'address' | 'wallet' | 'amount'>('address');
const operationView = ref<'form' | 'records' | 'created'>('form');
const walletReturn = computed(() => userStore.isBuyerActive ? '/buyer/wallet' : '/wallet');
function closeOperation() { if (!submitting.value && !directBusy.value) void router.replace(walletReturn.value); }
onBeforeRouteLeave(() => { if (submitting.value || directBusy.value) { Message.warning('正在处理本次充值，请稍候'); return false; } });
watch(activeTab, value => { if (value === 'address') operationView.value = 'created'; });
const amountDraft = ref('100');
const chain = ref<string>();
const submitting = ref(false);
const submissionUnknown = ref(false);
const pendingSnapshot = ref<FinancialSnapshot>();
function refreshSubmissionIssue() {
  submissionUnknown.value = !!financialSubmissionIssue(userStore.currentUser?.id, 'recharge');
  pendingSnapshot.value = financialSubmissionSnapshot(userStore.currentUser?.id, 'recharge');
}
const rechargeIntentApi = {
  lookup: realWalletApi.fetchRechargeByKey,
  submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => {
    const amount = exactNumericAmount(snapshot.amount, 18);
    if (amount.value === undefined) throw new Error('原申报金额无法准确提交，请联系平台核对');
    return realWalletApi.createRecharge({ chain: snapshot.chain!, amount: amount.value, idempotencyKey }, { showError: false });
  }
};

async function restoreRecharge() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined || submitting.value) return;
  const operation = ++createWriteVersion;
  submitting.value = true;
  try {
    const id = await submitKeyedFinancialOperation(userId, 'recharge', undefined, rechargeIntentApi, true);
    if (operation !== createWriteVersion || String(userStore.currentUser?.id) !== String(userId)) return;
    pendingRechargeReadId.value = id;
    refreshSubmissionIssue();
    await openDetail(id);
    if (operation === createWriteVersion) await loadRecords();
  } catch (error) {
    if (operation === createWriteVersion) Message.warning(error instanceof Error ? error.message : '原申报核对失败');
  } finally {
    if (operation === createWriteVersion) { submitting.value = false; refreshSubmissionIssue(); }
  }
}
const loadingRecords = ref(false);
const currentRecharge = ref<Api.RealWallet.RechargeVO>();
const pendingRechargeReadId = ref<string | number>();
const recentDeposits = ref<Api.RealWallet.RechargeVO[]>([]);
const recordCurrent = ref(1);
const recordSize = ref(10);
const recordTotal = ref(0);
const recordStatus = ref<Api.RealWallet.RechargeStatus>();

function readRecordsQuery() {
  const page = Number(route.query.page);
  recordCurrent.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const status = typeof route.query.status === 'string' && ['PENDING', 'CONFIRMED', 'CANCELED'].includes(route.query.status)
    ? route.query.status as Api.RealWallet.RechargeStatus : undefined;
  recordStatus.value = status;
  return route.query.status !== undefined && !status;
}

async function syncRecordsQuery(replace = false) {
  const before = route.fullPath;
  await (replace ? router.replace : router.push)({ query: { ...route.query,
    page: recordCurrent.value > 1 ? String(recordCurrent.value) : undefined, status: recordStatus.value } });
  if (route.fullPath === before) await loadRecords();
}
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.RealWallet.RechargeVO>();
const detailTargetId = ref<string | number>();
const cancelingRechargeId = ref<string | number>();
const loadingChains = ref(false);
const loadingAddress = ref(false);
const loadError = ref('');
const addressError = ref('');
const recordError = ref('');
const detailError = ref('');
const requestGuard = createLatestRequestGuard();
const recordsGuard = createLatestRequestGuard();
const chainsGuard = createLatestRequestGuard();
const addressGuard = createLatestRequestGuard();
const detailGuard = createLatestRequestGuard();
let createWriteVersion = 0;
let cancelWriteVersion = 0;

const chainOptions = ref<Api.RealWallet.RechargeChainVO[]>([]);
const selectedChain = computed(() => chainOptions.value.find(item => item.chain === chain.value));
const rechargeAddress = ref<Api.RealWallet.RechargeAddressVO>();
const walletPayChains = ref<WalletPayChain[]>([]);
const walletChainError = ref('');
const walletChainsGuard = createLatestRequestGuard();
const directAmount = ref('100');
const walletKey = ref<string>();
const directBusy = ref(false);
const directError = ref('');
interface DirectTransferProgress {
  started: true;
  chain: string;
  amount: string;
  toAddress: string;
  fromAddress: string;
  txHash?: string;
}
const directProgress = ref<DirectTransferProgress>();
const directProgressError = ref('');
let directWriteVersion = 0;
const selectedWalletChain = computed(() => walletPayChains.value.find(item => item.chain === chain.value && item.enabled));
const directWallets = computed(() => availableWallets(chain.value || ''));
const directConfigError = computed(() => {
  if (loadingChains.value || loadingAddress.value) return '正在核对充值配置';
  const recharge = selectedChain.value;
  const address = rechargeAddress.value;
  const payment = selectedWalletChain.value;
  if (!recharge || !address?.address) return addressError.value || '当前链的专属充值地址不可用';
  if (address.chain !== recharge.chain) return '充值地址与所选链不一致，请停止转账';
  if (address.memo) return '该链要求 Memo / Tag，暂不支持钱包直充，请使用地址转账';
  if (walletChainError.value) return walletChainError.value;
  if (!payment) return '该链尚未开放浏览器钱包转账';
  if (!['ETH', 'BSC', 'TRON'].includes(recharge.chain)
    || (recharge.chain === 'TRON' && !['mainnet', 'shasta', 'nile'].includes(payment.network.toLowerCase()))
    || (recharge.chain !== 'TRON' && !/^\d+$/.test(payment.network))) {
    return '该链的浏览器钱包网络配置暂不支持直充';
  }
  if (!payment.network || !address.tokenContract || !Number.isSafeInteger(address.decimals)
    || address.decimals !== payment.decimals || recharge.decimals !== payment.decimals
    || address.tokenContract.toLowerCase() !== payment.tokenContract.toLowerCase()) {
    return '充值与钱包转账配置不一致，请停止转账';
  }
  return '';
});

function directStorageKey(userId: string | number) {
  return `cpc:wallet-direct:transfer:${String(userId)}`;
}

function readDirectProgress() {
  directProgress.value = undefined;
  directProgressError.value = '';
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  try {
    const raw = localStorage.getItem(directStorageKey(userId));
    if (!raw) return;
    const saved = JSON.parse(raw) as DirectTransferProgress;
    if (saved?.started !== true || !saved.chain || !saved.amount || !saved.toAddress || !saved.fromAddress
      || (saved.txHash !== undefined && !saved.txHash)) throw new Error('本机直充记录不完整');
    directProgress.value = saved;
  } catch {
    directProgressError.value = '本机直充记录无法读取，请先核对钱包交易记录，勿重复转账';
  }
}

function saveDirectProgress(userId: string | number, progress: DirectTransferProgress) {
  localStorage.setItem(directStorageKey(userId), JSON.stringify(progress));
  if (String(userStore.currentUser?.id) === String(userId)) directProgress.value = progress;
}

function directRawAmount(value: string, decimals: number, minimums: Array<string | number | null | undefined>) {
  const amountText = value.trim();
  if (amountText.length > 96 || !/^\d+(?:\.\d+)?$/.test(amountText)
    || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('请输入有效的 USDT 金额');
  }
  const [whole, fractional = ''] = amountText.split('.');
  if (fractional.length > decimals) throw new Error(`该链最多支持 ${decimals} 位小数`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fractional.padEnd(decimals, '0') || '0');
  if (raw <= 0n || raw >= (1n << 256n)) throw new Error('请输入有效的 USDT 金额');
  for (const minimum of minimums) {
    if (minimum == null || String(minimum) === '') continue;
    const minText = String(minimum);
    if (!/^\d+(?:\.\d+)?$/.test(minText)) throw new Error('最低充值金额配置无效，请停止转账');
    const [minWhole, minFractional = ''] = minText.split('.');
    const minRaw = BigInt(minWhole) * 10n ** BigInt(decimals)
      + BigInt(minFractional.slice(0, decimals).padEnd(decimals, '0') || '0')
      + (minFractional.slice(decimals).replace(/0/g, '') ? 1n : 0n);
    if (raw < minRaw) throw new Error(`该链最低充值金额为 ${minText} USDT`);
  }
  return raw.toString();
}


function formatTime(value?: string | number) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

async function loadRecords() {
  const isCurrent = recordsGuard.begin();
  loadingRecords.value = true;
  recordError.value = '';
  try {
    const result = await realWalletApi.fetchRechargePage({
      pageNo: recordCurrent.value,
      pageSize: recordSize.value,
      status: recordStatus.value
    }, { signal: isCurrent.signal, showError: false });
    if (!isCurrent()) return;
    recordSize.value = resolvePageSize(result, recordSize.value);
    const maxPage = Math.max(1, Math.ceil(result.total / recordSize.value));
    if (recordCurrent.value > maxPage) {
      recordCurrent.value = maxPage;
      await syncRecordsQuery(true);
      return;
    }
    recentDeposits.value = result.records;
    recordTotal.value = result.total;
  } catch {
    if (!isCurrent()) return;
    recentDeposits.value = [];
    recordTotal.value = 0;
    recordError.value = '充值记录加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loadingRecords.value = false;
  }
}

async function loadChains() {
  const isCurrent = chainsGuard.begin();
  loadingChains.value = true;
  loadError.value = '';
  try {
    const chains = await realWalletApi.fetchRechargeChains({ signal: isCurrent.signal, showError: false });
    if (!isCurrent()) return;
    chainOptions.value = chains.filter(item => item.enabled);
    if (!chainOptions.value.some(item => item.chain === chain.value)) {
      chain.value = chainOptions.value[0]?.chain;
    }
  } catch {
    if (!isCurrent()) return;
    chainOptions.value = [];
    chain.value = '';
    loadError.value = '充值链加载失败，请稍后重试';
  } finally {
    if (isCurrent()) loadingChains.value = false;
  }
}

async function loadWalletChains() {
  const isCurrent = walletChainsGuard.begin();
  walletChainError.value = '';
  walletPayChains.value = [];
  try {
    const chains = await fetchWalletPayChains({ signal: isCurrent.signal });
    if (isCurrent()) walletPayChains.value = chains;
  } catch {
    if (isCurrent()) walletChainError.value = '钱包转账网络配置加载失败，请稍后重试';
  }
}

async function reloadDirectConfig() {
  await Promise.all([loadChains(), loadWalletChains()]);
  await loadRechargeAddress();
}

async function loadRechargeAddress(chainCode = chain.value) {
  const isCurrent = addressGuard.begin();
  if (!chainCode) {
    rechargeAddress.value = undefined;
    loadingAddress.value = false;
    return;
  }
  loadingAddress.value = true;
  addressError.value = '';
  rechargeAddress.value = undefined;
  try {
    const address = await realWalletApi.fetchRechargeAddress(chainCode, { signal: isCurrent.signal, showError: false });
    if (!address?.address?.trim() || address.chain !== chainCode) throw new Error('充值地址与所选网络不一致');
    if (isCurrent() && chainCode === chain.value) rechargeAddress.value = address;
  } catch {
    if (isCurrent() && chainCode === chain.value) {
      rechargeAddress.value = undefined;
      addressError.value = '专属充值地址加载失败，请稍后重试';
    }
  } finally {
    if (isCurrent() && chainCode === chain.value) loadingAddress.value = false;
  }
}

async function loadAll() {
  const currentUser = userStore.currentUser;
  if (!currentUser) {
    requestGuard.invalidate();
    recordsGuard.invalidate();
    chainsGuard.invalidate();
    walletChainsGuard.invalidate();
    addressGuard.invalidate();
    detailGuard.invalidate();
    chainOptions.value = [];
    walletPayChains.value = [];
    chain.value = undefined;
    rechargeAddress.value = undefined;
    currentRecharge.value = undefined;
    recentDeposits.value = [];
    recordTotal.value = 0;
    detail.value = undefined;
    loadingRecords.value = false;
    loadingChains.value = false;
    loadingAddress.value = false;
    detailLoading.value = false;
    loadError.value = '';
    addressError.value = '';
    walletChainError.value = '';
    recordError.value = '';
    detailError.value = '';
    return;
  }
  const isCurrent = requestGuard.begin();
  const userId = currentUser.id;
  loadError.value = '';
  const [chains, wallet] = await Promise.allSettled([loadChains(), walletStore.fetchWallet(userId), loadRecords(), loadWalletChains()]);
  if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
  if (chains.status === 'rejected' || wallet.status === 'rejected') loadError.value = '钱包基础信息加载失败，请稍后重试';
}

async function freshDirectConfig(chainCode: string, expected: { address: string; contract: string; network: string; decimals: number }) {
  const [rechargeChains, address, paymentChains] = await Promise.all([
    realWalletApi.fetchRechargeChains({ showError: false }),
    realWalletApi.fetchRechargeAddress(chainCode, { showError: false }),
    fetchWalletPayChains()
  ]);
  const recharge = rechargeChains.find(item => item.chain === chainCode && item.enabled);
  const payment = paymentChains.find(item => item.chain === chainCode && item.enabled);
  if (!recharge || !payment || address.chain !== chainCode || address.memo
    || !address.address || !address.tokenContract || !Number.isSafeInteger(address.decimals)
    || address.decimals !== recharge.decimals || address.decimals !== payment.decimals
    || address.address !== expected.address || address.tokenContract.toLowerCase() !== expected.contract.toLowerCase()
    || payment.tokenContract.toLowerCase() !== expected.contract.toLowerCase()
    || payment.network !== expected.network || payment.decimals !== expected.decimals) {
    throw new Error('充值地址或网络配置已变化，请刷新后重新核对，勿继续转账');
  }
  return { recharge, address, payment };
}

async function directTransfer() {
  if (directBusy.value || directProgress.value || directProgressError.value) return;
  const userId = userStore.currentUser?.id;
  const chainCode = chain.value;
  const address = rechargeAddress.value;
  const payment = selectedWalletChain.value;
  const selectedWallet = walletKey.value;
  if (userId === undefined || !chainCode || !address || !payment || !selectedWallet || directConfigError.value) {
    Message.warning(directConfigError.value || '请先选择链和浏览器钱包');
    return;
  }
  const amountText = directAmount.value.trim();
  const expected = { address: address.address, contract: payment.tokenContract, network: payment.network, decimals: payment.decimals };
  const operation = ++directWriteVersion;
  const isCurrent = () => operation === directWriteVersion && String(userStore.currentUser?.id) === String(userId)
    && chain.value === chainCode && directAmount.value.trim() === amountText
    && !directProgress.value && !directProgressError.value;
  directBusy.value = true;
  directError.value = '';
  let signatureStarted = false;
  try {
    const config = await freshDirectConfig(chainCode, expected);
    const rawAmount = directRawAmount(amountText, payment.decimals,
      [config.recharge.minAmount, config.address.minAmount]);
    if (!isCurrent()) throw new Error('账号、链或金额已变化，请重新核对');
    const wallet = await connectPaymentWallet({ chain: chainCode, network: payment.network,
      toAddress: address.address, tokenContract: payment.tokenContract, rawAmount }, selectedWallet);
    if (!isCurrent()) throw new Error('账号、链或金额已变化，请重新核对');
    const confirmed = await new Promise<boolean>(resolve => Modal.confirm({
      title: '确认钱包直充',
      content: `${chainCode} · ${payment.network}，转账 ${amountText} USDT。付款账户：${wallet.account}。收款地址：${address.address}。USDT 合约：${payment.tokenContract}。请仔细核对，确认后打开钱包签名。`,
      onOk: () => resolve(true), onCancel: () => resolve(false)
    }));
    if (!confirmed) return;
    const beforeSignature = await freshDirectConfig(chainCode, expected);
    directRawAmount(amountText, payment.decimals,
      [beforeSignature.recharge.minAmount, beforeSignature.address.minAmount]);
    if (!isCurrent()) throw new Error('账号、链或金额已变化，请重新核对');
    const progress: DirectTransferProgress = { started: true, chain: chainCode, amount: amountText,
      toAddress: address.address, fromAddress: wallet.account };
    readDirectProgress();
    if (!isCurrent()) throw new Error('本机已有待核对的直充记录，请先核对钱包交易');
    const hash = await wallet.sendTransfer(() => {
      readDirectProgress();
      if (!isCurrent()) throw new Error('账号、链、金额或直充记录已变化，请重新核对');
      saveDirectProgress(userId, progress);
      signatureStarted = true;
    });
    saveDirectProgress(userId, { ...progress, txHash: hash });
    if (operation === directWriteVersion && String(userStore.currentUser?.id) === String(userId)) {
      Message.success('钱包已提交交易，请等待链上确认和平台入账');
    }
  } catch (error) {
    if (signatureStarted && walletRequestRejected(error)) {
      try {
        localStorage.removeItem(directStorageKey(userId));
        if (String(userStore.currentUser?.id) === String(userId)) directProgress.value = undefined;
      } catch {
        if (String(userStore.currentUser?.id) === String(userId)) directProgressError.value = '签名取消后本机记录清理失败，请先核对钱包交易';
      }
    }
    if (operation === directWriteVersion && String(userStore.currentUser?.id) === String(userId)) {
      directError.value = error instanceof Error ? error.message : '钱包操作未确认，请先核对交易记录，勿重复转账';
    }
  } finally {
    if (operation === directWriteVersion) directBusy.value = false;
  }
}

function clearDirectProgress() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined || directBusy.value) return;
  let saved: string | null;
  try { saved = localStorage.getItem(directStorageKey(userId)); }
  catch { Message.error('本机记录无法读取，请稍后重试'); return; }
  Modal.confirm({
    title: '核对上一笔钱包直充',
    content: directProgress.value?.txHash
      ? '请确认已在钱包及平台核对上一笔交易。清除本机提示不会取消或改变链上交易。'
      : '本机未取得上一笔交易哈希。仅在钱包交易记录确认没有待确认或已发出的转账后，才可清除提示并开始下一笔。',
    onOk: () => {
      try {
        if (localStorage.getItem(directStorageKey(userId)) !== saved) {
          Message.warning('直充记录已变化，请重新核对');
          readDirectProgress();
          return;
        }
        localStorage.removeItem(directStorageKey(userId));
        if (String(userStore.currentUser?.id) === String(userId)) { directProgress.value = undefined; directProgressError.value = ''; }
      } catch { Message.error('本机记录清理失败，请稍后重试'); }
    }
  });
}

async function createRecharge() {
  refreshSubmissionIssue();
  if (submitting.value || submissionUnknown.value) return;
  const chainCode = selectedChain.value?.chain;
  const amount = exactNumericAmount(amountDraft.value, selectedChain.value?.decimals ?? 2);
  if (pendingRechargeReadId.value === undefined && amount.value === undefined) {
    Message.warning(amount.error);
    return;
  }
  const requestedAmount = amount.value ?? 0;
  if (pendingRechargeReadId.value === undefined && compareDecimalAmount(amountDraft.value, '0.01') === -1) {
    Message.warning('充值申报金额最少为 0.01 USDT');
    return;
  }
  if (pendingRechargeReadId.value === undefined && !chainCode) {
    Message.warning('当前没有可用充值链');
    return;
  }
  const minimum = selectedChain.value?.minAmount;
  if (pendingRechargeReadId.value === undefined && minimum !== undefined && compareDecimalAmount(minimum, 0) === undefined) {
    Message.warning('最低充值金额配置未确认，请重新读取');
    return;
  }
  if (pendingRechargeReadId.value === undefined && minimum !== undefined && compareDecimalAmount(amountDraft.value, minimum) === -1) {
    Message.warning(`该链单笔最低充值金额为 ${minimum} USDT`);
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++createWriteVersion;
  const isCurrentWrite = () => operation === createWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  try {
    if (pendingRechargeReadId.value === undefined) {
      try {
        const createdId = await submitKeyedFinancialOperation(requestedUserId, 'recharge', { chain: chainCode!, amount: requestedAmount }, rechargeIntentApi);
        if (!isCurrentWrite()) return;
        if (!((typeof createdId === 'string' && createdId.trim()) || (typeof createdId === 'number' && Number.isSafeInteger(createdId)))) {
          throw new Error('未取得可核对的申报编号');
        }
        pendingRechargeReadId.value = createdId;
        Message.success('充值申报已创建');
      } catch (error) {
        if (isCurrentWrite()) {
          refreshSubmissionIssue();
          if (isDefinitiveRejection(error)) Message.error(error instanceof Error ? error.message : '申报被拒绝，请核对填写内容');
          else {
            Message.warning('充值申报结果待核实，请查看申报记录，未确认前请勿再次创建');
          }
        }
        return;
      }
    }
    try {
      const nextRecharge = await realWalletApi.fetchRechargeDetail(pendingRechargeReadId.value!, { showError: false });
      if (!isCurrentWrite()) return;
      if (String(nextRecharge.id) !== String(pendingRechargeReadId.value)) throw new Error('充值申报回读对象不一致');
      currentRecharge.value = nextRecharge;
      pendingRechargeReadId.value = undefined;
      activeTab.value = 'address';
    } catch {
      if (isCurrentWrite()) Message.warning('申报已创建，详情读取失败。请重试读取，不会重复创建申报');
    }
    if (!isCurrentWrite()) return;
    recordCurrent.value = 1;
    await syncRecordsQuery(true);
  } finally {
    if (operation === createWriteVersion) submitting.value = false;
  }
}

async function copy(text?: string) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); Message.success('已复制'); }
  catch { Message.error('复制失败，请手动复制'); }
}

async function showDetail(record: Api.RealWallet.RechargeVO) {
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
    const next = await realWalletApi.fetchRechargeDetail(id, { signal: isCurrent.signal, showError: false });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (String(next.id) !== String(id)) throw new Error('充值详情对象不一致');
    detail.value = next;
  } catch {
    if (isCurrent()) detailError.value = '充值订单详情加载失败，请稍后重试';
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

async function cancelRecharge(record: Api.RealWallet.RechargeVO) {
  if (record.status !== 'PENDING' || cancelingRechargeId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++cancelWriteVersion;
  const isCurrentWrite = () => operation === cancelWriteVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancelingRechargeId.value = record.id;
  try {
    await realWalletApi.cancelRecharge(record.id);
    if (!isCurrentWrite()) return;
    Message.success('充值申报已取消');
    const canceled = (item?: Api.RealWallet.RechargeVO) => item && String(item.id) === String(record.id)
      ? { ...item, status: 'CANCELED', statusText: '已取消' } : item;
    currentRecharge.value = canceled(currentRecharge.value);
    if (detailOpen.value && String(detailTargetId.value) === String(record.id)) {
      // 使取消前发出的详情读取失效，不让旧 PENDING 回包覆盖已确认结果。
      detailGuard.invalidate();
      detailLoading.value = false;
      detail.value = canceled(detail.value || record);
      detailError.value = '';
    }
    await loadRecords();
  } catch {
    // 请求层已展示后端业务提示。
  } finally {
    if (operation === cancelWriteVersion && isCurrentWrite()) cancelingRechargeId.value = undefined;
  }
}

function queryRecords() {
  recordCurrent.value = 1;
  void syncRecordsQuery();
}

onMounted(() => {
  refreshSubmissionIssue();
  readDirectProgress();
  window.addEventListener('storage', refreshSubmissionIssue);
  window.addEventListener('storage', readDirectProgress);
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
  window.removeEventListener('storage', readDirectProgress);
  window.removeEventListener('focus', refreshSubmissionIssue);
  createWriteVersion += 1;
  directWriteVersion += 1;
  cancelWriteVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  chainsGuard.invalidate();
  walletChainsGuard.invalidate();
  addressGuard.invalidate();
  detailGuard.invalidate();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  createWriteVersion += 1;
  directWriteVersion += 1;
  cancelWriteVersion += 1;
  requestGuard.invalidate();
  recordsGuard.invalidate();
  chainsGuard.invalidate();
  walletChainsGuard.invalidate();
  addressGuard.invalidate();
  detailGuard.invalidate();
  submitting.value = false;
  directBusy.value = false;
  directError.value = '';
  walletChainError.value = '';
  walletPayChains.value = [];
  readDirectProgress();
  refreshSubmissionIssue();
  cancelingRechargeId.value = undefined;
  chainOptions.value = [];
  chain.value = undefined;
  rechargeAddress.value = undefined;
  currentRecharge.value = undefined;
  pendingRechargeReadId.value = undefined;
  recentDeposits.value = [];
  recordTotal.value = 0;
  detail.value = undefined;
  detailTargetId.value = undefined;
  detailOpen.value = false;
  void loadAll();
});
watch(chain, () => { walletKey.value = undefined; directError.value = ''; void loadRechargeAddress(); });
watch(() => route.query.id, id => {
  if (id) void openDetail(String(id));
}, { immediate: true });

const statusFilter = computed({
  get: () => recordStatus.value || 'all',
  set: (value: string) => {
    recordStatus.value = value === 'all' ? undefined : value as Api.RealWallet.RechargeStatus;
    queryRecords();
  }
});
</script>

<template>
  <div class="wallet-operation-page">
  <component :is="userStore.isBuyerActive ? BuyerWallet : WalletHome" />
  <WalletOperationDialog :visible="true" title="转入 · 链上充值" description="选择币种与网络，安心管理每一笔充值。" deposit :busy="submitting || directBusy" @dismiss="closeOperation">
    <div class="coin-tabs" role="group" aria-label="快捷选择币种"><button class="wallet-disabled-asset" disabled aria-disabled="true"><span class="coin-icon">$</span>USDC</button><button class="active" aria-pressed="true"><span class="coin-icon usdt">₮</span>USDT</button></div>
    <p class="wallet-asset-unavailable">USDC 充值暂未开放，仅使用已授权的 USDT 网络。</p>
    <div v-if="submissionUnknown" class="deposit-hint" role="alert"><UmIcon name="shield" /><span>上次充值申报结果待核实，请先核对原申报。<small v-if="pendingSnapshot">原申报：{{ pendingSnapshot.chain }} · {{ formatAmount(pendingSnapshot.amount) }} USDT</small><button class="outline wallet-note-action" :disabled="submitting || directBusy" @click="restoreRecharge">{{ submitting ? '正在核对…' : '恢复原申报' }}</button></span></div>
    <div v-if="loadError" class="deposit-hint" role="alert"><UmIcon name="return" /><span>{{ loadError }}<button class="outline wallet-note-action" :disabled="submitting || directBusy || loadingChains" @click="loadAll">重新读取</button></span></div>
    <section class="deposit-panel">
      <template v-if="operationView === 'form'">
        <div class="deposit-selectors"><label for="deposit-currency">货币<select id="deposit-currency" disabled><option>USDT</option></select></label><label for="deposit-network">网络<select id="deposit-network" v-model="chain" :disabled="loadingChains || submitting || directBusy"><option v-if="!chainOptions.length" value="">{{ loadingChains ? '正在读取…' : '暂无可用网络' }}</option><option v-for="option in chainOptions" :key="option.chain" :value="option.chain">{{ option.label }}（{{ option.chain }}）</option></select></label></div>
        <div class="deposit-subline"><span>充值至 USDT 钱包</span><button @click="operationView = 'records'">充值记录<UmIcon name="chevron" /></button></div>
        <div class="deposit-methods" role="group" aria-label="充值方式"><span :style="{ transform: 'translateX(' + (['address', 'wallet', 'amount'].indexOf(depositMethod) * 100) + '%)' }" /><button v-for="item in [{ key: 'address', label: '地址充值' }, { key: 'wallet', label: '钱包充值' }, { key: 'amount', label: '金额充值' }] as const" :key="item.key" :class="{ active: depositMethod === item.key }" :aria-pressed="depositMethod === item.key" :disabled="submitting || directBusy" @click="depositMethod = item.key">{{ item.label }}</button></div>
        <div :key="depositMethod" class="deposit-content">
          <template v-if="depositMethod === 'address'">
            <div v-if="loadingAddress" class="wallet-skeletons"><Skeleton class="h-44 w-44 mx-auto" /><Skeleton class="h-16" /></div>
            <template v-else-if="rechargeAddress?.address"><V47DepositQr :address="rechargeAddress.address" :network="selectedChain?.label || rechargeAddress.chain" :memo="rechargeAddress.memo" /><div class="deposit-address"><span>充值地址 · {{ selectedChain?.label || rechargeAddress.chain }}<strong>{{ rechargeAddress.address }}</strong></span><button aria-label="复制充值地址" @click="copy(rechargeAddress.address)"><UmIcon name="box" />复制</button></div><div v-if="rechargeAddress.memo" class="deposit-address"><span>必须填写 Memo / Tag<strong>{{ rechargeAddress.memo }}</strong></span><button aria-label="复制 Memo / Tag" @click="copy(rechargeAddress.memo)"><UmIcon name="box" />复制</button></div><div class="deposit-hint"><UmIcon name="shield" /><span>币种与网络需保持一致<small>地址充值无需创建申报，到账后以平台确认为准。{{ rechargeAddress.memo ? '转账时必须填写上述 Memo / Tag。' : '' }}</small><small v-if="rechargeAddress.minAmount">最低充值金额：{{ rechargeAddress.minAmount }} USDT</small><small v-if="rechargeAddress.minConfirmations">到账确认数：{{ rechargeAddress.minConfirmations }}</small></span></div></template>
            <div v-else class="deposit-empty"><UmIcon name="wallet" /><h3>充值地址暂不可用</h3><p>{{ addressError || '请先选择可用网络，再读取专属地址。' }}</p><button class="outline wallet-note-action" :disabled="!chain || loadingAddress" @click="loadRechargeAddress()">重新读取地址</button></div>
          </template>
          <template v-else-if="depositMethod === 'wallet'">
            <div class="deposit-wallet-visual"><UmIcon name="wallet" /><h3>从你的钱包，直接充值</h3><p>连接钱包后，核对币种、网络与金额。</p></div>
            <select v-model="walletKey" class="wallet-provider-select" aria-label="选择浏览器钱包" :disabled="directBusy || !!directConfigError || !!directProgress || !!directProgressError"><option :value="undefined">选择已安装的钱包</option><option v-for="item in directWallets" :key="item.key" :value="item.key">{{ item.label }}</option></select>
            <label for="direct-amount" class="deposit-amount">充值金额 <span>USDT</span><input id="direct-amount" v-model="directAmount" inputmode="decimal" autocomplete="off" placeholder="0.00" :disabled="directBusy || !!directProgress || !!directProgressError" /></label>
            <div class="wallet-network-details">网络：{{ selectedWalletChain?.network || '—' }}<br />专属收款地址：{{ rechargeAddress?.address || '—' }}<br />USDT 合约：{{ rechargeAddress?.tokenContract || '—' }}<br />最低充值金额：{{ rechargeAddress?.minAmount ?? selectedChain?.minAmount ?? '待确认' }} USDT</div>
            <div v-if="directConfigError" class="deposit-hint" role="alert"><UmIcon name="shield" /><span>{{ directConfigError }}<button class="outline wallet-note-action" :disabled="directBusy" @click="reloadDirectConfig">重新读取配置</button></span></div>
            <p v-if="directError" class="deposit-error" role="alert">{{ directError }}</p>
            <div v-if="directProgress || directProgressError" class="deposit-hint" role="alert"><UmIcon name="clock" /><span><template v-if="directProgress"><p>{{ directBusy ? '本次' : '上一笔' }} {{ directProgress.chain }} · {{ directProgress.amount }} USDT {{ directBusy ? '正在等待钱包返回转账结果。' : '转账结果待核对。' }}</p><small v-if="directProgress.txHash">交易哈希：{{ directProgress.txHash }}</small><small>{{ directProgress.txHash ? '请等待平台确认到账，勿重复转账。' : directBusy ? '请在钱包中确认或取消，当前尚未取得交易哈希。' : '尚未取得交易哈希，请先核对钱包交易记录，勿重复转账。' }}</small></template><p v-else>{{ directProgressError }}</p><button class="outline wallet-note-action" :disabled="directBusy" @click="router.push('/wallet/history')">查看钱包流水</button><button class="outline wallet-note-action" :disabled="directBusy" @click="clearDirectProgress">核对后开始下一笔</button></span></div>
            <button class="deposit-submit full wallet-note-action" :disabled="directBusy || !!directConfigError || !!directProgress || !!directProgressError || !walletKey || !directWallets.length" @click="directTransfer">{{ directBusy ? '等待钱包操作…' : '连接钱包并转账' }}<UmIcon name="arrow" /></button>
            <p v-if="!directWallets.length" class="wallet-operation-note">未检测到当前链可用的浏览器钱包，可以使用地址充值。</p><p class="wallet-operation-note">请准备该网络的 Gas 币。钱包直充不创建金额申报，实际入账请到钱包流水核对。</p>
          </template>
          <template v-else>
            <div class="deposit-wallet-visual"><UmIcon name="edit" /><h3>提前登记本次充值</h3><p>创建金额申报后，仍需向对应地址完成转账。</p></div>
            <form novalidate @submit.prevent="createRecharge" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }"><label for="recharge-amount" class="deposit-amount">充值金额 <span>USDT</span><input id="recharge-amount" v-model="amountDraft" inputmode="decimal" autocomplete="off" placeholder="0.00" :disabled="submitting || submissionUnknown" /></label><p v-if="selectedChain?.minAmount" class="wallet-operation-note">最低充值金额：{{ selectedChain.minAmount }} USDT</p><p v-if="pendingRechargeReadId !== undefined" class="deposit-pending"><UmIcon name="clock" />申报已创建，等待详情读取。不会重复创建申报。</p><button class="deposit-submit full" type="submit" :disabled="submitting || submissionUnknown || !selectedChain">{{ submitting ? '正在处理…' : pendingRechargeReadId !== undefined ? '重试读取已创建申报' : '创建充值申报' }}<UmIcon name="arrow" /></button></form>
          </template>
        </div>
      </template>
      <template v-else-if="operationView === 'created'">
        <div class="deposit-record-heading"><button @click="operationView = 'form'; activeTab = 'create'"><UmIcon name="arrow" />返回充值</button><h3>充值申报</h3></div>
        <template v-if="currentRecharge"><article class="deposit-record"><div><strong>{{ formatAmount(currentRecharge.amount) }} USDT</strong><span>{{ currentRecharge.statusText || currentRecharge.status || '待确认' }}</span></div><p>{{ currentRecharge.chain }} · 金额申报</p><small>{{ formatTime(currentRecharge.createdAt) }}<br />{{ currentRecharge.id }}</small></article><div v-if="currentRecharge.depositAddress" class="deposit-address"><span>收款地址 · {{ currentRecharge.chain }}<strong>{{ currentRecharge.depositAddress }}</strong></span><button @click="copy(currentRecharge.depositAddress)"><UmIcon name="box" />复制</button></div><p v-else class="deposit-error">收款地址暂不可用，请读取申报详情后核对。</p><div v-if="currentRecharge.memo" class="deposit-address"><span>必须填写 Memo / Tag<strong>{{ currentRecharge.memo }}</strong></span><button @click="copy(currentRecharge.memo)"><UmIcon name="box" />复制</button></div><button class="outline full wallet-note-action" @click="showDetail(currentRecharge)">查看申报详情</button></template><EmptyState v-else title="暂无充值申报订单" />
      </template>
      <template v-else>
        <div class="deposit-record-heading"><button @click="operationView = 'form'"><UmIcon name="arrow" />返回充值</button><h3>充值记录</h3></div>
        <select v-model="statusFilter" class="wallet-record-filter" aria-label="筛选充值记录状态"><option value="all">全部状态</option><option value="PENDING">待确认</option><option value="CONFIRMED">已确认</option><option value="CANCELED">已取消</option></select>
        <div v-if="loadingRecords && !recentDeposits.length" class="wallet-skeletons"><Skeleton v-for="n in 3" :key="n" class="h-16" /></div>
        <div v-else-if="recentDeposits.length" :class="{ 'wallet-refreshing': loadingRecords }"><article v-for="record in recentDeposits" :key="record.id" class="deposit-record"><div><strong>{{ formatAmount(record.amount) }} USDT</strong><span>{{ record.statusText || record.status || '待确认' }}</span></div><p>{{ record.chain }} · 金额申报</p><small>{{ formatTime(record.createdAt) }}<br />{{ record.id }}</small><button @click="showDetail(record)">查看详情</button><button v-if="record.status === 'PENDING'" :disabled="cancelingRechargeId !== undefined" @click="cancelRecharge(record)">{{ cancelingRechargeId === record.id ? '取消中…' : '取消申报' }}</button></article></div>
        <EmptyState v-else :title="recordError || '还没有充值记录'" :description="recordError ? undefined : '金额申报显示在这里，地址与钱包直充请查看资金流水。'" :action-text="recordError ? '重新读取' : undefined" @action="recordError && loadRecords()" />
        <BusinessPagination v-if="recordTotal > recordSize" :total="recordTotal" :current="recordCurrent" :page-size="recordSize" :loading="loadingRecords" @change="(page: number) => { recordCurrent = page; syncRecordsQuery(); }" />
        <button class="text-link full wallet-note-action" @click="router.push('/wallet/history')">查看实际入账流水 →</button>
      </template>
    </section>
    <p class="wallet-operation-note">请务必使用所选网络转入 USDT，到账状态以链上确认和平台结果为准。</p>
  </WalletOperationDialog>
  <V47VaultDialog v-model:visible="detailOpen" title="充值订单详情" description="申报记录及链上到账状态" icon="wallet"><div v-if="detailLoading" class="wallet-skeletons"><Skeleton v-for="n in 5" :key="n" class="h-12" /></div><DescriptionList v-else-if="detail" :items="[{ label: '订单编号', value: String(detail.id) }, { label: '网络', value: detail.chain }, { label: '金额', value: formatAmount(detail.amount) + ' USDT' }, { label: '状态', value: detail.statusText || detail.status || '待确认' }, { label: '收款地址', value: detail.depositAddress || '—' }, { label: 'Memo / Tag', value: detail.memo || '—' }, { label: '交易哈希', value: detail.txHash || '—' }, { label: '创建时间', value: formatTime(detail.createdAt) }, { label: '确认时间', value: formatTime(detail.confirmedAt) }]" /><EmptyState v-else-if="detailError" :title="detailError" action-text="重新读取" @action="detailTargetId !== undefined && openDetail(detailTargetId)" /></V47VaultDialog>
  </div>
</template>

<style scoped src="./v47-wallet-operation.css"></style>
