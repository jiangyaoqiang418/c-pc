<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { useUserStore, useCartStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { fetchLatestWalletPay, fetchWalletPayDetail, fetchWalletPayChains, submitWalletPayTx, validateWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';
import { availableWallets, connectPaymentWallet, walletRequestRejected } from '@/utils/wallet-pay-provider';
import { readWalletTransferProgress, saveWalletTransferProgress, clearWalletTransferProgress, type WalletTransferProgress } from '@/utils/wallet-pay-progress';
import { readPendingCheckout, pendingCheckoutStorageKey, clearCheckoutIntent, cleanupPaidCheckout, sumPaymentAmounts } from '@/utils/checkout';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const cart = useCartStore();
const guard = createLatestRequestGuard();
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
  if (document.hidden || !pay.value || !['SUBMITTED', 'CLOSED'].includes(pay.value.status)) return;
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
  successHandled = true;
  let pending;
  try { pending = readPendingCheckout(userId); } catch { Message.warning('支付已成功，但本地结算记录无法读取，请到订单列表核对'); }
  const matching = pending?.orderGroupNo === current.orderGroupNo ? pending : undefined;
  const orderId = matching?.firstOrderId || matching?.orderIds?.[0];
  const clean = await cleanupPaidCheckout([
    () => clearWalletTransferProgress(userId, current.payNo),
    () => { if (matching?.contextId) clearCheckoutIntent(matching.contextId); },
    () => matching?.cartSnapshot ? cart.consumePurchasedItems(matching.cartSnapshot) : undefined,
    () => {
      if (!matching) return;
      const key = pendingCheckoutStorageKey(userId);
      if (readPendingCheckout(userId)?.idempotencyKey === matching.idempotencyKey) localStorage.removeItem(key);
    }
  ]);
  if (!clean) Message.warning('支付已成功，但本地记录未完全清理，请以订单状态为准');
  if (String(userStore.currentUser?.id) !== String(userId) || orderGroupNo.value !== current.orderGroupNo) return;
  Message.success('钱包付款已由平台确认');
  if (orderId) await router.replace({ name: 'checkout-success', params: { orderId: String(orderId) }, query: { orderGroupNo: current.orderGroupNo } });
  else await router.replace({ name: 'order-list' });
}

function acceptPay(current: WalletPayOrder) {
  if (current.orderGroupNo !== orderGroupNo.value) throw new Error('支付单不属于当前订单组');
  pay.value = validateWalletPay(current, orderGroupNo.value);
  readProgress(current);
  if (current.status === 'SUCCESS') void settleSuccess(current);
  schedulePolling();
}

async function refreshDetail() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined) return;
  const version = generation;
  try {
    const next = await fetchWalletPayDetail(current.payNo);
    if (version !== generation || String(userStore.currentUser?.id) !== String(userId) || pay.value?.payNo !== current.payNo) return;
    errorMessage.value = '';
    acceptPay(next);
  } catch (error) {
    if (version === generation) errorMessage.value = error instanceof Error ? error.message : '支付状态读取失败，请重试';
    schedulePolling();
  }
}

async function reportHashFor(current: WalletPayOrder, userId: string | number, hash: string, fromAddress?: string) {
  if (!validHash(current.chain, hash)) throw new Error('交易哈希格式无效，请核对钱包交易记录');
  saveWalletTransferProgress(userId, current.payNo, { started: true, txHash: hash, fromAddress });
  if (pay.value?.payNo === current.payNo && String(userStore.currentUser?.id) === String(userId)) {
    progress.value = { started: true, txHash: hash, fromAddress };
  }
  if (String(userStore.currentUser?.id) !== String(userId)) throw new Error('账号已切换，交易哈希已在原账号本机记录；请切回原账号上报');
  const next = await submitWalletPayTx({ payNo: current.payNo, txHash: hash, ...(fromAddress ? { fromAddress } : {}) });
  if (pay.value?.payNo === current.payNo && String(userStore.currentUser?.id) === String(userId)) acceptPay(next);
}

async function reportHash(hash: string, fromAddress?: string) {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || userId === undefined) throw new Error('当前支付单已变化，请重新读取');
  await reportHashFor(current, userId, hash, fromAddress);
}

