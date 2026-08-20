<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { enums, formatAmount } from '@shared';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
import { RequestError } from '@/service/request';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import AddressSelector from '@/components/common/address-selector.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useCartStore, useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const cart = useCartStore();

const addressId = ref<string | number>();
const selectedAddr = ref<{
  receiverName: string;
  receiverPhone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}>();
const wallet = ref<Api.User.WalletSummary>();
const agreed = ref(false);
const submitting = ref(false);
const backendSelfPurchaseProductIds = ref<string[]>([]);

interface PendingCheckout {
  idempotencyKey: string;
  productIds: Array<string | number>;
  orderItems: Api.RealOrder.OrderCreateItemParams[];
  orderGroupNo?: string;
  orderIds?: Array<string | number>;
  firstOrderId?: string | number;
}

const pendingCheckout = ref<PendingCheckout>();

const items = computed(() => cart.selectedItems);
const overseasItems = computed(() => items.value.filter(i => i.product?.overseasCustoms));
const subTotal = computed(() => cart.subTotal);
const shippingFeeTotal = computed(() => cart.shippingFeeTotal);
const taxTotal = computed(() => cart.taxTotal);
const grandTotal = computed(() => cart.grandTotal);
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

const availableBalance = computed(() => Number(wallet.value?.available || 0));
const balanceEnough = computed(() => availableBalance.value >= Number(grandTotal.value));

function pendingStorageKey(userId: string | number) {
  return `cpc:checkout:pending:${userId}`;
}

function savePendingCheckout(value: PendingCheckout) {
  pendingCheckout.value = value;
  localStorage.setItem(pendingStorageKey(userStore.currentUser!.id), JSON.stringify(value));
}

