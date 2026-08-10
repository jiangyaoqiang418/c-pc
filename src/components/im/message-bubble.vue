<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  msg: Api.Im.Message | Api.RealNotify.ImMessageVO;
  side: 'left' | 'right' | 'center';
  senderName?: string;
}
const props = defineProps<Props>();

function toMockMessageType(type?: string): Api.Im.MessageType {
  const value = String(type || '').toUpperCase();
  if (value === 'IMAGE') return 'image';
  if (value === 'VOICE') return 'audio';
  if (value === 'ORDER_CARD') return 'card-order';
  if (value === 'SYSTEM') return 'system';
  return 'text';
}

function parseOrderCard(content?: string): Api.Im.CardPayload | undefined {
  if (!content) return undefined;
  try {
    const card = JSON.parse(content) as {
      productTitle?: string;
      amount?: string | number;
      orderNo?: string | number;
      productImage?: string;
      statusText?: string;
    };
    if (!card.productTitle && !card.orderNo) return undefined;
    return {
      title: card.productTitle || '订单卡片',
      subtitle: card.statusText,
      coverUrl: card.productImage,
      fields: [
        ...(card.orderNo ? [{ label: '订单号', value: String(card.orderNo) }] : []),
        ...(card.amount !== undefined ? [{ label: '金额', value: `U ${card.amount}` }] : [])
      ]
    };
  } catch {
    return undefined;
  }
}

const displayMessage = computed<Api.Im.Message>(() => {
  if ('type' in props.msg) return props.msg;
  const role = String(props.msg.senderRole || '').toUpperCase();
  const type = toMockMessageType(props.msg.msgType);
  return {
    id: props.msg.id as unknown as number,
    conversationId: props.msg.conversationId as unknown as number,
    type,
    senderId: (props.msg.senderId || 0) as unknown as number,
    senderName: role === 'SELLER' ? '买手' : role === 'ADMIN' ? '平台客服' : role === 'CUSTOMER' ? '顾客' : '系统',
    senderRole: role === 'SELLER' ? 'shopper' : role === 'ADMIN' ? 'agent' : role === 'CUSTOMER' ? 'customer' : 'ai_bot',
    content: props.msg.content,
    mediaUrl: props.msg.mediaUrl,
    cardPayload: type === 'card-order' ? parseOrderCard(props.msg.content) : undefined,
    isIntercepted: false,
    sentAt: props.msg.createdAt ? String(props.msg.createdAt) : '',
    readByIds: []
  };
});