async function retryReport() {
  if (!progress.value?.txHash || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try { await reportHash(progress.value.txHash, progress.value.fromAddress); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : '哈希上报失败，请重试同一笔交易'; }
  finally { busy.value = false; }
}

async function reportManualHash() {
  const current = pay.value;
  const hash = manualHash.value.trim();
  if (!current || busy.value) return;
  if (!validHash(current.chain, hash)) { Message.warning('请填写有效的链上交易哈希'); return; }
  busy.value = true;
  errorMessage.value = '';
  try { await reportHash(hash, progress.value?.fromAddress); manualHash.value = ''; }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : '交易哈希上报失败，请保留哈希重试'; }
  finally { busy.value = false; }
}

async function load() {
  const isCurrent = guard.begin();
  ++generation;
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
    const result = await fetchLatestWalletPay(orderGroupNo.value, { signal: isCurrent.signal });
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
  const retryingFailedChainTx = current?.status === 'SUBMITTED' && current.chainTx?.status === 'FAILED';
  if (!current || userId === undefined || busy.value || recoveryBlocked.value
    || (current.status !== 'PENDING' && !retryingFailedChainTx)) return;
  if (progress.value?.started && !retryingFailedChainTx) { Message.warning('本机已有转账尝试，请先核对或上报原交易，勿重复转账'); return; }
  busy.value = true;
  errorMessage.value = '';
  let signatureStarted = false;
  try {
    if (!retryingFailedChainTx && Number(current.expireAt) <= Date.now()) throw new Error('支付单已过期，请刷新状态，勿继续转账');
    const latest = validateWalletPay(await fetchWalletPayDetail(current.payNo), current.orderGroupNo);
    const latestRetryable = latest.status === 'SUBMITTED' && latest.chainTx?.status === 'FAILED';
    if (latest.payNo !== current.payNo || (latest.status !== 'PENDING' && !latestRetryable)
      || latest.rawAmount !== current.rawAmount || latest.toAddress !== current.toAddress
      || latest.tokenContract !== current.tokenContract || latest.network !== current.network) {
      acceptPay(latest);
      throw new Error('支付单状态或参数已变化，请重新核对，不要转账');
    }
    const wallet = await connectPaymentWallet(latest, walletKey.value);
    if (String(userStore.currentUser?.id) !== String(userId) || pay.value?.payNo !== latest.payNo) throw new Error('当前账号或支付单已变化，请重新核对');
    walletAccount.value = wallet.account;
    const confirmed = await new Promise<boolean>(resolve => Modal.confirm({
      title: '核对钱包转账',
      content: `${latest.chainLabel || latest.chain} ${latest.network} · ${latest.payAmount} USDT。付款账户：${wallet.account}。请再次核对页面中的收款地址和合约，确认后打开钱包签名。`,
      onOk: () => resolve(true), onCancel: () => resolve(false)
    }));
    if (!confirmed) return;
    if (String(userStore.currentUser?.id) !== String(userId) || pay.value?.payNo !== latest.payNo) throw new Error('当前账号或支付单已变化，请重新核对');
    const beforeSignature = validateWalletPay(await fetchWalletPayDetail(latest.payNo), latest.orderGroupNo);
    const beforeSignatureRetryable = beforeSignature.status === 'SUBMITTED' && beforeSignature.chainTx?.status === 'FAILED';
    if ((beforeSignature.status !== 'PENDING' && !beforeSignatureRetryable)
      || beforeSignature.chain !== latest.chain || beforeSignature.rawAmount !== latest.rawAmount
      || beforeSignature.toAddress !== latest.toAddress || beforeSignature.tokenContract !== latest.tokenContract
      || beforeSignature.network !== latest.network
      || (beforeSignature.status === 'PENDING' && Number(beforeSignature.expireAt) <= Date.now())) {
      acceptPay(beforeSignature);
      throw new Error('支付单状态或参数已变化，请刷新并核对，勿继续转账');
    }
    if (String(userStore.currentUser?.id) !== String(userId) || pay.value?.payNo !== latest.payNo) throw new Error('当前账号或支付单已变化，请重新核对');
    saveWalletTransferProgress(userId, latest.payNo, { started: true, fromAddress: wallet.account });
    progress.value = { started: true, fromAddress: wallet.account };
    signatureStarted = true;
    const hash = await wallet.sendTransfer();
    await reportHashFor(latest, userId, hash, wallet.account);
  } catch (error) {
    if (signatureStarted && walletRequestRejected(error)) {
      clearWalletTransferProgress(userId, current.payNo);
      progress.value = undefined;
    }
    errorMessage.value = error instanceof Error ? error.message : '钱包操作未确认，请先核对钱包交易，勿重复转账';
  } finally { busy.value = false; }
}

