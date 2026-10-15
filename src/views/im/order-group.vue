<script setup lang="ts">
import { Icon } from '@iconify/vue';
import ImagePreview from '@/components/common/image-preview.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
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
  recalledMessage,
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
watch(imageUrls, (urls, previous) => {
  if (!imagePreviewVisible.value) return;
  const selected = previous[imagePreviewCurrent.value];
  const index = selected ? urls.indexOf(selected) : -1;
  if (index < 0) imagePreviewVisible.value = false;
  else imagePreviewCurrent.value = index;
}, { flush: 'sync' });
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

const readRequests = new Set<string>();
const onReadVisibility = () => { void reportRead(); };
onMounted(() => document.addEventListener('visibilitychange', onReadVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onReadVisibility));
async function reportRead() {
  if (!scrollRef.value || scrollRef.value.clientHeight === 0
    || scrollRef.value.scrollHeight - scrollRef.value.scrollTop - scrollRef.value.clientHeight > 1) return;
  const lastReadMessageId = latestServerMessageId(messages.value);
  if (!conversation.value || !lastReadMessageId || document.visibilityState !== 'visible') return;
  const currentConversation = conversation.value;
  const userId = userStore.currentUser?.id;
  const version = messageWriteVersion;
  if (userId === undefined || (currentConversation.lastReadMessageId !== undefined && compareBusinessId(lastReadMessageId, currentConversation.lastReadMessageId) <= 0)) return;
  const readKey = `${userId}:${currentConversation.id}:${lastReadMessageId}`;
  if (readRequests.has(readKey)) return;
  readRequests.add(readKey);
  try {
    await notifyApi.markConversationRead({ conversationId: currentConversation.id, lastReadMessageId });
    if (version !== messageWriteVersion || !sameBusinessId(userId, userStore.currentUser?.id) || !sameBusinessId(conversation.value?.id, currentConversation.id)) return;
    if (currentConversation.lastReadMessageId === undefined || compareBusinessId(lastReadMessageId, currentConversation.lastReadMessageId) > 0) currentConversation.lastReadMessageId = lastReadMessageId;
    notifyStore.scheduleUnreadRefresh();
  } catch {
    // 分页只读；上报失败保留原水位，下次可见/滚动时重试。
  } finally { readRequests.delete(readKey); }
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
  void reportRead();
  requestAnimationFrame(() => {
    if (scrollRef.value === container) container.scrollTop = container.scrollHeight;
  });
}

function onMessageScroll() {
  followingLatest = isNearMessageBottom(scrollRef.value);
  historyAnchor = followingLatest ? undefined : captureMessageAnchor(scrollRef.value);
  if (followingLatest) { newMessagesAvailable.value = false; void reportRead(); }
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

async function onSend(payload: { type: 'text' | 'image' | 'audio' | 'video'; content?: string; mediaFileId?: string | number; coverFileId?: string | number; coverUrl?: string; duration?: number }) {
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
    msgType: payload.type === 'image' ? 'IMAGE' : payload.type === 'audio' ? 'VOICE' : payload.type === 'video' ? 'VIDEO' : 'TEXT',
    content: payload.content,
    mediaFileId: payload.mediaFileId,
    coverFileId: payload.coverFileId,
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
    content: message.content ?? undefined,
    mediaFileId: message.mediaFileId ?? undefined,
    coverFileId: message.coverFileId ?? undefined,
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
    messages.value = messages.value.map(item => sameBusinessId(item.id, message.id) ? recalledMessage(item) : item);
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
    if (operation !== messageWriteVersion || !sameBusinessId(conversation.value?.id, event.payload.conversationId)) return;
    if (followBottom && scrollVersion === historyScrollVersion) await scrollToBottom();
    else newMessagesAvailable.value = true;
  } else if (event.type === 'IM_RECALL') {
    const recalled = event.payload.message;
    const messageId = recalled?.id ?? event.payload.messageId ?? event.payload.id;
    if (messageId !== undefined) messages.value = messages.value.map(message => sameBusinessId(message.id, messageId) ? recalledMessage({ ...message, ...recalled }) : message);
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

  <div class="im-group-page">
    <header class="page-heading compact"><h1>订单会话</h1><button type="button" @click="closeToConversationList" class="text-link"><Icon icon="lucide:arrow-left" width="16" />返回消息中心</button></header>
    <section class="paper chat-panel chat-pane" :aria-busy="loading">
      <div v-if="loading" class="chat-loading" role="status"><Icon icon="lucide:loader-circle" class="animate-spin" width="24" /><span>正在加载订单会话</span></div>
      <div v-if="conversation" class="conversation">
        <header class="conversation-header section-heading"><div class="header-main"><div class="header-product"><img v-if="conversation.productImage" :src="conversation.productImage" alt="订单商品" /><div><h2 :title="conversation.peerName || conversation.productTitle || conversation.title || '订单会话'">{{ conversation.peerName || conversation.productTitle || conversation.title || '订单会话' }}</h2><p>订单 {{ conversation.orderNo || orderCode }} · {{ conversation.orderStatusText || conversation.myRole || '—' }}</p></div></div><RealtimeConnectionStatus :state="notifyStore.socketState" @reconnect="notifyStore.connect" /><button type="button" aria-label="关闭独立会话并返回消息中心" @click="closeToConversationList" class="icon-btn"><Icon icon="lucide:x" width="18" /></button></div></header>
        <div v-if="notifyStore.socketState === 'closed'" class="notice warning" role="status"><Icon icon="lucide:wifi-off" width="16" /><span>实时连接暂不可用，消息仍可发送；恢复连接后会自动同步。</span><button type="button" @click="notifyStore.connect" class="text-link">立即重连</button></div>
        <div v-if="syncIncomplete || messageSyncError" class="notice warning" role="status"><Icon icon="lucide:circle-alert" width="16" /><span>{{ messageSyncError || '还有历史增量消息待同步' }}</span><button type="button" :disabled="syncingMessages" @click="syncIncremental" class="text-link">继续同步</button></div>
        <div ref="scrollRef" class="messages chat-messages chat-scroll" style="overflow-anchor: none" @scroll="onMessageScroll" @load.capture="onMessageMediaLoad">
          <div v-if="hasOlder" class="load-older"><button type="button" :disabled="loadingOlder" @click="loadOlderMessages" class="text-link"><Icon :icon="loadingOlder ? 'lucide:loader-circle' : 'lucide:history'" :class="{ 'animate-spin': loadingOlder }" width="15" />加载更早消息</button></div>
          <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="senderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
          <div v-if="!messages.length" class="empty-msg">当前会话暂无消息</div>
        </div>
        <div v-if="newMessagesAvailable" class="new-message-bar"><button type="button" @click="scrollToBottom" class="outline"><Icon icon="lucide:arrow-down" width="15" />有新消息，查看最新消息</button></div>
        <MessageInput :context-key="String(userStore.currentUser?.id || '') + ':' + String(orderCode || '')" :submitting="messageSending" @media-busy="mediaBusy = $event" @send="onSend" />
        <ImagePreview v-model="imagePreviewVisible" :images="imageUrls" :start-index="imagePreviewCurrent" @update:current="imagePreviewCurrent = $event" />
      </div>
      <div v-else-if="!loading" class="placeholder"><EmptyState :title="loadError || '订单会话不存在'" :description="loadError ? '请检查网络后重试，或返回订单列表。' : undefined" :action-text="loadError ? '重新加载' : '返回订单列表'" @action="loadError ? retryLoad() : router.push('/order')" /></div>
    </section>
  </div>
</template>

<style scoped src="../../components/im/v47-messaging.css"></style>
