<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PaymentMethodSelector from '@/components/order/payment-method-selector.vue';
import { Message, Modal } from '@/lib/feedback';
import { formatAmount } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import * as realOrderApi from '@/service/api/order';
import { createWalletPay, fetchLatestWalletPay, fetchWalletPayChains, validateWalletPay, type WalletPayChain, type WalletPayOrder } from '@/service/api/wallet-pay';
import * as realWalletApi from '@/service/api/wallet';
import * as productApi from '@/service/api/product';
import { readCheckoutIntent, clearCheckoutIntent, prepareCheckoutPayment, canDiscardRejectedCheckout, cleanupPaidCheckout,
  readPendingCheckout, pendingCheckoutStorageKey as pendingStorageKey, sumPaymentAmounts, validateGroupPayResult, isGroupPaymentComplete, type PendingCheckout } from '@/utils/checkout';
import { withSubmissionLock } from '@/utils/financial-submission';
import { RequestError } from '@/service/request';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import AddressSelector from '@/components/common/address-selector.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import EmptyState from '@/components/common/empty-state.vue';
import { useCartStore, useUserStore } from '@/stores';
import type { CartItem } from '@/stores/cart';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { getOrderCapabilities } from '@/utils/order';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import { requestPayPassword } from '@/utils/pay-password';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';

const router = useRouter();
const route = useRoute();
const contextId = computed(() => typeof route.query.contextId === 'string' ? route.query.contextId : '');
const contextItems = ref<Array<{ productId: string | number; quantity: number }>>([]);
const userStore = useUserStore();
const cart = useCartStore();
const requestGuard = createLatestRequestGuard();
const walletGuard = createLatestRequestGuard();
const chainsGuard = createLatestRequestGuard();
const walletLoading = ref(false);
const walletError = ref('');
const walletChains = ref<WalletPayChain[]>([]);
const walletChainsLoading = ref(false);
const walletChainsError = ref('');
const paymentMethod = ref<'balance' | 'wallet'>('balance');
const selectedChain = ref('');
const latestWalletPay = ref<WalletPayOrder>();

const addressId = ref<string | number>();
const addressValid = ref(false);
const selectedAddr = ref<{
  receiverName: string;
  receiverPhone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}>();
const wallet = ref<Partial<Api.User.WalletSummary>>();
const loading = ref(false);
const loadError = ref('');
const agreed = ref(false);
const submitting = ref(false);
const confirmationPending = ref(false);
const backendSelfPurchaseProductIds = ref<string[]>([]);
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;
let cancelConfirmation: (() => void) | undefined;
let insufficientBalanceTimer: ReturnType<typeof setTimeout> | undefined;

const pendingCheckout = ref<PendingCheckout>();
const pendingOrders = ref<Api.RealOrder.Record[]>([]);
const hasCreatedOrders = computed(() => !!pendingCheckout.value?.orderIds?.length);
const hasUnconfirmedOrder = computed(() => !!pendingCheckout.value && !hasCreatedOrders.value);
const unpaidOrders = computed(() => pendingOrders.value.filter(order => getOrderCapabilities(order, userStore.currentUser?.id).pay));
const pendingTotal = computed(() => {
  try { return sumPaymentAmounts(unpaidOrders.value.map(order => order.totalAmount)); } catch { return ''; }
});

const checkoutItems = computed(() => route.query.contextId !== undefined
  ? contextItems.value.map(item => cart.enrich({ productId: item.productId, qty: item.quantity, selected: true, addedAt: '' }))
  : cart.enrichedItems.filter(item => item.selected));
const items = computed(() => checkoutItems.value.filter(item => item.available));
const overseasItems = computed(() => items.value.filter(i => i.product?.overseasCustoms));
const subTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.subtotal), 0).toFixed(2));
const shippingFeeTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.shippingFee), 0).toFixed(2));
const taxTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.tax), 0).toFixed(2));
const grandTotal = computed(() => (Number(subTotal.value) + Number(shippingFeeTotal.value) + Number(taxTotal.value)).toFixed(2));
const selfSoldItems = computed(() => {
  const currentUserId = userStore.currentUser?.id;
  const backendRejectedIds = new Set(backendSelfPurchaseProductIds.value);
  return items.value.filter(item => {
    if (backendRejectedIds.has(String(item.productId))) return true;
    return currentUserId !== undefined
      && currentUserId !== null
      && item.product?.sellerId !== undefined
      && String(item.product.sellerId) === String(currentUserId);
  });
});
const selfSoldTitles = computed(() => selfSoldItems.value.map(item => item.product?.title || String(item.productId)).join('、'));

const availableBalance = computed(() => wallet.value?.available === undefined ? undefined : Number(wallet.value.available));
const balanceEnough = computed(() => availableBalance.value !== undefined && availableBalance.value >= Number(grandTotal.value));
const walletSelected = computed(() => walletPayEntryEnabled && paymentMethod.value === 'wallet');
const submitDisabledReason = computed(() => {
  if (submitting.value || confirmationPending.value) return '订单正在处理，请勿重复提交';
  if (loadError.value) return loadError.value;
  if (loading.value || cart.mutating) return '商品和结算信息正在同步';
  if (selfSoldItems.value.length) return '不能购买自己发布的商品';
  if (!addressValid.value) return '请先选择有效的收货地址';
  if (!walletSelected.value && (walletLoading.value || availableBalance.value === undefined)) return '请先读取并核对钱包余额';
  if (walletSelected.value && !selectedWalletChain()) return '请选择当前可用且满足最低支付金额的链';
  if (!agreed.value) return '请先阅读并同意用户协议及隐私政策';
  return '';
});
const pendingDisabledReason = computed(() => {
  if (submitting.value || loading.value) return '正在读取或处理订单，请稍候';
  if (loadError.value) return loadError.value;
  if (!agreed.value) return '请先核对上述订单及待付金额';
  if (walletSelected.value && !selectedWalletChain(pendingTotal.value)) return '请选择当前可用且满足最低支付金额的链';
  return '';
});

function amountAtLeast(amount: string | number, minimum: string | number | null) {
  if (minimum === null || minimum === undefined || minimum === '') return true;
  const [amountInteger, amountFraction = ''] = sumPaymentAmounts([amount]).split('.');
  const [minInteger, minFraction = ''] = sumPaymentAmounts([minimum]).split('.');
  if (BigInt(amountInteger) !== BigInt(minInteger)) return BigInt(amountInteger) > BigInt(minInteger);
  const scale = Math.max(amountFraction.length, minFraction.length);
  return BigInt((amountFraction || '0').padEnd(scale, '0')) >= BigInt((minFraction || '0').padEnd(scale, '0'));
}

