<script setup lang="ts">
import { Icon } from '@iconify/vue';
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
const isVideo = computed(() => type.value === 'VIDEO');
const ROLE_META: Record<string, { label: string; cls: string }> = {
  CUSTOMER: { label: '顾客', cls: 'customer' },
  SELLER: { label: '买手', cls: 'seller' },
  ADMIN: { label: '平台', cls: 'admin' }
};
const roleMeta = computed(() => ROLE_META[String(props.msg.senderRole || '').toUpperCase()]);

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

  <div v-if="msg.recalled" class="msg-row center"><div class="bubble system"><Icon icon="lucide:undo-2" width="13" />消息已撤回</div></div>
  <div v-else-if="isSystem" class="msg-row center"><div class="bubble system">{{ systemContent }}</div></div>
  <div v-else-if="isOrderCard" class="msg-row center">
    <button v-if="orderCard" type="button" class="order-card" @click="orderCard.orderId && emit('open-order', orderCard.orderId)">
      <img v-if="orderCard.productImage" :src="orderCard.productImage" alt="订单商品" class="order-cover" />
      <div class="order-card-body">
        <div class="order-title" :title="orderCard.productTitle || '订单卡片'">{{ orderCard.productTitle || '订单卡片' }}</div>
        <div class="order-meta">订单号 {{ orderCard.orderNo || '—' }}</div>
        <div class="order-footer"><span>{{ orderCard.statusText || '查看订单' }}</span><strong v-if="orderCard.amount !== undefined">{{ orderCard.currency || 'USDT' }} {{ orderCard.amount }}</strong><Icon icon="lucide:arrow-up-right" width="15" /></div>
      </div>
    </button>
    <div v-else class="bubble system">{{ msg.content || '订单卡片' }}</div>
  </div>
  <div v-else class="msg-row" :class="side">
    <div class="msg-meta"><span class="sender-name">{{ senderName || msg.senderName || '成员' }}</span><span v-if="roleMeta" class="role-tag" :class="roleMeta.cls">{{ roleMeta.label }}</span><span class="time">{{ time }}</span></div>
    <div v-if="isImage && msg.mediaUrl" class="bubble media" :class="side">
      <button type="button" class="media-image-button" :aria-label="'预览图片：' + (msg.content || '聊天图片')" @click="emit('preview-image', msg.mediaUrl)"><img :src="msg.mediaUrl" alt="图片消息" class="media-img" /></button>
    </div>
    <div v-else-if="isVoice" class="bubble media voice" :class="side"><audio v-if="msg.mediaUrl" :src="msg.mediaUrl" controls preload="metadata" /><span v-else>语音暂不可用</span><span v-if="msg.duration">{{ msg.duration }} 秒</span></div>
    <div v-else-if="isVideo" class="bubble media video" :class="side"><video v-if="msg.mediaUrl" :src="msg.mediaUrl" :poster="msg.coverUrl || undefined" controls preload="none" playsinline /><div v-else class="video-placeholder"><Icon icon="lucide:video-off" width="22" />视频暂不可用</div><span v-if="msg.duration" class="video-duration">{{ msg.duration }} 秒</span></div>
    <div v-else class="bubble text" :class="side">{{ msg.content || '—' }}</div>
    <div v-if="side === 'right'" class="message-status" aria-live="polite">
      <span v-if="msg.failed" class="failed"><Icon icon="lucide:circle-alert" width="13" />发送失败</span><span v-else-if="msg.pending">发送中…</span><span v-else-if="readText">{{ readText }}</span>
      <button v-if="canRecall" type="button" class="recall-btn" @click="emit('recall', msg)">撤回</button><button v-if="msg.failed" type="button" class="recall-btn" @click="emit('retry', msg)">重新发送</button>
    </div>
  </div>
</template>

<style scoped>

.msg-row { display: flex; flex-direction: column; margin-bottom: 22px; }.msg-row.left { align-items: flex-start; }.msg-row.right { align-items: flex-end; }.msg-row.center { align-items: center; }
.msg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--yb-muted); margin-bottom: 6px; padding: 0 4px; }.msg-row.right .msg-meta { flex-direction: row-reverse; }.sender-name { font-weight: 600; color: var(--yb-ink-2); }.role-tag { padding: 1px 6px; border-radius: 4px; font-size: 11px; }.role-tag.customer { background: var(--yb-primary-soft); color: var(--yb-primary); }.role-tag.seller { background: var(--yb-fill); color: var(--yb-ink-2); }.role-tag.admin { background: color-mix(in srgb, var(--yb-warning) 12%, var(--yb-surface)); color: var(--yb-warning); }
.bubble { max-width: 78%; padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }.bubble.text { white-space: pre-wrap; }.bubble.text.left { border-top-left-radius: 2px; background: var(--yb-surface); color: var(--yb-ink); border: 1px solid var(--yb-hairline); }.bubble.text.right { border-top-right-radius: 2px; background: var(--yb-primary); color: var(--primary-foreground); }.bubble.system { display: inline-flex; align-items: center; gap: 6px; text-align: center; background: var(--yb-fill); color: var(--yb-muted); font-size: 12px; padding: 5px 12px; border-radius: 6px; }
.bubble.media { padding: 5px; background: var(--yb-surface); border: 1px solid var(--yb-hairline); }.bubble.media.right { background: var(--yb-primary-soft); }.media-image-button { display: block; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: zoom-in; }.media-img { max-width: 260px; max-height: 260px; border-radius: 6px; display: block; }.voice { display: flex; align-items: center; gap: 8px; }.voice audio { max-width: 260px; height: 36px; }.voice > span { font-size: 12px; color: var(--yb-muted); padding: 0 5px; }
.video { position: relative; }.video video, .video-placeholder { width: 300px; max-width: 65vw; aspect-ratio: 16 / 9; border-radius: 6px; background: var(--yb-ink); color: var(--yb-surface); display: flex; gap: 8px; align-items: center; justify-content: center; }.video-duration { display: block; padding: 3px 6px; color: var(--yb-muted); font-size: 12px; }
.message-status { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 0 4px; color: var(--yb-muted); font-size: 12px; }.failed { display: inline-flex; align-items: center; gap: 4px; color: var(--yb-danger); }.recall-btn { border: 0; padding: 2px 0; background: transparent; color: var(--yb-primary); cursor: pointer; font-size: inherit; }.recall-btn:hover { text-decoration: underline; }.recall-btn:focus-visible, .media-image-button:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 3px; }
.order-card { width: 390px; max-width: 90%; padding: 0; overflow: hidden; display: flex; text-align: left; background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 10px; cursor: pointer; transition: border-color 150ms, box-shadow 150ms; }.order-card:hover { border-color: var(--yb-primary); box-shadow: var(--yb-shadow-1); }.order-card:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 3px; }.order-cover { width: 92px; min-height: 92px; object-fit: cover; flex-shrink: 0; }.order-card-body { min-width: 0; flex: 1; padding: 14px; }.order-title { color: var(--yb-ink); font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.order-meta { margin-top: 5px; color: var(--yb-muted); font-size: 12px; overflow-wrap: anywhere; }.order-footer { display: flex; align-items: center; gap: 12px; margin-top: 10px; color: var(--yb-ink-2); font-size: 12px; }.order-footer strong { margin-left: auto; font-family: var(--font-mono); color: var(--yb-primary); }

</style>
