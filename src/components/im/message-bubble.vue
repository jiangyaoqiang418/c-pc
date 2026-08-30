<script setup lang="ts">
import { computed } from 'vue';
import { parseOrderMessageCard } from '@/utils/im';

interface Props {
  msg: Api.RealNotify.ImMessageVO;
  side: 'left' | 'right' | 'center';
  senderName?: string;
  readText?: string;
  canRecall?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'recall', message: Api.RealNotify.ImMessageVO): void;
  (e: 'retry', message: Api.RealNotify.ImMessageVO): void;
  (e: 'open-order', orderId: string | number): void;
  (e: 'preview-image', url: string): void;
}>();

const type = computed(() => String(props.msg.msgType || 'TEXT').toUpperCase());
const isSystem = computed(() => type.value === 'SYSTEM');
const isOrderCard = computed(() => type.value === 'ORDER_CARD');
const isImage = computed(() => type.value === 'IMAGE');
const isVoice = computed(() => type.value === 'VOICE');

const time = computed(() => {
  if (!props.msg.createdAt) return '—';
  const raw = props.msg.createdAt;
  const date = new Date(typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
});

const systemContent = computed(() => {
  const params = props.msg.params || {};
  const eventType = String(props.msg.eventType || '').toUpperCase();
  const statusText = String(params.statusText || '');
  const templates: Record<string, string> = {
    CREATED: '订单已创建',
    PRICE_CHANGED: `订单价格已更新${params.amount ? `：${params.amount} ${params.currency || 'USDT'}` : ''}`,
    PAID: '订单已付款',
    SHIPPED: '买手已发货',
    COMPLETED: '订单已完成',
    SETTLED: '订单货款已结算',
    CANCELED: '订单已取消',
    REFUND_APPLIED: '买家已申请仅退款',
    REFUND_AGREED: '平台已同意退款',
    REFUND_REJECTED: '平台已驳回退款',
    REFUND_CANCELED: '买家已撤销退款申请'
  };
  return templates[eventType] || statusText || props.msg.content || '订单状态已更新';
});

const orderCard = computed(() => isOrderCard.value ? parseOrderMessageCard(props.msg.content) : undefined);
</script>

<template>
  <div v-if="msg.recalled" class="msg-row center">
    <div class="bubble system">消息已撤回</div>
  </div>

  <div v-else-if="isSystem" class="msg-row center">
    <div class="bubble system">{{ systemContent }}</div>
  </div>

  <div v-else-if="isOrderCard" class="msg-row center">
    <button v-if="orderCard" class="order-card" @click="orderCard.orderId && emit('open-order', orderCard.orderId)">
      <img v-if="orderCard.productImage" :src="orderCard.productImage" alt="订单商品" class="order-cover" />
      <div class="order-card-body">
        <div class="order-title">{{ orderCard.productTitle || '订单卡片' }}</div>
        <div class="order-meta">订单号 {{ orderCard.orderNo || '—' }}</div>
        <div class="order-footer">
          <span>{{ orderCard.statusText || '查看订单' }}</span>
          <strong v-if="orderCard.amount !== undefined">{{ orderCard.currency || 'USDT' }} {{ orderCard.amount }}</strong>
        </div>
      </div>
    </button>
    <div v-else class="bubble system">{{ msg.content || '订单卡片' }}</div>
  </div>

  <div v-else class="msg-row" :class="side">
    <div class="msg-meta">
      <span class="sender-name">{{ senderName || msg.senderName || '成员' }}</span>
      <span class="time">{{ time }}</span>
    </div>

    <div v-if="isImage && msg.mediaUrl" class="bubble media" :class="side">
      <button type="button" class="media-image-button" :aria-label="'预览图片：' + (msg.content || '聊天图片')" @click="emit('preview-image', msg.mediaUrl)">
        <img :src="msg.mediaUrl" alt="图片消息" class="media-img" />
      </button>
    </div>
    <div v-else-if="isVoice" class="bubble media voice" :class="side">
      <audio v-if="msg.mediaUrl" :src="msg.mediaUrl" controls preload="metadata" />
      <span v-if="msg.duration">{{ msg.duration }} 秒</span>
    </div>
    <div v-else class="bubble text" :class="side">{{ msg.content || '—' }}</div>

    <div v-if="side === 'right'" class="message-status">
      <span v-if="msg.failed" class="failed">发送失败</span>
      <span v-else-if="msg.pending">发送中…</span>
      <span v-else-if="readText">{{ readText }}</span>
      <button v-if="canRecall" class="recall-btn" @click="emit('recall', msg)">撤回</button>
      <button v-if="msg.failed" class="recall-btn" @click="emit('retry', msg)">重新发送</button>
    </div>
  </div>
</template>

<style scoped>
.msg-row { display: flex; flex-direction: column; margin-bottom: 12px; }
.msg-row.left { align-items: flex-start; }
.msg-row.right { align-items: flex-end; }
.msg-row.center { align-items: center; }
.msg-meta { display: flex; gap: 8px; font-size: 11px; color: #86909c; margin-bottom: 4px; padding: 0 4px; }
.msg-row.right .msg-meta { flex-direction: row-reverse; }
.sender-name { font-weight: 500; }
.bubble { max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-break: break-word; }
.bubble.text.left { background: #fff; color: #1d2129; border: 1px solid #f2f3f5; }
.bubble.text.right { background: var(--bw-brand-primary); color: #fff; }
.bubble.system { background: #f2f3f5; color: #86909c; font-size: 12px; padding: 4px 12px; border-radius: 4px; border: none; }
.bubble.media { padding: 4px; background: #fff; border: 1px solid #f2f3f5; }
.bubble.media.right { background: #f3f7ff; }
.media-image-button { display: block; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: zoom-in; }
.media-img { max-width: 240px; max-height: 240px; border-radius: 8px; display: block; }
.voice { display: flex; align-items: center; gap: 8px; }
.voice audio { max-width: 260px; height: 34px; }
.message-status { display: flex; align-items: center; gap: 8px; margin-top: 3px; padding: 0 4px; color: #86909c; font-size: 10px; }
.failed { color: #f53f3f; }
.recall-btn { border: 0; padding: 0; background: transparent; color: #165dff; cursor: pointer; font-size: 10px; }
.order-card { width: 360px; max-width: 80%; padding: 0; overflow: hidden; display: flex; text-align: left; background: #fff; border: 1px solid #e5e6eb; border-radius: 10px; cursor: pointer; }
.order-cover { width: 88px; height: 88px; object-fit: cover; flex-shrink: 0; }
.order-card-body { min-width: 0; flex: 1; padding: 12px; }
.order-title { color: #1d2129; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-meta { margin-top: 5px; color: #86909c; font-size: 11px; }
.order-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; color: #4e5969; font-size: 11px; }
.order-footer strong { color: #f53f3f; }
</style>
