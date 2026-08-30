<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IconClose } from '@arco-design/web-vue/es/icon';
import { Message } from '@arco-design/web-vue';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import RealtimeConnectionStatus from '@/components/im/realtime-connection-status.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useNotifyStore, useUserStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';
import {
  applyReadEvent,
  captureMessageAnchor,
  restoreMessageAnchor,
  compareBusinessId,
  conversationImageUrls,
  createClientMessageId,
  createOptimisticMessage,
  imagePreviewIndex,
  isRecallAvailable,
  latestServerMessageId,
  isNearMessageBottom,
  syncMessageGap,
  mergeMessages,
  markUnconfirmedMessageFailed,
  sameBusinessId
} from '@/utils/im';
import { conversationListQuery } from '@/utils/notification';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const notifyStore = useNotifyStore();

const orderCode = computed(() => String(route.params.orderCode));
const conversation = ref<Api.RealNotify.ImConversationVO>();
const messages = ref<Api.RealNotify.ImMessageVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const pageNo = ref(1);
const hasOlder = ref(false);
const syncCursor = ref<string | number>('0');
const syncIncomplete = ref(false);
const messageSyncError = ref('');
const syncingMessages = ref(false);
const newMessagesAvailable = ref(false);
const loadingOlder = ref(false);
const messageSending = ref(false);
const mediaBusy = ref(false);
const recallingMessageIds = ref(new Set<string>());
const scrollRef = ref<HTMLDivElement>();
let historyAnchor: ReturnType<typeof captureMessageAnchor>;
let followingLatest = true;
const readerWatermarks = ref<Record<string, string | number>>({});
const imagePreviewVisible = ref(false);
const imagePreviewCurrent = ref(0);
const imageUrls = computed(() => conversationImageUrls(messages.value));
const requestGuard = createLatestRequestGuard();
const olderMessagesGuard = createLatestRequestGuard();
const incrementalMessagesGuard = createLatestRequestGuard();
let messageWriteVersion = 0;
let recallWriteVersion = 0;
let historyScrollVersion = 0;

function isCurrentMessageContext(
  operation: number,
  requestedUserId: string | number,
  requestedOrderCode: string,
  requestedConversationId: string | number
) {
  return operation === messageWriteVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && orderCode.value === requestedOrderCode
    && !!conversation.value
    && sameBusinessId(conversation.value.id, requestedConversationId);
}

function isCurrentRecallContext(
  operation: number,
  requestedUserId: string | number,
  requestedOrderCode: string,
  requestedConversationId: string | number
) {
  return operation === recallWriteVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && orderCode.value === requestedOrderCode
    && !!conversation.value
    && sameBusinessId(conversation.value.id, requestedConversationId);
}

