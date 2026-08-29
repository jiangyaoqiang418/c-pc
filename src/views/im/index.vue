<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import RealtimeConnectionStatus from '@/components/im/realtime-connection-status.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useNotifyStore, useUserStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';
import {
  compareBusinessId,
  conversationImageUrls,
  createClientMessageId,
  createOptimisticMessage,
  imagePreviewIndex,
  isRecallAvailable,
  latestServerMessageId,
  mergeMessages,
  sameBusinessId
} from '@/utils/im';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const notifyStore = useNotifyStore();

type ConvKind = 'group' | 'cs' | 'presale';
const activeTab = ref<ConvKind>('group');
const conversations = ref<Api.RealNotify.ImConversationVO[]>([]);
const selectedConversationId = ref<string | number>();
const messages = ref<Api.RealNotify.ImMessageVO[]>([]);
const loading = ref(false);
const conversationLoading = ref(false);
const conversationLoadError = ref('');
const messageLoadError = ref('');
const restSyncing = ref(false);
const lastSyncedAt = ref<Date>();
const loadingOlder = ref(false);
const messageSending = ref(false);
const pageNo = ref(1);
const hasOlder = ref(false);
const scrollRef = ref<HTMLDivElement>();
const readerWatermarks = ref<Record<string, string | number>>({});
const imagePreviewVisible = ref(false);
const imagePreviewCurrent = ref(0);
const deletingConversationId = ref<string | number>();
const recallingMessageIds = ref(new Set<string>());
const conversationListGuard = createLatestRequestGuard();
const messageListGuard = createLatestRequestGuard();
const olderMessagesGuard = createLatestRequestGuard();
const incrementalMessagesGuard = createLatestRequestGuard();
let messageWriteVersion = 0;
let readWriteVersion = 0;
let recallWriteVersion = 0;
let conversationDeleteVersion = 0;
let disposed = false;

function isCurrentUser(userId: string | number | undefined) {
  return userId !== undefined && String(userStore.currentUser?.id) === String(userId);
}

function isCurrentMessageWrite(operation: number, userId: string | number, conversationId: string | number) {
  return operation === messageWriteVersion
    && isCurrentUser(userId)
    && sameBusinessId(selectedConversationId.value, conversationId);
}

function hasBizType(conversation: Api.RealNotify.ImConversationVO, type: string) {
  return String(conversation.bizType || '').toUpperCase() === type;
}

const groups = computed(() => conversations.value.filter(conversation => hasBizType(conversation, 'ORDER')));
const csSessions = computed(() => conversations.value.filter(conversation => {
  const type = String(conversation.bizType || '').toUpperCase();
  return type === 'CUSTOMER_SERVICE' || type === 'CS';
}));
const presaleSessions = computed(() => conversations.value.filter(conversation => hasBizType(conversation, 'PRESALE')));
const selectedConversation = computed(() => conversations.value.find(conversation => sameBusinessId(conversation.id, selectedConversationId.value)));
const imageUrls = computed(() => conversationImageUrls(messages.value));

function currentCandidates() {
  return activeTab.value === 'group' ? groups.value : activeTab.value === 'cs' ? csSessions.value : presaleSessions.value;
}

async function loadConversations(selectFirst = true) {
  if (disposed) return;
  const isCurrent = conversationListGuard.begin();
  conversationLoadError.value = '';
  try {
    const response = await notifyApi.fetchConversations(
      { pageNo: 1, pageSize: 100 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent()) return;
    conversations.value = response.records || [];
    notifyStore.setImUnreadCount(conversations.value.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0));
    if (selectFirst) await selectFirstConversation();
    lastSyncedAt.value = new Date();
  } catch (error) {
    if (!isCurrent()) return;
    conversationLoadError.value = '会话加载失败，请检查网络后重试';
    throw error;
  }
}

async function init() {
  if (disposed) return;
  conversationLoading.value = true;
  loading.value = true;
  try {
    await loadConversations();
  } catch {
    conversations.value = [];
    selectedConversationId.value = undefined;
    messages.value = [];
  } finally {
    if (!disposed) {
      loading.value = false;
      conversationLoading.value = false;
    }
  }
}

async function selectFirstConversation() {
  const candidates = currentCandidates();
  const requestedConversation = candidates.find(conversation => sameBusinessId(conversation.id, route.query.conversationId as string | undefined));
  if (requestedConversation) {
    await selectConversation(requestedConversation);
    return;
  }
  if (candidates.length && !candidates.some(conversation => sameBusinessId(conversation.id, selectedConversationId.value))) {
    await selectConversation(candidates[0]);
  }
}

