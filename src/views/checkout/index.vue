<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import UmIcon from '@/components/common/um-icon.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PaymentMethodSelector from '@/components/order/payment-method-selector.vue';
import { Message, Modal } from '@/lib/feedback';
import { TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import * as realOrderApi from '@/service/api/order';
import { createWalletPay, fetchLatestWalletPay, fetchWalletPayChains, validateWalletPay, type WalletPayChain, type WalletPayOrder } from '@/service/api/wallet-pay';
import * as realWalletApi from '@/service/api/wallet';
import * as productApi from '@/service/api/product';
import { readCheckoutIntent, clearCheckoutIntent, prepareCheckoutPayment, canDiscardRejectedCheckout, cleanupPaidCheckout,
  readPendingCheckout, pendingCheckoutStorageKey as pendingStorageKey, sumPaymentAmounts, formatPaymentAmount as formatAmount, validateGroupPayResult, validateRecoveredCheckoutOrders, isGroupPaymentComplete, type PendingCheckout } from '@/utils/checkout';
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
import { exactTransactionAmount } from '@/components/wallet/decimal-amount';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { getAccessToken } from '@/service/request/token';

const router = useRouter();
const route = useRoute();
const contextId = computed(() => typeof route.query.contextId === 'string' ? route.query.contextId : '');
const contextItems = ref<Array<{ productId: string | number; quantity: number; skuId?: string | number; confirmedUnitPrice?: string }>>([]);
const userStore = useUserStore();
const cart = useCartStore();
const requestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const walletGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
const chainsGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
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
const recoveryNotice = ref('');
const recoveryRejected = ref(false);
const hasCreatedOrders = computed(() => !!pendingCheckout.value?.orderIds?.length);
const hasUnconfirmedOrder = computed(() => !!pendingCheckout.value && !hasCreatedOrders.value);
const unpaidOrders = computed(() => pendingOrders.value.filter(order => getOrderCapabilities(order, userStore.currentUser?.id).pay));
const pendingTotal = computed(() => {
  try { return sumPaymentAmounts(unpaidOrders.value.map(order => order.totalAmount)); } catch { return ''; }
});

const checkoutItems = computed(() => route.query.contextId !== undefined
  ? contextItems.value.map(item => cart.enrich({ productId: item.productId, skuId: item.skuId,
    confirmedUnitPrice: item.confirmedUnitPrice, qty: item.quantity, selected: true, addedAt: '' }))
  : cart.enrichedItems.filter(item => item.selected));
const items = computed(() => checkoutItems.value.filter(item => item.available));
const overseasItems = computed(() => items.value.filter(i => i.product?.overseasCustoms));
const subTotal = computed(() => checkoutItems.value.some(item => !item.available) ? '' : sumPaymentAmounts(items.value.map(item => item.subtotal)));
const shippingFeeTotal = computed(() => checkoutItems.value.some(item => !item.available) ? '' : sumPaymentAmounts(items.value.map(item => item.shippingFee)));
const taxTotal = computed(() => checkoutItems.value.some(item => !item.available) ? '' : sumPaymentAmounts(items.value.map(item => item.tax)));
const grandTotal = computed(() => checkoutItems.value.some(item => !item.available) ? '' : sumPaymentAmounts(items.value.map(item => item.lineTotal)));
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

const availableBalance = computed(() => {
  const value = wallet.value?.available;
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  try { return sumPaymentAmounts([value]); } catch { return undefined; }
});
const balanceEnough = computed(() => availableBalance.value !== undefined && !!grandTotal.value && amountAtLeast(availableBalance.value, grandTotal.value));
const walletSelected = computed(() => walletPayEntryEnabled && paymentMethod.value === 'wallet');
const submitDisabledReason = computed(() => {
  if (grandTotal.value && exactTransactionAmount(grandTotal.value).error) return '结算总额超出交易金额范围，请调整购买数量';
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
  if (unpaidOrders.value.length && exactTransactionAmount(pendingTotal.value).error) return '待付总额超出交易金额范围，请联系平台核对';
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
  return items.value.map(item => ({ productId: item.productId, skuId: item.skuId,
    confirmedUnitPrice: item.unitPrice, quantity: item.qty }));
}

function hasSameOrderItems(
  left: Api.RealOrder.OrderCreateItemParams[],
  right: Api.RealOrder.OrderCreateItemParams[]
) {
  if (left.length !== right.length) return false;
  const normalize = (item: Api.RealOrder.OrderCreateItemParams) => JSON.stringify([
    String(item.productId), item.skuId === undefined ? '' : String(item.skuId), item.quantity || 1,
    item.sessionId === undefined ? '' : String(item.sessionId),
    item.confirmedUnitPrice === undefined ? '' : sumPaymentAmounts([item.confirmedUnitPrice])
  ]);
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
      const purchasedProducts = new Set(latest.filter(order => !['CANCELLED', 'REFUNDED'].includes(order.status))
        .map(order => `${order.productId}:${order.skuId ?? ''}`));
      await finishPaidCheckout(pending, payable[0].id,
        pending.cartSnapshot?.filter(item => purchasedProducts.has(`${item.productId}:${item.skuId ?? ''}`)));
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
  const expectedRoute = route.fullPath;
  const session = getAccessToken();
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId)
    && route.fullPath === expectedRoute && getAccessToken() === session;
  submitting.value = true;
  recoveryNotice.value = '';
  recoveryRejected.value = false;
  try {
    await withSubmissionLock(pendingStorageKey(userId), async () => {
      if (!isCurrent()) return;
      const stored = readPendingCheckout(userId);
      if (!stored || stored.idempotencyKey !== expectedKey || stored.orderIds?.length) {
        throw new Error('结算记录已变化，请重新读取原订单');
      }
      const originalSnapshot = JSON.stringify(stored);
      // 回查不会创建订单；NOT_FOUND 也不能证明原请求不会继续执行。
      const result = await realOrderApi.fetchOrderCreationByKey(stored.idempotencyKey);
      if (!isCurrent()) return;
      if (JSON.stringify(readPendingCheckout(userId)) !== originalSnapshot) throw new Error('结算记录已在其他页面变化，请重新读取原订单');
      if (result.status !== 'CREATED') {
        if (result.orderIds.length) throw new Error('原下单回查状态与订单身份矛盾，请保留原记录并核对');
        recoveryRejected.value = result.status === 'REJECTED';
        recoveryNotice.value = result.status === 'NOT_FOUND'
          ? '暂未找到原下单记录，仍不能排除在途请求。原下单标识、商品和地址已保留；请稍后重新查询，不会自动重新下单或付款。'
          : result.status === 'PROCESSING'
            ? '原下单请求仍在处理中。原下单标识、商品和地址已保留；请稍后重新查询，不会自动重新下单或付款。'
            : `原下单已被明确拒绝${result.rejectionCode === undefined || result.rejectionCode === null ? '' : `（${result.rejectionCode}）`}：${result.rejectionMessage || '请联系平台核对拒绝原因'}。原记录已保留，同一标识不会重新创建订单。`;
        return;
      }
      const orders = await Promise.all(result.orderIds.map(id => realOrderApi.fetchOrderDetail(id)));
      if (!isCurrent()) return;
      const recovered = validateRecoveredCheckoutOrders(stored, result, orders, userId);
      const receipt = validateGroupPayResult(await realOrderApi.fetchOrderGroupPayResult(result.orderGroupNo!), result.orderGroupNo!, result.orderIds);
      if (!isCurrent()) return;
      if (receipt.items.length !== result.orderIds.length) throw new Error('原下单订单组回执缺少部分订单，请保留原记录并核对');
      if (JSON.stringify(readPendingCheckout(userId)) !== originalSnapshot) throw new Error('结算记录已在其他页面变化，请重新读取原订单');
      recovered.paymentResult = receipt;
      savePendingCheckout(recovered);
      pendingOrders.value = orders;
      agreed.value = false;
      recoveryNotice.value = '';
      Message.success('已找到并核对上次创建的整批订单，请核对订单及金额后再确认付款');
    });
  } catch (error) {
    if (isCurrent()) {
      recoveryNotice.value = error instanceof Error ? error.message : '上次下单结果仍未确认，请稍后重新查询';
      Message.error(recoveryNotice.value);
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}

function confirmRecoverUnconfirmedOrder() {
  if (!hasUnconfirmedOrder.value || submitting.value || confirmationPending.value) return;
  void recoverUnconfirmedOrder();
}

function confirmDiscardRejectedCheckout() {
  const userId = userStore.currentUser?.id;
  const expectedKey = pendingCheckout.value?.idempotencyKey;
  if (userId === undefined || !expectedKey || !recoveryRejected.value || !hasUnconfirmedOrder.value
    || submitting.value || loading.value || confirmationPending.value) return;
  const originalSnapshot = JSON.stringify(pendingCheckout.value);
  const expectedRoute = route.fullPath;
  const session = getAccessToken();
  const operation = ++writeVersion;
  const isCurrent = () => operation === writeVersion && String(userStore.currentUser?.id) === String(userId)
    && route.fullPath === expectedRoute && getAccessToken() === session;
  confirmationPending.value = true;
  confirmationModal = Modal.confirm({
    title: '确认原下单已拒绝并重新结算？',
    content: '将再次查询原下单标识。只有服务端仍明确返回已拒绝，且原记录未变化时，才解除本地结算保护并重新读取当前商品；不会自动下单或付款。',
    okText: '确认拒绝并重新结算',
    onCancel() {
      if (operation === writeVersion) confirmationPending.value = false;
    },
    onClose() {
      if (operation === writeVersion) confirmationPending.value = false;
    },
    async onOk() {
      if (!isCurrent()) return;
      confirmationPending.value = false;
      submitting.value = true;
      let cleared = false;
      try {
        await withSubmissionLock(pendingStorageKey(userId), async () => {
          if (!isCurrent()) return;
          const stored = readPendingCheckout(userId);
          if (!stored || stored.idempotencyKey !== expectedKey || stored.orderIds?.length
            || JSON.stringify(stored) !== originalSnapshot) throw new Error('原结算记录已变化，未清理记录，请重新查询');
          const result = await realOrderApi.fetchOrderCreationByKey(expectedKey);
          if (!isCurrent()) return;
          if (JSON.stringify(readPendingCheckout(userId)) !== originalSnapshot) throw new Error('原结算记录已在其他页面变化，未清理记录');
          if (result.status !== 'REJECTED' || result.orderIds.length) {
            recoveryRejected.value = false;
            throw new Error('原下单状态已变化，记录已保留，请重新查询上次下单结果');
          }
          clearPendingCheckout(userId, expectedKey);
          recoveryRejected.value = false;
          recoveryNotice.value = '';
          cleared = true;
        });
        if (cleared && isCurrent()) {
          agreed.value = false;
          submitting.value = false;
          await load();
        }
      } catch (error) {
        if (isCurrent()) {
          recoveryNotice.value = error instanceof Error ? error.message : '拒绝结果暂不能再次确认，原记录已保留';
          Message.error(recoveryNotice.value);
        }
      } finally {
        if (operation === writeVersion) submitting.value = false;
      }
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
    if (pending.orderGroupNo) validateRecoveredCheckoutOrders(pending, {
      status: 'CREATED', orderGroupNo: pending.orderGroupNo, orderIds: ids
    }, latest, userId);
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

watch(checkoutSignature, () => { agreed.value = false; });

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
  recoveryNotice.value = '';
  recoveryRejected.value = false;
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
    if (hasUnconfirmedOrder.value) {
      if (isCurrent() && String(userStore.currentUser?.id) === String(userId)) await recoverUnconfirmedOrder();
      return;
    }
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
watch([() => userStore.currentUser?.id, () => route.query.contextId, () => userStore.sessionVersion], () => {
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
  if (exactTransactionAmount(grandTotal.value).error) {
    Message.error('结算总额超出交易金额范围，请调整购买数量');
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
  const changedPrices = items.value.filter(item => item.confirmedUnitPrice !== undefined
    && sumPaymentAmounts([item.confirmedUnitPrice]) !== sumPaymentAmounts([item.unitPrice]));
  if (changedPrices.length) {
    confirmationPending.value = true;
    const confirmed = await new Promise<boolean>(resolve => {
      cancelConfirmation = () => resolve(false);
      confirmationModal = Modal.confirm({
        title: '商品价格已更新',
        content: changedPrices.map(item => `${item.product?.title || item.productId}${item.specText ? `（${item.specText}）` : ''}：`
          + `${item.confirmedUnitPrice} → ${item.unitPrice} USDT`).join('；') + '。请核对最新价格后再提交。',
        okText: '按最新价格继续',
        cancelText: '返回核对',
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    confirmationPending.value = false;
    cancelConfirmation = undefined;
    confirmationModal = undefined;
    if (!confirmed) return;
    if (confirmationVersion !== writeVersion || signature !== checkoutSignature()) {
      Message.warning('结算信息已变化，请重新确认后提交');
      return;
    }
  }
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
  await doSubmit(paymentMethod.value, selectedChain.value, signature);
}

async function doSubmit(method: 'balance' | 'wallet', chain: string, expectedSignature: string) {
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const expectedSession = getAccessToken();
  const expectedRoute = route.fullPath;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && getAccessToken() === expectedSession && route.fullPath === expectedRoute;
  submitting.value = true;
  let activePending: PendingCheckout | undefined;
  let createBatchStarted = false;
  let creationResponseReceived = false;
  const hadPendingAttempt = !!pendingCheckout.value;
  try {
    await withSubmissionLock(pendingStorageKey(requestedUserId), async () => {
      try {
        if (!isCurrentWrite()) return;
        if (!agreed.value || expectedSignature !== checkoutSignature() || !addressValid.value
          || checkoutItems.value.some(item => !item.available)) {
          throw new Error('结算商品、规格、价格或地址已变化，请重新核对并确认');
        }
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
          creationResponseReceived = true;
          if (!isCurrentWrite()) return;
          if (!orderGroup.orderIds?.length) throw new Error('下单未返回订单 ID');
          const createdOrders = await Promise.all(orderGroup.orderIds.map(id => realOrderApi.fetchOrderDetail(id)));
          if (!isCurrentWrite()) return;
          const validated = validateRecoveredCheckoutOrders(pending, {
            status: 'CREATED', orderGroupNo: orderGroup.orderGroupNo, orderIds: orderGroup.orderIds
          }, createdOrders, requestedUserId);
          pending.orderGroupNo = validated.orderGroupNo;
          pending.orderIds = validated.orderIds;
          pending.firstOrderId = validated.firstOrderId;
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
        const firstOrderId = pending.firstOrderId ?? pending.orderIds?.[0];
        if (!isCurrentWrite()) return;
        if (firstOrderId === undefined) throw new Error('付款已确认，请到我的订单查看，勿重复提交');
        await finishPaidCheckout(pending, firstOrderId, pending.cartSnapshot);
      } catch (error) {
        if (isCurrentWrite() && createBatchStarted && !creationResponseReceived && !activePending?.orderIds?.length && error instanceof RequestError) {
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
      else if (hasUnconfirmedOrder.value) {
        submitting.value = false;
        await recoverUnconfirmedOrder();
      }
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="checkout-page">
    <div class="checkout-steps"><span class="done">01 购物袋</span><UmIcon name="arrow" /><span class="active">02 确认订单</span><UmIcon name="arrow" /><span>03 完成支付</span></div><div class="page-heading compact"><h1>确认订单</h1></div>
    <Alert v-if="loadError" variant="destructive" class="load-alert"><AlertTitle>结算信息未能读取</AlertTitle><AlertDescription>{{ loadError }}</AlertDescription><button type="button" class="outline"  :disabled="loading" @click="load"><Icon v-if="loading" icon="lucide:loader-circle" width="16" class="animate-spin" />重新加载</button></Alert>
    <section v-if="hasCreatedOrders" class="paper panel pending-checkout" :aria-busy="loading">
      <div class="section-heading"><span class="step-number"><Icon icon="lucide:clipboard-list" width="18" /></span><h2>继续已创建订单</h2></div>
      <p class="section-description">以下为上次下单生成的真实订单，不使用当前购物车的商品、地址或金额。已付款或已结束的订单不会再次付款。</p>
      <Skeleton v-if="loading && !pendingOrders.length" class="orders-skeleton" />
      <div class="pending-orders" :class="{ reading: loading }">
        <article v-for="order in pendingOrders" :key="String(order.id)" class="pending-order"><div class="order-heading"><RouterLink :to="{ name: 'order-detail', params: { id: String(order.id) } }">订单 {{ order.code }}</RouterLink><OrderStatusTag :status="order.status" /></div><p>{{ order.productTitle }}<template v-if="order.skuSpecs?.length"> · {{ order.skuSpecs.map(spec => `${spec.name}：${spec.value}`).join(' / ') }}</template> · 数量 {{ order.quantity ?? '待核对' }} · U {{ order.totalAmount }}</p><p class="muted">收货地址：{{ order.shippingAddress }}</p></article>
      </div>
      <div class="pending-total">本次待付款 <strong>{{ unpaidOrders.length }} 笔 · U {{ pendingTotal || '待核对' }}</strong></div>
      <Alert v-if="latestWalletPay && ['PENDING', 'SUBMITTED', 'CLOSED'].includes(latestWalletPay.status)" class="notice"><AlertDescription>钱包支付单 {{ latestWalletPay.payNo }}：{{ latestWalletPay.statusText || latestWalletPay.status }}。</AlertDescription><button type="button"  class="notice-action outline" @click="router.push({ name: 'checkout-wallet-pay', params: { orderGroupNo: latestWalletPay.orderGroupNo } })">查看支付进度</button></Alert>
      <Alert v-if="pendingCheckout?.paymentResult" class="notice"><AlertTitle>上次核对回执（当前状态以上方订单为准）</AlertTitle><AlertDescription><div v-for="item in pendingCheckout.paymentResult.items" :key="String(item.orderId)" class="receipt-item">{{ item.orderNo || item.orderId }} · U {{ item.amount }} · {{ item.status }} {{ item.message || '' }}</div></AlertDescription></Alert>
      <PaymentMethodSelector v-if="walletPayEntryEnabled && walletChains.length && unpaidOrders.length" v-model="paymentMethod" v-model:selected-chain="selectedChain" class="pending-methods" :chains="walletChains" :wallet-enabled="walletPayEntryEnabled" :disabled="submitting || loading" :chain-available="chain => chain.enabled && amountAtLeast(pendingTotal || '0', chain.minAmount)" />
      <Alert v-if="walletPayEntryEnabled && walletChainsError" class="notice"><AlertDescription>{{ walletChainsError }}</AlertDescription><button type="button"  class="notice-action text-link" :disabled="walletChainsLoading || submitting" @click="loadWalletChains">重新读取支付网络</button></Alert>
      <label v-if="unpaidOrders.length" class="agreement agree-row"><input type="checkbox" :checked="agreed" :disabled="submitting || loading" aria-label="已核对上述订单及待付金额" @change="agreed = ($event.target as HTMLInputElement).checked" />已核对上述订单及待付金额</label>
      <div class="pending-actions">
        <TooltipProvider v-if="unpaidOrders.length"><Tooltip><TooltipTrigger as-child><span :tabindex="pendingDisabledReason ? 0 : undefined"><button type="button" class="primary" :disabled="!!pendingDisabledReason" @click="payPendingOrders"><Icon v-if="submitting" icon="lucide:loader-circle" width="16" class="animate-spin" />{{ walletSelected ? '创建钱包支付单' : '支付上述待付款订单' }}</button></span></TooltipTrigger><TooltipContent v-if="pendingDisabledReason">{{ pendingDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        <button type="button" class="outline"  :disabled="submitting" @click="startNewCheckout">开始新的结算（保留已有订单）</button><button type="button" class="text-link"  @click="router.push({ name: 'order-list' })">查看我的订单</button>
      </div>
    </section>
    <section v-else-if="hasUnconfirmedOrder" class="paper panel recovery-panel">
      <div class="section-heading"><span class="step-number"><Icon icon="lucide:circle-alert" width="18" /></span><h2>上次下单结果待确认</h2></div>
      <p class="section-description">浏览器保存了上次提交的 {{ pendingCheckout?.orderItems.length }} 种商品，但还没有收到订单号；这不代表订单已创建。当前购物车和地址可能已经变化。</p>
      <ul class="recovery-items"><li v-for="item in pendingCheckout?.orderItems" :key="`${item.productId}:${item.skuId ?? ''}`">商品编号 {{ item.productId }}<template v-if="item.skuId !== undefined"> · SKU {{ item.skuId }}</template> · 数量 {{ item.quantity ?? 1 }}</li></ul>
      <Alert class="notice"><AlertDescription>{{ recoveryNotice || '仅按原下单标识查询结果，保留上次保存的商品和地址；不会重新创建订单或自动付款。' }}</AlertDescription></Alert>
      <div class="pending-actions"><button type="button" class="primary" :disabled="submitting || confirmationPending" @click="confirmRecoverUnconfirmedOrder"><Icon v-if="submitting || confirmationPending" icon="lucide:loader-circle" width="16" class="animate-spin" />查询上次下单结果</button><button v-if="recoveryRejected" type="button" class="outline" :disabled="submitting || confirmationPending || loading" @click="confirmDiscardRejectedCheckout">确认拒绝并重新结算</button><button type="button" class="outline"  :disabled="submitting || confirmationPending" @click="router.push({ name: 'order-list' })">查看我的订单</button></div>
    </section>
    <div v-else-if="loading && !items.length" class="checkout-layout" aria-label="正在读取结算信息"><div class="main-sections"><Skeleton class="section-skeleton" /><Skeleton class="section-skeleton" /></div><Skeleton class="summary-skeleton" /></div>
    <div v-else-if="items.length" class="checkout-layout" :aria-busy="loading || submitting">
      <div class="main-sections">
        <section class="paper panel"><AddressSelector v-if="userStore.currentUser" v-model="addressId" :user-id="userStore.currentUser.id" @validity="addressValid = $event" @changed="address => selectedAddr = address"><template #heading><h2><em>01</em> 收货信息</h2></template></AddressSelector></section>
        <section class="paper panel">
          <div class="section-heading"><h2><em>02</em> 商品清单</h2><span class="section-meta">{{ items.length }} 种 · {{ items.reduce((sum, item) => sum + item.qty, 0) }} 件</span></div>
          <Alert v-if="overseasItems.length" class="notice overseas-notice"><AlertDescription>以下 {{ overseasItems.length }} 种商品来自海外直邮，过关后不可退货退款。</AlertDescription></Alert>
          <div class="goods-list"><article v-for="item in items" :key="`${item.productId}:${item.skuId ?? ''}`" class="checkout-item">
            <img :src="item.image || item.product?.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="item.product?.title || '商品图片'" @error="setImageFallback" />
            <div><small>买手 {{ item.product?.sellerName || '—' }}</small><h3><RouterLink :to="`/product/${item.productId}`">{{ item.product?.title }}</RouterLink></h3><p><template v-if="item.specText">{{ item.specText }} · </template><template v-if="item.product">{{ productApi.getAftersaleMeta(item.product.aftersaleType).label }} · </template>数量 {{ item.qty }}<span v-if="item.product?.overseasCustoms"> · 海外直邮</span></p></div><b>{{ formatAmount(item.subtotal) }} <small>USDT</small></b>
          </article></div>
        </section>
        <section class="paper panel">
          <div class="section-heading"><h2><em>03</em> 支付方式</h2></div>
          <PaymentMethodSelector v-model="paymentMethod" v-model:selected-chain="selectedChain" :chains="walletChains" :wallet-enabled="walletPayEntryEnabled" :disabled="submitting || confirmationPending" :chain-available="chain => chain.enabled && amountAtLeast(grandTotal, chain.minAmount)">
            <template #balance><div class="balance-row"><span>钱包可用余额</span><span :class="{ insufficient: availableBalance !== undefined && !balanceEnough }">{{ availableBalance === undefined ? '余额待确认' : `U ${formatAmount(availableBalance)}` }}{{ availableBalance !== undefined && !balanceEnough ? ' · 余额不足' : '' }}</span></div></template>
          </PaymentMethodSelector>
          <Alert v-if="walletPayEntryEnabled && walletChainsError" class="notice"><AlertDescription>{{ walletChainsError }}</AlertDescription><button type="button"  class="notice-action text-link" :disabled="walletChainsLoading || submitting || confirmationPending" @click="loadWalletChains">重新读取支付网络</button></Alert>
          <Alert v-if="walletError" class="notice"><AlertDescription>{{ walletError }}；商品、收货地址及协议选择保持不变。</AlertDescription><button type="button"  class="notice-action outline" :disabled="loading || submitting || confirmationPending || walletLoading" @click="loadWallet"><Icon v-if="walletLoading" icon="lucide:loader-circle" width="14" class="animate-spin" />重新读取余额</button></Alert>
          <Alert v-if="selfSoldItems.length" variant="destructive" class="notice"><AlertTitle>不能购买自己发布的商品：{{ selfSoldTitles }}</AlertTitle><AlertDescription>请返回购物车移除该商品，或选择其他买手的商品后再结算。</AlertDescription></Alert>
        </section>
      </div>
      <aside class="paper summary-card payment-summary">
        <h2>订单明细</h2>
        <div class="money-row"><span>商品合计</span><b>{{ formatAmount(subTotal) }} USDT</b></div><div class="money-row"><span>运费</span><b>{{ formatAmount(shippingFeeTotal) }} USDT</b></div><div class="money-row"><span>税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="13" /></span><b>{{ formatAmount(taxTotal) }} USDT</b></div>
        <div class="summary-total"><span>应付金额</span><b>{{ formatAmount(grandTotal) }}<small> USDT</small></b></div>
        <div class="agreement agree-row"><input id="checkout-agreement" type="checkbox" :checked="agreed" :disabled="submitting || confirmationPending" aria-label="同意用户协议及隐私政策" @change="agreed = ($event.target as HTMLInputElement).checked" /><div><label for="checkout-agreement">我已阅读并同意</label><RouterLink :to="{ path: '/help', query: { agreement: 'user' } }">《用户协议》</RouterLink><RouterLink :to="{ path: '/help', query: { agreement: 'privacy' } }">《隐私政策》</RouterLink></div></div>
        <TooltipProvider><Tooltip><TooltipTrigger as-child><span class="submit-trigger" :tabindex="submitDisabledReason ? 0 : undefined"><button type="button" class="submit-button gold full" :disabled="!!submitDisabledReason" @click="submit"><Icon v-if="submitting || confirmationPending" icon="lucide:loader-circle" width="16" class="animate-spin" />{{ walletSelected ? '提交订单并前往钱包支付' : '提交订单' }}</button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        <RouterLink to="/cart" class="text-link full return-cart">返回购物袋</RouterLink>
      </aside>
    </div>
    <EmptyState v-else-if="!loadError" title="没有选中要结算的商品" action-text="回到购物车" @action="router.push('/cart')" />
  </div>
</template>

<style scoped>
.panel { min-width:0; }.main-sections { min-width:0; }.section-heading { flex-wrap:wrap; }.section-meta { font-size:13px; color:var(--muted); margin-left:auto; }.section-description { font-size:13px; color:var(--muted); margin-bottom:20px; }.checkout-item h3 { overflow-wrap:anywhere; }
.balance-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px 20px; }.insufficient { color:var(--yb-danger); }.agree-row { display:flex; align-items:flex-start; gap:10px; margin:20px 0; }.agree-row > button { flex-shrink:0; margin-top:3px; }.agree-row a { color:var(--green); }.submit-trigger { display:block; width:100%; }.return-cart { margin-top:20px; }
.pending-order { border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:12px; }.order-heading { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }.order-heading a { color:var(--green); font-size:14px; }.pending-order p { margin-top:8px; overflow-wrap:anywhere; }.pending-total { display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:16px 0; }.pending-total strong { font-size:20px; }.notice { margin:16px 0; }.notice-action { margin-top:10px; }.receipt-item { margin-top:8px; overflow-wrap:anywhere; }.pending-methods { margin:20px 0; }.pending-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:12px; margin-top:20px; }.recovery-items { padding-left:20px; font-size:13px; color:var(--muted); }.load-alert { margin-bottom:20px; }.load-alert button { margin-top:12px; }
.section-skeleton { height:280px; margin-bottom:22px; }.summary-skeleton { height:440px; }.orders-skeleton { height:200px; margin-bottom:20px; }.reading { opacity:.55; }
@media (max-width:700px) {
  .checkout-item { flex-wrap:wrap; }
  .checkout-item > img { flex-shrink:0; }
  .checkout-item > div { min-width:0; }
  .checkout-item > b { min-width:0; max-width:100%; margin-left:auto; white-space:normal; overflow-wrap:anywhere; text-align:right; }
  .payment-summary :is(.money-row,.summary-total) { flex-wrap:wrap; gap:8px 15px; }
  .payment-summary :is(.money-row,.summary-total) > b { min-width:0; max-width:100%; margin-left:auto; overflow-wrap:anywhere; text-align:right; }
  .balance-row > span,.pending-total strong { min-width:0; max-width:100%; overflow-wrap:anywhere; }
}
</style>
