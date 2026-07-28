<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  msg: Api.Im.Message;
  side: 'left' | 'right' | 'center';
  senderName?: string;
}
const props = defineProps<Props>();

const typeMeta = computed(() => enums.MSG_TYPE_META[props.msg.type]);
const time = computed(() => new Date(props.msg.sentAt).toLocaleString());

const isSystem = computed(() => ['system', 'system-banner'].includes(props.msg.type));
const isRisk = computed(() => ['risk-warning', 'risk-intercept'].includes(props.msg.type));
const isEvent = computed(() =>
  ['order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(
    props.msg.type
  )
);
const isCard = computed(() => ['card-order', 'card-product', 'card-payment'].includes(props.msg.type));
const isMedia = computed(() => ['image', 'video', 'audio', 'file'].includes(props.msg.type));
const isText = computed(() => props.msg.type === 'text');

const eventEmoji = computed(() => {
  const m: Record<string, string> = {
    'order-paid': '💸',
    'order-shipped': '📦',
    'order-delivered': '🎁',
    'price-change': '🏷️',
    'refund-request': '💰',
    'presale-merged': '🔗'
  };
  return m[props.msg.type] || '📢';
});
</script>

<template>
  <!-- 系统消息（居中） -->
  <div v-if="isSystem" class="msg-row center">
    <div class="bubble system">
      {{ msg.content || typeMeta.label }}
    </div>
  </div>

  <!-- 事件消息（居中卡片） -->
  <div v-else-if="isEvent" class="msg-row center">
    <div class="bubble event">
      <span class="emoji">{{ eventEmoji }}</span>
      <span class="event-label">{{ typeMeta.label }}</span>
      <span class="event-content">{{ msg.content || '—' }}</span>
    </div>
  </div>

  <!-- 风险消息（居中横幅） -->
  <div v-else-if="isRisk" class="msg-row center">
    <div class="bubble risk" :class="msg.type">
      <span class="emoji">⚠️</span>
      <span class="risk-label">{{ typeMeta.label }}</span>
      <span class="risk-content">{{ msg.content || '本消息已被平台风控拦截' }}</span>
    </div>
  </div>

  <!-- 普通对话气泡 -->
  <div v-else class="msg-row" :class="side">
    <div class="msg-meta">
      <span class="sender-name">{{ senderName || msg.senderName }}</span>
      <span class="time">{{ time }}</span>
    </div>

    <!-- 文本 -->
    <div v-if="isText" class="bubble text" :class="side">
      {{ msg.content }}
    </div>

    <!-- 卡片消息 -->
    <div v-else-if="isCard && msg.cardPayload" class="bubble card" :class="side">
      <div v-if="msg.cardPayload.coverUrl" class="card-cover">
        <img :src="msg.cardPayload.coverUrl" />
      </div>
      <div class="card-body">
        <div class="card-title">{{ msg.cardPayload.title }}</div>
        <div v-if="msg.cardPayload.subtitle" class="card-sub">{{ msg.cardPayload.subtitle }}</div>
        <div v-if="msg.cardPayload.fields?.length" class="card-fields">
          <div v-for="f in msg.cardPayload.fields" :key="f.label" class="card-field">
            <span class="f-lbl">{{ f.label }}</span>
            <span class="f-val">{{ f.value }}</span>
          </div>
        </div>
        <a-link v-if="msg.cardPayload.linkText && msg.cardPayload.linkUrl" size="small">
          {{ msg.cardPayload.linkText }} ›
        </a-link>
      </div>
    </div>

    <!-- 媒体消息 -->
    <div v-else-if="isMedia" class="bubble media" :class="side">
      <img v-if="msg.type === 'image' && msg.mediaUrl" :src="msg.mediaUrl" class="media-img" />
      <div v-else class="media-fallback">
        <span class="emoji">{{ msg.type === 'video' ? '🎬' : msg.type === 'audio' ? '🎙' : '📎' }}</span>
        <span>{{ msg.mediaName || typeMeta.label }}</span>
      </div>
    </div>

    <!-- 其他 -->
    <div v-else class="bubble text" :class="side">
      {{ msg.content || typeMeta.label }}
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
