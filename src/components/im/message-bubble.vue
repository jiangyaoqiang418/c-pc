<script setup lang="ts">
import CopyValue from '@/components/common/copy-value.vue';
import ProductSourceBadge from '@/components/common/product-source-badge.vue';
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { parseOrderMessageCard } from '@/utils/im';
import { parseProductMessageCard } from '@/utils/im-product-card';
import { setImageFallback } from '@/utils/image-placeholder';
import ConversationOrderBar from '@/components/im/conversation-order-bar.vue';

interface Props {
  msg: Api.RealNotify.ImMessageVO;
  side: 'left' | 'right' | 'center';
  senderName?: string;
  readText?: string;
  canRecall?: boolean;
  orderRevision?: number;
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
const isProductCard = computed(() => type.value === 'PRODUCT_CARD');
const isImage = computed(() => type.value === 'IMAGE');
const isVoice = computed(() => type.value === 'VOICE');
const isVideo = computed(() => type.value === 'VIDEO');
const senderInitial = computed(() => props.side === 'right' ? '我' : Array.from(props.senderName || props.msg.senderName || '成员')[0]);
const mediaFailed = ref(false);
const mediaAttempt = ref(0);
const mediaElement = ref<HTMLImageElement | HTMLMediaElement>();
const mediaKey = computed(() => JSON.stringify([props.msg.id, props.msg.mediaUrl, type.value, mediaAttempt.value]));
const avatarFailed = ref(false);
watch(() => props.msg.senderAvatar, () => { avatarFailed.value = false; });
function releaseMedia() {
  const element = mediaElement.value;
  mediaElement.value = undefined;
  if (element && 'pause' in element) {
    element.pause();
    element.removeAttribute('src');
    element.load();
  }
}
watch([() => props.msg.id, () => props.msg.mediaUrl, type, () => Boolean(props.msg.recalled)], () => {
  releaseMedia();
  mediaFailed.value = false;
  mediaAttempt.value = 0;
}, { flush:'sync' });
onBeforeUnmount(releaseMedia);
function onMediaError(event: Event) {
  if (event.currentTarget !== mediaElement.value) return;
  mediaFailed.value = true;
  releaseMedia();
}
function retryMedia() {
  mediaFailed.value = false;
  mediaAttempt.value += 1;
}
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
  if (eventType === 'REVIEW_PUBLISHED') return props.msg.content || '买家已发布评价';
  const statusText = String(params.statusText || '');
  const templates: Record<string, string> = {
    CREATED: '订单已创建',
    PRICE_CHANGED: `订单价格已更新${params.amount ? `：${params.amount} ${params.currency || 'USDT'}` : ''}`,
    PAID: '订单已付款',
    SHIPPED: '买手已发货',
    COMPLETED: '订单已完成',
    SETTLED: '订单货款已结算',
    CANCELED: '订单已取消',
    REFUND_APPLIED: '买家已申请售后',
    REFUND_AGREED: '平台已同意退款',
    REFUND_REJECTED: '平台已驳回退款',
    REFUND_CANCELED: '买家已撤销退款申请',
    AFTERSALE_UPDATED: '售后处理状态已更新',
    AFTERSALE_COMPLETED: '售后流程已完成'
  };
  return templates[eventType] || statusText || props.msg.content || '订单状态已更新';
});

const orderCard = computed(() => isOrderCard.value ? parseOrderMessageCard(props.msg.content) : undefined);
const productCard = computed(() => isProductCard.value ? parseProductMessageCard(props.msg.content) : undefined);


</script>

