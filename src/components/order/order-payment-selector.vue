<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Modal } from '@arco-design/web-vue';
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
const guard = createLatestRequestGuard();
const detail = ref<Api.RealOrder.Record>();
const chains = ref<WalletPayChain[]>([]);
const latestPay = ref<WalletPayOrder>();
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const chainError = ref('');
const method = ref<'balance' | 'chain'>();
const selectedChain = ref('');
let writeVersion = 0;

const groupNo = computed(() => detail.value?.orderGroupNo?.trim() || '');
const activePay = computed(() => latestPay.value && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(latestPay.value.status));

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

watch([() => props.visible, () => props.order.id, () => userStore.currentUser?.id], () => {
  writeVersion += 1;
  guard.invalidate();
  submitting.value = false;
  if (props.visible) void load();
}, { immediate: true });
onBeforeUnmount(() => { writeVersion += 1; guard.invalidate(); });

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
        const confirmed = await new Promise<boolean>(resolve => Modal.confirm({
          title: '先核对原链上支付',
          content: `原支付单 ${latestPay.value?.payNo} 已${latestPay.value?.statusText || latestPay.value?.status}。旧交易仍可能延迟到账；请先在钱包和平台核对原交易，确认后再选择新的付款。`,
          onOk: () => resolve(true), onCancel: () => resolve(false)
        }));
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
    const accepted = await new Promise<boolean>(resolve => Modal.confirm({
      title: '核对链上支付',
      content: `本次将为该订单组的 ${preview.count} 笔待付订单创建 ${selected.label}（${selected.network}）支付单，合计 U ${preview.amount}。不会立即转账，下一页还需连接钱包并签名。`,
      onOk: () => resolve(true), onCancel: () => resolve(false)
    }));
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
  <a-modal :visible="visible" title="选择付款方式" :footer="false" :mask-closable="!submitting" @cancel="close">
    <a-spin :loading="loading" style="width: 100%">
      <a-alert v-if="error" type="warning" :closable="false">{{ error }}<template #action><a-button size="mini" :disabled="submitting" @click="load">重新核对</a-button></template></a-alert>
      <template v-if="detail">
        <p>订单 {{ detail.code }} · U {{ detail.totalAmount }}</p>
        <a-alert v-if="activePay" type="info" :closable="false">
          此订单组已有钱包支付单（{{ latestPay?.statusText || latestPay?.status }}），请先核对原支付进度，勿重复付款。
          <template #action><a-button size="mini" @click="router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: groupNo } })">查看支付进度</a-button></template>
        </a-alert>
        <a-alert v-else-if="latestPay && ['CLOSED', 'FAILED'].includes(latestPay.status)" type="warning" :closable="false">此前的链上支付单已{{ latestPay.statusText || latestPay.status }}。再次发起前请先核对原交易是否到账。</a-alert>
        <a-radio-group v-model="method" direction="vertical" class="method-choices" :disabled="!!activePay || !!error">
          <a-radio value="balance">站内钱包余额支付（输入支付密码）</a-radio>
          <a-radio value="chain" :disabled="!walletPayEntryEnabled || !groupNo || !chains.length || !!chainError">USDT 链上支付（连接浏览器钱包）</a-radio>
        </a-radio-group>
        <a-alert v-if="chainError" type="warning" :closable="false">{{ chainError }}</a-alert>
        <p v-else-if="!walletPayEntryEnabled || !groupNo || !chains.length" class="hint">{{ !walletPayEntryEnabled ? '链上支付入口暂未开放。' : !groupNo ? '该订单缺少订单组号，暂不能创建链上支付单。' : '当前没有可用的链上支付网络。' }}</p>
        <a-select v-if="method === 'chain'" v-model="selectedChain" placeholder="选择支付链" class="chain-select">
          <a-option v-for="item in chains" :key="item.chain" :value="item.chain">{{ item.label }} · {{ item.network }}</a-option>
        </a-select>
      </template>
    </a-spin>
    <div class="actions"><a-button :disabled="submitting" @click="close">取消</a-button><a-button type="primary" :loading="submitting" :disabled="loading || !!error || !!activePay || !method || (method === 'chain' && !selectedChain)" @click="continuePayment">继续付款</a-button></div>
  </a-modal>
</template>

<style scoped>
.method-choices { display: flex; flex-direction: column; gap: 12px; margin: 18px 0; }
.chain-select { width: 100%; margin-bottom: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.hint { color: var(--yb-muted); font-size: 12px; }
</style>
