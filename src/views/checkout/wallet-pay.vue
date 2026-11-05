<script setup lang="ts">
import CopyValue from '@/components/common/copy-value.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/common/empty-state.vue';
import { Message, Modal } from '@/lib/feedback';
import { useUserStore, useCartStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { withSubmissionLock } from '@/utils/financial-submission';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { fetchCurrentWalletPay, fetchWalletPayDetail, fetchWalletPayChains, submitWalletPayTx, validateWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';
import { availableWallets, connectPaymentWallet, walletRequestRejected } from '@/utils/wallet-pay-provider';
import { readWalletTransferProgress, saveWalletTransferProgress, clearWalletTransferProgress, type WalletTransferProgress } from '@/utils/wallet-pay-progress';
import { readPendingCheckout, pendingCheckoutStorageKey, clearCheckoutIntent, cleanupPaidCheckout, sumPaymentAmounts } from '@/utils/checkout';
import { validateGroupPayResult } from '@/utils/checkout';
import { fetchOrderGroupPayResult } from '@/service/api/order';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import { statusMap } from '@/service/api/order-mapper';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const cart = useCartStore();
const guard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const detailGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const orderGroupNo = computed(() => String(route.params.orderGroupNo || ''));
const pay = ref<WalletPayOrder>();
const progress = ref<WalletTransferProgress>();
const loading = ref(false);
const busy = ref(false);
const errorMessage = ref('');
const walletKey = ref('');
const walletAccount = ref('');
const manualHash = ref('');
const recoveryBlocked = ref(false);
const minConfirmations = ref<number>();
const groupResult = ref<Api.RealOrder.OrderGroupPayResult>();
const resultError = ref('');
const resultGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const chainRetryable = computed(() => pay.value?.status === 'SUBMITTED' && pay.value.chainTx?.status === 'FAILED');
const transferAmountInsufficient = computed(() => {
  const current = pay.value;
  const transferred = current?.chainTx?.transferAmount;
  if (current?.status !== 'SUBMITTED' || current.chainTx?.status === 'FAILED' || transferred == null) return false;
  try {
    const [receivedWhole, receivedFraction = ''] = sumPaymentAmounts([transferred]).split('.');
    const [payableWhole, payableFraction = ''] = sumPaymentAmounts([current.payAmount]).split('.');
    if (BigInt(receivedWhole) !== BigInt(payableWhole)) return BigInt(receivedWhole) < BigInt(payableWhole);
    const scale = Math.max(receivedFraction.length, payableFraction.length);
    return BigInt((receivedFraction || '0').padEnd(scale, '0'))
      < BigInt((payableFraction || '0').padEnd(scale, '0'));
  } catch { return false; }
});
const chainProgressText = computed(() => {
  const tx = pay.value?.chainTx;
  if (!tx) return '';
  if (tx.status === 'NOT_FOUND') return '正在等待区块链广播…';
  if (tx.status === 'PENDING') return '交易打包中…';
  if (tx.status === 'CONFIRMING') return `区块确认中 ${tx.confirmations}/${tx.minConfirmations}`;
  if (tx.status === 'CONFIRMED') return '链上已确认，正在入账付款…';
  return '这笔链上转账执行失败，资金未转出';
});
const wallets = computed(() => availableWallets(pay.value?.chain || ''));
const walletInstallLinks = computed(() => pay.value?.chain === 'TRON'
  ? [{ label: '安装 TronLink', url: 'https://www.tronlink.org/dlDetails/' }]
  : pay.value?.chain === 'ETH' || pay.value?.chain === 'BSC'
    ? [
        { label: '安装 MetaMask', url: 'https://metamask.io/download' },
        { label: '安装 OKX Wallet', url: 'https://web3.okx.com/zh-hans/extension' }
      ]
    : []);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let successHandled = false;
let disposed = false;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let cancelConfirmation: (() => void) | undefined;
function closeConfirmation() { cancelConfirmation?.(); cancelConfirmation = undefined; confirmationModal?.close(); confirmationModal = undefined; }
function currentContext(version: number, userId: string | number, session: string, payNo?: string) {
  return !disposed && version === generation && getAccessToken() === session
    && String(userStore.currentUser?.id) === String(userId) && (!payNo || pay.value?.payNo === payNo);
}
function transferLockKey(userId: string | number, payNo: string) { return `wallet-pay-transfer:${String(userId)}:${payNo}`; }

function formatExpiry(value: string | number | undefined) {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString() : '请以订单状态为准';
}

function validHash(chain: string, hash: string) {
  return chain === 'TRON' ? /^[0-9a-fA-F]{64}$/.test(hash) : /^0x[0-9a-fA-F]{64}$/.test(hash);
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function schedulePolling() {
  stopPolling();
  if (disposed || busy.value || document.hidden || !pay.value || !['SUBMITTED', 'CLOSED'].includes(pay.value.status)) return;
  pollTimer = setTimeout(() => { void refreshDetail(); }, pay.value.status === 'SUBMITTED' ? 4000 : 30000);
}

function readProgress(current: WalletPayOrder) {
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  try { progress.value = readWalletTransferProgress(userId, current.payNo); recoveryBlocked.value = false; }
  catch (error) {
    recoveryBlocked.value = true;
    errorMessage.value = error instanceof Error ? error.message : '本机转账记录无法读取，请先核对钱包交易';
  }
}

async function settleSuccess(current: WalletPayOrder) {
  if (successHandled) return;
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  const version = generation;
  const session = getAccessToken();
  const isCurrent = () => currentContext(version, userId, session, current.payNo) && orderGroupNo.value === current.orderGroupNo;
  successHandled = true;
  try {
    const result = await readGroupResult(current);
    if (!isCurrent()) return;
    groupResult.value = result;
    if (result.items.some(item => item.status === 'CREATED')) throw new Error('付款状态待核对，请刷新逐单结果');
  } catch (cause) {
    if (isCurrent()) { successHandled = false; resultError.value = cause instanceof Error ? cause.message : '订单结果读取失败，请刷新'; }
    return;
  }
  let pending;
  try { pending = readPendingCheckout(userId); } catch { if (isCurrent()) Message.warning('支付已成功，但本地结算记录无法读取，请到订单列表核对'); }
  const matching = pending?.orderGroupNo === current.orderGroupNo ? pending : undefined;
  const orderId = matching?.firstOrderId || matching?.orderIds?.[0];
  const clean = await cleanupPaidCheckout([
    () => { if (isCurrent()) clearWalletTransferProgress(userId, current.payNo); },
    () => { if (isCurrent() && matching?.contextId) clearCheckoutIntent(matching.contextId); },
    () => isCurrent() && matching?.cartSnapshot ? cart.consumePurchasedItems(matching.cartSnapshot) : undefined,
    () => {
      if (!isCurrent() || !matching) return;
      const key = pendingCheckoutStorageKey(userId);
      if (readPendingCheckout(userId)?.idempotencyKey === matching.idempotencyKey) localStorage.removeItem(key);
    }
  ]);
  if (!isCurrent()) return;
  if (!clean) Message.warning('支付已成功，但本地记录未完全清理，请以订单状态为准');
  Message.success('钱包付款已由平台确认');
  if (orderId) await router.replace({ name: 'checkout-success', params: { orderId: String(orderId) }, query: { orderGroupNo: current.orderGroupNo } });
  else await router.replace({ name: 'order-list' });
}

function acceptPay(current: WalletPayOrder) {
  if (current.orderGroupNo !== orderGroupNo.value) throw new Error('支付单不属于当前订单组');
  const checked = validateWalletPay(current, orderGroupNo.value);
  if (pay.value && pay.value.payNo !== checked.payNo) throw new Error('支付单已变化，请重新加载');
  if (pay.value?.status === 'SUCCESS' && checked.status !== 'SUCCESS') return;
  pay.value = checked;
  readProgress(current);
  if (current.status === 'FAILED' || current.status === 'CLOSED') void refreshGroupResult(current);
  if (current.status === 'SUCCESS') void settleSuccess(current);
  schedulePolling();
}

async function readGroupResult(current: WalletPayOrder, signal?: AbortSignal) {
  const result = await fetchOrderGroupPayResult(current.orderGroupNo, { signal });
  return validateGroupPayResult(result, current.orderGroupNo, result?.items?.map(item => item.orderId) || []);
}

async function refreshGroupResult(current: WalletPayOrder) {
  const latest = resultGuard.begin();
  try {
    const result = await readGroupResult(current, latest.signal);
    if (!latest() || pay.value?.payNo !== current.payNo) return;
    groupResult.value = result;
    resultError.value = '';
  } catch {
    if (latest()) resultError.value = '逐单付款结果读取失败，请刷新后核对剩余待付金额';
  }
}

async function refreshDetail() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined || busy.value || disposed) return;
  const version = generation;
  const session = getAccessToken();
  const isLatest = detailGuard.begin();
  const isCurrent = () => isLatest() && currentContext(version, userId, session, current.payNo);
  try {
    const next = await fetchWalletPayDetail(current.payNo, { signal:isLatest.signal });
    if (!isCurrent()) return;
    errorMessage.value = '';
    acceptPay(next);
  } catch (error) {
    if (isCurrent()) errorMessage.value = error instanceof Error ? error.message : '支付状态读取失败，请重试';
  } finally { if (isCurrent()) schedulePolling(); }
}

async function reportHashFor(current: WalletPayOrder, userId: string | number, hash: string, fromAddress: string | undefined,
  version: number, session: string) {
  if (!validHash(current.chain, hash)) throw new Error('交易哈希格式无效，请核对钱包交易记录');
  saveWalletTransferProgress(userId, current.payNo, { started: true, txHash: hash, fromAddress });
  if (currentContext(version, userId, session, current.payNo)) progress.value = { started:true, txHash:hash, fromAddress };
  if (!currentContext(version, userId, session, current.payNo)) throw new Error('页面或账号已变化，交易哈希已在原账号本机记录；请返回原支付单上报');
  const next = await submitWalletPayTx({ payNo: current.payNo, txHash: hash, ...(fromAddress ? { fromAddress } : {}) });
  if (!currentContext(version, userId, session, current.payNo)) return;
  detailGuard.invalidate();
  resultGuard.invalidate();
  groupResult.value = undefined;
  resultError.value = '';
  acceptPay(next);
}

async function reportHash(hash: string, fromAddress?: string) {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined) throw new Error('当前支付单已变化，请重新加载');
  const version = generation;
  const session = getAccessToken();
  await withSubmissionLock(transferLockKey(userId, current.payNo), async () => {
    if (!currentContext(version, userId, session, current.payNo)) throw new Error('页面或账号已变化，请重新核对');
    await reportHashFor(current, userId, hash, fromAddress, version, session);
  });
}