async function load() {
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  const isCurrent = requestGuard.begin();
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) {
    loading.value = false;
    conversation.value = undefined;
    messages.value = [];
    hasOlder.value = false;
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  pageNo.value = 1;
  try {
    const nextConversation = await notifyApi.fetchOrderConversation(requestedOrderCode, { signal: isCurrent.signal });
    if (!isCurrent() || orderCode.value !== requestedOrderCode || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    conversation.value = nextConversation;
    if (conversation.value) {
      const response = await notifyApi.fetchConversationMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 50 }, { signal: isCurrent.signal });
      if (!isCurrent() || orderCode.value !== requestedOrderCode || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
      messages.value = mergeMessages(messages.value, response.records || []);
      syncCursor.value = latestServerMessageId(mergeMessages([], response.records || [])) ?? '0';
      syncIncomplete.value = false;
      messageSyncError.value = '';
      newMessagesAvailable.value = false;
      hasOlder.value = messages.value.length < (response.total || 0);
      void reportRead();
      await scrollToBottom();
    }
  } catch {
    if (!isCurrent()) return;
    conversation.value = undefined;
    messages.value = [];
    loadError.value = '订单会话加载失败，请检查网络后重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function retryLoad() {
  void load();
}

async function loadOlderMessages() {
  if (!conversation.value || !hasOlder.value || loadingOlder.value) return;
  const requestedConversationId = conversation.value.id;
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const isCurrent = olderMessagesGuard.begin();
  loadingOlder.value = true;
  const container = scrollRef.value;
  try {
    const nextPage = pageNo.value + 1;
    const response = await notifyApi.fetchConversationMessages(
      { conversationId: requestedConversationId, pageNo: nextPage, pageSize: 50 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || orderCode.value !== requestedOrderCode || String(userStore.currentUser?.id) !== String(requestedUserId)
      || !conversation.value || !sameBusinessId(conversation.value.id, requestedConversationId)) return;
    const anchor = captureMessageAnchor(container);
    const scrollVersion = historyScrollVersion;
    messages.value = mergeMessages(response.records || [], messages.value);
    pageNo.value = nextPage;
    hasOlder.value = messages.value.length < (response.total || 0);
    await nextTick();
    if (!isCurrent() || orderCode.value !== requestedOrderCode || String(userStore.currentUser?.id) !== String(requestedUserId)
      || !conversation.value || !sameBusinessId(conversation.value.id, requestedConversationId)) return;
    if (scrollVersion === historyScrollVersion) restoreMessageAnchor(container, anchor);
    historyAnchor = captureMessageAnchor(container);
  } catch {
    if (!isCurrent()) return;
    // 请求层已展示错误；保留当前消息和滚动位置，用户可再次加载历史。
  } finally {
    if (isCurrent()) loadingOlder.value = false;
  }
}

async function reportRead() {
  const lastReadMessageId = latestServerMessageId(messages.value);
  if (!conversation.value || !lastReadMessageId || document.visibilityState !== 'visible') return;
  try {
    await notifyApi.markConversationRead({ conversationId: conversation.value.id, lastReadMessageId });
    notifyStore.scheduleUnreadRefresh();
  } catch {
    // 拉取首页同样会推进已读，显式上报作为停留期间新消息的补充。
  }
}

async function syncIncremental() {
  if (!conversation.value || loading.value) return;
  const requestedConversationId = conversation.value.id;
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const isCurrent = incrementalMessagesGuard.begin();
  const current = () => isCurrent() && orderCode.value === requestedOrderCode
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && sameBusinessId(conversation.value?.id, requestedConversationId);
  const followBottom = isNearMessageBottom(scrollRef.value);
  const scrollVersion = historyScrollVersion;
  let receivedNewMessages = false;
  syncingMessages.value = true;
  messageSyncError.value = '';
  try {
    const complete = await syncMessageGap({ conversationId: requestedConversationId, sinceId: syncCursor.value, signal: isCurrent.signal,
      request: (sinceId, limit) => notifyApi.fetchIncrementalMessages({ conversationId: requestedConversationId, sinceId, limit }, { signal: isCurrent.signal }),
      accept: (incoming, cursor) => {
        if (!current()) return;
        const previousCount = messages.value.length;
        messages.value = mergeMessages(messages.value, incoming);
        receivedNewMessages ||= messages.value.length > previousCount;
        syncCursor.value = cursor;
        if (receivedNewMessages && !followBottom) newMessagesAvailable.value = true;
      }
    });
    if (!current()) return;
    syncIncomplete.value = !complete;
    void reportRead();
    if (!current()) return;
    if (followBottom && scrollVersion === historyScrollVersion) await scrollToBottom();
    else if (receivedNewMessages) newMessagesAvailable.value = true;
  } catch {
    if (current()) messageSyncError.value = '消息尚未同步完整，请重试；已读取的消息会保留';
  } finally {
    if (isCurrent()) syncingMessages.value = false;
  }
}

async function scrollToBottom() {
  newMessagesAvailable.value = false;
  followingLatest = true;
  historyAnchor = undefined;
  await nextTick();
  const container = scrollRef.value;
  if (!container) return;
  container.scrollTop = container.scrollHeight;
  requestAnimationFrame(() => {
    if (scrollRef.value === container) container.scrollTop = container.scrollHeight;
  });
}

function onMessageScroll() {
  followingLatest = isNearMessageBottom(scrollRef.value);
  historyAnchor = followingLatest ? undefined : captureMessageAnchor(scrollRef.value);
  if (followingLatest) newMessagesAvailable.value = false;
  else historyScrollVersion += 1;
}

function onMessageMediaLoad() {
  if (followingLatest) void scrollToBottom();
  else restoreMessageAnchor(scrollRef.value, historyAnchor);
}

function previewImage(url: string) {
  const index = imagePreviewIndex(imageUrls.value, url);
  if (index < 0) return;
  imagePreviewCurrent.value = index;
  imagePreviewVisible.value = true;
}

function sideOf(message: Api.RealNotify.ImMessageVO): 'left' | 'right' | 'center' {
  const type = String(message.msgType || '').toUpperCase();
  if (!message.senderId || type === 'SYSTEM' || type === 'ORDER_CARD') return 'center';
  return sameBusinessId(message.senderId, userStore.currentUser?.id) ? 'right' : 'left';
}

function senderName(message: Api.RealNotify.ImMessageVO) {
  if (sameBusinessId(message.senderId, userStore.currentUser?.id)) return '我';
  return message.senderName || (String(message.senderRole).toUpperCase() === 'ADMIN' ? '平台客服' : '成员');
}

function readText(message: Api.RealNotify.ImMessageVO) {
  if (sideOf(message) !== 'right' || message.pending || message.failed) return '';
  const count = Object.values(readerWatermarks.value).filter(id => compareBusinessId(id, message.id) >= 0).length;
  return count ? `已读 ${count}` : '未读';
}

async function onSend(payload: { type: 'text' | 'image' | 'audio'; content?: string; mediaFileId?: string | number }) {
  if (!conversation.value || messageSending.value) return;
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedConversationId = conversation.value.id;
  const operation = ++messageWriteVersion;
  messageSending.value = true;
  const clientMsgId = createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId: requestedConversationId,
    msgType: payload.type === 'image' ? 'IMAGE' : payload.type === 'audio' ? 'VOICE' : 'TEXT',
    content: payload.content,
    mediaFileId: payload.mediaFileId,
    clientMsgId
  };
  messages.value = mergeMessages(messages.value, createOptimisticMessage(params, {
    id: userStore.currentUser?.id,
    name: userStore.displayName,
    avatar: userStore.currentUser?.avatar,
    role: conversation.value.myRole
  }));
  await scrollToBottom();
  if (!isCurrentMessageContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
  try {
    const sent = await notifyApi.sendConversationMessage(params, { showError: false });
    if (!isCurrentMessageContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    await scrollToBottom();
  } catch (error) {
    if (!isCurrentMessageContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    messages.value = markUnconfirmedMessageFailed(messages.value, clientMsgId);
    if (messages.value.some(message => message.clientMsgId === clientMsgId && message.failed)) {
      Message.error(error instanceof Error ? error.message : '未取得消息发送结果，请核对后使用原消息重试');
    }
  } finally {
    if (operation === messageWriteVersion) messageSending.value = false;
  }
}

async function retryMessage(message: Api.RealNotify.ImMessageVO) {
  if (!conversation.value || !message.failed || messageSending.value || mediaBusy.value) return;
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestedConversationId = conversation.value.id;
  const operation = ++messageWriteVersion;
  messageSending.value = true;
  const clientMsgId = message.clientMsgId || createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId: requestedConversationId,
    msgType: String(message.msgType || 'TEXT').toUpperCase() as Api.RealNotify.SendMessageType,
    content: message.content,
    mediaFileId: message.mediaFileId,
    clientMsgId
  };
  messages.value = messages.value.map(item => sameBusinessId(item.id, message.id)
    ? { ...item, clientMsgId, pending: true, failed: false, createdAt: String(Date.now()) }
    : item);
  try {
    const sent = await notifyApi.sendConversationMessage(params, { showError: false });
    if (!isCurrentMessageContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    await scrollToBottom();
  } catch (error) {
    if (!isCurrentMessageContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    messages.value = markUnconfirmedMessageFailed(messages.value, clientMsgId);
    if (messages.value.some(item => item.clientMsgId === clientMsgId && item.failed)) {
      Message.error(error instanceof Error ? error.message : '未取得消息发送结果，请核对后使用原消息重试');
    }
  } finally {
    if (operation === messageWriteVersion) messageSending.value = false;
  }
}

async function recallMessage(message: Api.RealNotify.ImMessageVO) {
  const requestedOrderCode = orderCode.value;
  const requestedUserId = userStore.currentUser?.id;
  const requestedConversationId = conversation.value?.id;
  if (requestedUserId === undefined || requestedConversationId === undefined) return;
  const messageId = String(message.id);
  if (recallingMessageIds.value.has(messageId)) return;
  const operation = recallWriteVersion;
  recallingMessageIds.value = new Set(recallingMessageIds.value).add(messageId);
  try {
    await notifyApi.recallConversationMessage({ id: message.id });
    if (!isCurrentRecallContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    messages.value = messages.value.map(item => sameBusinessId(item.id, message.id) ? { ...item, recalled: true, content: undefined, mediaUrl: undefined } : item);
  } catch {
    // 请求层展示错误。
  } finally {
    if (!isCurrentRecallContext(operation, requestedUserId, requestedOrderCode, requestedConversationId)) return;
    const next = new Set(recallingMessageIds.value);
    next.delete(messageId);
    recallingMessageIds.value = next;
  }
}

function openOrder(orderId: string | number) {
  router.push({ name: 'order-detail', params: { id: orderId } });
}

function closeToConversationList() {
  router.push({ name: 'im', query: conversationListQuery(conversation.value?.id) });
}

notifyStore.subscribe(async event => {
  if (event.type === 'SYNC') {
    try {
      await syncIncremental();
    } catch {
      // 实时补偿读取失败时保留当前消息，等待下一次同步或用户刷新。
    }
  } else if (event.type === 'IM_MESSAGE' && conversation.value && sameBusinessId(event.payload.conversationId, conversation.value.id)) {
    const followBottom = isNearMessageBottom(scrollRef.value);
    const scrollVersion = historyScrollVersion;
    const operation = messageWriteVersion;
    messages.value = mergeMessages(messages.value, event.payload);
    void reportRead();
    if (operation !== messageWriteVersion || !sameBusinessId(conversation.value?.id, event.payload.conversationId)) return;
    if (followBottom && scrollVersion === historyScrollVersion) await scrollToBottom();
    else newMessagesAvailable.value = true;
  } else if (event.type === 'IM_RECALL') {
    const recalled = event.payload.message;
    const messageId = recalled?.id ?? event.payload.messageId ?? event.payload.id;
    if (messageId !== undefined) messages.value = messages.value.map(message => sameBusinessId(message.id, messageId) ? { ...message, ...recalled, recalled: true, content: undefined, mediaUrl: undefined } : message);
  } else if (event.type === 'IM_READ') {
    readerWatermarks.value = applyReadEvent(readerWatermarks.value, conversation.value?.id, event.payload);
  }
});

onMounted(load);
onBeforeUnmount(() => {
  messageWriteVersion += 1;
  recallWriteVersion += 1;
  requestGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
});
watch([() => route.params.orderCode, () => userStore.currentUser?.id], ([nextCode, nextUserId], [prevCode, prevUserId]) => {
  if (String(nextCode) === String(prevCode) && String(nextUserId) === String(prevUserId)) return;
  messageWriteVersion += 1;
  recallWriteVersion += 1;
  requestGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  conversation.value = undefined;
  messages.value = [];
  loadError.value = '';
  readerWatermarks.value = {};
  pageNo.value = 1;
  hasOlder.value = false;
  syncCursor.value = '0';
  syncIncomplete.value = false;
  messageSyncError.value = '';
  syncingMessages.value = false;
  newMessagesAvailable.value = false;
  loadingOlder.value = false;
  messageSending.value = false;
  recallingMessageIds.value = new Set();
  imagePreviewVisible.value = false;
  void load();
});
</script>

<template>
  <div class="im-group-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <a-card v-if="conversation" class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
        <div class="conversation-header">
          <img v-if="conversation.productImage" :src="conversation.productImage" alt="订单商品" class="product-image" />
          <div class="conversation-info"><div class="conversation-title">{{ conversation.productTitle || conversation.title || '订单会话' }}</div><div class="conversation-sub">订单 {{ conversation.orderNo || conversation.bizId || orderCode }} · {{ conversation.orderStatusText || conversation.myRole || '—' }}</div></div>
          <RealtimeConnectionStatus :state="notifyStore.socketState" @reconnect="notifyStore.connect" />
          <a-button class="close-button" type="text" shape="circle" aria-label="关闭独立会话并返回消息中心" @click="closeToConversationList"><template #icon><IconClose /></template></a-button>
        </div>
        <a-alert v-if="notifyStore.socketState === 'closed'" type="warning" :show-icon="false" class="realtime-alert">
          实时连接暂不可用，消息仍可发送；刷新页面或恢复连接后会自动同步。
          <template #action><a-link role="button" tabindex="0" @click="notifyStore.connect" @keydown.enter="notifyStore.connect" @keydown.space.prevent="notifyStore.connect">立即重连</a-link></template>
        </a-alert>
        <a-alert v-if="syncIncomplete || messageSyncError" type="warning">{{ messageSyncError || '还有历史增量消息待同步' }}<template #action><a-button :loading="syncingMessages" @click="syncIncremental">继续同步</a-button></template></a-alert>
        <div ref="scrollRef" class="messages chat-scroll" style="overflow-anchor: none" @scroll="onMessageScroll" @load.capture="onMessageMediaLoad">
          <div v-if="hasOlder" class="load-older"><a-link role="button" tabindex="0" :loading="loadingOlder" @click="loadOlderMessages" @keydown.enter="loadOlderMessages" @keydown.space.prevent="loadOlderMessages">加载更早消息</a-link></div>
          <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="senderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
          <div v-if="!messages.length" class="empty-msg">该群暂无消息，开始聊天吧 👋</div>
        </div>
        <a-button v-if="newMessagesAvailable" @click="scrollToBottom">有新消息，查看最新消息</a-button>
        <MessageInput :context-key="String(userStore.currentUser?.id || '') + ':' + String(orderCode || '')" :submitting="messageSending" @media-busy="mediaBusy = $event" @send="onSend" />
        <a-image-preview-group :src-list="imageUrls" :visible="imagePreviewVisible" :current="imagePreviewCurrent" @update:visible="imagePreviewVisible = $event" @update:current="imagePreviewCurrent = $event" />
      </a-card>
      <EmptyState
        v-else-if="!loading"
        :title="loadError || '订单会话不存在'"
        :description="loadError ? '请检查网络后重试，或返回订单列表。' : undefined"
        :action-text="loadError ? '重新加载' : '返回订单列表'"
        @action="loadError ? retryLoad() : router.push('/order')"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.im-group-page { padding-top: 16px; }
.chat-card { background: #f7f8fa; border-radius: var(--bw-card-radius); overflow: hidden; height: calc(100vh - 200px); min-height: 560px; }
.chat-card :deep(.arco-card-body) { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 !important; box-sizing: border-box; overflow: hidden; }
.conversation-header { background: #fff; padding: 14px 20px; border-bottom: 1px solid #f2f3f5; display: flex; align-items: center; gap: 10px; }.conversation-info { min-width: 0; flex: 1; }.close-button { flex: 0 0 auto; color: #4e5969; }
.product-image { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; }.conversation-title { color: #1d2129; font-size: 14px; font-weight: 600; }.conversation-sub { color: #86909c; font-size: 12px; margin-top: 4px; }
.realtime-alert { width: calc(100% - 40px); margin: 10px auto 0; box-sizing: border-box; flex: 0 0 auto; }.messages { flex: 1 1 auto; min-height: 0; padding: 16px 20px; background: #f7f8fa; overflow-y: auto; overscroll-behavior: contain; }.chat-card :deep(.input-area) { position: sticky; bottom: 0; z-index: 2; flex: 0 0 auto; }.load-older { text-align: center; margin-bottom: 14px; }.empty-msg { text-align: center; color: #86909c; padding: 40px 0; font-size: 13px; }
@media (max-width: 720px) { .chat-card { height: calc(100vh - 160px); min-height: 520px; } .conversation-header { padding: 12px 16px; } .messages { padding: 12px; } .realtime-alert { width: calc(100% - 24px); margin-top: 8px; } }
</style>
