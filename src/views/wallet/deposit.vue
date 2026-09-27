<script setup lang="ts">
import { resolvePageSize } from '@/service/api/page';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
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
const amount = ref(100);
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
  submit: (snapshot: FinancialSnapshot, idempotencyKey: string) => realWalletApi.createRecharge({ chain: snapshot.chain!, amount: Number(snapshot.amount), idempotencyKey }, { showError: false })
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

const statusColor = computed(() => (status?: string) => {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'CANCELED') return 'red';
  return 'orange';
});

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
    saveDirectProgress(userId, progress);
    signatureStarted = true;
    const hash = await wallet.sendTransfer();
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
  if (pendingRechargeReadId.value === undefined && (!Number.isFinite(amount.value) || amount.value <= 0)) {
    Message.warning('请输入正确的充值金额');
    return;
  }
  const requestedAmount = amount.value;
  const chainCode = selectedChain.value?.chain;
  if (pendingRechargeReadId.value === undefined && !chainCode) {
    Message.warning('当前没有可用充值链');
    return;
  }
  const minAmount = Number(selectedChain.value?.minAmount || 0);
  if (pendingRechargeReadId.value === undefined && minAmount > 0 && requestedAmount < minAmount) {
    Message.warning(`该链单笔最低充值金额为 ${minAmount} USDT`);
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
</script>

<template>
  <div class="deposit-page shop-container">
    <h1 class="page-title">钱包链上充值</h1>
    <p class="hint">选择充值链后，可直接使用专属地址完成 USDT 转账；如需留存申报记录，可填写金额后创建充值订单。</p>
    <a-alert v-if="submissionUnknown" type="warning" :closable="false" class="load-alert">
      上次申报结果待核实，恢复时先查原单，仅明确未落地才按原键原参重试。旧无键记录只读核实。
      <div v-if="pendingSnapshot">原申报：{{ pendingSnapshot.chain }} · U {{ formatAmount(pendingSnapshot.amount) }}</div>
      <template #action><a-space><a-button :loading="submitting" @click="restoreRecharge">恢复原申报</a-button><a-button :loading="loadingRecords" @click="loadRecords">核对申报记录</a-button></a-space></template>
    </a-alert>
    <a-alert v-if="loadError" type="error" class="load-alert" :closable="false">{{ loadError }}<template #action><a-button size="mini" @click="loadAll">重新加载</a-button></template></a-alert>

    <a-card class="tab-card" :body-style="{ padding: '12px 24px 24px' }" :bordered="false">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="create" title="充值地址与申报">
          <a-form :model="{ amount, chain }" layout="vertical" class="recharge-form">
            <a-row :gutter="16">
              <a-col :xs="24" :sm="12">
                <a-form-item label="链选择">
                  <a-select v-model="chain" size="large" :loading="loadingChains" placeholder="请选择充值链">
                  <a-option v-for="option in chainOptions" :key="option.chain" :value="option.chain">
                    {{ option.label }}（{{ option.chain }}）
                  </a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="申报金额 (USDT)">
                  <a-input-number v-model="amount" :min="0.01" :precision="selectedChain?.decimals ?? 2" placeholder="请输入充值金额" size="large" />
                </a-form-item>
              </a-col>
            </a-row>
            <div v-if="rechargeAddress?.address" class="direct-address">
              <div class="direct-address-head">
                <div>
                  <div class="address-label">{{ selectedChain?.label || rechargeAddress.chain }}（{{ selectedChain?.chain || rechargeAddress.chain }}）专属充值地址</div>
                  <div class="address-value direct-address-value">{{ rechargeAddress.address }}</div>
                </div>
                <a-button size="small" @click="copy(rechargeAddress.address)">复制地址</a-button>
              </div>
              <div v-if="rechargeAddress.memo" class="minimum-hint">Memo / Tag：{{ rechargeAddress.memo }}</div>
              <div v-if="rechargeAddress.minAmount" class="minimum-hint">建议最低充值金额：{{ rechargeAddress.minAmount }} USDT</div>
              <div v-if="rechargeAddress.minConfirmations" class="minimum-hint">到账确认数：{{ rechargeAddress.minConfirmations }}</div>
            </div>
            <a-alert v-else-if="selectedChain && !loadingAddress" type="warning" class="direct-address" :title="addressError || '充值地址暂不可用，请稍后重新加载。'" />
            <a-alert type="warning" class="chain-alert" title="请务必使用所选链转账；到账状态以链上确认和平台审核结果为准。" />
            <div class="optional-order">
              <div>
                <div class="optional-order-title">可选：创建充值申报记录</div>
                <div class="optional-order-hint">直接向上述地址转账即可到账；创建订单仅用于提前留存本次充值金额。</div>
              </div>
              <a-button type="primary" size="large" :loading="submitting" :disabled="submissionUnknown" @click="createRecharge">{{ pendingRechargeReadId !== undefined ? '重试读取已创建申报' : '创建申报订单' }}</a-button>
            </div>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="wallet" title="钱包直充">
          <div class="recharge-form">
            <a-alert type="info" class="chain-alert" :closable="false">浏览器钱包会向您的专属地址直接转入 USDT，无需创建充值申报单。请准备该网络的 Gas 币；下方申报记录可能不包含这笔直充，请到钱包流水核对实际入账。</a-alert>
            <a-row :gutter="16">
              <a-col :xs="24" :sm="12">
                <div class="wallet-field-label">充值链</div>
                <a-select v-model="chain" size="large" :loading="loadingChains" placeholder="请选择充值链">
                  <a-option v-for="option in chainOptions" :key="option.chain" :value="option.chain">{{ option.label }}（{{ option.chain }}）</a-option>
                </a-select>
              </a-col>
              <a-col :xs="24" :sm="12">
                <div class="wallet-field-label">转账金额 (USDT)</div>
                <a-input v-model="directAmount" size="large" inputmode="decimal" placeholder="请输入 USDT 金额" :disabled="directBusy" />
              </a-col>
            </a-row>
            <div class="direct-address wallet-direct-info">
              <div class="address-label">网络</div>
              <div class="address-value">{{ selectedWalletChain?.network || '—' }}</div>
              <div class="address-label">专属收款地址</div>
              <div class="address-value">{{ rechargeAddress?.address || '—' }}</div>
              <div class="address-label">USDT 合约</div>
              <div class="address-value">{{ rechargeAddress?.tokenContract || '—' }}</div>
              <div v-if="rechargeAddress?.minAmount || selectedChain?.minAmount" class="minimum-hint">最低充值金额：{{ rechargeAddress?.minAmount || selectedChain?.minAmount }} USDT</div>
              <div v-if="rechargeAddress?.minConfirmations" class="minimum-hint">到账确认数：{{ rechargeAddress.minConfirmations }}</div>
            </div>
            <a-alert v-if="directConfigError" type="warning" class="chain-alert" :closable="false">{{ directConfigError }}<template #action><a-button size="mini" @click="reloadDirectConfig">重新加载</a-button></template></a-alert>
            <a-alert v-if="directError" type="warning" class="chain-alert" :closable="false">{{ directError }}</a-alert>
            <a-alert v-if="directProgress || directProgressError" type="warning" class="chain-alert direct-progress-alert" :closable="false">
              <div class="direct-progress-content">
                <template v-if="directProgress">
                  <div>上一笔 {{ directProgress.chain }} · {{ directProgress.amount }} USDT 已打开钱包签名。</div>
                  <div v-if="directProgress.txHash" class="direct-progress-hash">交易哈希：{{ directProgress.txHash }}</div>
                  <div>{{ directProgress.txHash ? '请等待平台确认到账，勿重复转账。' : '尚未取得交易哈希，请先核对钱包交易记录，勿重复转账。' }}</div>
                </template>
                <div v-else>{{ directProgressError }}</div>
                <div class="direct-progress-actions">
                  <a-button size="mini" @click="router.push({ name: 'wallet-history' })">查看钱包流水</a-button>
                  <a-button size="mini" @click="clearDirectProgress">核对后开始下一笔</a-button>
                </div>
              </div>
            </a-alert>
            <div class="wallet-operations">
              <a-select v-model="walletKey" placeholder="选择已安装的钱包" class="wallet-select" :disabled="directBusy || !!directConfigError || !!directProgress || !!directProgressError">
                <a-option v-for="item in directWallets" :key="item.key" :value="item.key">{{ item.label }}</a-option>
              </a-select>
              <a-button type="primary" size="large" :loading="directBusy" :disabled="!!directConfigError || !!directProgress || !!directProgressError || !walletKey || !directWallets.length" @click="directTransfer">连接钱包并转账</a-button>
            </div>
            <div v-if="!directWallets.length" class="minimum-hint">未检测到当前链可用的浏览器钱包，请安装并解锁 MetaMask、OKX Wallet 或 TronLink。</div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="address" title="申报订单信息">
          <template v-if="currentRecharge">
            <a-descriptions :column="1" bordered :data="[
              { label: '订单编号', value: String(currentRecharge.id) },
              { label: '充值链', value: currentRecharge.chain },
              { label: '充值金额', value: 'U ' + formatAmount(currentRecharge.amount) },
              { label: '订单状态', value: currentRecharge.statusText || currentRecharge.status || 'PENDING' },
              { label: '创建时间', value: formatTime(currentRecharge.createdAt) }
            ]" />
            <div class="address-block">
              <div class="address-label">收款地址</div>
              <div class="address-value">{{ currentRecharge.depositAddress || '收款地址暂不可用' }}</div>
              <a-button v-if="currentRecharge.depositAddress" size="small" @click="copy(currentRecharge.depositAddress)">复制地址</a-button>
            </div>
            <div v-if="currentRecharge.memo" class="address-block">
              <div class="address-label">Memo / Tag</div>
              <div class="address-value">{{ currentRecharge.memo }}</div>
              <a-button size="small" @click="copy(currentRecharge.memo)">复制 Memo</a-button>
            </div>
          </template>
          <EmptyState v-else title="暂无充值申报订单" />
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-card class="txn-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
      <div class="records-head">
        <div class="section-title">充值记录</div>
        <a-select v-model="recordStatus" placeholder="全部状态" allow-clear style="width: 160px" @change="queryRecords">
          <a-option value="PENDING">待确认</a-option>
          <a-option value="CONFIRMED">已确认</a-option>
          <a-option value="CANCELED">已取消</a-option>
        </a-select>
      </div>
      <a-table :data="recentDeposits" :loading="loadingRecords" :pagination="false" row-key="id" :bordered="false">
        <template #columns>
          <a-table-column title="订单编号" data-index="id" :width="220" />
          <a-table-column title="链" data-index="chain" :width="120" />
          <a-table-column title="金额" :width="140">
            <template #cell="{ record }">U {{ formatAmount(record.amount) }}</template>
          </a-table-column>
          <a-table-column title="状态" :width="130">
            <template #cell="{ record }"><a-tag :color="statusColor(record.status)">{{ record.statusText || record.status || 'PENDING' }}</a-tag></template>
          </a-table-column>
          <a-table-column title="创建时间">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="150">
            <template #cell="{ record }">
              <div class="record-actions">
                <a-button type="text" @click="showDetail(record)">详情</a-button>
                <a-button v-if="record.status === 'PENDING'" type="text" status="danger" :loading="cancelingRechargeId === record.id" @click="cancelRecharge(record)">取消申报</a-button>
              </div>
            </template>
          </a-table-column>
        </template>
        <template #empty><EmptyState :title="recordError || '暂无链上充值记录'" :action-text="recordError ? '重新加载' : undefined" @action="recordError && loadRecords()" /></template>
      </a-table>
      <div v-if="recordTotal > recordSize" class="pagination">
        <a-pagination
          :total="recordTotal"
          :current="recordCurrent"
          :page-size="recordSize"
          show-total
          @change="(page: number) => { recordCurrent = page; syncRecordsQuery(); }"
        />
      </div>
    </a-card>

    <a-drawer
      v-model:visible="detailOpen"
      title="充值订单详情"
      placement="right"
      :width="520"
      :mask="true"
      :mask-closable="true"
      :footer="false"
    >
      <a-spin :loading="detailLoading" style="width: 100%">
        <a-descriptions v-if="detail" :column="1" bordered :data="[
          { label: '订单编号', value: String(detail.id) },
          { label: '链', value: detail.chain },
          { label: '金额', value: 'U ' + formatAmount(detail.amount) },
          { label: '状态', value: detail.statusText || detail.status || 'PENDING' },
          { label: '收款地址', value: detail.depositAddress || '—' },
          { label: 'Memo / Tag', value: detail.memo || '—' },
          { label: '交易哈希', value: detail.txHash || '—' },
          { label: '创建时间', value: formatTime(detail.createdAt) },
          { label: '确认时间', value: formatTime(detail.confirmedAt) }
        ]" />
        <EmptyState v-else-if="detailError" :title="detailError" action-text="重新加载" @action="detailTargetId !== undefined && openDetail(detailTargetId)" />
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.deposit-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.hint { color: #86909c; font-size: 13px; margin: 0 0 16px; }
.tab-card, .txn-card { background: #fff; border-radius: var(--bw-card-radius); margin-bottom: 16px; }
.recharge-form { max-width: 720px; padding-top: 12px; }
.chain-alert { margin-bottom: 16px; }
.direct-progress-alert { align-items: flex-start; }
.direct-progress-alert :deep(.arco-alert-icon) { margin-top: 2px; }
.direct-progress-content { min-width: 0; }
.direct-progress-hash { overflow-wrap: anywhere; }
.direct-progress-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.direct-address { margin-bottom: 16px; padding: 16px; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 6px; }
.direct-address-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.direct-address-head > div { min-width: 0; }
.direct-address-value { margin-bottom: 0; }
.minimum-hint { color: #86909c; font-size: 12px; margin-top: 12px; }
.optional-order { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-top: 2px; }
.optional-order-title { color: #1d2129; font-size: 14px; font-weight: 600; }
.optional-order-hint { color: #86909c; font-size: 12px; margin-top: 4px; }
.wallet-field-label { color: #4e5969; font-size: 13px; margin-bottom: 8px; }
.wallet-direct-info { margin-top: 16px; }
.wallet-direct-info .address-value { margin-bottom: 10px; }
.wallet-operations { display: flex; align-items: center; gap: 12px; }
.wallet-select { width: 240px; }
.address-block { margin-top: 16px; padding: 16px; background: #f7f8fa; border-radius: 6px; }
.address-label { color: #86909c; font-size: 12px; margin-bottom: 8px; }
.address-value { color: #1d2129; font-family: var(--yb-font-mono); overflow-wrap: anywhere; margin-bottom: 12px; }
.section-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 14px; padding-left: 8px; border-left: 3px solid var(--bw-brand-primary); }
.records-head { display: flex; justify-content: space-between; align-items: flex-start; }
.record-actions { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.pagination { display: flex; justify-content: center; margin-top: 16px; }
.load-alert { margin-bottom: 16px; }
@media (max-width: 640px) {
  .deposit-page { padding-top: 10px; }
  .tab-card :deep(.arco-card-body), .txn-card :deep(.arco-card-body) { padding-left: 16px !important; padding-right: 16px !important; }
  .direct-address-head, .optional-order { align-items: stretch; flex-direction: column; }
  .direct-address-head .arco-btn, .optional-order .arco-btn { width: 100%; }
  .wallet-operations { align-items: stretch; flex-direction: column; }
  .wallet-select, .wallet-operations .arco-btn { width: 100%; }
  .records-head { align-items: stretch; flex-direction: column; gap: 10px; }
  .records-head :deep(.arco-select) { width: 100% !important; }
}
</style>