async function retryReport() {
  if (!progress.value?.txHash || busy.value) return;
  const version = generation;
  busy.value = true;
  errorMessage.value = '';
  stopPolling();
  detailGuard.invalidate();
  try { await reportHash(progress.value.txHash, progress.value.fromAddress); }
  catch (error) { if (version === generation && !disposed) errorMessage.value = error instanceof Error ? error.message : '哈希上报失败，请重试同一笔交易'; }
  finally { if (version === generation && !disposed) { busy.value = false; schedulePolling(); } }
}

async function reportManualHash() {
  const current = pay.value;
  const hash = manualHash.value.trim();
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined || busy.value || !['PENDING', 'SUBMITTED'].includes(current.status)) return;
  if (!validHash(current.chain, hash)) { Message.warning('请填写有效的链上交易哈希'); return; }
  const version = generation;
  const session = getAccessToken();
  busy.value = true;
  errorMessage.value = '';
  stopPolling();
  detailGuard.invalidate();
  try {
    const originalHash = current.txHash || progress.value?.txHash;
    if (originalHash && originalHash !== hash) {
      const accepted = await new Promise<boolean>(resolve => {
        cancelConfirmation = () => resolve(false);
        confirmationModal = Modal.confirm({ title: '核对已广播的替换交易', content: '仅在钱包确实广播了原交易的加速或替换交易后，才上报新哈希。请确认链、收款地址、金额与本支付单一致；未广播不要填写新哈希。',
          onOk: () => resolve(true), onCancel: () => resolve(false), onClose: () => resolve(false) });
      });
      cancelConfirmation = undefined;
      confirmationModal = undefined;
      if (!accepted || !currentContext(version, userId, session, current.payNo)) return;
    }
    await reportHash(hash, progress.value?.fromAddress);
    if (version === generation) manualHash.value = '';
  }
  catch (error) { if (version === generation && !disposed) errorMessage.value = error instanceof Error ? error.message : '交易哈希上报失败，请保留哈希重试'; }
  finally { if (version === generation && !disposed) { busy.value = false; schedulePolling(); } }
}