<template>

  <div v-if="msg.recalled" class="msg-row center"><div class="bubble system"><Icon icon="lucide:undo-2" width="13" />消息已撤回</div></div>
  <div v-else-if="isSystem" class="msg-row center"><div class="bubble system">{{ systemContent }}</div></div>
  <div v-else-if="isOrderCard" class="msg-row center order-message">
    <div v-if="orderCard" class="im-order-card">
      <img v-if="orderCard.productImage" :src="orderCard.productImage" alt="订单商品" class="order-cover" />
      <div class="order-card-body">
        <div class="order-title" :title="orderCard.productTitle || '订单卡片'">{{ orderCard.productTitle || '订单卡片' }}</div>
        <div class="im-order-meta">订单号 <CopyValue :value="orderCard.orderNo" label="订单号" /></div>
        <div class="order-footer"><button type="button" class="text-link open-order-card" :disabled="!orderCard.orderId" @click="orderCard.orderId && emit('open-order', orderCard.orderId)">查看订单 · {{ orderCard.statusText || '订单详情' }}</button><strong v-if="orderCard.amount !== undefined">{{ orderCard.currency || 'USDT' }} {{ orderCard.amount }}</strong><Icon icon="lucide:arrow-up-right" width="15" /></div>
      </div>
    </div>
    <ConversationOrderBar v-if="orderCard?.orderId" aftersale-only compact :order-id="orderCard.orderId" :revision="String(orderRevision)" />
    <div v-else class="bubble system">{{ msg.content || '订单卡片' }}</div>
  </div>
  <div v-else class="msg-row message" :class="[side, { me: side === 'right' }]"><span class="avatar"><img v-if="msg.senderAvatar && !avatarFailed" :src="msg.senderAvatar" :alt="senderName || msg.senderName || '成员'" @error="avatarFailed = true" /><template v-else>{{ senderInitial }}</template></span><div class="message-body">
    <div class="msg-meta"><span class="sender-name">{{ senderName || msg.senderName || '成员' }}</span><span v-if="roleMeta" class="role-tag" :class="roleMeta.cls">{{ roleMeta.label }}</span><span class="time">{{ time }}</span></div>
    <div v-if="(isImage || isVoice || isVideo) && (!msg.mediaUrl || mediaFailed)" class="bubble media media-error" :class="side" role="status">
      <Icon icon="lucide:file-warning" width="20" /><span>{{ isImage ? '图片' : isVoice ? '语音' : '视频' }}{{ msg.mediaUrl ? '加载失败，链接可能已失效或格式不受支持' : '暂不可用' }}</span>
      <button v-if="msg.mediaUrl" type="button" @click="retryMedia" class="outline">重新加载</button>
    </div>
    <div v-else-if="isImage && msg.mediaUrl" class="bubble media image-media" :class="side">
      <button type="button" class="media-image-button" :aria-label="'预览图片：' + (msg.content || '聊天图片')" @click="emit('preview-image', msg.mediaUrl)"><img :key="mediaKey" ref="mediaElement" :src="msg.mediaUrl" alt="图片消息" class="media-img" @error="onMediaError" /></button>
    </div>
    <div v-else-if="isVoice" class="bubble media voice" :class="side"><audio :key="mediaKey" ref="mediaElement" :src="msg.mediaUrl || undefined" aria-label="语音消息" controls preload="metadata" @error="onMediaError" /><span v-if="msg.duration">{{ msg.duration }} 秒</span></div>
    <div v-else-if="isVideo" class="bubble media video" :class="side"><video :key="mediaKey" ref="mediaElement" :src="msg.mediaUrl || undefined" :poster="msg.coverUrl || undefined" aria-label="视频消息" controls preload="none" playsinline @error="onMediaError" /><span v-if="msg.duration" class="video-duration">{{ msg.duration }} 秒</span></div>
    <template v-else-if="isProductCard">
      <RouterLink v-if="productCard" class="im-order-card im-product-card" :to="{ name: 'product-detail', params: { id: productCard.productId } }">
        <img v-if="productCard.image" :src="productCard.image" :alt="productCard.title" class="order-cover" @error="setImageFallback" />
        <div class="order-card-body"><div class="order-title"><ProductSourceBadge :source="productCard.source" />{{ productCard.title }}</div><div class="order-footer"><span>查看商品</span><strong>{{ productCard.price }} USDT</strong><Icon icon="lucide:arrow-up-right" width="15" /></div></div>
      </RouterLink>
      <p v-else class="bubble system">商品卡片暂不可用</p>
    </template>
    <p v-else class="bubble text" :class="side">{{ msg.content || '—' }}</p>
    <div v-if="side === 'right'" class="message-status" aria-live="polite">
      <span v-if="msg.failed" class="failed"><Icon icon="lucide:circle-alert" width="13" />发送失败</span><span v-else-if="msg.pending">发送中…</span><span v-else-if="readText">{{ readText }}</span>
      <button v-if="canRecall" type="button" class="recall-btn" @click="emit('recall', msg)">撤回</button><button v-if="msg.failed" type="button" class="recall-btn" @click="emit('retry', msg)">重新发送</button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.msg-row.center { align-self:center; width:100%; display:flex; justify-content:center; }
