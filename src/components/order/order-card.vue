<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal, Textarea } from '@arco-design/web-vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import OrderStatusTag from './order-status-tag.vue';
import OrderActions from './order-actions.vue';
import OrderPaymentSelector from './order-payment-selector.vue';
import * as orderApi from '@/service/api/order';
import { requestPayPassword } from '@/utils/pay-password';
import { useUserStore } from '@/stores';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { formatDateValue } from '@/utils/date-range';
import { getOrderCapabilities } from '@/utils/order';
import { fetchLatestWalletPay, validateWalletPay } from '@/service/api/wallet-pay';
import { sumPaymentAmounts } from '@/utils/checkout';

interface Props {
  order: Api.RealOrder.DisplayRecord;
  reviewable?: boolean;
}
const props = withDefaults(defineProps<Props>(), { reviewable: false });
const emit = defineEmits<{ (e: 'changed'): void }>();

const router = useRouter();
const userStore = useUserStore();
const permissions = computed(() => getOrderCapabilities(props.order, userStore.currentUser?.id));
const cover = computed(() => props.order.productCover || PRODUCT_IMAGE_PLACEHOLDER);
const acting = ref(false);
const paymentOpen = ref(false);
const confirmationOpen = ref(false);
let actionVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

function isCurrentAction(operation: number, userId: string | number, orderId: string | number) {
  return operation === actionVersion
    && String(userStore.currentUser?.id) === String(userId)
    && String(props.order.id) === String(orderId);
}

function goDetail() {
  router.push({ name: 'order-detail', params: { id: String(props.order.id) } });
}

function pay() {
  if (!permissions.value.pay || acting.value || confirmationOpen.value) return;
  paymentOpen.value = true;
}

async function payBalance() {
  if (!permissions.value.pay) return;
  if (acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedOrderId = props.order.id;
  const requestedAmount = String(props.order.totalAmount);
  const operation = ++actionVersion;
  acting.value = true;
  try {
    const payPassword = await requestPayPassword();
    if (!payPassword || !isCurrentAction(operation, requestedUserId, requestedOrderId)) return;
    const r = await orderApi.withOrderPayment(requestedUserId, [requestedOrderId], undefined, async payment => {
      const latestOrder = await orderApi.fetchOrderDetail(requestedOrderId);
      if (!getOrderCapabilities(latestOrder, requestedUserId).pay
        || sumPaymentAmounts([latestOrder.totalAmount]) !== sumPaymentAmounts([requestedAmount])) {
        throw new Error('订单状态或金额已变化，请刷新后重新核对');
      }
      if (latestOrder.orderGroupNo) {
        const latestPay = await fetchLatestWalletPay(latestOrder.orderGroupNo);
        if (latestPay && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(latestPay, latestOrder.orderGroupNo).status)) {
          throw new Error('该订单组已有链上支付单，请先核对支付进度，勿重复付款');
        }
      }
      return payment.payOrder(requestedOrderId, String(latestOrder.totalAmount), payPassword, { showError: false });
    });
    if (!isCurrentAction(operation, requestedUserId, requestedOrderId)) return;
    if (r.ok) {
      Message.success('支付成功');
      emit('changed');
    } else {
      Message.error(r.message || '支付失败');
    }
  } catch (error) {
    if (isCurrentAction(operation, requestedUserId, requestedOrderId)) {
      Message.error(error instanceof Error ? error.message : '支付结果未确认，请核对订单');
      emit('changed');
    }
  } finally {
    if (operation === actionVersion) acting.value = false;
  }
}