async function load() {
  const isCurrent = guard.begin();
  ++generation;
  detailGuard.invalidate();
  resultGuard.invalidate();
  groupResult.value = undefined;
  resultError.value = '';
  closeConfirmation();
  successHandled = false;
  busy.value = false;
  loading.value = false;
  manualHash.value = '';
  stopPolling();
  const userId = userStore.currentUser?.id;
  pay.value = undefined;
  progress.value = undefined;
  recoveryBlocked.value = false;
  errorMessage.value = '';
  walletAccount.value = '';
  minConfirmations.value = undefined;
  if (!walletPayEntryEnabled || userId === undefined || !orderGroupNo.value) {
    errorMessage.value = '钱包直付入口暂未开放，请从订单列表核对待付订单';
    return;
  }
  loading.value = true;
  try {
    const result = await fetchCurrentWalletPay(orderGroupNo.value, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    if (!result) throw new Error('未找到该订单组的钱包支付单，请返回结算页');
    acceptPay(result);
    void fetchWalletPayChains({ signal: isCurrent.signal }).then(chains => {
      if (isCurrent()) minConfirmations.value = chains.find(chain => chain.chain === result.chain && chain.network === result.network)?.minConfirmations;
    }).catch(() => undefined);
    walletKey.value = wallets.value[0]?.key || '';
    const saved = readWalletTransferProgress(userId, result.payNo);
    if (saved?.txHash && result.status === 'PENDING') void retryReport();
  } catch (error) {
    if (isCurrent()) errorMessage.value = error instanceof Error ? error.message : '支付单读取失败，请稍后重试';
  } finally { if (isCurrent()) loading.value = false; }
}

async function transfer() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined || busy.value || recoveryBlocked.value
    || current.status !== 'PENDING') return;
  if (progress.value?.started) { Message.warning('本机已有转账尝试，请先核对或上报原交易，勿重复转账'); return; }
  const version = generation;
  const session = getAccessToken();
  const selectedWallet = walletKey.value;
  const isCurrent = () => currentContext(version, userId, session, current.payNo);
  const checkProgress = (latest: WalletPayOrder) => {
    const saved = readWalletTransferProgress(userId, latest.payNo);
    if (saved?.started) {
      throw new Error('本机已有待核对的转账尝试，请先核对或上报原交易，勿重复转账');
    }
  };
  busy.value = true;
  errorMessage.value = '';
  stopPolling();
  detailGuard.invalidate();
  try {
    await withSubmissionLock(transferLockKey(userId, current.payNo), async () => {
      let signatureStarted = false;
      try {
        if (!isCurrent()) throw new Error('当前账号或支付单已变化，请重新核对');
        if (Number(current.expireAt) <= Date.now()) throw new Error('支付单已过期，请刷新状态，勿继续转账');
        const latest = validateWalletPay(await fetchWalletPayDetail(current.payNo), current.orderGroupNo);
        if (!isCurrent()) return;
        if (latest.payNo !== current.payNo || latest.status !== 'PENDING'
          || latest.chain !== current.chain || latest.rawAmount !== current.rawAmount || latest.toAddress !== current.toAddress
          || latest.tokenContract !== current.tokenContract || latest.network !== current.network) {
          acceptPay(latest);
          throw new Error('支付单状态或参数已变化，请重新核对，不要转账');
        }
        checkProgress(latest);
        const wallet = await connectPaymentWallet(latest, selectedWallet);
        if (!isCurrent()) throw new Error('当前账号或支付单已变化，请重新核对');
        walletAccount.value = wallet.account;
        const confirmed = await new Promise<boolean>(resolve => {
          cancelConfirmation = () => resolve(false);
          confirmationModal = Modal.confirm({
            title: '核对钱包转账',
            content: `${latest.chainLabel || latest.chain} ${latest.network} · ${latest.payAmount} USDT。付款账户：${wallet.account}。请再次核对页面中的收款地址和合约，确认后打开钱包签名。`,
            onOk: () => resolve(true), onCancel: () => resolve(false)
          });
        });
        cancelConfirmation = undefined;
        confirmationModal = undefined;
        if (!confirmed || !isCurrent()) return;
        const beforeSignature = validateWalletPay(await fetchWalletPayDetail(latest.payNo), latest.orderGroupNo);
        if (!isCurrent()) return;
        if (beforeSignature.payNo !== latest.payNo || beforeSignature.status !== 'PENDING'
          || beforeSignature.chain !== latest.chain || beforeSignature.rawAmount !== latest.rawAmount
          || beforeSignature.toAddress !== latest.toAddress || beforeSignature.tokenContract !== latest.tokenContract
          || beforeSignature.network !== latest.network
          || (beforeSignature.status === 'PENDING' && Number(beforeSignature.expireAt) <= Date.now())) {
          acceptPay(beforeSignature);
          throw new Error('支付单状态或参数已变化，请刷新并核对，勿继续转账');
        }
        checkProgress(beforeSignature);
        const hash = await wallet.sendTransfer(() => {
          if (!isCurrent()) throw new Error('当前账号或支付单已变化，本次尚未签名');
          if (beforeSignature.status === 'PENDING' && Number(beforeSignature.expireAt) <= Date.now()) {
            throw new Error('支付单已过期，本次尚未签名，请刷新状态后核对');
          }
          checkProgress(beforeSignature);
          saveWalletTransferProgress(userId, latest.payNo, { started:true, fromAddress:wallet.account });
          progress.value = { started:true, fromAddress:wallet.account };
          signatureStarted = true;
        });
        await reportHashFor(latest, userId, hash, wallet.account, version, session);
      } catch (error) {
        if (signatureStarted && walletRequestRejected(error)) {
          clearWalletTransferProgress(userId, current.payNo);
          if (isCurrent()) progress.value = undefined;
        }
        throw error;
      }
    });
  } catch (error) {
    if (isCurrent()) errorMessage.value = error instanceof Error ? error.message : '钱包操作未确认，请先核对钱包交易，勿重复转账';
  } finally { if (isCurrent()) { busy.value = false; schedulePolling(); } }
}