function restartClosed() {
  const current = pay.value;
  const userId = userStore.currentUser?.id;
  if (!current || current.status !== 'CLOSED' || userId === undefined) return;
  if (progress.value?.started) { Message.warning('本机仍有转账记录，请先核对链上交易结果'); return; }
  Modal.confirm({ title: '重新发起钱包支付', content: '仅在确认未发生链上转账后重新创建支付单。旧支付单关闭后仍可能出现到账回调，请先核对交易记录。',
    onOk: () => {
      const pending = readPendingCheckout(userId);
      if (pending?.orderGroupNo === current.orderGroupNo && pending.walletPayAttempt?.payNo === current.payNo) {
        delete pending.walletPayAttempt;
        localStorage.setItem(pendingCheckoutStorageKey(userId), JSON.stringify(pending));
      }
      void router.push({ name: 'checkout' });
    } });
}

function onVisibility() { if (!document.hidden) void refreshDetail(); else stopPolling(); }
onMounted(() => { void load(); document.addEventListener('visibilitychange', onVisibility); window.addEventListener('focus', onVisibility); });
onBeforeUnmount(() => { guard.invalidate(); ++generation; stopPolling(); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('focus', onVisibility); });
watch([orderGroupNo, () => userStore.currentUser?.id], () => { void load(); });
</script>