function cancel() {
  if (!permissions.value.cancel) return;
  if (acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedOrderId = props.order.id;
  const operation = ++actionVersion;
  const reason = ref('');
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '取消订单？',
    content: () => h(Textarea, {
      modelValue: reason.value,
      'onUpdate:modelValue': (value: string) => { reason.value = value; },
      placeholder: '请输入取消原因（必填）',
      autoSize: { minRows: 3, maxRows: 5 }
    }),
    okText: '确认取消',
    okButtonProps: { status: 'danger' },
    onBeforeOk() {
      if (reason.value.trim()) return true;
      Message.warning('请填写取消原因');
      return false;
    },
    onCancel() {
      if (operation === actionVersion) confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentAction(operation, requestedUserId, requestedOrderId) || !permissions.value.cancel) {
        if (operation === actionVersion) confirmationOpen.value = false;
        return;
      }
      acting.value = true;
      try {
        const r = await orderApi.cancelOrder(requestedOrderId, reason.value.trim());
        if (!isCurrentAction(operation, requestedUserId, requestedOrderId)) return;
        if (r.ok) {
          Message.success('订单已取消');
          emit('changed');
        }
      } catch {
        if (isCurrentAction(operation, requestedUserId, requestedOrderId)) Message.error('取消订单请求失败，请稍后重试');
      } finally {
        if (operation === actionVersion) {
          acting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}

async function confirm() {
  if (!permissions.value.confirm) return;
  if (acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedOrderId = props.order.id;
  const operation = ++actionVersion;
  confirmationOpen.value = true;
  acting.value = true;
  try {
    const payPassword = await requestPayPassword(undefined, '确认收货');
    if (!payPassword || !isCurrentAction(operation, requestedUserId, requestedOrderId) || !permissions.value.confirm) return;
    const r = await orderApi.confirmReceipt(requestedOrderId, requestedUserId, payPassword);
    if (!isCurrentAction(operation, requestedUserId, requestedOrderId)) return;
    if (r.ok) {
      Message.success('已确认收货');
      emit('changed');
    }
  } catch (error) {
    if (isCurrentAction(operation, requestedUserId, requestedOrderId)) {
      Message.error(error instanceof Error ? error.message : '确认收货失败');
      emit('changed');
    }
  } finally {
    if (operation === actionVersion) {
      acting.value = false;
      confirmationOpen.value = false;
    }
  }
}

function extendReceipt() {
  if (!permissions.value.extendReceipt || acting.value || confirmationOpen.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedOrderId = props.order.id;
  const operation = ++actionVersion;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '延长收货？',
    content: '确认后自动收货时间将顺延 5 天，每笔订单最多可延长 5 次。',
    okText: '确认延长',
    onCancel() {
      if (operation === actionVersion) confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentAction(operation, requestedUserId, requestedOrderId) || !permissions.value.extendReceipt) {
        if (operation === actionVersion) confirmationOpen.value = false;
        return;
      }
      acting.value = true;
      try {
        const result = await orderApi.extendReceipt(requestedOrderId, requestedUserId);
        if (!isCurrentAction(operation, requestedUserId, requestedOrderId)) return;
        Message.success(result.recovered ? '已核对到延长收货结果' : '已延长收货 5 天');
        emit('changed');
      } catch (error) {
        if (isCurrentAction(operation, requestedUserId, requestedOrderId)) {
          Message.error(error instanceof Error ? error.message : '延长收货结果未确认，请核对订单');
          emit('changed');
        }
      } finally {
        if (operation === actionVersion) {
          acting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}

onBeforeUnmount(() => {
  actionVersion += 1;
  paymentOpen.value = false;
  confirmationModal?.close();
});
watch([() => props.order.id, () => userStore.currentUser?.id], () => {
  actionVersion += 1;
  paymentOpen.value = false;
  confirmationModal?.close();
  acting.value = false;
  confirmationOpen.value = false;
});

function review() {
  if (!permissions.value.review || !props.reviewable) return;
  router.push({ name: 'review-write', params: { orderId: String(props.order.id) } });
}

function aftersale() {
  if (!permissions.value.refund && !permissions.value.viewAftersale) return;
  if (props.order.status === 'IN_AFTERSALE') {
    router.push({ name: 'aftersale-list' });
  } else {
    router.push({ name: 'aftersale-create', params: { orderId: String(props.order.id) } });
  }
}

function contactShopper() {
  router.push({ name: 'im-order-group', params: { orderCode: String(props.order.id) } });
}

function viewLogistics() {
  router.push({ name: 'order-detail', params: { id: String(props.order.id) }, hash: '#logistics' });
}
</script>

<template>
  <a-card
    class="order-card"
    :bordered="false"
    :body-style="{ padding: '14px 18px' }"
    hoverable
    role="button"
    tabindex="0"
    :aria-label="`打开订单 ${order.code}`"
    @click="goDetail"
    @keydown.enter.self="goDetail"
    @keydown.space.prevent.self="goDetail"
  >
    <div class="head">
      <span class="code">订单号：{{ order.code }}</span>
      <span class="time">下单于 {{ formatDateValue(order.createdAt) }}</span>
      <span class="seller">买手：{{ order.shopperName }}</span>
      <OrderStatusTag :status="order.status" />
    </div>
    <div class="body">
      <img :src="cover" :alt="order.productTitle" class="cover" @error="setImageFallback" />
      <div class="info">
        <div class="title">{{ order.productTitle }}</div>
        <div class="addr">收货：{{ order.receiverName }} · {{ order.shippingAddress }}</div>
      </div>
      <div class="amount">
        <div class="amount-label">合计</div>
        <div class="amount-cny">{{ formatUsdt(order.totalAmount) }}</div>
        <div class="amount-usdt">≈ {{ formatCny(order.totalAmount) }}</div>
      </div>
      <div class="op" @click.stop>
        <OrderActions :order="order" :reviewable="reviewable" @pay="pay" @cancel="cancel" @confirm="confirm" @extend-receipt="extendReceipt" @detail="goDetail" @review="review" @aftersale="aftersale" @cs="contactShopper" @logistics="viewLogistics" />
      </div>
    </div>
  </a-card>
  <OrderPaymentSelector v-model:visible="paymentOpen" :order="order" @balance="payBalance" />
</template>

<style scoped>
.order-card {
  margin-bottom: 12px;
  cursor: pointer;
}
.order-card:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: 2px;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--yb-hairline);
  font-size: 13px;
  color: var(--yb-ink-2);
}
.code {
  font-family: ui-monospace, monospace;
  color: var(--yb-ink);
  font-weight: 500;
}
.time {
  color: var(--yb-muted);
  font-size: 12px;
}
.seller {
  font-size: 12px;
  color: var(--yb-ink-2);
}
.body {
  display: grid;
  grid-template-columns: 80px 1fr auto auto;
  gap: 16px;
  align-items: center;
  padding-top: 12px;
}
.cover {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--yb-fill);
}
.title {
  font-size: 14px;
  font-weight: 500;
  color: var(--yb-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.addr {
  font-size: 12px;
  color: var(--yb-muted);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.amount-label {
  font-size: 11px;
  color: var(--yb-muted);
}
.amount-cny {
  font-family: var(--yb-font-mono);
  font-size: 17px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-muted);
}
.op {
  align-self: center;
}
</style>