async function returnToPaymentMethods() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || busy.value || userId === undefined) return;
  const version = generation;
  const session = getAccessToken();
  const isCurrent = () => currentContext(version, userId, session, current.payNo);
  busy.value = true;
  stopPolling();
  try {
    const pending = readPendingCheckout(userId);
    if (pending?.orderGroupNo === current.orderGroupNo && pending.orderIds?.length) {
      if (isCurrent()) await router.push({ name: 'checkout' });
      return;
    }
    const result = await readGroupResult(current);
    if (!isCurrent()) return;
    groupResult.value = result;
    const orderId = result.items.find(item => item.status === 'CREATED')?.orderId || result.items[0]?.orderId;
    if (orderId === undefined) throw new Error('未找到关联订单，请从我的订单核对');
    await router.push({ name: 'order-detail', params: { id: String(orderId) }, query: { payment: 'choose' } });
  } catch (cause) {
    if (isCurrent()) errorMessage.value = cause instanceof Error ? cause.message : '订单读取失败，请重试';
  } finally {
    if (isCurrent()) { busy.value = false; schedulePolling(); }
  }
}

function restartClosed() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || current.status !== 'CLOSED' || userId === undefined) return;
  if (progress.value?.started) { Message.warning('本机仍有转账记录，请先核对链上交易结果'); return; }
  const version = generation;
  const session = getAccessToken();
  confirmationModal = Modal.confirm({ title: '重新发起钱包支付', content: '仅在确认未发生链上转账后重新创建支付单；如需改用余额，请返回付款方式选择。',
    onOk: () => {
      if (!currentContext(version, userId, session, current.payNo)) return;
      try {
        if (readWalletTransferProgress(userId, current.payNo)?.started) throw new Error('本机已有待核对转账，请先核对原交易');
        const pending = readPendingCheckout(userId);
        if (pending?.orderGroupNo === current.orderGroupNo && pending.walletPayAttempt?.payNo === current.payNo) {
          delete pending.walletPayAttempt;
          localStorage.setItem(pendingCheckoutStorageKey(userId), JSON.stringify(pending));
        }
        void router.push({ name: 'checkout' });
      } catch (cause) { if (currentContext(version, userId, session)) errorMessage.value = cause instanceof Error ? cause.message : '原支付记录无法读取，请先核对'; }
    } });
}