async function selectConversation(conversation: Api.RealNotify.ImConversationVO) {
  const conversationId = conversation.id;
  messageWriteVersion += 1;
  recallWriteVersion += 1;
  recallingMessageIds.value = new Set();
  messageSending.value = false;
  const isCurrent = messageListGuard.begin();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  selectedConversationId.value = conversationId;
  messages.value = [];
  hasOlder.value = false;
  loadingOlder.value = false;
  loading.value = true;
  messageLoadError.value = '';
  pageNo.value = 1;
  try {
    const response = await notifyApi.fetchConversationMessages(
      { conversationId, pageNo: 1, pageSize: 50 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    messages.value = mergeMessages(messages.value, response.records || []);
    hasOlder.value = messages.value.length < (response.total || 0);
    const currentConversation = selectedConversation.value;
    if (currentConversation) currentConversation.unreadCount = 0;
    refreshImUnreadFromConversations();
    await reportRead(conversationId);
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    await scrollToBottom();
  } catch {
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    messages.value = [];
    messageLoadError.value = '消息加载失败，请检查网络后重试';
  } finally {
    if (isCurrent() && sameBusinessId(selectedConversationId.value, conversationId)) loading.value = false;
  }
}

async function loadOlderMessages() {
  if (!selectedConversation.value || !hasOlder.value || loadingOlder.value) return;
  const conversationId = selectedConversation.value.id;
  const isCurrent = olderMessagesGuard.begin();
  loadingOlder.value = true;
  const container = scrollRef.value;
  const oldHeight = container?.scrollHeight || 0;
  try {
    const nextPage = pageNo.value + 1;
    const response = await notifyApi.fetchConversationMessages(
      { conversationId, pageNo: nextPage, pageSize: 50 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    messages.value = mergeMessages(response.records || [], messages.value);
    pageNo.value = nextPage;
    hasOlder.value = messages.value.length < (response.total || 0);
    await nextTick();
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    if (container) container.scrollTop = container.scrollHeight - oldHeight;
  } catch {
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    // 请求层已展示错误；保留当前消息和滚动位置，用户可再次加载历史。
  } finally {
    if (isCurrent() && sameBusinessId(selectedConversationId.value, conversationId)) loadingOlder.value = false;
  }
}

function refreshImUnreadFromConversations() {
  notifyStore.setImUnreadCount(conversations.value.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0));
}

async function reportRead(expectedConversationId?: string | number) {
  const conversation = selectedConversation.value;
  const lastReadMessageId = latestServerMessageId(messages.value);
  if (!conversation || !lastReadMessageId || document.visibilityState !== 'visible') return;
  if (expectedConversationId !== undefined && !sameBusinessId(conversation.id, expectedConversationId)) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++readWriteVersion;
  try {
    await notifyApi.markConversationRead({ conversationId: conversation.id, lastReadMessageId });
    if (
      operation !== readWriteVersion
      || !isCurrentUser(requestedUserId)
      || !sameBusinessId(selectedConversationId.value, conversation.id)
    ) return;
    conversation.lastReadMessageId = lastReadMessageId;
  } catch {
    // 历史页首次拉取本身也会推进已读；显式上报失败时保留当前页面，不影响消息阅读。
  }
}

async function syncCurrentConversation() {
  const conversation = selectedConversation.value;
  if (!conversation) return;
  const conversationId = conversation.id;
  const isCurrent = incrementalMessagesGuard.begin();
  const sinceId = latestServerMessageId(messages.value);
  try {
    const incoming = await notifyApi.fetchIncrementalMessages(
      { conversationId, sinceId, limit: 200 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    if (incoming.length) {
      messages.value = mergeMessages(messages.value, incoming);
      await reportRead(conversationId);
      if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
      await scrollToBottom();
    }
  } catch (error) {
    if (!isCurrent()) return;
    throw error;
  }
}

async function scrollToBottom() {
  await nextTick();
  const container = scrollRef.value;
  if (!container) return;
  container.scrollTop = container.scrollHeight;
  requestAnimationFrame(() => {
    if (scrollRef.value === container) container.scrollTop = container.scrollHeight;
  });
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

function getSenderName(message: Api.RealNotify.ImMessageVO) {
  if (sameBusinessId(message.senderId, userStore.currentUser?.id)) return '我';
  if (message.senderName) return message.senderName;
  const role = String(message.senderRole || '').toUpperCase();
  return role === 'SELLER' ? '买手' : role === 'ADMIN' ? '平台客服' : role === 'CUSTOMER' ? '顾客' : '系统';
}

function readText(message: Api.RealNotify.ImMessageVO) {
  if (sideOf(message) !== 'right' || message.pending || message.failed) return '';
  const count = Object.values(readerWatermarks.value).filter(id => compareBusinessId(id, message.id) >= 0).length;
  return count ? `已读 ${count}` : '未读';
}

async function onSend(payload: { type: 'text' | 'image' | 'audio'; content?: string; mediaFileId?: string | number }) {
  const conversation = selectedConversation.value;
  if (!conversation || messageSending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const conversationId = conversation.id;
  const operation = ++messageWriteVersion;
  messageSending.value = true;
  const clientMsgId = createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId,
    msgType: payload.type === 'image' ? 'IMAGE' : payload.type === 'audio' ? 'VOICE' : 'TEXT',
    content: payload.content,
    mediaFileId: payload.mediaFileId,
    clientMsgId
  };
  messages.value = mergeMessages(messages.value, createOptimisticMessage(params, {
    id: userStore.currentUser?.id,
    name: userStore.displayName,
    avatar: userStore.currentUser?.avatar,
    role: conversation.myRole
  }));
  await scrollToBottom();
  if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
  try {
    const sent = await notifyApi.sendConversationMessage(params);
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    try {
      await loadConversations(false);
    } catch {
      // 会话列表刷新失败不应把已发送成功的消息标记为失败。
    }
    if (isCurrentMessageWrite(operation, requestedUserId, conversationId)) await scrollToBottom();
  } catch {
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    const optimistic = messages.value.find(message => message.clientMsgId === clientMsgId);
    if (optimistic) optimistic.failed = true;
  } finally {
    if (operation === messageWriteVersion) messageSending.value = false;
  }
}

async function retryMessage(message: Api.RealNotify.ImMessageVO) {
  const conversation = selectedConversation.value;
  if (!conversation || !message.failed || messageSending.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const conversationId = conversation.id;
  const operation = ++messageWriteVersion;
  messageSending.value = true;
  const clientMsgId = createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId,
    msgType: String(message.msgType || 'TEXT').toUpperCase() as Api.RealNotify.SendMessageType,
    content: message.content,
    mediaFileId: message.mediaFileId,
    clientMsgId
  };
  messages.value = messages.value.map(item => sameBusinessId(item.id, message.id)
    ? { ...item, clientMsgId, pending: true, failed: false, createdAt: String(Date.now()) }
    : item);
  try {
    const sent = await notifyApi.sendConversationMessage(params);
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    try {
      await loadConversations(false);
    } catch {
      // 会话列表刷新失败不应把重试发送成功的消息标记为失败。
    }
    if (isCurrentMessageWrite(operation, requestedUserId, conversationId)) await scrollToBottom();
  } catch {
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    const optimistic = messages.value.find(item => item.clientMsgId === clientMsgId);
    if (optimistic) {
      optimistic.pending = false;
      optimistic.failed = true;
    }
  } finally {
    if (operation === messageWriteVersion) messageSending.value = false;
  }
}

async function recallMessage(message: Api.RealNotify.ImMessageVO) {
  const requestedUserId = userStore.currentUser?.id;
  const conversationId = selectedConversationId.value;
  if (requestedUserId === undefined || conversationId === undefined) return;
  const messageId = String(message.id);
  if (recallingMessageIds.value.has(messageId)) return;
  const operation = recallWriteVersion;
  recallingMessageIds.value = new Set(recallingMessageIds.value).add(messageId);
  try {
    await notifyApi.recallConversationMessage({ id: message.id });
    if (
      operation !== recallWriteVersion
      || !isCurrentUser(requestedUserId)
      || !sameBusinessId(selectedConversationId.value, conversationId)
    ) return;
    messages.value = messages.value.map(item => sameBusinessId(item.id, message.id) ? { ...item, recalled: true, content: undefined, mediaUrl: undefined } : item);
    await loadConversations(false);
  } catch {
    // 请求层展示后端的撤回窗口或权限错误。
  } finally {
    if (
      operation !== recallWriteVersion
      || !isCurrentUser(requestedUserId)
      || !sameBusinessId(selectedConversationId.value, conversationId)
    ) return;
    const next = new Set(recallingMessageIds.value);
    next.delete(messageId);
    recallingMessageIds.value = next;
  }
}

function deleteSelectedConversation() {
  const conversation = selectedConversation.value;
  if (!conversation || deletingConversationId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const conversationId = conversation.id;
  const operation = ++conversationDeleteVersion;
  deletingConversationId.value = conversation.id;
  Modal.warning({
    title: '删除会话',
    content: '会话仅从你的列表移除；对方再次发消息后会自动恢复，历史消息不会删除。',
    hideCancel: false,
    onCancel() {
      conversationDeleteVersion += 1;
      deletingConversationId.value = undefined;
    },
    onOk: async () => {
      if (
        operation !== conversationDeleteVersion
        || !isCurrentUser(requestedUserId)
        || !sameBusinessId(selectedConversationId.value, conversationId)
      ) {
        if (operation === conversationDeleteVersion && isCurrentUser(requestedUserId)) {
          deletingConversationId.value = undefined;
        }
        return;
      }
      try {
        await notifyApi.deleteConversation(conversationId);
        if (
          operation !== conversationDeleteVersion
          || !isCurrentUser(requestedUserId)
          || !sameBusinessId(selectedConversationId.value, conversationId)
        ) return;
        conversationListGuard.invalidate();
        messageListGuard.invalidate();
        olderMessagesGuard.invalidate();
        incrementalMessagesGuard.invalidate();
        conversations.value = conversations.value.filter(item => !sameBusinessId(item.id, conversation.id));
        selectedConversationId.value = undefined;
        messages.value = [];
        loading.value = false;
        loadingOlder.value = false;
        hasOlder.value = false;
        messageLoadError.value = '';
        refreshImUnreadFromConversations();
        await selectFirstConversation();
        Message.success('会话已移除');
      } catch {
        // 请求层已展示错误，保留当前会话，避免把删除失败误显示为已移除。
      } finally {
        if (operation === conversationDeleteVersion && isCurrentUser(requestedUserId)) {
          deletingConversationId.value = undefined;
        }
      }
    }
  });
}

function lastPreview(conversation: Api.RealNotify.ImConversationVO) {
  return conversation.lastMessagePreview || '暂无消息';
}

function previewTime(conversation: Api.RealNotify.ImConversationVO) {
  if (!conversation.lastMessageAt) return '—';
  const raw = conversation.lastMessageAt;
  const date = new Date(typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function openOrderGroup() {
  if (selectedConversation.value?.bizId) router.push({ name: 'im-order-group', params: { orderCode: selectedConversation.value.bizId } });
}

function openOrder(orderId: string | number) {
  router.push({ name: 'order-detail', params: { id: orderId } });
}

function lastSyncText() {
  return lastSyncedAt.value ? `最近同步 ${lastSyncedAt.value.toLocaleTimeString()}` : '尚未同步';
}

async function refreshRestData() {
  if (disposed || restSyncing.value) return;
  restSyncing.value = true;
  try {
    await loadConversations(false);
    if (disposed) return;
    await syncCurrentConversation();
    if (disposed) return;
    lastSyncedAt.value = new Date();
  } catch {
    // 请求层已展示错误；最近同步时间不前移，保留当前会话和消息供用户重试。
  } finally {
    if (!disposed) restSyncing.value = false;
  }
}

function retryConversationLoad() {
  void init();
}

function retryMessageLoad() {
  if (selectedConversation.value) void selectConversation(selectedConversation.value);
}

notifyStore.subscribe(async event => {
  if (event.type === 'SYNC') {
    await Promise.allSettled([loadConversations(false), syncCurrentConversation()]);
    return;
  }
  if (event.type === 'IM_MESSAGE') {
    const message = event.payload;
    const conversation = conversations.value.find(item => sameBusinessId(item.id, message.conversationId));
    if (selectedConversation.value && sameBusinessId(selectedConversation.value.id, message.conversationId)) {
      messages.value = mergeMessages(messages.value, message);
      if (conversation) conversation.unreadCount = 0;
      await reportRead();
      await scrollToBottom();
    } else if (conversation && !sameBusinessId(message.senderId, userStore.currentUser?.id)) {
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    } else if (!conversation) {
      try {
        await loadConversations(false);
      } catch {
        // 实时事件触发的补偿读取失败不应产生未捕获 Promise，保留当前页面供下次同步。
      }
    }
    refreshImUnreadFromConversations();
    return;
  }
  if (event.type === 'IM_RECALL') {
    const recalled = event.payload.message;
    const messageId = recalled?.id ?? event.payload.messageId ?? event.payload.id;
    if (messageId !== undefined) {
      messages.value = messages.value.map(message => sameBusinessId(message.id, messageId)
        ? { ...message, ...recalled, recalled: true, content: undefined, mediaUrl: undefined }
        : message);
    }
    try {
      await loadConversations(false);
    } catch {
      // 撤回事件后的会话列表刷新失败不影响当前消息的撤回展示。
    }
    return;
  }
  if (event.type === 'IM_READ') {
    const readerId = event.payload.readerUserId ?? event.payload.userId;
    if (readerId !== undefined) readerWatermarks.value[String(readerId)] = event.payload.lastReadMessageId;
  }
});

onMounted(init);
onBeforeUnmount(() => {
  disposed = true;
  messageWriteVersion += 1;
  readWriteVersion += 1;
  recallWriteVersion += 1;
  conversationDeleteVersion += 1;
  conversationListGuard.invalidate();
  messageListGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
});
watch(activeTab, async () => {
  if (disposed) return;
  messageWriteVersion += 1;
  readWriteVersion += 1;
  recallWriteVersion += 1;
  conversationDeleteVersion += 1;
  messageListGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  loading.value = false;
  loadingOlder.value = false;
  messageSending.value = false;
  recallingMessageIds.value = new Set();
  deletingConversationId.value = undefined;
  messages.value = [];
  hasOlder.value = false;
  selectedConversationId.value = undefined;
  if (disposed) return;
  await selectFirstConversation();
});
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  messageWriteVersion += 1;
  readWriteVersion += 1;
  recallWriteVersion += 1;
  conversationDeleteVersion += 1;
  conversationListGuard.invalidate();
  messageListGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  conversations.value = [];
  selectedConversationId.value = undefined;
  messages.value = [];
  readerWatermarks.value = {};
  pageNo.value = 1;
  hasOlder.value = false;
  loading.value = false;
  loadingOlder.value = false;
  messageSending.value = false;
  recallingMessageIds.value = new Set();
  deletingConversationId.value = undefined;
  conversationLoading.value = false;
  conversationLoadError.value = '';
  messageLoadError.value = '';
  lastSyncedAt.value = undefined;
  if (next !== undefined) void init();
});
</script>

<template>
  <div class="im-page shop-container">
    <h1 class="page-title">消息中心</h1>
    <a-card class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
      <div class="layout">
        <aside class="sidebar">
          <a-alert v-if="conversationLoadError" type="error" :show-icon="false" class="load-error">
            {{ conversationLoadError }}
            <template #action><a-link @click="retryConversationLoad">重新加载</a-link></template>
          </a-alert>
          <div class="sync-bar">
            <span>{{ lastSyncText() }}</span>
            <a-button type="text" size="mini" :loading="restSyncing" @click="refreshRestData">刷新会话</a-button>
          </div>
          <a-tabs v-model:active-key="activeTab" class="sidebar-tabs">
            <a-tab-pane key="group" :title="`三方群 (${groups.length})`">
              <div v-if="conversationLoading" class="sidebar-loading"><a-spin :loading="true" /><span>正在同步会话</span></div>
              <div v-else-if="groups.length" class="conv-list chat-scroll">
                <div v-for="conversation in groups" :key="conversation.id" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, conversation.id) }" @click="selectConversation(conversation)">
                  <img v-if="conversation.peerAvatar" :src="conversation.peerAvatar" :alt="conversation.peerName || '会话头像'" class="avatar image" />
                  <div v-else class="avatar group">{{ (conversation.peerName || conversation.title || '订').slice(0, 1) }}</div>
                  <div class="info">
                    <div class="conv-title-row">
                      <div class="conv-name">{{ conversation.peerName || conversation.title || `订单会话 ${conversation.bizId || ''}` }}</div>
                      <span v-if="conversation.unreadCount" class="unread-badge">{{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}</span>
                    </div>
                    <div class="conv-meta"><span class="preview">{{ lastPreview(conversation) }}</span></div>
                    <div class="conv-time">{{ conversation.orderNo ? `订单 ${conversation.orderNo}` : `业务 ${conversation.bizId || '—'}` }} · {{ previewTime(conversation) }}</div>
                  </div>
                </div>
              </div>
              <EmptyState v-else title="暂无三方群" description="下单后会自动创建订单三方群" />
            </a-tab-pane>
            <a-tab-pane key="cs" title="平台客服">
              <div v-if="conversationLoading" class="sidebar-loading"><a-spin :loading="true" /><span>正在同步会话</span></div>
              <div v-else-if="csSessions.length" class="conv-list chat-scroll">
                <div v-for="conversation in csSessions" :key="conversation.id" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, conversation.id) }" @click="selectConversation(conversation)">
                  <div class="avatar cs">客</div><div class="info"><div class="conv-name">{{ conversation.title || '油宝在线客服' }}</div><div class="conv-meta">{{ lastPreview(conversation) }}</div></div>
                </div>
              </div>
              <EmptyState v-else title="暂无客服会话" />
            </a-tab-pane>
            <a-tab-pane key="presale" :title="`售前 (${presaleSessions.length})`">
              <div v-if="conversationLoading" class="sidebar-loading"><a-spin :loading="true" /><span>正在同步会话</span></div>
              <div v-else-if="presaleSessions.length" class="conv-list chat-scroll">
                <div v-for="conversation in presaleSessions" :key="conversation.id" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, conversation.id) }" @click="selectConversation(conversation)">
                  <div class="avatar presale">售</div><div class="info"><div class="conv-name">{{ conversation.title || '售前会话' }}</div><div class="conv-meta">{{ lastPreview(conversation) }}</div></div>
                </div>
              </div>
              <EmptyState v-else title="暂无售前会话" />
            </a-tab-pane>
          </a-tabs>
        </aside>

        <section class="chat-pane">
          <a-spin class="chat-spin" :loading="loading">
          <div v-if="selectedConversation" class="conversation">
              <div class="conversation-header">
                <div class="header-product">
                  <img v-if="selectedConversation.productImage" :src="selectedConversation.productImage" alt="订单商品" />
                  <div><div class="cs-title">{{ selectedConversation.productTitle || selectedConversation.title || '会话' }}</div><div class="cs-sub">{{ selectedConversation.orderNo ? `订单 ${selectedConversation.orderNo}` : `业务 ID ${selectedConversation.bizId || '—'}` }} · {{ selectedConversation.orderStatusText || selectedConversation.myRole || '—' }}</div></div>
                </div>
                <div class="header-actions"><RealtimeConnectionStatus :state="notifyStore.socketState" @reconnect="notifyStore.connect" /><a-button type="text" size="mini" :loading="restSyncing" @click="refreshRestData">同步消息</a-button><a-link v-if="selectedConversation.bizId" @click="openOrderGroup">独立窗口打开</a-link><a-link status="danger" :disabled="deletingConversationId !== undefined" @click="deleteSelectedConversation">{{ deletingConversationId !== undefined ? '删除中…' : '删除会话' }}</a-link></div>
            </div>
            <a-alert v-if="notifyStore.socketState === 'closed'" type="warning" :show-icon="false" class="realtime-alert">
              实时连接暂不可用，消息仍可发送；刷新页面或恢复连接后会自动同步。
              <template #action><a-space size="small"><a-link @click="notifyStore.connect">立即重连</a-link><a-link :loading="restSyncing" @click="refreshRestData">刷新数据</a-link></a-space></template>
            </a-alert>
            <div ref="scrollRef" class="messages chat-scroll">
                <div v-if="hasOlder" class="load-older"><a-link :loading="loadingOlder" @click="loadOlderMessages">加载更早消息</a-link></div>
                <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="getSenderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
                <EmptyState v-if="messageLoadError" :title="messageLoadError" action-text="重新加载" @action="retryMessageLoad" />
                <div v-else-if="!messages.length" class="empty-msg">该群暂无消息</div>
              </div>
              <MessageInput :context-key="String(userStore.currentUser?.id || '') + ':' + String(selectedConversationId || '')" :submitting="messageSending" @send="onSend" />
              <a-image-preview-group :src-list="imageUrls" :visible="imagePreviewVisible" :current="imagePreviewCurrent" @update:visible="imagePreviewVisible = $event" @update:current="imagePreviewCurrent = $event" />
            </div>
            <div v-else class="placeholder"><EmptyState :title="conversationLoadError || '请选择左侧会话'" :description="conversationLoadError ? '不会把请求失败误显示为没有会话。' : '点击三方群或客服开始聊天'" :action-text="conversationLoadError ? '重新加载' : undefined" @action="retryConversationLoad" /></div>
          </a-spin>
        </section>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.im-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.chat-card { background: #fff; border-radius: var(--bw-card-radius); overflow: hidden; }
.chat-card :deep(.arco-card-body) { height: 100%; min-height: 0; padding: 0 !important; overflow: hidden; }
.layout { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 200px); min-height: 600px; overflow: hidden; }
.sidebar { background: #fafbfc; border-right: 1px solid #f2f3f5; display: flex; flex-direction: column; min-height: 0; }
.load-error { margin: 8px 8px 0; }
.sync-bar { display: flex; align-items: center; justify-content: space-between; min-height: 36px; padding: 0 8px 0 14px; color: var(--yb-faint); font-size: 11px; border-bottom: 1px solid #f2f3f5; }
.sidebar-loading { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 44px 16px; color: var(--yb-muted); font-size: 12px; }
.sidebar-tabs { flex: 1; min-height: 0; }
.sidebar-tabs :deep(.arco-tabs-content) { height: calc(100% - 46px); }
.sidebar-tabs :deep(.arco-tabs-content-list), .sidebar-tabs :deep(.arco-tabs-pane) { height: 100%; }
.conv-list { overflow-y: auto; height: 100%; }
.conv-row { display: flex; gap: 10px; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f7f8fa; transition: background .15s; }
.conv-row:hover, .conv-row.active { background: #f3f7ff; }
.conv-row.active { border-left: 3px solid var(--bw-brand-primary); }
.avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; flex-shrink: 0; object-fit: cover; }
.avatar.group { background: #165dff; }.avatar.cs { background: #00b42a; }.avatar.presale { background: #ff7d00; }
.info { flex: 1; min-width: 0; }.conv-title-row { display: flex; align-items: center; gap: 8px; }
.conv-name { min-width: 0; flex: 1; font-size: 13px; font-weight: 500; color: #1d2129; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unread-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #f53f3f; color: #fff; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; }
.conv-meta { font-size: 11px; color: #86909c; margin-top: 2px; }.preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.conv-time { font-size: 10px; color: #c9cdd4; margin-top: 2px; }
.chat-pane { display: flex; flex-direction: column; background: #f7f8fa; min-width: 0; min-height: 0; }.chat-spin { flex: 1; min-height: 0; }.chat-spin :deep(.arco-spin) { height: 100%; min-height: 0; }
.conversation { display: flex; flex-direction: column; height: 100%; min-height: 0; }.conversation-header { background: #fff; padding: 12px 20px; border-bottom: 1px solid #f2f3f5; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.header-product { display: flex; align-items: center; gap: 10px; min-width: 0; }.header-product img { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; }.cs-title { font-weight: 600; font-size: 14px; }.cs-sub { margin-top: 3px; font-size: 12px; color: #86909c; }.header-actions { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.realtime-alert { width: calc(100% - 40px); margin: 10px auto 0; box-sizing: border-box; flex: 0 0 auto; }.messages { flex: 1 1 auto; min-height: 0; padding: 16px 20px; overflow-y: auto; overscroll-behavior: contain; }.conversation :deep(.input-area) { position: sticky; bottom: 0; z-index: 2; flex: 0 0 auto; }.load-older { text-align: center; margin-bottom: 14px; }.empty-msg { text-align: center; color: #86909c; padding: 40px 0; font-size: 13px; }.placeholder { display: flex; align-items: center; justify-content: center; height: 100%; }
@media (max-width: 960px) { .layout { grid-template-columns: 260px minmax(0, 1fr); } .conversation-header { padding: 12px 16px; } .messages { padding: 14px 16px; } .realtime-alert { width: calc(100% - 32px); } }
@media (max-width: 720px) { .layout { grid-template-columns: minmax(0, 1fr); height: calc(100vh - 160px); min-height: 560px; } .sidebar { max-height: 220px; border-right: 0; border-bottom: 1px solid #f2f3f5; } .header-actions { gap: 10px; } .conversation-header { align-items: flex-start; } .messages { padding: 12px; } .realtime-alert { width: calc(100% - 24px); margin-top: 8px; } }
</style>