const typeMeta = computed(() => enums.MSG_TYPE_META[displayMessage.value.type]);
const time = computed(() => {
  const raw = displayMessage.value.sentAt;
  if (!raw) return '—';
  const date = new Date(/^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
});

const isSystem = computed(() => ['system', 'system-banner'].includes(displayMessage.value.type));
const isRisk = computed(() => ['risk-warning', 'risk-intercept'].includes(displayMessage.value.type));
const isEvent = computed(() =>
  ['order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(
    displayMessage.value.type
  )
);
const isCard = computed(() => ['card-order', 'card-product', 'card-payment'].includes(displayMessage.value.type));
const isMedia = computed(() => ['image', 'video', 'audio', 'file'].includes(displayMessage.value.type));
const isText = computed(() => displayMessage.value.type === 'text');

const eventEmoji = computed(() => {
  const m: Record<string, string> = {
    'order-paid': '💸',
    'order-shipped': '📦',
    'order-delivered': '🎁',
    'price-change': '🏷️',
    'refund-request': '💰',
    'presale-merged': '🔗'
  };
  return m[displayMessage.value.type] || '📢';
});
</script>

<template>
  <!-- 系统消息（居中） -->
  <div v-if="isSystem" class="msg-row center">
    <div class="bubble system">
      {{ displayMessage.content || typeMeta.label }}
    </div>
  </div>

  <!-- 事件消息（居中卡片） -->
  <div v-else-if="isEvent" class="msg-row center">
    <div class="bubble event">
      <span class="emoji">{{ eventEmoji }}</span>
      <span class="event-label">{{ typeMeta.label }}</span>
      <span class="event-content">{{ displayMessage.content || '—' }}</span>
    </div>
  </div>

  <!-- 风险消息（居中横幅） -->
  <div v-else-if="isRisk" class="msg-row center">
    <div class="bubble risk" :class="displayMessage.type">
      <span class="emoji">⚠️</span>
      <span class="risk-label">{{ typeMeta.label }}</span>
      <span class="risk-content">{{ displayMessage.content || '本消息已被平台风控拦截' }}</span>
    </div>
  </div>

  <!-- 普通对话气泡 -->
  <div v-else class="msg-row" :class="side">
    <div class="msg-meta">
      <span class="sender-name">{{ senderName || displayMessage.senderName }}</span>
      <span class="time">{{ time }}</span>
    </div>

    <!-- 文本 -->
    <div v-if="isText" class="bubble text" :class="side">
      {{ displayMessage.content }}
    </div>

    <!-- 卡片消息 -->
    <div v-else-if="isCard && displayMessage.cardPayload" class="bubble card" :class="side">
      <div v-if="displayMessage.cardPayload.coverUrl" class="card-cover">
        <img :src="displayMessage.cardPayload.coverUrl" />
      </div>
      <div class="card-body">
        <div class="card-title">{{ displayMessage.cardPayload.title }}</div>
        <div v-if="displayMessage.cardPayload.subtitle" class="card-sub">{{ displayMessage.cardPayload.subtitle }}</div>
        <div v-if="displayMessage.cardPayload.fields?.length" class="card-fields">
          <div v-for="f in displayMessage.cardPayload.fields" :key="f.label" class="card-field">
            <span class="f-lbl">{{ f.label }}</span>
            <span class="f-val">{{ f.value }}</span>
          </div>
        </div>
        <a-link v-if="displayMessage.cardPayload.linkText && displayMessage.cardPayload.linkUrl" size="small">
          {{ displayMessage.cardPayload.linkText }} ›
        </a-link>
      </div>
    </div>

    <!-- 媒体消息 -->
    <div v-else-if="isMedia" class="bubble media" :class="side">
      <img v-if="displayMessage.type === 'image' && displayMessage.mediaUrl" :src="displayMessage.mediaUrl" class="media-img" />
      <div v-else class="media-fallback">
        <span class="emoji">{{ displayMessage.type === 'video' ? '🎬' : displayMessage.type === 'audio' ? '🎙' : '📎' }}</span>
        <span>{{ displayMessage.mediaName || typeMeta.label }}</span>
      </div>
    </div>

    <!-- 其他 -->
    <div v-else class="bubble text" :class="side">
      {{ displayMessage.content || typeMeta.label }}
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}
.msg-row.left {
  align-items: flex-start;
}
.msg-row.right {
  align-items: flex-end;
}
.msg-row.center {
  align-items: center;
}
.msg-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #86909c;
  margin-bottom: 4px;
  padding: 0 4px;
}
.msg-row.right .msg-meta {
  flex-direction: row-reverse;
}
.sender-name {
  font-weight: 500;
}
.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.bubble.text.left {
  background: #fff;
  color: #1d2129;
  border: 1px solid #f2f3f5;
}
.bubble.text.right {
  background: var(--bw-brand-primary);
  color: #fff;
}
.bubble.system {
  background: #f7f8fa;
  color: #86909c;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: none;
}
.bubble.event {
  background: linear-gradient(135deg, #fff7e6 0%, #fff 60%);
  border: 1px solid #ffe7ba;
  color: #4e5969;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 8px 14px;
}
.bubble.event .event-label {
  font-weight: 600;
  color: #ff7d00;
}
.bubble.event .event-content {
  color: #4e5969;
}
.bubble.risk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 8px 14px;
  max-width: 80%;
}
.bubble.risk.risk-warning {
  background: #fff7e6;
  color: #ff7d00;
  border: 1px solid #ffd591;
}
.bubble.risk.risk-intercept {
  background: #ffece8;
  color: #f53f3f;
  border: 1px solid #ffadb1;
}
.bubble.risk .risk-label {
  font-weight: 600;
}
.bubble.card {
  background: #fff;
  border: 1px solid #f2f3f5;
  padding: 0;
  overflow: hidden;
  width: 260px;
  max-width: 70%;
}
.bubble.card.right {
  background: #f3f7ff;
}
.card-cover img {
  width: 100%;
  display: block;
}
.card-body {
  padding: 12px 14px;
}
.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.card-sub {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
.card-fields {
  margin-top: 8px;
  border-top: 1px dashed #f2f3f5;
  padding-top: 8px;
}
.card-field {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
}
.f-lbl {
  color: #86909c;
}
.f-val {
  color: #1d2129;
  font-weight: 500;
}
.bubble.media {
  padding: 4px;
  background: #fff;
  border: 1px solid #f2f3f5;
}
.bubble.media.right {
  background: #f3f7ff;
}
.media-img {
  max-width: 240px;
  max-height: 240px;
  border-radius: 8px;
  display: block;
}
.media-fallback {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4e5969;
  padding: 6px;
}
.emoji {
  font-size: 14px;
}
</style>