function clearPendingCheckout() {
  pendingCheckout.value = undefined;
  localStorage.removeItem(pendingStorageKey(userStore.currentUser!.id));
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

function shouldDiscardPending(pending: PendingCheckout) {
  return !pending.orderIds?.length && !hasSameOrderItems(pending.orderItems, currentOrderItems());
}

function isSelfPurchaseError(error: unknown) {
  return error instanceof RequestError && /不能购买自己(?:的|发布的)?商品/.test(error.message);
}

onMounted(async () => {
  if (!userStore.currentUser) {
    router.replace({ name: 'login', query: { redirect: '/checkout' } });
    return;
  }
  await cart.refresh();
  if (items.value.length === 0) {
    Message.warning('请先选择要结算的商品');
    router.replace('/cart');
    return;
  }
  try {
    const raw = localStorage.getItem(pendingStorageKey(userStore.currentUser.id));
    if (raw) {
      const cached = JSON.parse(raw) as PendingCheckout;
      if (cached.idempotencyKey && Array.isArray(cached.productIds) && Array.isArray(cached.orderItems)) {
        if (shouldDiscardPending(cached)) {
          localStorage.removeItem(pendingStorageKey(userStore.currentUser.id));
        } else {
          pendingCheckout.value = cached;
        }
      } else {
        localStorage.removeItem(pendingStorageKey(userStore.currentUser.id));
      }
    }
  } catch {
    localStorage.removeItem(pendingStorageKey(userStore.currentUser.id));
  }
  wallet.value = (await realWalletApi.fetchWalletOverview(userStore.currentUser.id)).summary;
});

async function submit() {
  if (selfSoldItems.value.length) {
    Message.error(`不能购买自己发布的商品：${selfSoldTitles.value}`);
    return;
  }
  if (!agreed.value) {
    Message.warning('请阅读并同意协议');
    return;
  }
  if (!selectedAddr.value) {
    Message.warning('请选择收货地址');
    return;
  }
  if (!balanceEnough.value) {
    Message.error({
      content: '钱包余额不足，请前往钱包链上充值',
      duration: 3500
    });
    setTimeout(() => router.push('/wallet/deposit'), 600);
    return;
  }
  if (overseasItems.value.length > 0) {
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: '海外直邮商品提醒',
        content: `订单包含 ${overseasItems.value.length} 件海外直邮商品，过关后不支持退换，请确认。`,
        okText: '确认提交',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    if (!confirmed) return;
  }
  await doSubmit();
}

async function doSubmit() {
  submitting.value = true;
  let activePending: PendingCheckout | undefined;
  let createBatchStarted = false;
  try {
    if (!addressId.value) throw new Error('未选择收货地址');
    if (pendingCheckout.value && shouldDiscardPending(pendingCheckout.value)) clearPendingCheckout();
    const pending: PendingCheckout = pendingCheckout.value ?? {
        idempotencyKey: crypto.randomUUID(),
        productIds: items.value.map(item => item.productId),
        orderItems: currentOrderItems()
      };
    activePending = pending;
    if (!pending.orderIds?.length) {
      savePendingCheckout(pending);
      createBatchStarted = true;
      const orderGroup = await realOrderApi.createOrders({
        addressId: addressId.value,
        items: pending.orderItems,
        idempotencyKey: pending.idempotencyKey
      }, { showError: false });
      if (!orderGroup.orderIds.length) throw new Error('下单未返回订单 ID');
      pending.orderGroupNo = orderGroup.orderGroupNo;
      pending.orderIds = orderGroup.orderIds;
      pending.firstOrderId = orderGroup.orderIds[0];
      savePendingCheckout(pending);
    }
    if (pending.orderGroupNo) {
      await realOrderApi.payOrderGroup(pending.orderGroupNo, { showError: false });
    } else {
      const paymentResults = await Promise.allSettled(
        pending.orderIds.map(id => realOrderApi.payOrder(id, { showError: false }))
      );
      const failedOrderIds = pending.orderIds.filter((_, index) => paymentResults[index].status === 'rejected');
      if (failedOrderIds.length) {
        pending.orderIds = failedOrderIds;
        savePendingCheckout(pending);
        throw new Error(`已创建订单，其中 ${failedOrderIds.length} 笔待付款。请检查余额后重试，系统不会重复下单。`);
      }
    }
    const firstOrderId = pending.firstOrderId;
    pending.productIds.forEach(productId => cart.remove(productId));
    clearPendingCheckout();
    wallet.value = (await realWalletApi.fetchWalletOverview(userStore.currentUser!.id)).summary;
    Message.success('支付成功');
    if (firstOrderId) router.push({ name: 'checkout-success', params: { orderId: String(firstOrderId) } });
  } catch (error) {
    if (createBatchStarted && !activePending?.orderIds?.length && error instanceof RequestError) {
      if (isSelfPurchaseError(error) && activePending) {
        backendSelfPurchaseProductIds.value = [
          ...new Set([...backendSelfPurchaseProductIds.value, ...activePending.productIds.map(String)])
        ];
      }
      clearPendingCheckout();
    }
    Message.error(error instanceof Error ? error.message : '订单提交失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="checkout-page">
    <div v-if="items.length" class="container">
      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">1. 收货信息</div>
        <AddressSelector
          v-if="userStore.currentUser"
          v-model="addressId"
          :user-id="userStore.currentUser.id"
          @changed="(a) => (selectedAddr = a)"
        />
      </a-card>

      <a-card class="step-card" :body-style="{ padding: '20px 24px' }">
        <div class="step-title">2. 商品清单 <span class="muted">· {{ items.length }} 种 {{ cart.selectedQty }} 件</span></div>
        <div v-if="overseasItems.length" class="overseas-warn">
          🌏 以下 {{ overseasItems.length }} 件商品来自海外直邮，过关后不可退货退款
        </div>
        <div class="goods-list">
          <div v-for="item in items" :key="item.productId" class="goods-row">
            <img :src="item.product?.images?.[0]?.url || `https://picsum.photos/seed/${item.productId}/80/80`" :alt="item.product?.title || '商品图片'" class="cover" />
            <div class="info">
              <div class="title">{{ item.product?.title }}</div>
              <div class="tags">
                <a-tag v-if="item.product" :color="enums.AFTERSALE_TYPE_META[item.product.aftersaleType].color" size="small">
                  {{ enums.AFTERSALE_TYPE_META[item.product.aftersaleType].label }}
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
            可用 U {{ formatAmount(availableBalance) }} {{ balanceEnough ? '' : '· 余额不足' }}
          </span>
        </div>
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
            <a-link>《用户协议》</a-link>
            <a-link>《隐私政策》</a-link>
          </a-checkbox>
        </div>

        <div class="submit-row">
          <div class="submit-meta">
            <span class="muted">应付：</span>
            <span class="grand">{{ formatUsdt(grandTotal) }}</span>
            <span class="grand-usdt">≈ {{ formatCny(grandTotal) }}</span>
          </div>
          <a-button type="primary" size="large" :loading="submitting" :disabled="!agreed || selfSoldItems.length > 0" @click="submit">
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
