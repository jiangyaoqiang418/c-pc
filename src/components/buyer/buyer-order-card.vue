<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

interface Props {
  order: Api.RealOrder.DisplayRecord;
}
const props = defineProps<Props>();
defineEmits<{
  (e: 'change-price', order: Api.RealOrder.DisplayRecord): void;
  (e: 'upload-proof', order: Api.RealOrder.DisplayRecord): void;
  (e: 'upload-shipping', order: Api.RealOrder.DisplayRecord): void;
  (e: 'manage-logistics', order: Api.RealOrder.DisplayRecord): void;
}>();

const router = useRouter();
const cover = computed(() => props.order.productCover || PRODUCT_IMAGE_PLACEHOLDER);

function goDetail() {
  router.push({ name: 'order-detail', params: { id: String(props.order.id) } });
}
function goIm() {
  router.push({ name: 'im-order-group', params: { orderCode: props.order.code } });
}
</script>

<template>
  <div class="buyer-order-card">
    <div class="head">
      <span class="code">{{ order.code }}</span>
      <span class="time">{{ new Date(order.createdAt).toLocaleString() }}</span>
      <OrderStatusTag :status="order.status" />
    </div>

    <div class="body">
      <div
        class="cover-wrap"
        role="link"
        tabindex="0"
        :aria-label="`打开订单 ${order.code} 的商品详情`"
        @click="goDetail"
        @keydown.enter="goDetail"
        @keydown.space.prevent="goDetail"
      >
        <img :src="cover" :alt="order.productTitle" class="cover" @error="setImageFallback" />
      </div>
      <div class="info">
        <div class="title" role="link" tabindex="0" :aria-label="`打开订单 ${order.code} 的商品详情`" @click="goDetail" @keydown.enter="goDetail" @keydown.space.prevent="goDetail">{{ order.productTitle }}</div>
        <div class="meta-row">
          <span class="tag-chip">
            <Icon icon="lucide:user" width="11" />
            {{ order.customerName }}
          </span>
          <span class="tag-chip">
            <Icon icon="lucide:map-pin" width="11" />
            {{ order.receiverName }} · {{ order.receiverPhone }}
          </span>
        </div>
        <div class="address">
          <Icon icon="lucide:navigation" width="11" /> {{ order.shippingAddress }}
        </div>
      </div>
      <div class="amount">
        <div class="amount-label">订单收入</div>
        <div class="amount-cny">{{ formatUsdt(order.totalAmount) }}</div>
        <div class="amount-usdt">≈ {{ formatCny(order.totalAmount) }}</div>
      </div>
    </div>

    <div class="actions" @click.stop>
      <button class="btn ghost" @click="goDetail">
        <Icon icon="lucide:external-link" width="14" /> 订单详情
      </button>
      <button class="btn ghost" @click="goIm">
        <Icon icon="lucide:message-square" width="14" /> 三方群
      </button>
      <button
        v-if="order.status === 'PENDING_PAYMENT'"
        class="btn primary"
        @click="$emit('change-price', order)"
      >
        <Icon icon="lucide:badge-dollar-sign" width="14" /> 修改价格
      </button>
      <template v-else-if="order.status === 'PROCURING'">
        <button class="btn ghost" @click="$emit('upload-proof', order)">
          <Icon icon="lucide:upload" width="14" /> 上传采购截图
        </button>
        <button class="btn primary" @click="$emit('upload-shipping', order)">
          <Icon icon="lucide:package" width="14" /> 填写发货
        </button>
      </template>
      <button
        v-else-if="order.status === 'PROCURED'"
        class="btn primary"
        @click="$emit('upload-shipping', order)"
      >
        <Icon icon="lucide:package" width="14" /> 上传发货
      </button>
      <template v-else-if="['IN_TRANSIT', 'AFTERSALE_CONFIRM'].includes(order.status)">
        <button class="btn ghost" @click="$emit('manage-logistics', order)">
          <Icon icon="lucide:route" width="14" /> 物流管理
        </button>
        <span class="status-note"><Icon icon="lucide:truck" width="12" /> 等待顾客签收</span>
      </template>
      <span v-else-if="order.status === 'COMPLETED'" class="status-note success">
        <Icon icon="lucide:check-circle-2" width="12" /> 订单已完成
      </span>
    </div>
  </div>
</template>

<style scoped>
.buyer-order-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: var(--yb-radius-card);
  padding: 18px 22px;
  margin-bottom: 14px;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.24s, border-color 0.24s;
}
.buyer-order-card:hover {
  transform: translateY(-2px);
  border-color: transparent;
  box-shadow: var(--yb-shadow-2);
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--yb-hairline);
  font-size: 12px;
}
.code {
  font-family: var(--yb-font-mono);
  color: var(--yb-ink);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.time {
  color: var(--yb-faint);
  font-size: 11px;
  flex: 1;
  font-family: var(--yb-font-mono);
}
.body {
  display: grid;
  grid-template-columns: 88px 1fr auto;
  gap: 18px;
  align-items: flex-start;
  padding: 14px 0;
}
.cover-wrap {
  cursor: pointer;
  overflow: hidden;
  border-radius: var(--yb-radius-md);
}
.cover {
  width: 88px;
  height: 88px;
  object-fit: cover;
  display: block;
  transition: transform 0.5s;
  background: var(--yb-hairline);
}
.cover-wrap:hover .cover {
  transform: scale(1.06);
}
.cover-wrap:focus-visible,
.title:focus-visible {
  outline: 2px solid var(--yb-brand-primary, #165dff);
  outline-offset: 2px;
  border-radius: 4px;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-ink);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.005em;
}
.title:hover {
  color: var(--yb-primary);
}
.meta-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--yb-bg);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  color: var(--yb-muted);
}
.address {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--yb-faint);
}
.amount {
  text-align: right;
  min-width: 130px;
}
.amount-label {
  font-size: 11px;
  color: var(--yb-muted);
  margin-bottom: 4px;
}
.amount-cny {
  font-family: var(--yb-font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--yb-success);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-muted);
  margin-top: 2px;
}
.actions {
  display: flex;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--yb-hairline);
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: var(--yb-radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s;
  border: 1px solid transparent;
}
.btn.ghost {
  background: var(--yb-bg);
  color: var(--yb-ink-2);
  border-color: var(--yb-hairline);
}
.btn.ghost:hover {
  background: var(--yb-surface);
  border-color: var(--yb-ink);
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
}
.status-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--yb-primary-soft);
  color: var(--yb-primary);
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 500;
}
.status-note.success {
  background: var(--yb-success-soft);
  color: var(--yb-success);
}
</style>
