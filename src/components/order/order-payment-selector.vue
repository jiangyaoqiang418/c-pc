<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Modal } from '@/lib/feedback';
import * as orderApi from '@/service/api/order';
import { createWalletPay, fetchLatestWalletPay, fetchWalletPayChains, validateWalletPay, type WalletPayChain, type WalletPayOrder } from '@/service/api/wallet-pay';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { readPendingCheckout, pendingCheckoutStorageKey, sumPaymentAmounts, validateGroupPayResult } from '@/utils/checkout';
import { withOrderSubmissionLocks, withSubmissionLock } from '@/utils/financial-submission';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { getOrderCapabilities } from '@/utils/order';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';

const props = defineProps<{ visible: boolean; order: Api.RealOrder.DisplayRecord }>();
const emit = defineEmits<{ (e: 'update:visible', visible: boolean): void; (e: 'balance'): void }>();
const router = useRouter();
const userStore = useUserStore();
const guard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const detail = ref<Api.RealOrder.Record>();
const chains = ref<WalletPayChain[]>([]);
const latestPay = ref<WalletPayOrder>();
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const chainError = ref('');
const method = ref<'balance' | 'chain'>();
const selectedChain = ref('');
const paymentMethodId = useId();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let cancelConfirmation: (() => void) | undefined;
function closeConfirmation() { cancelConfirmation?.(); cancelConfirmation = undefined; confirmationModal?.close(); confirmationModal = undefined; }
function askConfirmation(title: string, content: string) {
  return new Promise<boolean>(resolve => {
    cancelConfirmation = () => resolve(false);
    confirmationModal = Modal.confirm({ title, content,
      onOk: () => { confirmationModal = undefined; cancelConfirmation = undefined; resolve(true); },
      onCancel: () => { confirmationModal = undefined; cancelConfirmation = undefined; resolve(false); }
    });
  });
}

const groupNo = computed(() => detail.value?.orderGroupNo?.trim() || '');
const activePay = computed(() => latestPay.value && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(latestPay.value.status));
const chainDisabledReason = computed(() => {
  if (!walletPayEntryEnabled) return '链上支付入口暂未开放';
  if (!groupNo.value) return '该订单缺少订单组号，暂不能创建链上支付单';
  if (chainError.value) return chainError.value;
  if (!chains.value.length) return '当前没有可用的链上支付网络';
  return '';
});
const continueDisabledReason = computed(() => {
  if (loading.value || submitting.value) return '正在核对或处理付款，请稍候';
  if (error.value) return error.value;
  if (activePay.value) return '已有钱包支付单，请先查看原支付进度';
  if (!method.value) return '请先选择付款方式';
  if (method.value === 'chain' && !selectedChain.value) return '请选择支付链';
  return '';
});

function close() {
  if (submitting.value) return;
  emit('update:visible', false);
}

