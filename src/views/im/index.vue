<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
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
const loadingOlder = ref(false);
const pageNo = ref(1);
const hasOlder = ref(false);
const scrollRef = ref<HTMLDivElement>();
const readerWatermarks = ref<Record<string, string | number>>({});
const imagePreviewVisible = ref(false);
const imagePreviewCurrent = ref(0);

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
  const response = await notifyApi.fetchConversations({ pageNo: 1, pageSize: 100 });
  conversations.value = response.records || [];
  notifyStore.setImUnreadCount(conversations.value.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0));
  if (selectFirst) await selectFirstConversation();
}

async function init() {
  loading.value = true;
  try {
    await loadConversations();
  } catch {
    conversations.value = [];
    selectedConversationId.value = undefined;
    messages.value = [];
  } finally {
    loading.value = false;
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
  selectedConversationId.value = conversation.id;
  loading.value = true;
  pageNo.value = 1;
  try {
    const response = await notifyApi.fetchConversationMessages({ conversationId: conversation.id, pageNo: 1, pageSize: 50 });
    messages.value = mergeMessages([], response.records || []);
    hasOlder.value = messages.value.length < (response.total || 0);
    conversation.unreadCount = 0;
    refreshImUnreadFromConversations();
    await reportRead();
    await scrollToBottom();
  } catch {
    messages.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadOlderMessages() {
  if (!selectedConversation.value || !hasOlder.value || loadingOlder.value) return;
  loadingOlder.value = true;
  const container = scrollRef.value;
  const oldHeight = container?.scrollHeight || 0;
  try {
    const nextPage = pageNo.value + 1;
    const response = await notifyApi.fetchConversationMessages({
      conversationId: selectedConversation.value.id,
      pageNo: nextPage,
      pageSize: 50
    });
    messages.value = mergeMessages(response.records || [], messages.value);
    pageNo.value = nextPage;
    hasOlder.value = messages.value.length < (response.total || 0);
    await nextTick();
    if (container) container.scrollTop = container.scrollHeight - oldHeight;
  } finally {
    loadingOlder.value = false;
  }
}

function refreshImUnreadFromConversations() {
  notifyStore.setImUnreadCount(conversations.value.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0));
}

async function reportRead() {
  const conversation = selectedConversation.value;
  const lastReadMessageId = latestServerMessageId(messages.value);
  if (!conversation || !lastReadMessageId || document.visibilityState !== 'visible') return;
  try {
    await notifyApi.markConversationRead({ conversationId: conversation.id, lastReadMessageId });
    conversation.lastReadMessageId = lastReadMessageId;
  } catch {
    // 历史页首次拉取本身也会推进已读；显式上报失败时保留当前页面，不影响消息阅读。
  }
}

async function syncCurrentConversation() {
  const conversation = selectedConversation.value;
  if (!conversation) return;
  const sinceId = latestServerMessageId(messages.value);
  const incoming = await notifyApi.fetchIncrementalMessages({ conversationId: conversation.id, sinceId, limit: 200 });
  if (incoming.length) {
    messages.value = mergeMessages(messages.value, incoming);
    await reportRead();
    await scrollToBottom();
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

async function onSend(payload: { type: 'text' | 'image' | 'audio'; content?: string; mediaUrl?: string; duration?: number }) {
  const conversation = selectedConversation.value;
  if (!conversation) return;
  const clientMsgId = createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId: conversation.id,
    msgType: payload.type === 'image' ? 'IMAGE' : payload.type === 'audio' ? 'VOICE' : 'TEXT',
    content: payload.content,
    mediaUrl: payload.mediaUrl,
    duration: payload.duration,
    clientMsgId
  };
  messages.value = mergeMessages(messages.value, createOptimisticMessage(params, {
    id: userStore.currentUser?.id,
    name: userStore.displayName,
    avatar: userStore.currentUser?.avatar,
    role: conversation.myRole
  }));
  await scrollToBottom();
  try {
    const sent = await notifyApi.sendConversationMessage(params);
    messages.value = mergeMessages(messages.value, sent);
    await loadConversations(false);
    await scrollToBottom();
  } catch {
    const optimistic = messages.value.find(message => message.clientMsgId === clientMsgId);
    if (optimistic) optimistic.failed = true;
  }
}

async function retryMessage(message: Api.RealNotify.ImMessageVO) {
  const conversation = selectedConversation.value;
  if (!conversation || !message.failed) return;
  const clientMsgId = createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId: conversation.id,
    msgType: String(message.msgType || 'TEXT').toUpperCase() as Api.RealNotify.SendMessageType,
    content: message.content,
    mediaUrl: message.mediaUrl,
    duration: message.duration,
    clientMsgId
  };
  messages.value = messages.value.map(item => sameBusinessId(item.id, message.id)
    ? { ...item, clientMsgId, pending: true, failed: false, createdAt: String(Date.now()) }
    : item);
  try {
    messages.value = mergeMessages(messages.value, await notifyApi.sendConversationMessage(params));
    await loadConversations(false);
    await scrollToBottom();
  } catch {
    const optimistic = messages.value.find(item => item.clientMsgId === clientMsgId);
    if (optimistic) {
      optimistic.pending = false;
      optimistic.failed = true;
    }
  }
}

async function recallMessage(message: Api.RealNotify.ImMessageVO) {
  try {
    await notifyApi.recallConversationMessage({ id: message.id });
    messages.value = messages.value.map(item => sameBusinessId(item.id, message.id) ? { ...item, recalled: true, content: undefined, mediaUrl: undefined } : item);
    await loadConversations(false);
  } catch {
    // 请求层展示后端的撤回窗口或权限错误。
  }
}

function deleteSelectedConversation() {
  const conversation = selectedConversation.value;
  if (!conversation) return;
  Modal.warning({
    title: '删除会话',
    content: '会话仅从你的列表移除；对方再次发消息后会自动恢复，历史消息不会删除。',
    hideCancel: false,
    onOk: async () => {
      await notifyApi.deleteConversation(conversation.id);
      conversations.value = conversations.value.filter(item => !sameBusinessId(item.id, conversation.id));
      selectedConversationId.value = undefined;
      messages.value = [];
      refreshImUnreadFromConversations();
      await selectFirstConversation();
      Message.success('会话已移除');
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
      await loadConversations(false);
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
    await loadConversations(false);
    return;
  }
  if (event.type === 'IM_READ') {
    const readerId = event.payload.readerUserId ?? event.payload.userId;
    if (readerId !== undefined) readerWatermarks.value[String(readerId)] = event.payload.lastReadMessageId;
  }
});

onMounted(init);
watch(activeTab, async () => {
  messages.value = [];
  selectedConversationId.value = undefined;
  await selectFirstConversation();
});
</script>

<template>
  <div class="im-page shop-container">
    <h1 class="page-title">消息中心</h1>
    <a-card class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
      <div class="layout">
        <aside class="sidebar">
          <a-tabs v-model:active-key="activeTab" class="sidebar-tabs">
            <a-tab-pane key="group" :title="`三方群 (${groups.length})`">
              <div v-if="groups.length" class="conv-list chat-scroll">
                <div v-for="conversation in groups" :key="conversation.id" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, conversation.id) }" @click="selectConversation(conversation)">
                  <img v-if="conversation.peerAvatar" :src="conversation.peerAvatar" class="avatar image" />
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
              <div v-if="csSessions.length" class="conv-list chat-scroll">
                <div v-for="conversation in csSessions" :key="conversation.id" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, conversation.id) }" @click="selectConversation(conversation)">
                  <div class="avatar cs">客</div><div class="info"><div class="conv-name">{{ conversation.title || '油宝在线客服' }}</div><div class="conv-meta">{{ lastPreview(conversation) }}</div></div>
                </div>
              </div>
              <EmptyState v-else title="暂无客服会话" />
            </a-tab-pane>
            <a-tab-pane key="presale" :title="`售前 (${presaleSessions.length})`">
              <div v-if="presaleSessions.length" class="conv-list chat-scroll">
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
                  <img v-if="selectedConversation.productImage" :src="selectedConversation.productImage" />
                  <div><div class="cs-title">{{ selectedConversation.productTitle || selectedConversation.title || '会话' }}</div><div class="cs-sub">{{ selectedConversation.orderNo ? `订单 ${selectedConversation.orderNo}` : `业务 ID ${selectedConversation.bizId || '—'}` }} · {{ selectedConversation.orderStatusText || selectedConversation.myRole || '—' }}</div></div>
                </div>
                <div class="header-actions"><a-link v-if="selectedConversation.bizId" @click="openOrderGroup">独立窗口打开</a-link><a-link status="danger" @click="deleteSelectedConversation">删除会话</a-link></div>
            </div>
            <a-alert v-if="notifyStore.socketState === 'closed'" type="warning" :show-icon="false" class="realtime-alert">
              实时连接暂不可用，消息仍可发送；刷新页面或恢复连接后会自动同步。
              <template #action><a-link @click="notifyStore.connect">立即重连</a-link></template>
            </a-alert>
            <div ref="scrollRef" class="messages chat-scroll">
                <div v-if="hasOlder" class="load-older"><a-link :loading="loadingOlder" @click="loadOlderMessages">加载更早消息</a-link></div>
                <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="getSenderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
                <div v-if="!messages.length" class="empty-msg">该群暂无消息</div>
              </div>
              <MessageInput @send="onSend" />
              <a-image-preview-group :src-list="imageUrls" :visible="imagePreviewVisible" :current="imagePreviewCurrent" @update:visible="imagePreviewVisible = $event" @update:current="imagePreviewCurrent = $event" />
            </div>
            <div v-else class="placeholder"><EmptyState title="请选择左侧会话" description="点击三方群或客服开始聊天" /></div>
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
.header-product { display: flex; align-items: center; gap: 10px; min-width: 0; }.header-product img { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; }.cs-title { font-weight: 600; font-size: 14px; }.cs-sub { margin-top: 3px; font-size: 12px; color: #86909c; }.header-actions { display: flex; gap: 14px; flex-shrink: 0; }
.realtime-alert { width: calc(100% - 40px); margin: 10px auto 0; box-sizing: border-box; flex: 0 0 auto; }.messages { flex: 1 1 auto; min-height: 0; padding: 16px 20px; overflow-y: auto; overscroll-behavior: contain; }.conversation :deep(.input-area) { position: sticky; bottom: 0; z-index: 2; flex: 0 0 auto; }.load-older { text-align: center; margin-bottom: 14px; }.empty-msg { text-align: center; color: #86909c; padding: 40px 0; font-size: 13px; }.placeholder { display: flex; align-items: center; justify-content: center; height: 100%; }
@media (max-width: 960px) { .layout { grid-template-columns: 260px minmax(0, 1fr); } .conversation-header { padding: 12px 16px; } .messages { padding: 14px 16px; } .realtime-alert { width: calc(100% - 32px); } }
@media (max-width: 720px) { .layout { grid-template-columns: minmax(0, 1fr); height: calc(100vh - 160px); min-height: 560px; } .sidebar { max-height: 220px; border-right: 0; border-bottom: 1px solid #f2f3f5; } .header-actions { gap: 10px; } .conversation-header { align-items: flex-start; } .messages { padding: 12px; } .realtime-alert { width: calc(100% - 24px); margin-top: 8px; } }
</style>