.order-message { flex-direction:column; align-items:center; gap:8px; }
.message-body { min-width:0; }
.msg-meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:var(--muted); font-size:11px; margin-bottom:6px; }
.message.me .msg-meta { justify-content:flex-end; }
.sender-name { color:var(--ink); font-weight:600; }
.avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
.role-tag { padding:1px 6px; border-radius:4px; background:var(--soft); color:var(--muted); font-size:10px; }
.role-tag.customer { color:var(--green); }.role-tag.admin { color:var(--yb-warning); }
.bubble.text { white-space:pre-wrap; overflow-wrap:anywhere; }
.message.me .bubble.text { color:var(--on-primary,var(--paper)); }
.bubble.system { display:inline-flex; align-items:center; gap:6px; text-align:center; background:var(--soft); color:var(--muted); font-size:12px; padding:6px 12px; border:1px solid var(--line); border-radius:6px; }
.bubble.media { padding:5px; background:var(--soft); border:1px solid var(--line); border-radius:10px; overflow:hidden; max-width:100%; }
.bubble.media.image-media { width:fit-content; }
.message.me .bubble.image-media { margin-left:auto; }
.media-image-button { display:block; padding:0; border:0; border-radius:6px; cursor:zoom-in; }
.media-img { display:block; width:auto; height:auto; max-width:min(200px,55vw); max-height:200px; border-radius:6px; object-fit:contain; }
.voice { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.voice audio { max-width:min(260px,55vw); height:36px; }.voice>span { font-size:12px; color:var(--muted); padding:0 5px; }
.video video { width:300px; max-width:55vw; aspect-ratio:16/9; border-radius:6px; background:var(--soft); }
.video-duration { display:block; padding:3px 6px; color:var(--muted); font-size:12px; }
.message-status { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:10px; margin-top:6px; color:var(--muted); font-size:11px; }
.failed { display:inline-flex; align-items:center; gap:4px; color:var(--yb-danger); }
.recall-btn { color:var(--green); font-size:inherit; }.recall-btn:hover { text-decoration:underline; }
.media-error { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px; color:var(--muted); }
.media-error>span { max-width:260px; font-size:13px; }
.order-message .im-order-card { position:relative; }.open-order-card::after { content:""; position:absolute; inset:0; }.im-order-meta :deep(.copy-value button) { position:relative; z-index:1; }
.im-order-card { width:390px; max-width:90%; display:flex; overflow:hidden; padding:0; text-align:left; background:var(--paper); border:1px solid var(--line); border-radius:10px; }
.im-order-card:hover { border-color:var(--green); }
.im-product-card { max-width:100%; text-decoration:none; }
.im-product-card:focus-visible { outline:2px solid var(--green); outline-offset:3px; }
.order-cover { width:92px; min-height:92px; object-fit:cover; flex-shrink:0; }
.order-card-body { min-width:0; flex:1; padding:14px; }
.order-title { color:var(--ink); font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.im-order-meta { margin-top:5px; background:transparent; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.order-footer { display:flex; align-items:center; gap:12px; margin-top:10px; font-size:12px; color:var(--muted); }
.order-footer strong { margin-left:auto; color:var(--green); font-family:var(--font-mono); }
</style>
