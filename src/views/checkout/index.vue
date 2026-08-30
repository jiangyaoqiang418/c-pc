<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { formatAmount } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
import * as productApi from '@/service/api/product';
import { readCheckoutIntent, clearCheckoutIntent, prepareCheckoutPayment, canDiscardRejectedCheckout, cleanupPaidCheckout,
  readPendingCheckout, pendingCheckoutStorageKey as pendingStorageKey, type PendingCheckout } from '@/utils/checkout';
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

const router = useRouter();
const route = useRoute();
const contextId = computed(() => typeof route.query.contextId === 'string' ? route.query.contextId : '');
const contextItems = ref<Array<{ productId: string | number; quantity: number }>>([]);
const userStore = useUserStore();
const cart = useCartStore();
const requestGuard = createLatestRequestGuard();
const walletGuard = createLatestRequestGuard();
const walletLoading = ref(false);
const walletError = ref('');

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
const unpaidOrders = computed(() => pendingOrders.value.filter(order => getOrderCapabilities(order, userStore.currentUser?.id).pay));
const pendingTotal = computed(() => unpaidOrders.value.reduce((sum, order) => sum + Number(order.totalAmount), 0));

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
  void router.push({ name: 'checkout-success', params: { orderId: String(orderId) } }).catch(() => {
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
  const pending = pendingCheckout.value;
  const userId = userStore.currentUser?.id;
  if (!pending?.orderIds?.length || userId === undefined || submitting.value || loading.value || loadError.value) return;
  const orderIds = [...pending.orderIds];
  if (!agreed.value || !unpaidOrders.value.length || !Number.isFinite(pendingTotal.value)) {
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
      const latest = await Promise.all(orderIds.map(id => realOrderApi.fetchOrderDetail(id)));
      if (!isCurrent()) return;
      const payment = prepareCheckoutPayment(confirmedOrders, latest, userId, pending.orderGroupNo);
      pendingOrders.value = latest;
      if (payment.changed) {
        agreed.value = false;
        Message.warning('已有订单状态或金额已更新，请重新确认');
        return;
      }
      const payable = payment.payable;
      if (payment.orderGroupNo) {
        await realOrderApi.payOrderGroup(payment.orderGroupNo, { showError: false });
      } else {
        const results = await Promise.allSettled(payable.map(order => realOrderApi.payOrder(order.id, { showError: false })));
        if (!isCurrent()) return;
        if (results.some(result => result.status === 'rejected')) throw new Error('部分订单付款未确认，请核对最新状态后重试');
      }
      if (!isCurrent()) return;
      const purchasedProducts = new Set(latest.filter(order => !['CANCELLED', 'REFUNDED'].includes(order.status)).map(order => String(order.productId)));
      await finishPaidCheckout(pending, payable[0].id,
        pending.cartSnapshot?.filter(item => purchasedProducts.has(String(item.productId))));
    });
  } catch (error) {
    if (!isCurrent()) return;
    Message.error(error instanceof Error ? error.message : '支付结果未确认，请重新读取订单状态');
    await load();
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

function checkoutSignature() {
  return JSON.stringify([userStore.currentUser?.id, contextId.value, currentOrderItems(), addressId.value, grandTotal.value]);
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
  try {
    pendingOrders.value = [];
    pendingCheckout.value = undefined;
    pendingCheckout.value = readPendingCheckout(userId!);
    if (pendingCheckout.value?.orderIds?.length) {
      const orders = await Promise.all(pendingCheckout.value.orderIds.map(id => realOrderApi.fetchOrderDetail(id, { signal: isCurrent.signal })));
      if (!isCurrent() || String(userStore.currentUser?.id) !== String(userId)) return;
      if (orders.some((order, index) => String(order.id) !== String(pendingCheckout.value?.orderIds?.[index]))) {
        throw new Error('订单回读对象不一致，请从我的订单重新核对');
      }
      if (orders.some(order => !getOrderCapabilities(order, userId).isCustomer)) throw new Error('已有订单不属于当前顾客');
      pendingOrders.value = orders;
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

onMounted(load);
onBeforeUnmount(() => {
  writeVersion += 1;
  cancelConfirmation?.();
  confirmationModal?.close();
  requestGuard.invalidate();
  walletGuard.invalidate();
  if (insufficientBalanceTimer) clearTimeout(insufficientBalanceTimer);
  insufficientBalanceTimer = undefined;
});
watch([() => userStore.currentUser?.id, () => route.query.contextId], () => {
  cancelConfirmation?.();
  confirmationModal?.close();
  requestGuard.invalidate();
  walletGuard.invalidate();
  walletLoading.value = false;
  walletError.value = '';
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
});

async function submit() {
  if (submitting.value || confirmationPending.value) return;
  if (hasCreatedOrders.value) {
    await payPendingOrders();
    return;
  }
  if (loading.value || walletLoading.value || cart.mutating || checkoutItems.value.some(item => !item.available)) {
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
  if (availableBalance.value === undefined) {
    Message.warning('可用余额尚未取得，请重新加载核对后再提交');
    return;
  }
  if (!balanceEnough.value) {
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
  await doSubmit();
}

async function doSubmit() {
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
          if (orderGroup.totalAmount === undefined || Number(orderGroup.totalAmount) !== Number(grandTotal.value)) {
            throw new Error('订单实际金额已变化，请在订单详情确认金额后付款');
          }
        }
        if (pending.orderGroupNo) {
          await realOrderApi.payOrderGroup(pending.orderGroupNo, { showError: false });
          if (!isCurrentWrite()) return;
        } else {
          const paymentResults = await Promise.allSettled(
            pending.orderIds.map(id => realOrderApi.payOrder(id, { showError: false }))
          );
          const failedOrderIds = pending.orderIds.filter((_, index) => paymentResults[index].status === 'rejected');
          if (!isCurrentWrite()) return;
          if (failedOrderIds.length) {
            savePendingCheckout(pending);
            throw new Error(`已创建订单，其中 ${failedOrderIds.length} 笔待付款。请检查余额后重试，系统不会重复下单。`);
          }
        }
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
      Message.error(error instanceof Error ? error.message : '订单提交失败，请稍后重试');
      if (hasCreatedOrders.value) await load();
    }
  } finally {
    if (operation === writeVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="checkout-page">
    <a-alert v-if="loadError" type="error" :closable="false" class="load-alert">
      {{ loadError }}
      <template #action><a-button size="mini" :loading="loading" @click="load">重新加载</a-button></template>
    </a-alert>
    <div v-if="hasCreatedOrders" class="container">
      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <h2>继续已创建订单</h2>
        <p>以下为上次下单生成的真实订单，不使用当前购物车的商品、地址或金额。已付款或已结束的订单不会再次付款。</p>
        <a-spin :loading="loading" style="width: 100%">
          <div v-for="order in pendingOrders" :key="String(order.id)" class="step-card">
            <a-link @click="router.push({ name: 'order-detail', params: { id: String(order.id) } })">订单 {{ order.code }}</a-link>
            <OrderStatusTag :status="order.status" />
            <p>{{ order.productTitle }} · 数量 {{ order.quantity ?? '待核对' }} · U {{ formatAmount(order.totalAmount) }}</p>
            <p>收货地址：{{ order.shippingAddress }}</p>
          </div>
        </a-spin>
        <p>本次待付款：{{ unpaidOrders.length }} 笔 · U {{ formatAmount(pendingTotal) }}</p>
        <a-checkbox v-if="unpaidOrders.length" v-model="agreed">已核对上述订单及待付金额</a-checkbox>
        <a-space>
          <a-button v-if="unpaidOrders.length" type="primary" :disabled="!agreed || loading || !!loadError" :loading="submitting" @click="payPendingOrders">支付上述待付款订单</a-button>
          <a-button :disabled="submitting" @click="startNewCheckout">开始新的结算（保留已有订单）</a-button>
          <a-button @click="router.push({ name: 'order-list' })">查看我的订单</a-button>
        </a-space>
      </a-card>
    </div>
    <div v-else-if="items.length" class="container">
      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">1. 收货信息</div>
        <AddressSelector
          v-if="userStore.currentUser"
          v-model="addressId"
          :user-id="userStore.currentUser.id"
          @validity="addressValid = $event"
          @changed="(a) => (selectedAddr = a)"
        />
      </a-card>

      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">2. 商品清单 <span class="muted">· {{ items.length }} 种 {{ items.reduce((sum, item) => sum + item.qty, 0) }} 件</span></div>
        <div v-if="overseasItems.length" class="overseas-warn">
          🌏 以下 {{ overseasItems.length }} 件商品来自海外直邮，过关后不可退货退款
        </div>
        <div class="goods-list">
          <div v-for="item in items" :key="item.productId" class="goods-row">
            <img :src="item.product?.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="item.product?.title || '商品图片'" class="cover" @error="setImageFallback" />
            <div class="info">
              <div class="title">{{ item.product?.title }}</div>
              <div class="tags">
                <a-tag v-if="item.product" :color="productApi.getAftersaleMeta(item.product.aftersaleType).color" size="small">
                  {{ productApi.getAftersaleMeta(item.product.aftersaleType).label }}
                </a-tag>
                <a-tag v-if="item.product?.overseasCustoms" color="orange" size="small">海外直邮</a-tag>
                <span class="seller">买手 · {{ item.product?.sellerName }}</span>
              </div>
            </div>
            <div class="qty">×{{ item.qty }}</div>
            <div class="amount">
              <span class="amount-cny">{{ formatUsdt(item.lineTotal) }}</span>
              <span class="amount-usdt">≈ {{ formatCny(item.lineTotal) }}</span>
            </div>
          </div>
        </div>
      </a-card>

      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">3. 金额明细</div>
        <div class="amount-list">
          <div class="am-row">
            <span class="am-label">商品合计</span>
            <span class="am-val">
              <span class="cny">{{ formatUsdt(subTotal) }}</span>
              <span class="usdt">≈ {{ formatCny(subTotal) }}</span>
            </span>
          </div>
          <div class="am-row">
            <span class="am-label">运费合计</span>
            <span class="am-val">
              <span class="cny">{{ formatUsdt(shippingFeeTotal) }}</span>
              <span class="usdt">≈ {{ formatCny(shippingFeeTotal) }}</span>
            </span>
          </div>
          <div class="am-row">
            <span class="am-label">
              税费合计
              <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="12" />
            </span>
            <span class="am-val">
              <span class="cny">{{ formatUsdt(taxTotal) }}</span>
              <span class="usdt">≈ {{ formatCny(taxTotal) }}</span>
            </span>
          </div>
          <div class="am-row total">
            <span class="am-label">应付总额</span>
            <span class="am-val">
              <span class="cny total-cny">{{ formatUsdt(grandTotal) }}</span>
              <span class="usdt">≈ {{ formatCny(grandTotal) }} · {{ priceSet(grandTotal).rateLabel }}</span>
            </span>
          </div>
        </div>
      </a-card>

      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">4. 支付</div>
        <div class="pay-row">
          <span class="pay-name">使用钱包余额支付</span>
          <span class="pay-meta" :class="{ insufficient: !balanceEnough }">
            可用 U {{ formatAmount(availableBalance) }} {{ availableBalance === undefined ? '· 余额待确认' : balanceEnough ? '' : '· 余额不足' }}
          </span>
        </div>
        <a-alert v-if="walletError" type="warning" :closable="false">
          {{ walletError }}；商品、收货地址及协议选择保持不变。
          <template #action><a-button size="mini" :loading="walletLoading" :disabled="loading || submitting || confirmationPending" @click="loadWallet">重新读取余额</a-button></template>
        </a-alert>
        <p class="pay-meta">当前 Swagger 仅提供钱包余额支付，OKX 支付入口将在后端提供真实支付契约后开放。</p>
        <a-alert
          v-if="selfSoldItems.length"
          type="error"
          :title="`不能购买自己发布的商品：${selfSoldTitles}`"
          content="请返回购物车移除该商品，或选择其他买手的商品后再结算。"
          class="self-purchase-alert"
        />

        <a-divider />

        <div class="agree-row">
          <a-checkbox v-model="agreed">
            我已阅读并同意
            <a-link role="link" tabindex="0" @click.stop="router.push({ path: '/help', query: { agreement: 'user' } })" @keydown.enter.stop="router.push({ path: '/help', query: { agreement: 'user' } })" @keydown.space.stop.prevent="router.push({ path: '/help', query: { agreement: 'user' } })">《用户协议》</a-link>
            <a-link role="link" tabindex="0" @click.stop="router.push({ path: '/help', query: { agreement: 'privacy' } })" @keydown.enter.stop="router.push({ path: '/help', query: { agreement: 'privacy' } })" @keydown.space.stop.prevent="router.push({ path: '/help', query: { agreement: 'privacy' } })">《隐私政策》</a-link>
          </a-checkbox>
        </div>

        <div class="submit-row">
          <div class="submit-meta">
            <span class="muted">应付：</span>
            <span class="grand">{{ formatUsdt(grandTotal) }}</span>
            <span class="grand-usdt">≈ {{ formatCny(grandTotal) }}</span>
          </div>
          <a-button type="primary" size="large" :loading="submitting || confirmationPending" :disabled="!agreed || !addressValid || selfSoldItems.length > 0 || !!loadError || loading || walletLoading || availableBalance === undefined" @click="submit">
            提交订单
          </a-button>
        </div>
      </a-card>
    </div>

    <EmptyState v-else title="没有选中要结算的商品" action-text="回到购物车" @action="router.push('/cart')" />
  </div>
</template>

<style scoped>
.checkout-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 16px;
}
.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.step-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.step-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.overseas-warn {
  background: #fff7e6;
  color: #ff7d00;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  border-left: 3px solid #ff7d00;
}
.goods-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.goods-row {
  display: grid;
  grid-template-columns: 60px 1fr 80px 120px;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed #f2f3f5;
}
.cover {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  background: #f7f8fa;
}
.title {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.seller {
  font-size: 11px;
  color: #86909c;
}
.qty {
  text-align: center;
  color: #4e5969;
}
.amount {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.amount-cny {
  color: var(--yb-ink);
  font-weight: 700;
  font-family: var(--yb-font-mono);
  font-size: 15px;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-size: 11px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  margin-top: 2px;
}

/* Amount list */
.amount-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.am-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px dashed var(--yb-hairline);
}
.am-row:last-child { border-bottom: none; }
.am-row.total {
  border-top: 1px solid var(--yb-hairline);
  border-bottom: none;
  padding-top: 14px;
  margin-top: 4px;
}
.am-label {
  color: var(--yb-muted);
  font-size: 13px;
}
.am-val {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}
.am-val .cny {
  color: var(--yb-ink);
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.am-val .usdt {
  font-size: 11px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  margin-top: 2px;
}
.total-cny {
  font-size: 26px !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em;
}
.pay-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.pay-name {
  font-weight: 500;
  color: #1d2129;
}
.pay-meta {
  font-size: 12px;
  color: #86909c;
}
.self-purchase-alert {
  margin-top: 12px;
}
.pay-meta.insufficient {
  color: #f53f3f;
}
.agree-row {
  margin: 12px 0;
}
.submit-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 24px;
}
.submit-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.grand {
  font-family: var(--yb-font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.grand-usdt {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  color: var(--yb-muted);
  margin-left: 4px;
}
.muted {
  color: #86909c;
  font-size: 13px;
}
</style>