<template>
  <div class="wallet-pay-page">
    <a-spin :loading="loading" style="width: 100%">
      <a-card class="wallet-pay-card" :bordered="false">
        <template #title>USDT 钱包直付</template>
        <a-alert v-if="errorMessage" type="warning" :closable="false">{{ errorMessage }}</a-alert>
        <template v-if="pay">
          <a-alert v-if="pay.status === 'PENDING'" type="info" :closable="false">请核对链、金额和收款地址后再打开钱包；准备对应网络的 Gas 币。只有平台确认到账才算付款成功。</a-alert>
          <a-alert v-else-if="chainRetryable" type="warning" :closable="false">原链上交易执行失败，资金未转出。请核对钱包记录后，使用本支付单原链、金额和收款地址重新转账并上报新哈希。</a-alert>
          <a-alert v-else-if="pay.status === 'SUBMITTED'" type="info" :closable="false">{{ chainProgressText || `交易已提交，正在等待链上确认${minConfirmations ? `（至少 ${minConfirmations} 个确认）` : ''}和平台入账。` }}请勿重复转账。</a-alert>
          <a-alert v-else-if="pay.status === 'CLOSED'" type="warning" :closable="false">支付单已关闭，仍可能收到延迟到账回调。请先核对链上交易，再决定是否重新发起。</a-alert>
          <a-alert v-else-if="pay.status === 'FAILED'" type="warning" :closable="false">链上到账未能完成订单支付，资金将按后端规则入平台余额。请前往订单核对，勿重复链上转账。</a-alert>
          <a-alert v-if="transferAmountInsufficient" type="warning" :closable="false">已识别转入金额低于应付金额，到账后可能存入平台余额；最终付款结果以支付单状态为准。</a-alert>
          <a-descriptions :column="1" bordered class="pay-details">
            <a-descriptions-item label="订单组号">{{ pay.orderGroupNo }}</a-descriptions-item>
            <a-descriptions-item label="支付单号">{{ pay.payNo }}</a-descriptions-item>
            <a-descriptions-item label="状态">
              <span class="pay-status">
                <span>{{ pay.statusText || pay.status }}</span>
                <a-spin v-if="pay.status === 'SUBMITTED'" :loading="true" :size="14" aria-label="链上确认中" />
              </span>
            </a-descriptions-item>
            <a-descriptions-item label="链与网络">{{ pay.chainLabel || pay.chain }} · {{ pay.network }}</a-descriptions-item>
            <a-descriptions-item label="应转 USDT">{{ pay.payAmount }}</a-descriptions-item>
            <a-descriptions-item label="收款地址">{{ pay.toAddress }}</a-descriptions-item>
            <a-descriptions-item label="USDT 合约">{{ pay.tokenContract }}</a-descriptions-item>
            <a-descriptions-item label="有效期至">{{ formatExpiry(pay.expireAt) }}</a-descriptions-item>
            <a-descriptions-item label="钱包账户">{{ walletAccount || progress?.fromAddress || '尚未连接' }}</a-descriptions-item>
            <a-descriptions-item v-if="pay.txHash || progress?.txHash" label="交易哈希">{{ pay.txHash || progress?.txHash }}</a-descriptions-item>
            <a-descriptions-item v-if="pay.chainTx" label="链上进度">{{ chainProgressText }}</a-descriptions-item>
            <a-descriptions-item v-if="pay.chainTx?.blockHeight" label="区块高度">{{ pay.chainTx.blockHeight }}</a-descriptions-item>
            <a-descriptions-item v-if="pay.chainTx?.transferAmount" label="已识别转入">{{ pay.chainTx.transferAmount }} USDT</a-descriptions-item>
          </a-descriptions>
          <div v-if="(pay.status === 'PENDING' && !progress?.started || chainRetryable) && !recoveryBlocked" class="pay-operations">
            <a-select v-model="walletKey" placeholder="选择已安装的钱包" class="wallet-select">
              <a-option v-for="item in wallets" :key="item.key" :value="item.key">{{ item.label }}</a-option>
            </a-select>
            <a-button type="primary" :loading="busy" :disabled="!walletKey || loading" @click="transfer">{{ chainRetryable ? '重新连接钱包并转账' : '连接钱包并转账' }}</a-button>
            <div v-if="!wallets.length" class="wallet-install">
              <span class="muted">未检测到当前链可用的浏览器钱包，请从官方页面安装：</span>
              <a v-for="item in walletInstallLinks" :key="item.url" :href="item.url" target="_blank" rel="noopener noreferrer" class="wallet-install-link">
                {{ item.label }}
              </a>
              <span class="muted">安装并解锁后，请刷新本页重新连接。</span>
            </div>
          </div>
          <div v-if="progress?.started && !progress.txHash && pay.status === 'PENDING'" class="pay-operations">
            <a-alert type="warning" :closable="false">本机曾打开钱包签名，但未取得交易哈希。请先在钱包中核对交易记录，勿再次转账。</a-alert>
            <a-input v-model="manualHash" placeholder="核对后填写原交易哈希" class="hash-input" />
            <a-button :loading="busy" @click="reportManualHash">上报原交易哈希</a-button>
          </div>
          <div v-if="progress?.txHash && pay.status === 'PENDING'" class="pay-operations">
            <a-button :loading="busy" @click="retryReport">重试上报同一交易</a-button>
          </div>
          <a-button v-if="pay.status === 'CLOSED'" class="restart" @click="restartClosed">核对后返回结算页</a-button>
          <a-button v-if="pay.status === 'FAILED'" class="restart" @click="router.push({ name: 'checkout' })">返回结算页使用余额</a-button>
          <p v-if="pay.failReason" class="muted">{{ pay.failReason }}</p>
        </template>
        <a-result v-else-if="!loading && !errorMessage" status="info" title="暂无钱包支付单" />
        <a-space class="actions">
          <a-button :disabled="loading || busy" @click="pay ? refreshDetail() : load()">刷新状态</a-button>
          <a-button @click="router.push({ name: 'order-list' })">查看我的订单</a-button>
        </a-space>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.wallet-pay-page { max-width: 840px; margin: 48px auto 80px; padding: 0 20px; }
.wallet-pay-card { border-radius: 12px; box-shadow: 0 12px 32px rgb(22 33 54 / 8%); }
.pay-details { margin-top: 20px; overflow-wrap: anywhere; }
.pay-status { display: inline-flex; align-items: center; gap: 8px; }
.pay-operations { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.wallet-select { width: 240px; }
.wallet-install { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.wallet-install-link { color: rgb(var(--primary-6)); text-decoration: underline; }
.hash-input { width: 360px; max-width: 100%; }
.muted { color: var(--yb-muted); }
.restart { margin-top: 20px; }
.actions { margin-top: 24px; }
</style>