function selectedWalletChain(amount = hasCreatedOrders.value ? pendingTotal.value : grandTotal.value) {
  return walletChains.value.find(chain => chain.chain === selectedChain.value && chain.enabled && amount
    && amountAtLeast(amount, chain.minAmount));
}

async function loadWalletChains() {
  if (!walletPayEntryEnabled || !userStore.currentUser) return;
  const isCurrent = chainsGuard.begin();
  const userId = userStore.currentUser.id;
  walletChainsLoading.value = true;
  walletChainsError.value = '';
  try {
    const chains = await fetchWalletPayChains({ signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    walletChains.value = chains;
    if (!chains.some(chain => chain.chain === selectedChain.value)) {
      selectedChain.value = chains.find(chain => chain.enabled)?.chain || '';
    }
    if (!chains.length) paymentMethod.value = 'balance';
  } catch {
    if (isCurrent()) {
      walletChains.value = [];
      walletChainsError.value = '钱包支付可用链读取失败，当前仍可使用余额支付';
      paymentMethod.value = 'balance';
    }
  } finally {
    if (isCurrent()) walletChainsLoading.value = false;
  }
}

function savePendingCheckout(value: PendingCheckout) {
  localStorage.setItem(pendingStorageKey(userStore.currentUser!.id), JSON.stringify(value));
  pendingCheckout.value = value;
}

function clearPendingCheckout(userId = userStore.currentUser!.id, expectedKey = pendingCheckout.value?.idempotencyKey) {
  const key = pendingStorageKey(userId);
  const raw = localStorage.getItem(key);
  if (raw && JSON.parse(raw).idempotencyKey !== expectedKey) throw new Error('其他页面已更新结算记录，未清理新的结算');
  localStorage.removeItem(key);
  if (String(userStore.currentUser?.id) === String(userId) && pendingCheckout.value?.idempotencyKey === expectedKey) pendingCheckout.value = undefined;
}

async function finishPaidCheckout(pending: PendingCheckout, orderId: string | number, purchasedItems?: CartItem[]) {
  const userId = userStore.currentUser!.id;
  const version = writeVersion;
  // 在任何异步清理之前捕获购物车所属账号，锁等待期间切换账号会取消原操作。
  const consume = purchasedItems ? cart.consumePurchasedItems(purchasedItems) : Promise.resolve();
  const clean = await cleanupPaidCheckout([
    () => { if (pending.contextId) clearCheckoutIntent(pending.contextId); },
    () => consume,
    () => clearPendingCheckout(userId, pending.idempotencyKey)
  ]);
  if (version !== writeVersion || String(userStore.currentUser?.id) !== String(userId)) return;
  Message.success('支付成功');
  if (!clean) Message.warning('支付已成功，但本地结算记录清理失败，请以订单状态为准，勿重复购买');
  void router.push({ name: 'checkout-success', params: { orderId: String(orderId) }, query: pending.orderGroupNo ? { orderGroupNo: pending.orderGroupNo } : undefined }).catch(() => {
    Message.warning('支付已成功，请前往我的订单查看结果');
  });
}

function currentOrderItems(): Api.RealOrder.OrderCreateItemParams[] {
  return items.value.map(item => ({ productId: item.productId, quantity: item.qty }));
}

function hasSameOrderItems(
  left: Api.RealOrder.OrderCreateItemParams[],
  right: Api.RealOrder.OrderCreateItemParams[]
) {
  if (left.length !== right.length) return false;
  const normalize = (item: Api.RealOrder.OrderCreateItemParams) => `${String(item.productId)}:${item.quantity || 1}`;
  return left.map(normalize).sort().every((item, index) => item === right.map(normalize).sort()[index]);
}

async function startNewCheckout() {
  if (submitting.value) return;
  const userId = userStore.currentUser?.id;
  const expectedKey = pendingCheckout.value?.idempotencyKey;
  if (userId === undefined || !expectedKey) return;
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    await withSubmissionLock(pendingStorageKey(userId), async () => {
      if (!isCurrent()) return;
      const latest = readPendingCheckout(userId);
      if (!latest?.orderIds?.length || latest.idempotencyKey !== expectedKey) throw new Error('结算记录已变化，请重新读取已有订单');
      clearPendingCheckout(userId, expectedKey);
      pendingOrders.value = [];
      agreed.value = false;
      Message.info('已有订单仍保留在我的订单中，本次重新结算不会修改或取消它们');
      await load();
    });
  } catch (error) {
    if (isCurrent()) Message.warning(error instanceof Error ? error.message : '结算记录未能更新，请重新读取');
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

async function payPendingOrders() {
  if (walletSelected.value) {
    await payPendingOrdersWithWallet();
    return;
  }
  const pending = pendingCheckout.value;
  const userId = userStore.currentUser?.id;
  if (!pending?.orderIds?.length || userId === undefined || submitting.value || loading.value || loadError.value) return;
  if (!agreed.value || !unpaidOrders.value.length || !pendingTotal.value) {
    Message.warning('请先确认已有订单的实际状态及待付金额');
    return;
  }
  const confirmedOrders = pendingOrders.value.map(order => ({ ...order }));
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    await withSubmissionLock(pendingStorageKey(userId), async () => {
      if (!isCurrent()) return;
      const stored = readPendingCheckout(userId);
      if (!stored || stored.idempotencyKey !== pending.idempotencyKey) throw new Error('结算记录已在其他页面变化，请重新读取已有订单');
      if (walletPayEntryEnabled && stored.orderGroupNo) {
        const walletPay = await fetchLatestWalletPay(stored.orderGroupNo);
        if (!isCurrent()) return;
        if (walletPay && ['PENDING', 'SUBMITTED'].includes(validateWalletPay(walletPay, stored.orderGroupNo).status)) {
          throw new Error('该订单组已有钱包支付单，请先到钱包支付页核对，勿重复付款');
        }
      }
      const paid = await payCheckoutOrders(pending, userId, isCurrent, latest => {
        const payment = prepareCheckoutPayment(confirmedOrders, latest, userId, pending.orderGroupNo);
        pendingOrders.value = latest;
        if (payment.changed) {
          agreed.value = false;
          Message.warning('已有订单状态或金额已更新，请重新确认');
          return;
        }
        return payment.payable;
      }, () => '部分订单付款未确认，请核对最新状态后重试');
      if (!paid || !isCurrent()) return;
      const { latest, payable } = paid;
      const purchasedProducts = new Set(latest.filter(order => !['CANCELLED', 'REFUNDED'].includes(order.status)).map(order => String(order.productId)));
      await finishPaidCheckout(pending, payable[0].id,
        pending.cartSnapshot?.filter(item => purchasedProducts.has(String(item.productId))));
    });
  } catch (error) {
    if (!isCurrent()) return;
    Message.error(error instanceof Error ? error.message : '支付结果未确认，请重新读取订单状态');
    agreed.value = false;
    await load();
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

async function recoverUnconfirmedOrder() {
  const userId = userStore.currentUser?.id;
  const expectedKey = pendingCheckout.value?.idempotencyKey;
  if (userId === undefined || !expectedKey || !hasUnconfirmedOrder.value || submitting.value) return;
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    await withSubmissionLock(pendingStorageKey(userId), async () => {
      if (!isCurrent()) return;
      const stored = readPendingCheckout(userId);
      if (!stored || stored.idempotencyKey !== expectedKey || stored.orderIds?.length) {
        throw new Error('结算记录已变化，请重新读取原订单');
      }
      // 只能以原商品、原地址及原键恢复；当前购物车和地址不参与旧单重试。
      const orderGroup = await realOrderApi.createOrders({
        addressId: stored.addressId!,
        items: stored.orderItems,
        idempotencyKey: stored.idempotencyKey
      }, { showError: false });
      if (!isCurrent()) return;
      if (!orderGroup.orderIds?.length) throw new Error('下单未返回订单 ID，请重新核对原订单');
      stored.orderGroupNo = orderGroup.orderGroupNo;
      stored.orderIds = orderGroup.orderIds;
      stored.firstOrderId = orderGroup.orderIds[0];
      savePendingCheckout(stored);
    });
    if (isCurrent()) {
      agreed.value = false;
      await load();
    }
  } catch (error) {
    if (isCurrent()) Message.error(error instanceof Error ? error.message : '上次下单结果仍未确认，请稍后重试');
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

function confirmRecoverUnconfirmedOrder() {
  if (!hasUnconfirmedOrder.value || submitting.value || confirmationPending.value) return;
  confirmationPending.value = true;
  const operation = ++writeVersion;
  confirmationModal = Modal.confirm({
    title: '恢复上次下单？',
    content: '将使用上次保存的商品、数量、收货地址和同一个下单标识核对结果。如果上次请求未成功，这一步可能创建上次的订单；恢复后不会自动付款。',
    okText: '恢复上次订单',
    onCancel() {
      if (operation === writeVersion) confirmationPending.value = false;
    },
    async onOk() {
      if (operation !== writeVersion) return;
      confirmationPending.value = false;
      await recoverUnconfirmedOrder();
    }
  });
}

async function createWalletPayForPending(pending: PendingCheckout, confirmedOrders: Api.RealOrder.Record[],
  userId: string | number, chain: string, isCurrent: () => boolean) {
  const group = pending.orderGroupNo;
  const ids = pending.orderIds;
  if (!group || !ids?.length) throw new Error('订单组信息缺失，请返回订单核对');
  const existing = await fetchLatestWalletPay(group);
  if (!isCurrent()) return;
  if (existing) {
    const current = validateWalletPay(existing, group);
    if (['PENDING', 'SUBMITTED', 'SUCCESS'].includes(current.status)) {
      await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
      return;
    }
    if (current.status === 'CLOSED' && pending.walletPayAttempt?.payNo === current.payNo) {
      throw new Error('原支付单已关闭，请先到钱包支付页核对链上交易，再重新发起');
    }
  }
  const latest = await Promise.all(ids.map(id => realOrderApi.fetchOrderDetail(id)));
  if (!isCurrent()) return;
  const prepared = prepareCheckoutPayment(confirmedOrders, latest, userId, group);
  if (prepared.changed) throw new Error('订单状态或金额已变化，请重新读取并确认');
  const payable = prepared.payable;
  const groupResult = validateGroupPayResult(await realOrderApi.fetchOrderGroupPayResult(group), group, ids);
  if (!isCurrent()) return;
  const remaining = groupResult.items.filter(item => item.status === 'CREATED');
  if (groupResult.items.length !== ids.length || remaining.length !== payable.length
    || remaining.some(item => !payable.some(order => String(order.id) === String(item.orderId)
      && sumPaymentAmounts([order.totalAmount]) === sumPaymentAmounts([item.amount])))) {
    throw new Error('订单组状态或金额已变化，请重新读取并确认');
  }
  const confirmedAmount = sumPaymentAmounts(payable.map(order => order.totalAmount));
  const chosen = walletChains.value.find(item => item.chain === chain && item.enabled);
  if (!chosen || !amountAtLeast(confirmedAmount, chosen.minAmount)) throw new Error('该链当前不可用或低于最小支付金额，请重新选择');
  let attempt = pending.walletPayAttempt;
  if (attempt && attempt.chain !== chain) throw new Error('已有另一条链的钱包支付尝试，请先核对原支付单');
  if (!attempt) {
    attempt = { chain, idempotencyKey: crypto.randomUUID() };
    pending.walletPayAttempt = attempt;
    savePendingCheckout(pending);
  }
  try {
    const pay = validateWalletPay(await createWalletPay({ orderGroupNo: group, chain,
      confirmedAmount, idempotencyKey: attempt.idempotencyKey }), group, chain);
    if (!isCurrent()) return;
    attempt.payNo = pay.payNo;
    savePendingCheckout(pending);
    await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
  } catch (error) {
    if (error instanceof RequestError && ['-300', '-301', '-302', '-309', '-312'].includes(error.code || '') && !attempt.payNo) {
      // 明确拒绝时没有支付单；释放本次键，用户重新核价或换链后才能新发起。
      delete pending.walletPayAttempt;
      savePendingCheckout(pending);
    }
    if (error instanceof RequestError && error.code === '-312') throw new Error('订单金额已变化，请重新读取订单并确认金额');
    if (error instanceof RequestError && error.code === '-305' && isCurrent()) {
      await router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: group } });
      return;
    }
    throw error;
  }
}

async function payPendingOrdersWithWallet() {
  const pending = pendingCheckout.value;
  const userId = userStore.currentUser?.id;
  const chain = selectedChain.value;
  if (!pending?.orderIds?.length || userId === undefined || submitting.value || loading.value || loadError.value) return;
  if (!agreed.value || !unpaidOrders.value.length || !pendingTotal.value || !selectedWalletChain(pendingTotal.value)) {
    Message.warning('请先核对待付订单金额并选择可用的链');
    return;
  }
  const confirmedOrders = pendingOrders.value.map(order => ({ ...order }));
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId);
  submitting.value = true;
  try {
    await withSubmissionLock(pendingStorageKey(userId), async () => {
      if (!isCurrent()) return;
      const stored = readPendingCheckout(userId);
      if (!stored || stored.idempotencyKey !== pending.idempotencyKey) throw new Error('结算记录已变化，请重新读取');
      if (sumPaymentAmounts(confirmedOrders.filter(order => getOrderCapabilities(order, userId).pay)
        .map(order => order.totalAmount)) !== pendingTotal.value) throw new Error('待付金额已变化，请重新读取');
      await createWalletPayForPending(stored, confirmedOrders, userId, chain, isCurrent);
    });
  } catch (error) {
    if (isCurrent()) {
      Message.error(error instanceof Error ? error.message : '支付单创建结果待核对，请勿更换链重复发起');
      agreed.value = false;
      await load();
    }
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

async function payCheckoutOrders(pending: PendingCheckout, userId: string | number, isCurrent: () => boolean,
  prepare: (latest: Api.RealOrder.Record[]) => Api.RealOrder.Record[] | undefined, failureMessage: (count: number) => string) {
  const ids = [...(pending.orderIds || [])];
  return realOrderApi.withOrderPayment(userId, ids, pending.orderGroupNo, async payment => {
    if (!isCurrent()) return;
    const stored = readPendingCheckout(userId);
    if (!stored || stored.idempotencyKey !== pending.idempotencyKey || stored.orderGroupNo !== pending.orderGroupNo
      || stored.orderIds?.length !== ids.length || stored.orderIds.some((id, index) => String(id) !== String(ids[index]))) {
      throw new Error('原结算订单已变化，请重新读取');
    }
    const latest = await Promise.all(ids.map(id => realOrderApi.fetchOrderDetail(id)));
    if (!isCurrent()) return;
    if (latest.some((order, index) => String(order.id) !== String(ids[index]))) throw new Error('订单回读对象不一致，请重新核对');
    const payable = prepare(latest);
    if (!payable || !isCurrent()) return;
    const payPassword = await requestPayPassword(route.fullPath);
    if (!payPassword || !isCurrent()) return;
    if (pending.orderGroupNo) {
      await payGroup(pending, payable, payPassword, isCurrent, payment);
    } else {
      const results = await Promise.allSettled(payable.map(order => payment.payOrder(order.id, String(order.totalAmount), payPassword, { showError: false })));
      if (!isCurrent()) return;
      const failedCount = results.filter(result => result.status === 'rejected').length;
      if (failedCount) {
        savePendingCheckout(pending);
        throw new Error(failureMessage(failedCount));
      }
    }
    if (isCurrent()) return { latest, payable };
  });
}

async function payGroup(pending: PendingCheckout, payable: Api.RealOrder.Record[], payPassword: string, isCurrent: () => boolean, payment: realOrderApi.OrderPaymentActions) {
  const group = pending.orderGroupNo!;
  const ids = pending.orderIds!;
  const before = validateGroupPayResult(await realOrderApi.fetchOrderGroupPayResult(group), group, ids);
  if (!isCurrent()) return;
  const remaining = before.items.filter(item => item.status === 'CREATED');
  const amount = sumPaymentAmounts(payable.map(order => order.totalAmount));
  if (before.items.length !== ids.length || remaining.length !== payable.length
    || remaining.some(item => !payable.some(order => String(order.id) === String(item.orderId)
      && sumPaymentAmounts([order.totalAmount, 0]) === sumPaymentAmounts([item.amount, 0])))) {
    throw new Error('订单组状态或金额已变化，请重新读取并确认剩余订单');
  }
  let result: Api.RealOrder.OrderGroupPayResult;
  try {
    result = validateGroupPayResult(await payment.payOrderGroup(amount, payPassword, { showError: false }), group, ids);
  } catch (error) {
    if (!isCurrent()) return;
    // 回查仅用于恢复当前状态，金额变化不得自动重付。
    result = validateGroupPayResult(await realOrderApi.fetchOrderGroupPayResult(group), group, ids);
    if (!isCurrent()) return;
    pending.paymentResult = result;
    savePendingCheckout(pending);
    if (error instanceof RequestError && error.code === '-312') throw new Error('确认金额已失效，请重新读取并确认金额后再付款');
    if (!isGroupPaymentComplete(result, payable.map(order => order.id))) throw error;
  }
  if (!isCurrent()) return;
  pending.paymentResult = result;
  savePendingCheckout(pending);
  if (!isGroupPaymentComplete(result, payable.map(order => order.id))) {
    throw new Error(`本次已付 ${result.paidCount} 笔，未成功 ${result.failedCount} 笔；请核对逐单结果后重试剩余订单`);
  }
}

function checkoutSignature() {
  return JSON.stringify([userStore.currentUser?.id, contextId.value, currentOrderItems(), addressId.value,
    grandTotal.value, paymentMethod.value, selectedChain.value]);
}

function isSelfPurchaseError(error: unknown) {
  return error instanceof RequestError && /不能购买自己(?:的|发布的)?商品/.test(error.message);
}

async function loadWallet() {
  const userId = userStore.currentUser?.id;
  if (userId === undefined) return;
  const isCurrent = walletGuard.begin();
  walletLoading.value = true;
  walletError.value = '';
  wallet.value = undefined;
  try {
    const result = await realWalletApi.fetchWalletOverview(userId, { signal: isCurrent.signal });
    if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
    wallet.value = result.summary;
    if (result.summary.available === undefined) walletError.value = '可用余额尚未取得，请重新读取余额';
  } catch {
    if (isCurrent()) walletError.value = '钱包余额读取失败，请重新读取余额';
  } finally {
    if (isCurrent()) walletLoading.value = false;
  }
}

async function load() {
  const isCurrent = requestGuard.begin();
  const userId = userStore.currentUser?.id;
  if (!userStore.currentUser) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  loading.value = true;
  loadError.value = '';
  latestWalletPay.value = undefined;
  try {
    pendingOrders.value = [];
    pendingCheckout.value = undefined;
    pendingCheckout.value = readPendingCheckout(userId!);
    if (walletPayEntryEnabled && pendingCheckout.value?.walletPayAttempt) {
      paymentMethod.value = 'wallet';
      selectedChain.value = pendingCheckout.value.walletPayAttempt.chain;
    }
    if (pendingCheckout.value?.orderIds?.length) {
      const orders = await Promise.all(pendingCheckout.value.orderIds.map(id => realOrderApi.fetchOrderDetail(id, { signal: isCurrent.signal })));
      if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
      if (orders.some((order, index) => String(order.id) !== String(pendingCheckout.value?.orderIds?.[index]))) {
        throw new Error('订单回读对象不一致，请从我的订单重新核对');
      }
      if (orders.some(order => !getOrderCapabilities(order, userId).isCustomer)) throw new Error('已有订单不属于当前顾客');
      pendingOrders.value = orders;
      const pending = pendingCheckout.value;
      if (pending.orderGroupNo) {
        const result = validateGroupPayResult(await realOrderApi.fetchOrderGroupPayResult(pending.orderGroupNo, { signal: isCurrent.signal }), pending.orderGroupNo, pending.orderIds!);
        if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
        pending.paymentResult = result;
        savePendingCheckout(pending);
        if (walletPayEntryEnabled) {
          try {
            const walletPay = await fetchLatestWalletPay(pending.orderGroupNo, { signal: isCurrent.signal });
            if (!isCurrent()) return;
            latestWalletPay.value = walletPay ? validateWalletPay(walletPay, pending.orderGroupNo) : undefined;
          } catch { if (isCurrent()) walletChainsError.value = '钱包支付进度暂时无法读取，请勿重复付款'; }
        }
      }
      return;
    }
    if (hasUnconfirmedOrder.value) return;
    contextItems.value = [];
    if (route.query.contextId !== undefined) {
      const intent = readCheckoutIntent(contextId.value, userId!);
      const products = await Promise.all(intent.items.map(item => productApi.fetchProductDetail(item.productId, { signal: isCurrent.signal })));
      if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
      products.forEach(cart.upsertProduct);
      contextItems.value = intent.items;
    } else {
      await cart.refresh({ signal: isCurrent.signal });
    }
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== String(userId)) return;
    if (checkoutItems.value.some(item => !item.available)) {
      throw new Error('已选商品尚未全部确认可购，请返回购物车检查');
    }
    if (items.value.length === 0) {
      Message.warning('请先选择要结算的商品');
      router.replace('/cart');
      return;
    }
    await loadWallet();
  } catch (error) {
    if (!isCurrent() || String(userStore.currentUser?.id || '') !== String(userId)) return;
    wallet.value = undefined;
    loadError.value = error instanceof Error ? error.message : '结算基础数据加载失败，请稍后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(() => { void load(); void loadWalletChains(); });
onBeforeUnmount(() => {
  writeVersion += 1;
  cancelConfirmation?.();
  confirmationModal?.close();
  requestGuard.invalidate();
  walletGuard.invalidate();
  chainsGuard.invalidate();
  if (insufficientBalanceTimer) clearTimeout(insufficientBalanceTimer);
  insufficientBalanceTimer = undefined;
});
watch([() => userStore.currentUser?.id, () => route.query.contextId], () => {
  cancelConfirmation?.();
  confirmationModal?.close();
  requestGuard.invalidate();
  walletGuard.invalidate();
  chainsGuard.invalidate();
  walletLoading.value = false;
  walletError.value = '';
  walletChains.value = [];
  walletChainsLoading.value = false;
  walletChainsError.value = '';
  paymentMethod.value = 'balance';
  selectedChain.value = '';
  if (insufficientBalanceTimer) clearTimeout(insufficientBalanceTimer);
  insufficientBalanceTimer = undefined;
  addressId.value = undefined;
  addressValid.value = false;
  selectedAddr.value = undefined;
  wallet.value = undefined;
  agreed.value = false;
  pendingCheckout.value = undefined;
  pendingOrders.value = [];
  backendSelfPurchaseProductIds.value = [];
  writeVersion += 1;
  submitting.value = false;
  confirmationPending.value = false;
  void load();
  void loadWalletChains();
});

async function submit() {
  if (submitting.value || confirmationPending.value) return;
  if (hasCreatedOrders.value) {
    await payPendingOrders();
    return;
  }
  if (hasUnconfirmedOrder.value) {
    Message.warning('请先核对上次下单结果，再开始新的结算');
    return;
  }
  if (loading.value || (!walletSelected.value && walletLoading.value) || cart.mutating || checkoutItems.value.some(item => !item.available)) {
    Message.warning('请等待商品读取完成并检查已选商品数量');
    return;
  }
  if (loadError.value) {
    Message.error(loadError.value);
    return;
  }
  if (selfSoldItems.value.length) {
    Message.error(`不能购买自己发布的商品：${selfSoldTitles.value}`);
    return;
  }
  if (!agreed.value) {
    Message.warning('请阅读并同意协议');
    return;
  }
  if (!selectedAddr.value || !addressValid.value) {
    Message.warning('请等待地址读取成功后选择收货地址');
    return;
  }
  if (walletSelected.value && !selectedWalletChain()) {
    Message.warning('请选择当前可用且满足最低支付金额的链');
    return;
  }
  if (!walletSelected.value && availableBalance.value === undefined) {
    Message.warning('可用余额尚未取得，请重新加载核对后再提交');
    return;
  }
  if (!walletSelected.value && !balanceEnough.value) {
    Message.error({
      content: '钱包余额不足，请前往钱包链上充值',
      duration: 3500
    });
    if (insufficientBalanceTimer) clearTimeout(insufficientBalanceTimer);
    insufficientBalanceTimer = setTimeout(() => {
      insufficientBalanceTimer = undefined;
      void router.push('/wallet/deposit');
    }, 600);
    return;
  }
  const signature = checkoutSignature();
  const confirmationVersion = ++writeVersion;
  if (overseasItems.value.length > 0) {
    confirmationPending.value = true;
    const confirmed = await new Promise<boolean>(resolve => {
      cancelConfirmation = () => resolve(false);
      confirmationModal = Modal.confirm({
        title: '海外直邮商品提醒',
        content: `订单包含 ${overseasItems.value.length} 件海外直邮商品，过关后不支持退换，请确认。`,
        okText: '确认提交',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    confirmationPending.value = false;
    cancelConfirmation = undefined;
    confirmationModal = undefined;
    if (!confirmed) return;
  }
  if (confirmationVersion !== writeVersion || signature !== checkoutSignature()) {
    Message.warning('结算信息已变化，请重新确认后提交');
    return;
  }
  await doSubmit(paymentMethod.value, selectedChain.value);
}

async function doSubmit(method: 'balance' | 'wallet', chain: string) {
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId);
  submitting.value = true;
  let activePending: PendingCheckout | undefined;
  let createBatchStarted = false;
  const hadPendingAttempt = !!pendingCheckout.value;
  try {
    await withSubmissionLock(pendingStorageKey(requestedUserId), async () => {
      try {
        if (!isCurrentWrite()) return;
        const stored = readPendingCheckout(requestedUserId);
        if (stored?.idempotencyKey !== pendingCheckout.value?.idempotencyKey || stored?.orderIds?.length) {
          await load();
          throw new Error('其他页面已更新结算记录，请核对后重新确认');
        }
        pendingCheckout.value = stored;
        if (!addressId.value || !addressValid.value) throw new Error('请重新读取并选择收货地址');
        if (pendingCheckout.value && (!hasSameOrderItems(pendingCheckout.value.orderItems, currentOrderItems())
          || String(pendingCheckout.value.addressId) !== String(addressId.value))) {
          throw new Error('上次下单结果尚待确认且结算信息已变化，请先到我的订单核对，不会重复创建订单');
        }
        const pending: PendingCheckout = pendingCheckout.value ?? {
          idempotencyKey: crypto.randomUUID(),
          productIds: items.value.map(item => item.productId),
          orderItems: currentOrderItems(),
          addressId: addressId.value,
          contextId: contextId.value || undefined,
          cartSnapshot: contextId.value ? undefined : cart.items.filter(item => item.selected).map(item => ({ ...item }))
        };
        activePending = pending;
        if (!pending.orderIds?.length) {
          if (!isCurrentWrite()) return;
          savePendingCheckout(pending);
          createBatchStarted = true;
          const orderGroup = await realOrderApi.createOrders({
            addressId: pending.addressId!,
            items: pending.orderItems,
            idempotencyKey: pending.idempotencyKey
          }, { showError: false });
          if (!isCurrentWrite()) return;
          if (!orderGroup.orderIds.length) throw new Error('下单未返回订单 ID');
          pending.orderGroupNo = orderGroup.orderGroupNo;
          pending.orderIds = orderGroup.orderIds;
          pending.firstOrderId = orderGroup.orderIds[0];
          savePendingCheckout(pending);
          if (orderGroup.totalAmount === undefined || sumPaymentAmounts([orderGroup.totalAmount]) !== sumPaymentAmounts([grandTotal.value])) {
            throw new Error('订单实际金额已变化，请在订单详情确认金额后付款');
          }
        }
        if (method === 'wallet') {
          if (!walletPayEntryEnabled || !walletChains.value.some(item => item.chain === chain && item.enabled)) {
            throw new Error('钱包支付暂不可用，请返回选择余额支付');
          }
          const createdOrders = await Promise.all(pending.orderIds!.map(id => realOrderApi.fetchOrderDetail(id)));
          if (!isCurrentWrite()) return;
          const payment = prepareCheckoutPayment(createdOrders, createdOrders, requestedUserId, pending.orderGroupNo);
          if (sumPaymentAmounts(payment.payable.map(order => order.totalAmount)) !== sumPaymentAmounts([grandTotal.value])) {
            throw new Error('订单实际金额已变化，请重新确认已有订单后付款');
          }
          await createWalletPayForPending(pending, createdOrders, requestedUserId, chain, isCurrentWrite);
          return;
        }
        const paid = await payCheckoutOrders(pending, requestedUserId, isCurrentWrite, createdOrders => {
          const payment = prepareCheckoutPayment(createdOrders, createdOrders, requestedUserId, pending.orderGroupNo);
          if (sumPaymentAmounts(payment.payable.map(order => order.totalAmount)) !== sumPaymentAmounts([grandTotal.value])) {
            throw new Error('订单实际金额已变化，请重新确认已有订单后付款');
          }
          return payment.payable;
        }, count => `已创建订单，其中 ${count} 笔待付款。请检查余额后重试，系统不会重复下单。`);
        if (!paid) return;
        const firstOrderId = pending.firstOrderId;
        if (!isCurrentWrite()) return;
        await finishPaidCheckout(pending, firstOrderId ?? pending.orderIds[0], pending.cartSnapshot);
      } catch (error) {
        if (isCurrentWrite() && createBatchStarted && !activePending?.orderIds?.length && error instanceof RequestError) {
          if (isSelfPurchaseError(error) && activePending) {
            backendSelfPurchaseProductIds.value = [
              ...new Set([...backendSelfPurchaseProductIds.value, ...activePending.productIds.map(String)])
            ];
          }
          if (canDiscardRejectedCheckout(error, hadPendingAttempt)) {
            try { clearPendingCheckout(); } catch {
              Message.warning('本次下单已被拒绝，但本地记录清理失败，请恢复浏览器存储后重试');
            }
          }
        }
        throw error;
      }
    });
  } catch (error) {
    if (isCurrentWrite()) {
      Message.error({
        content: error instanceof Error ? error.message : '订单提交失败，请稍后重试',
        resetOnHover: true
      });
      agreed.value = false;
      if (hasCreatedOrders.value) await load();
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="checkout-page">
    <header class="page-heading"><p class="eyebrow">SECURE CHECKOUT</p><h1>确认订单</h1><p>核对商品、收货信息与支付方式后提交。</p></header>
    <Alert v-if="loadError" variant="destructive" class="load-alert"><AlertTitle>结算信息未能读取</AlertTitle><AlertDescription>{{ loadError }}</AlertDescription><Button variant="outline" :disabled="loading" @click="load"><Icon v-if="loading" icon="lucide:loader-circle" width="16" class="animate-spin" />重新加载</Button></Alert>
    <section v-if="hasCreatedOrders" class="panel pending-checkout" :aria-busy="loading">
      <div class="section-heading"><span class="step-number"><Icon icon="lucide:clipboard-list" width="18" /></span><h2>继续已创建订单</h2></div>
      <p class="section-description">以下为上次下单生成的真实订单，不使用当前购物车的商品、地址或金额。已付款或已结束的订单不会再次付款。</p>
      <Skeleton v-if="loading && !pendingOrders.length" class="orders-skeleton" />
      <div class="pending-orders" :class="{ reading: loading }">
        <article v-for="order in pendingOrders" :key="String(order.id)" class="pending-order"><div class="order-heading"><RouterLink :to="{ name: 'order-detail', params: { id: String(order.id) } }">订单 {{ order.code }}</RouterLink><OrderStatusTag :status="order.status" /></div><p>{{ order.productTitle }} · 数量 {{ order.quantity ?? '待核对' }} · U {{ order.totalAmount }}</p><p class="muted">收货地址：{{ order.shippingAddress }}</p></article>
      </div>
      <div class="pending-total">本次待付款 <strong>{{ unpaidOrders.length }} 笔 · U {{ pendingTotal || '待核对' }}</strong></div>
      <Alert v-if="latestWalletPay && ['PENDING', 'SUBMITTED', 'CLOSED'].includes(latestWalletPay.status)" class="notice"><AlertDescription>钱包支付单 {{ latestWalletPay.payNo }}：{{ latestWalletPay.statusText || latestWalletPay.status }}。</AlertDescription><Button variant="outline" class="notice-action" @click="router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: latestWalletPay.orderGroupNo } })">查看支付进度</Button></Alert>
      <Alert v-if="pendingCheckout?.paymentResult" class="notice"><AlertTitle>上次核对回执（当前状态以上方订单为准）</AlertTitle><AlertDescription><div v-for="item in pendingCheckout.paymentResult.items" :key="String(item.orderId)" class="receipt-item">{{ item.orderNo || item.orderId }} · U {{ item.amount }} · {{ item.status }} {{ item.message || '' }}</div></AlertDescription></Alert>
      <PaymentMethodSelector v-if="walletPayEntryEnabled && walletChains.length && unpaidOrders.length" v-model="paymentMethod" v-model:selected-chain="selectedChain" class="pending-methods" :chains="walletChains" :wallet-enabled="walletPayEntryEnabled" :disabled="submitting || loading" :chain-available="chain => chain.enabled && amountAtLeast(pendingTotal || '0', chain.minAmount)" />
      <Alert v-if="walletPayEntryEnabled && walletChainsError" class="notice"><AlertDescription>{{ walletChainsError }}</AlertDescription><Button variant="link" class="notice-action" :disabled="walletChainsLoading || submitting" @click="loadWalletChains">重新读取支付网络</Button></Alert>
      <label v-if="unpaidOrders.length" class="agree-row"><Checkbox :model-value="agreed" :disabled="submitting || loading" aria-label="已核对上述订单及待付金额" @update:model-value="value => agreed = value === true" />已核对上述订单及待付金额</label>
      <div class="pending-actions">
        <TooltipProvider v-if="unpaidOrders.length"><Tooltip><TooltipTrigger as-child><span :tabindex="pendingDisabledReason ? 0 : undefined"><Button :disabled="!!pendingDisabledReason" @click="payPendingOrders"><Icon v-if="submitting" icon="lucide:loader-circle" width="16" class="animate-spin" />{{ walletSelected ? '创建钱包支付单' : '支付上述待付款订单' }}</Button></span></TooltipTrigger><TooltipContent v-if="pendingDisabledReason">{{ pendingDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        <Button variant="outline" :disabled="submitting" @click="startNewCheckout">开始新的结算（保留已有订单）</Button><Button variant="ghost" @click="router.push({ name: 'order-list' })">查看我的订单</Button>
      </div>
    </section>
    <section v-else-if="hasUnconfirmedOrder" class="panel recovery-panel">
      <div class="section-heading"><span class="step-number"><Icon icon="lucide:circle-alert" width="18" /></span><h2>上次下单结果待确认</h2></div>
      <p class="section-description">浏览器保存了上次提交的 {{ pendingCheckout?.orderItems.length }} 种商品，但还没有收到订单号；这不代表订单已创建。当前购物车和地址可能已经变化。</p>
      <ul class="recovery-items"><li v-for="item in pendingCheckout?.orderItems" :key="String(item.productId)">商品编号 {{ item.productId }} · 数量 {{ item.quantity ?? 1 }}</li></ul>
      <Alert class="notice"><AlertDescription>恢复时只使用上次保存的商品和地址，可能创建上次的订单；恢复后会先展示订单供你核对，不会自动付款。</AlertDescription></Alert>
      <div class="pending-actions"><Button :disabled="submitting || confirmationPending" @click="confirmRecoverUnconfirmedOrder"><Icon v-if="submitting || confirmationPending" icon="lucide:loader-circle" width="16" class="animate-spin" />恢复上次订单</Button><Button variant="outline" :disabled="submitting || confirmationPending" @click="router.push({ name: 'order-list' })">查看我的订单</Button></div>
    </section>
    <div v-else-if="loading && !items.length" class="checkout-layout" aria-label="正在读取结算信息"><div class="main-sections"><Skeleton class="section-skeleton" /><Skeleton class="section-skeleton" /></div><Skeleton class="summary-skeleton" /></div>
    <div v-else-if="items.length" class="checkout-layout" :aria-busy="loading || submitting">
      <div class="main-sections">
        <section class="panel"><div class="section-heading"><span class="step-number">1</span><h2>收货信息</h2></div><AddressSelector v-if="userStore.currentUser" v-model="addressId" :user-id="userStore.currentUser.id" @validity="addressValid = $event" @changed="address => selectedAddr = address" /></section>
        <section class="panel">
          <div class="section-heading"><span class="step-number">2</span><h2>商品清单</h2><span class="section-meta">{{ items.length }} 种 · {{ items.reduce((sum, item) => sum + item.qty, 0) }} 件</span></div>
          <Alert v-if="overseasItems.length" class="notice overseas-notice"><AlertDescription>以下 {{ overseasItems.length }} 种商品来自海外直邮，过关后不可退货退款。</AlertDescription></Alert>
          <div class="goods-list"><article v-for="item in items" :key="item.productId" class="goods-row">
            <img :src="item.product?.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="item.product?.title || '商品图片'" class="cover" @error="setImageFallback" />
            <div class="goods-info"><RouterLink :to="`/product/${item.productId}`" class="goods-title">{{ item.product?.title }}</RouterLink><div class="tags"><span v-if="item.product" class="tag">{{ productApi.getAftersaleMeta(item.product.aftersaleType).label }}</span><span v-if="item.product?.overseasCustoms" class="tag overseas-tag">海外直邮</span></div><p class="seller">买手 · {{ item.product?.sellerName || '—' }}</p></div>
            <span class="quantity">× {{ item.qty }}</span><div class="line-amount"><strong>{{ formatUsdt(item.lineTotal) }}</strong><small>≈ {{ formatCny(item.lineTotal) }}</small></div>
          </article></div>
        </section>
        <section class="panel">
          <div class="section-heading"><span class="step-number">3</span><h2>选择支付方式</h2></div>
          <PaymentMethodSelector v-model="paymentMethod" v-model:selected-chain="selectedChain" :chains="walletChains" :wallet-enabled="walletPayEntryEnabled" :disabled="submitting || confirmationPending" :chain-available="chain => chain.enabled && amountAtLeast(grandTotal, chain.minAmount)">
            <template #balance><div class="balance-row"><span>钱包可用余额</span><span :class="{ insufficient: availableBalance !== undefined && !balanceEnough }">{{ availableBalance === undefined ? '余额待确认' : `U ${formatAmount(availableBalance)}` }}{{ availableBalance !== undefined && !balanceEnough ? ' · 余额不足' : '' }}</span></div></template>
          </PaymentMethodSelector>
          <Alert v-if="walletPayEntryEnabled && walletChainsError" class="notice"><AlertDescription>{{ walletChainsError }}</AlertDescription><Button variant="link" class="notice-action" :disabled="walletChainsLoading || submitting || confirmationPending" @click="loadWalletChains">重新读取支付网络</Button></Alert>
          <Alert v-if="walletError" class="notice"><AlertDescription>{{ walletError }}；商品、收货地址及协议选择保持不变。</AlertDescription><Button variant="outline" class="notice-action" :disabled="loading || submitting || confirmationPending || walletLoading" @click="loadWallet"><Icon v-if="walletLoading" icon="lucide:loader-circle" width="14" class="animate-spin" />重新读取余额</Button></Alert>
          <Alert v-if="selfSoldItems.length" variant="destructive" class="notice"><AlertTitle>不能购买自己发布的商品：{{ selfSoldTitles }}</AlertTitle><AlertDescription>请返回购物车移除该商品，或选择其他买手的商品后再结算。</AlertDescription></Alert>
        </section>
      </div>
      <aside class="panel payment-summary">
        <h2>金额明细</h2>
        <dl class="amount-list"><div><dt>商品合计</dt><dd>{{ formatUsdt(subTotal) }}<small>≈ {{ formatCny(subTotal) }}</small></dd></div><div><dt>运费合计</dt><dd>{{ formatUsdt(shippingFeeTotal) }}</dd></div><div><dt>税费合计 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="13" /></dt><dd>{{ formatUsdt(taxTotal) }}</dd></div></dl>
        <div class="grand-total"><span>应付总额</span><strong>{{ formatUsdt(grandTotal) }}</strong><small>≈ {{ formatCny(grandTotal) }}</small></div>
        <div class="agree-row"><Checkbox id="checkout-agreement" :model-value="agreed" :disabled="submitting || confirmationPending" aria-label="同意用户协议及隐私政策" @update:model-value="value => agreed = value === true" /><div><label for="checkout-agreement">我已阅读并同意</label><RouterLink :to="{ path: '/help', query: { agreement: 'user' } }">《用户协议》</RouterLink><RouterLink :to="{ path: '/help', query: { agreement: 'privacy' } }">《隐私政策》</RouterLink></div></div>
        <TooltipProvider><Tooltip><TooltipTrigger as-child><span class="submit-trigger" :tabindex="submitDisabledReason ? 0 : undefined"><Button class="submit-button" size="lg" :disabled="!!submitDisabledReason" @click="submit"><Icon v-if="submitting || confirmationPending" icon="lucide:loader-circle" width="16" class="animate-spin" />{{ walletSelected ? '提交订单并前往钱包支付' : '提交订单' }}</Button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        <p class="rate-note">{{ priceSet(grandTotal).rateLabel }}<br />本地参考折算，以 USDT 结算</p><RouterLink to="/cart" class="return-cart"><Icon icon="lucide:arrow-left" width="14" />返回购物车</RouterLink>
      </aside>
    </div>
    <EmptyState v-else-if="!loadError" title="没有选中要结算的商品" action-text="回到购物车" @action="router.push('/cart')" />
  </div>
</template>

<style scoped>
.checkout-page { width:100%; margin:0 auto; padding:0 0 32px; }
.page-heading { margin-bottom: 24px; }
.eyebrow { margin: 0 0 4px; color: var(--yb-gold); font-size: 12px; letter-spacing: .12em; font-weight: 600; }
.page-heading h1 { font-size: 28px; font-weight: 650; margin: 0; }
.page-heading > p:last-child { margin: 8px 0 0; font-size: 14px; color: var(--yb-muted); }
.checkout-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 24px; align-items: start; }
.main-sections { display: grid; gap: 24px; min-width: 0; }
.panel { padding: 24px; background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; min-width: 0; }
.section-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.step-number { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; background: var(--yb-primary-soft); color: var(--yb-primary); font-size: 13px; font-weight: 600; }
h2 { font-size: 20px; font-weight: 650; margin: 0; }
.section-meta, .section-description { color: var(--yb-muted); font-size: 13px; }
.section-meta { margin-left: auto; }
.section-description { margin: 0 0 20px; }
.goods-row { display: grid; grid-template-columns: 80px minmax(0, 1fr) 40px auto; align-items: center; gap: 16px; padding: 20px 0; border-bottom: 1px solid var(--yb-hairline); }
.goods-row:first-child { padding-top: 0; }
.goods-row:last-child { border-bottom: 0; padding-bottom: 0; }
.cover { width: 80px; height: 80px; object-fit: contain; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-fill); }
.goods-title { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.goods-title:hover { color: var(--yb-primary); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag { font-size: 12px; padding: 1px 6px; border-radius: 4px; color: var(--yb-primary); background: var(--yb-fill); }
.overseas-tag { color: var(--yb-gold); background: var(--yb-champagne); }
.seller { font-size: 12px; color: var(--yb-muted); margin: 6px 0 0; }
.quantity { font-size: 14px; color: var(--yb-muted); text-align: center; }
.line-amount { text-align: right; font-variant-numeric: tabular-nums; }
.line-amount strong { font-size: 16px; font-weight: 600; }
.line-amount small, .amount-list small { display: block; font-size: 12px; font-weight: 400; color: var(--yb-muted); }
.balance-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; }
.insufficient { color: var(--yb-danger); }
.payment-summary { position: sticky; top:170px; }
.amount-list { display: grid; gap: 18px; margin: 24px 0; }
.amount-list > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.amount-list dt { display: inline-flex; align-items: center; gap: 4px; color: var(--yb-muted); font-size: 14px; }
.amount-list dd { margin: 0; font-size: 14px; font-weight: 600; text-align: right; }
.grand-total { display: grid; gap: 5px; padding-top: 20px; border-top: 1px solid var(--yb-hairline); }
.grand-total > span { font-size: 14px; }
.grand-total strong { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
.grand-total small, .rate-note { font-size: 12px; color: var(--yb-muted); }
.agree-row { display: flex; align-items: flex-start; gap: 10px; margin: 20px 0; font-size: 13px; color: var(--yb-muted); line-height: 1.8; }
.agree-row > button { margin-top: 3px; flex-shrink: 0; }
.agree-row label { cursor: pointer; }
.agree-row a { color: var(--yb-primary); }
.submit-trigger, .submit-button { width: 100%; }
.submit-button { white-space: normal; height: auto; min-height: 44px; text-align: center; }
.rate-note { margin: 14px 0; }
.return-cart { display: flex; justify-content: center; align-items: center; gap: 6px; font-size: 13px; color: var(--yb-muted); }
.pending-order { border: 1px solid var(--yb-hairline); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.order-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.order-heading a { color: var(--yb-primary); font-size: 14px; font-weight: 600; }
.pending-order p { margin: 8px 0 0; font-size: 14px; overflow-wrap: anywhere; }
.pending-total { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 16px 0; font-size: 14px; }
.pending-total strong { font-size: 20px; font-weight: 650; }
.notice { margin: 16px 0; background: var(--yb-fill); }
.notice-action { margin-top: 10px; }
.receipt-item { margin-top: 8px; overflow-wrap: anywhere; }
.pending-methods { margin: 20px 0; }
.pending-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.recovery-items { margin: 0; padding-left: 20px; font-size: 13px; color: var(--yb-muted); }
.load-alert { margin-bottom: 20px; }
.load-alert button { margin-top: 12px; }
.section-skeleton { height: 280px; }
.summary-skeleton { height: 440px; }
.orders-skeleton { height: 200px; margin-bottom: 20px; }
.reading { opacity: .55; }
@media (max-width: 1100px) { .checkout-layout { grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; } .panel { padding: 20px; } .goods-row { gap: 12px; grid-template-columns: 64px minmax(0, 1fr) 30px auto; } .cover { width: 64px; height: 64px; } }
@media (max-width: 800px) { .checkout-layout { grid-template-columns: 1fr; } .payment-summary { position: static; } }
</style>
