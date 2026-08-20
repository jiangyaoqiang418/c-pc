<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import OrderStatusTag from './order-status-tag.vue';
import OrderActions from './order-actions.vue';
import * as orderApi from '@/service/api/order';

interface Props {
  order: Api.Order.OrderRecord;
  reviewable?: boolean;
}
const props = withDefaults(defineProps<Props>(), { reviewable: false });
const emit = defineEmits<{ (e: 'changed'): void }>();

const router = useRouter();
const cover = computed(() => props.order.productCover || `https://picsum.photos/seed/${props.order.productId}/200/200`);

function goDetail() {
  router.push({ name: 'order-detail', params: { id: String(props.order.id) } });
}

async function pay() {
  const r = await orderApi.payOrder(props.order.id);
  if (r.ok) {
    Message.success('支付成功');
    emit('changed');
  } else {
    Message.error(r.message || '支付失败');
  }
}

function cancel() {
  Modal.confirm({
    title: '取消订单？',
    content: '取消后订单将不可恢复',
    okText: '确认取消',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const r = await orderApi.cancelOrder(props.order.id);
      if (r.ok) {
        Message.success('订单已取消');
        emit('changed');
      }
    }
  });
}

async function confirm() {
  Modal.confirm({
    title: '确认收货？',
    content: '请确认您已收到商品并验货无误',
    async onOk() {
      const r = await orderApi.confirmReceipt(props.order.id);
      if (r.ok) {
        Message.success('已确认收货');
        emit('changed');
      }
    }
  });
}

function review() {
  router.push({ name: 'review-write', params: { orderId: String(props.order.id) } });
}

function aftersale() {
  if (props.order.status === 'IN_AFTERSALE') {
    router.push({ name: 'aftersale-list' });
  } else {
    router.push({ name: 'aftersale-create', params: { orderId: String(props.order.id) } });
  }
}

function contactShopper() {
  router.push({ name: 'im-order-group', params: { orderCode: props.order.code } });
}
</script>

<template>
  <a-card class="order-card" :bordered="false" :body-style="{ padding: '14px 18px' }" hoverable @click="goDetail">
    <div class="head">
      <span class="code">订单号：{{ order.code }}</span>
      <span class="time">下单于 {{ new Date(order.createdAt).toLocaleString() }}</span>
      <span class="seller">买手：{{ order.shopperName }}</span>
      <OrderStatusTag :status="order.status" />
    </div>
    <div class="body">
      <img :src="cover" :alt="order.productTitle" class="cover" />
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
        <OrderActions :order="order" :reviewable="reviewable" @pay="pay" @cancel="cancel" @confirm="confirm" @detail="goDetail" @review="review" @aftersale="aftersale" @cs="contactShopper" />
      </div>
    </div>
  </a-card>
</template>

<style scoped>
.order-card {
  margin-bottom: 12px;
  cursor: pointer;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #f2f3f5;
  font-size: 13px;
  color: #4e5969;
}
.code {
  font-family: ui-monospace, monospace;
  color: #1d2129;
  font-weight: 500;
}
.time {
  color: #86909c;
  font-size: 12px;
}
.seller {
  font-size: 12px;
  color: #4e5969;
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
  background: #f7f8fa;
}
.title {
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.addr {
  font-size: 12px;
  color: #86909c;
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