function onStorage() { if (pay.value && !disposed) readProgress(pay.value); }
function onVisibility() { if (!document.hidden && !disposed) void refreshDetail(); else stopPolling(); }
onMounted(() => { void load(); document.addEventListener('visibilitychange', onVisibility); window.addEventListener('focus', onVisibility); window.addEventListener('storage', onStorage); });
onBeforeUnmount(() => { disposed = true; guard.invalidate(); detailGuard.invalidate(); resultGuard.invalidate(); ++generation; closeConfirmation(); stopPolling(); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('focus', onVisibility); window.removeEventListener('storage', onStorage); });
watch([orderGroupNo, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => { void load(); });

</script>

<template>
  <div class="wallet-pay-page">

    <section class="paper narrow wallet-pay-card" :aria-busy="loading || busy">
      <span class="eyebrow">SECURE CHECKOUT</span><h1>USDT 钱包直付</h1>
      <Alert v-if="errorMessage" variant="destructive" class="notice"><AlertDescription>{{ errorMessage }}</AlertDescription></Alert>
      <Skeleton v-if="loading && !pay" class="pay-skeleton" />
      <template v-if="pay">
        <p>订单组 {{ pay.orderGroupNo }}</p><div class="payment-amount">{{ pay.payAmount }} <small>USDT</small></div><div class="status-banner"><UmIcon :name="pay.status === 'SUCCESS' ? 'check' : 'clock'" /><span>{{ pay.statusText || pay.status }}<small>{{ pay.chainLabel || pay.chain }} · {{ pay.network }}</small></span></div>
        <Alert v-if="pay.status === 'PENDING'" class="notice"><AlertDescription>请核对链、金额和收款地址后再打开钱包；准备对应网络的 Gas 币。只有平台确认到账才算付款成功。</AlertDescription></Alert>
        <Alert v-else-if="chainRetryable" class="notice"><AlertDescription>原链上交易执行失败，正在核对平台状态。请保留钱包记录，服务端返回终态前不要再次付款。</AlertDescription></Alert>
        <Alert v-else-if="pay.status === 'SUBMITTED'" class="notice" aria-live="polite"><AlertDescription>{{ chainProgressText || `交易已提交，正在等待链上确认${minConfirmations ? `（至少 ${minConfirmations} 个确认）` : ''}和平台入账。` }}请勿重复转账。</AlertDescription></Alert>
        <Alert v-else-if="pay.status === 'CLOSED'" class="notice"><AlertDescription>本直付单已终止，之后的链上到账只进入本人余额，不再触发订单付款。请通过充值记录和钱包余额核对到账，再按订单当前状态选择付款。</AlertDescription></Alert>
        <Alert v-else-if="pay.status === 'FAILED'" class="notice"><AlertDescription>本次订单组付款全部或部分失败，请核对下方逐单结果。已付款订单保留，仅对仍待付金额重新确认付款；剩余资金留在余额。</AlertDescription></Alert>
        <Alert v-if="transferAmountInsufficient" class="notice"><AlertDescription>已识别转入金额低于应付金额，到账后可能存入平台余额；最终付款结果以支付单状态为准。</AlertDescription></Alert>
        <dl class="spec-table pay-details">
          <div><dt>订单组号</dt><dd><CopyValue :value="pay.orderGroupNo" label="订单组号" /></dd></div><div><dt>支付单号</dt><dd><CopyValue :value="pay.payNo" label="支付单号" /></dd></div>
          <div class="address-detail"><dt>收款地址</dt><dd>{{ pay.toAddress }}</dd></div><div><dt>USDT 合约</dt><dd>{{ pay.tokenContract }}</dd></div>
          <div><dt>有效期至</dt><dd>{{ formatExpiry(pay.expireAt) }}</dd></div><div><dt>钱包账户</dt><dd>{{ walletAccount || progress?.fromAddress || '尚未连接' }}</dd></div>
          <div v-if="pay.txHash || progress?.txHash"><dt>交易哈希</dt><dd><CopyValue :value="pay.txHash || progress?.txHash" label="交易哈希" /></dd></div>
          <div v-if="pay.chainTx"><dt>链上进度</dt><dd>{{ chainProgressText }}</dd></div><div v-if="pay.chainTx?.blockHeight"><dt>区块高度</dt><dd>{{ pay.chainTx.blockHeight }}</dd></div><div v-if="pay.chainTx?.transferAmount"><dt>已识别转入</dt><dd>{{ pay.chainTx.transferAmount }} USDT</dd></div>
        </dl>
        <div v-if="pay.status === 'PENDING' && !progress?.started && !recoveryBlocked" class="pay-operations">
          <div class="field wallet-field"><Label for="payment-wallet">选择已安装的钱包</Label><Select v-model="walletKey" :disabled="busy || loading"><SelectTrigger id="payment-wallet"><SelectValue placeholder="选择已安装的钱包" /></SelectTrigger><SelectContent><SelectItem v-for="item in wallets" :key="item.key" :value="item.key">{{ item.label }}</SelectItem></SelectContent></Select></div>
          <button type="button" class="gold full" :disabled="!walletKey || loading || busy" @click="transfer"><Icon v-if="busy" icon="lucide:loader-circle" width="16" class="animate-spin" />连接钱包并转账</button>
          <div v-if="!wallets.length" class="wallet-install"><span>未检测到当前链可用的浏览器钱包，请从官方页面安装：</span><div><a v-for="item in walletInstallLinks" :key="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.label }} <Icon icon="lucide:external-link" width="12" /></a></div><span>安装并解锁后，请刷新本页重新连接。</span></div>
        </div>
        <div v-if="pay.status === 'SUBMITTED' || progress?.started && !progress.txHash && pay.status === 'PENDING'" class="recovery-operations">
          <Alert class="notice"><AlertDescription>{{ pay.status === 'SUBMITTED' ? '原交易正在核对。相同哈希可安全重试；只有钱包确实广播了替换交易，才上报新哈希。请勿再次付款。' : '本机曾打开钱包签名，但未取得交易哈希。请先在钱包中核对交易记录，勿再次转账。' }}</AlertDescription></Alert>
          <form class="field hash-form" @submit.prevent="reportManualHash"><Label for="manual-transaction-hash">已广播交易哈希</Label><Input id="manual-transaction-hash" v-model="manualHash" :disabled="busy" autocomplete="off" spellcheck="false" placeholder="核对钱包活动后填写" /><button class="outline" type="submit"  :disabled="busy"><Icon v-if="busy" icon="lucide:loader-circle" width="16" class="animate-spin" />核对并上报交易哈希</button></form>
        </div>
        <div v-if="progress?.txHash && (pay.status === 'PENDING' || chainRetryable && progress.txHash !== pay.txHash)" class="retry-report"><button type="button" class="outline"  :disabled="busy" @click="retryReport"><Icon v-if="busy" icon="lucide:loader-circle" width="16" class="animate-spin" />重试上报同一交易</button></div>
        <Alert v-if="resultError" variant="destructive" class="notice"><AlertDescription>{{ resultError }}</AlertDescription></Alert>
        <section v-if="groupResult || pay.payResult" class="group-results" aria-label="逐单付款结果"><h2>逐单付款结果</h2><p>仍待付：{{ (groupResult || pay.payResult)!.unpaidAmount }} USDT。取消订单单独展示，不计为已付款。</p><div v-for="item in (groupResult || pay.payResult)!.items" :key="String(item.orderId)"><RouterLink :to="{ name: 'order-detail', params: { id: String(item.orderId) } }">{{ item.orderNo || item.orderId }}</RouterLink> · {{ item.amount }} USDT · <OrderStatusTag :status="statusMap[item.status]" /><p v-if="item.message">{{ item.message }}</p></div></section>
        <button type="button" v-if="pay.status !== 'SUCCESS'" class="restart outline" :disabled="busy || loading" @click="returnToPaymentMethods">返回付款方式选择</button>
        <button type="button" v-if="pay.status === 'CLOSED'" class="restart outline" :disabled="busy || loading" @click="restartClosed">核对后重新发起钱包支付</button>
        <p v-if="pay.status === 'SUBMITTED'" class="hint">可返回查看订单，链上确认完成前不可再次付款。</p>
        <div v-if="pay.status === 'CLOSED' || pay.status === 'FAILED'" class="button-row"><RouterLink :to="{ name: 'wallet-deposit', query: { view: 'records' } }">核对充值记录</RouterLink><RouterLink :to="{ name: 'wallet' }">查看钱包余额</RouterLink></div>
        <p v-if="pay.failReason" class="failure-reason">{{ pay.failReason }}</p>
      </template>
      <EmptyState v-else-if="!loading && !errorMessage" title="暂无钱包支付单" />
      <footer class="button-row actions"><button type="button" class="outline"  :disabled="loading || busy" @click="pay ? refreshDetail() : load()"><Icon icon="lucide:refresh-cw" width="16" />刷新状态</button><button type="button" class="text-link"  @click="router.push({ name: 'order-list' })">查看我的订单</button></footer>
    </section>
  </div>
</template>

<style scoped>
.group-results { margin-top:20px; padding:16px; border:1px solid var(--line); border-radius:8px; background:var(--soft); font-size:13px; overflow-wrap:anywhere; }.group-results h2 { font-size:16px; }.group-results>div { margin-top:12px; }.group-results p,.hint { color:var(--muted); font-size:12px; }
.wallet-pay-card > h1 { margin:10px 0; }.wallet-pay-card > p { margin-top:12px; }.notice { margin:16px 0; }.pay-details > div { display:contents; }.pay-details dd { overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }.address-detail dd { color:var(--green); font-weight:600; }.pay-operations { display:grid; gap:12px; margin-top:24px; }.wallet-field { margin:0; }.wallet-install { display:grid; gap:8px; padding:16px; border-radius:8px; background:var(--soft); font-size:13px; }.wallet-install > div { display:flex; flex-wrap:wrap; gap:16px; }.wallet-install a { display:inline-flex; align-items:center; gap:4px; color:var(--green); text-decoration:underline; }.hash-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 12px; }.hash-form label { grid-column:1 / -1; }.restart,.retry-report { margin-top:20px; }.failure-reason { margin-top:16px; font-size:13px; color:var(--yb-danger); overflow-wrap:anywhere; }.actions { justify-content:flex-end; flex-wrap:wrap; margin-top:24px; padding-top:20px; border-top:1px solid var(--line); }.pay-skeleton { height:360px; }
@media (max-width:700px) {
  .hash-form { grid-template-columns:1fr; }
  .wallet-pay-card > p,.payment-amount { overflow-wrap:anywhere; }
}
</style>