async function load() {
  const isCurrent = guard.begin();
  const userId = userStore.currentUser?.id;
  const orderId = props.order.id;
  detail.value = undefined;
  chains.value = [];
  latestPay.value = undefined;
  method.value = undefined;
  selectedChain.value = '';
  error.value = '';
  chainError.value = '';
  if (!props.visible || userId === undefined) return;
  loading.value = true;
  try {
    const current = await orderApi.fetchOrderDetail(orderId, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    if (String(current.id) !== String(orderId) || !getOrderCapabilities(current, userId).pay) {
      throw new Error('订单状态已变化，请刷新订单列表');
    }
    detail.value = current;
    if (current.orderGroupNo && walletPayEntryEnabled) {
      const [chainResult, latestResult] = await Promise.allSettled([
        fetchWalletPayChains({ signal: isCurrent.signal }),
        fetchLatestWalletPay(current.orderGroupNo, { signal: isCurrent.signal })
      ]);
      if (!isCurrent()) return;
      if (chainResult.status === 'fulfilled') {
        chains.value = chainResult.value.filter(item => item.enabled);
        selectedChain.value = chains.value[0]?.chain || '';
      } else chainError.value = '链上支付配置读取失败，请重试';
      if (latestResult.status === 'fulfilled') {
        latestPay.value = latestResult.value ? validateWalletPay(latestResult.value, current.orderGroupNo) : undefined;
      } else throw new Error('钱包支付状态读取失败，请重试，暂不可重复付款');
    }
  } catch (cause) {
    if (isCurrent()) error.value = cause instanceof Error ? cause.message : '订单付款信息读取失败，请重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

watch([() => props.visible, () => props.order.id, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  writeVersion += 1;
  closeConfirmation();
  guard.invalidate();
  submitting.value = false;
  if (props.visible) void load();
}, { immediate: true });
onBeforeUnmount(() => { writeVersion += 1; closeConfirmation(); guard.invalidate(); });

function amountAtLeast(amount: string, minimum: string | number | null) {
  if (minimum === null || minimum === undefined || minimum === '') return true;
  const [whole, fraction = ''] = sumPaymentAmounts([amount]).split('.');
  const [minWhole, minFraction = ''] = sumPaymentAmounts([minimum]).split('.');
  if (BigInt(whole) !== BigInt(minWhole)) return BigInt(whole) > BigInt(minWhole);
  const scale = Math.max(fraction.length, minFraction.length);
  return BigInt((fraction || '0').padEnd(scale, '0')) >= BigInt((minFraction || '0').padEnd(scale, '0'));
}

async function readPayableGroup(group: string, clickedId: string | number, userId: string | number) {
  const result = await orderApi.fetchOrderGroupPayResult(group);
  const ids = result?.items?.map(item => item.orderId) || [];
  validateGroupPayResult(result, group, ids);
  if (!ids.some(id => String(id) === String(clickedId))) throw new Error('所选订单不属于该订单组，请刷新后重试');
  const orders = await Promise.all(ids.map(id => orderApi.fetchOrderDetail(id)));
  const payable = result.items.filter(item => item.status === 'CREATED' && !item.success);
  if (!payable.some(item => String(item.orderId) === String(clickedId)) || !payable.length) {
    throw new Error('所选订单已不在待付款状态，请刷新后重试');
  }
  for (const item of result.items) {
    const current = orders.find(order => String(order.id) === String(item.orderId));
    if (!current || current.orderGroupNo !== group || !getOrderCapabilities(current, userId).isCustomer
      || sumPaymentAmounts([current.totalAmount]) !== sumPaymentAmounts([item.amount])
      || (item.status === 'CREATED') !== getOrderCapabilities(current, userId).pay) {
      throw new Error('订单组状态或金额已变化，请刷新后重新核对');
    }
  }
  const amount = sumPaymentAmounts(payable.map(item => item.amount));
  if (amount !== sumPaymentAmounts([result.unpaidAmount])) throw new Error('订单组待付金额不一致，请停止付款');
  return { amount, ids, count: payable.length };
}

interface WalletAttempt { chain: string; amount: string; idempotencyKey: string; payNo?: string }
function ownAttemptKey(userId: string | number, group: string) {
  return `cpc:order-wallet-pay:attempt:${String(userId)}:${group}`;
}

async function continuePayment() {
  if (loading.value || submitting.value || !method.value || error.value || activePay.value) return;
  const userId = userStore.currentUser?.id;
  const current = detail.value;
  if (userId === undefined || !current) return;
  const group = groupNo.value;
  const orderId = current.id;
  const selectedMethod = method.value;
  const chosenChain = selectedChain.value;
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && props.visible
    && String(userStore.currentUser?.id) === String(userId) && String(props.order.id) === String(orderId);
  submitting.value = true;
  error.value = '';
  try {
    const refreshed = await orderApi.fetchOrderDetail(orderId);
    if (!isCurrent()) return;
    if (!getOrderCapabilities(refreshed, userId).pay || refreshed.orderGroupNo !== current.orderGroupNo
      || sumPaymentAmounts([refreshed.totalAmount]) !== sumPaymentAmounts([current.totalAmount])) {
      throw new Error('订单状态或金额已变化，请刷新后重新核对');
    }
    if (group && walletPayEntryEnabled) {
      const existing = await fetchLatestWalletPay(group);
      if (!isCurrent()) return;
      latestPay.value = existing ? validateWalletPay(existing, group) : undefined;
      if (latestPay.value && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(latestPay.value.status)) {
        await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
        return;
      }
      if (latestPay.value && ['CLOSED', 'FAILED'].includes(latestPay.value.status)) {
        const confirmed = await askConfirmation('先核对原链上支付',
          `原支付单 ${latestPay.value?.payNo} 已${latestPay.value?.statusText || latestPay.value?.status}。旧交易仍可能延迟到账；请先在钱包和平台核对原交易，确认后再选择新的付款。`);
        if (!confirmed || !isCurrent()) return;
      }
    }
    if (selectedMethod === 'balance') {
      emit('update:visible', false);
      emit('balance');
      return;
    }
    if (!walletPayEntryEnabled || !group || chainError.value) throw new Error('当前订单暂不可使用链上支付');
    const selected = chains.value.find(item => item.chain === chosenChain && item.enabled);
    if (!selected) throw new Error('请先选择可用的支付链');
    const preview = await readPayableGroup(group, orderId, userId);
    if (!isCurrent()) return;
    if (!amountAtLeast(preview.amount, selected.minAmount)) throw new Error('订单组金额低于该链最小支付额，请选择余额支付或其他链');
    const accepted = await askConfirmation('核对链上支付',
      `本次将为该订单组的 ${preview.count} 笔待付订单创建 ${selected.label}（${selected.network}）支付单，合计 U ${preview.amount}。不会立即转账，下一页还需连接钱包并签名。`);
    if (!accepted || !isCurrent()) return;
    let pending = readPendingCheckout(userId);
    const matchingPending = pending?.orderGroupNo === group;
    const storageKey = matchingPending ? pendingCheckoutStorageKey(userId) : ownAttemptKey(userId, group);
    await withSubmissionLock(storageKey, () => withOrderSubmissionLocks(userId, preview.ids, async () => {
      if (!isCurrent()) return;
      const fresh = await readPayableGroup(group, orderId, userId);
      if (!isCurrent()) return;
      if (fresh.amount !== preview.amount || fresh.ids.map(String).sort().join(',') !== preview.ids.map(String).sort().join(',')) {
        throw new Error('订单组待付情况已变化，请重新核对');
      }
      const liveChains = await fetchWalletPayChains();
      const liveChain = liveChains.find(item => item.chain === chosenChain && item.enabled);
      if (!liveChain || liveChain.network !== selected.network || liveChain.tokenContract !== selected.tokenContract
        || liveChain.decimals !== selected.decimals || !amountAtLeast(fresh.amount, liveChain.minAmount)) {
        throw new Error('支付链配置已变化，请重新选择');
      }
      const existing = await fetchLatestWalletPay(group);
      if (!isCurrent()) return;
      const latest = existing ? validateWalletPay(existing, group) : undefined;
      if (latest && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(latest.status)) {
        await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
        return;
      }
      pending = readPendingCheckout(userId);
      if (matchingPending !== (pending?.orderGroupNo === group)) throw new Error('结算记录已变化，请重新核对');
      if (matchingPending && pending && (pending.orderIds?.length !== fresh.ids.length
        || pending.orderIds.some(id => !fresh.ids.some(groupId => String(groupId) === String(id))))) {
        throw new Error('本机结算订单组与服务端不一致，请返回结算页核对');
      }
      let attempt: WalletAttempt | undefined;
      if (matchingPending) {
        const saved = pending?.walletPayAttempt;
        if (saved) attempt = { ...saved, amount: fresh.amount };
      } else {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          try { attempt = JSON.parse(raw) as WalletAttempt; }
          catch { throw new Error('本机支付尝试记录损坏，请先核对原支付单，勿重复发起'); }
        }
      }
      if (attempt && (typeof attempt.idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(attempt.idempotencyKey)
        || typeof attempt.chain !== 'string' || typeof attempt.amount !== 'string'
        || (attempt.payNo !== undefined && (typeof attempt.payNo !== 'string' || !attempt.payNo.trim()))
        || attempt.chain !== chosenChain || attempt.amount !== fresh.amount)) {
        throw new Error('已有不同金额或链的支付尝试，请先核对原支付单');
      }
      if (attempt?.payNo && latest && attempt.payNo === latest.payNo && ['CLOSED', 'FAILED'].includes(latest.status)) {
        attempt = undefined;
      } else if (attempt?.payNo && (!latest || attempt.payNo !== latest.payNo)) {
        throw new Error('原支付单状态尚未确认，请先核对，勿重复发起');
      }
      if (!attempt) attempt = { chain: chosenChain, amount: fresh.amount, idempotencyKey: crypto.randomUUID() };
      const saveAttempt = (value: WalletAttempt | undefined) => {
        if (matchingPending && pending) {
          pending.walletPayAttempt = value ? { chain: value.chain, idempotencyKey: value.idempotencyKey, payNo: value.payNo } : undefined;
          localStorage.setItem(storageKey, JSON.stringify(pending));
        } else if (value) localStorage.setItem(storageKey, JSON.stringify(value));
        else localStorage.removeItem(storageKey);
      };
      saveAttempt(attempt);
      try {
        const created = validateWalletPay(await createWalletPay({ orderGroupNo: group, chain: chosenChain,
          confirmedAmount: fresh.amount, idempotencyKey: attempt.idempotencyKey }), group, chosenChain);
        if (!isCurrent()) return;
        saveAttempt({ ...attempt, payNo: created.payNo });
        await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
      } catch (cause) {
        if (cause instanceof RequestError && ['-300', '-301', '-302', '-309', '-312'].includes(cause.code || '') && !attempt.payNo) {
          saveAttempt(undefined);
        }
        if (cause instanceof RequestError && cause.code === '-305' && isCurrent()) {
          await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
          return;
        }
        throw cause;
      }
    }));
  } catch (cause) {
    if (isCurrent()) error.value = cause instanceof Error ? cause.message : '付款方式确认失败，请稍后重试';
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <a-modal :visible="visible" title="选择付款方式" :width="540" :footer="false" :mask-closable="!submitting" :esc-to-close="!submitting" :closable="!submitting" @cancel="close">
    <div class="order-payment-body" :aria-busy="loading || submitting">
      <Alert v-if="error" variant="destructive" class="notice"><AlertDescription>{{ error }}</AlertDescription><button type="button" class="outline" :disabled="submitting || loading" @click="load">重新核对</button></Alert>
      <Skeleton v-if="loading && !detail" class="payment-skeleton" />
      <template v-if="detail">
        <div class="order-summary"><span>订单 {{ detail.code }}</span><strong>U {{ detail.totalAmount }}</strong></div>
        <Alert v-if="activePay" class="notice"><AlertDescription>此订单组已有钱包支付单（{{ latestPay?.statusText || latestPay?.status }}），请先核对原支付进度，勿重复付款。</AlertDescription><button type="button" class="outline" @click="router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: groupNo } })">查看支付进度</button></Alert>
        <Alert v-else-if="latestPay && ['CLOSED', 'FAILED'].includes(latestPay.status)" class="notice"><AlertDescription>此前的链上支付单已{{ latestPay.statusText || latestPay.status }}。再次发起前请先核对原交易是否到账。</AlertDescription></Alert>
        <fieldset class="method-choices payment-options" :disabled="!!activePay || !!error || loading || submitting"><legend class="sr-only">付款方式</legend>
          <label class="method-option" :class="{ active: method === 'balance' }"><input type="radio" :name="paymentMethodId" :checked="method === 'balance'" @change="method = 'balance'" /><UmIcon name="wallet" /><span><strong>站内钱包余额支付</strong><small>下一步输入支付密码</small></span></label>
          <TooltipProvider><Tooltip><TooltipTrigger as-child><span class="chain-choice" :tabindex="chainDisabledReason ? 0 : undefined"><label class="method-option" :class="{ active: method === 'chain', disabled: !!chainDisabledReason }"><input type="radio" :name="paymentMethodId" :checked="method === 'chain'" :disabled="!!chainDisabledReason" @change="method = 'chain'" /><UmIcon name="globe" /><span><strong>USDT 链上支付</strong><small>连接浏览器钱包后确认转账</small></span></label></span></TooltipTrigger><TooltipContent v-if="chainDisabledReason">{{ chainDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        </fieldset>
        <Alert v-if="chainError" class="notice"><AlertDescription>{{ chainError }}</AlertDescription></Alert>
        <p v-else-if="chainDisabledReason" class="hint">{{ chainDisabledReason }}。</p>
        <div v-if="method === 'chain'" class="chain-select field"><label for="order-payment-chain">支付网络</label><Select v-model="selectedChain" :disabled="loading || submitting"><SelectTrigger id="order-payment-chain"><SelectValue placeholder="选择支付链" /></SelectTrigger><SelectContent><SelectItem v-for="item in chains" :key="item.chain" :value="item.chain">{{ item.label }} · {{ item.network }}</SelectItem></SelectContent></Select></div>
      </template>
      <div class="button-row actions"><button type="button" class="outline"  :disabled="submitting" @click="close">取消</button><TooltipProvider><Tooltip><TooltipTrigger as-child><span :tabindex="continueDisabledReason ? 0 : undefined"><button type="button" class="primary" :disabled="!!continueDisabledReason" @click="continuePayment"><Icon v-if="submitting" icon="lucide:loader-circle" width="16" class="animate-spin" />继续付款</button></span></TooltipTrigger><TooltipContent v-if="continueDisabledReason">{{ continueDisabledReason }}</TooltipContent></Tooltip></TooltipProvider></div>
    </div>
  </a-modal>
</template>

<style scoped>
.order-summary { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; border-radius:8px; background:var(--soft); padding:16px; font-size:13px; }.order-summary strong { font-size:20px; }.notice { margin:16px 0; }.notice button { margin-top:12px; }.method-choices { border:0; padding:0; }.method-choices:disabled label,.method-option.disabled { opacity:.55; cursor:not-allowed; }.chain-choice { display:block; }.actions { justify-content:flex-end; flex-wrap:wrap; margin-top:24px; }.hint { color:var(--muted); font-size:13px; }.payment-skeleton { height:240px; }
</style>
