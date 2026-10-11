<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ImagePreview from '@/components/common/image-preview.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
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
import { createCoalescedRefresh, createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const notifyStore = useNotifyStore();

type ConvKind = 'group' | 'cs';
const activeTab = ref<ConvKind>('group');
const pendingConversationTarget = ref<string>();
const targetMessage = ref('');
let selectingTargetTab = false;
const conversations = ref<Api.RealNotify.ImConversationVO[]>([]);
const selectedConversationId = ref<string | number>();
const conversationOrders = ref<Api.RealNotify.ImConversationOrder[]>([]);
const includeHistoryOrders = ref(false);
const ordersLoading = ref(false);
const interventionLoading = ref(false);
const supportLoading = ref(false);
const messages = ref<Api.RealNotify.ImMessageVO[]>([]);
const loading = ref(false);
const conversationLoading = ref(false);
const loadingMoreConversations = ref(false);
const conversationPageNo = ref(1);
const conversationTotal = ref(0);
const conversationLoadError = ref('');
const messageLoadError = ref('');
const restSyncing = ref(false);
const lastSyncedAt = ref<Date>();
const loadingOlder = ref(false);
const messageSending = ref(false);
const mediaBusy = ref(false);
const pageNo = ref(1);
const hasOlder = ref(false);
const syncCursor = ref<string | number>('0');
const syncIncomplete = ref(false);
const messageSyncError = ref('');
const newMessagesAvailable = ref(false);
const scrollRef = ref<HTMLDivElement>();
let historyAnchor: ReturnType<typeof captureMessageAnchor>;
let followingLatest = true;
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
let deletionModal: ReturnType<typeof Modal.warning> | undefined;
let conversationLifecycleVersion = 0;
let disposed = false;
let historyScrollVersion = 0;
const conversationRefresh = createCoalescedRefresh(
  // 回读服务端摘要、时间和排序，不用消息正文自行拼装媒体/系统消息预览。
  () => loadConversations(false),
  () => { /* loadConversations 保留原会话并显示可重试错误。 */ }
);

function scheduleConversationRefresh() {
  if (disposed) return;
  conversationRefresh.schedule();
}

function cancelConversationRefresh() {
  conversationRefresh.cancel();
}

function isCurrentUser(userId: string | number | undefined) {
  return userId !== undefined && String(userStore.currentUser?.id) === String(userId);
}

function isCurrentMessageWrite(operation: number, userId: string | number, conversationId: string | number) {
  return operation === messageWriteVersion
    && isCurrentUser(userId)
    && sameBusinessId(selectedConversationId.value, conversationId);
}

function hasConversationType(conversation: Api.RealNotify.ImConversationVO, type: string) {
  return String(conversation.type || '').toUpperCase() === type;
}

const groups = computed(() => conversations.value.filter(conversation => hasConversationType(conversation, 'ORDER_GROUP')));
const csSessions = computed(() => conversations.value.filter(conversation => hasConversationType(conversation, 'SUPPORT')));
const selectedConversation = computed(() => conversations.value.find(conversation => sameBusinessId(conversation.id, selectedConversationId.value)));
const imageUrls = computed(() => conversationImageUrls(messages.value));
watch(imageUrls, (urls, previous) => {
  if (!imagePreviewVisible.value) return;
  const selected = previous[imagePreviewCurrent.value];
  const index = selected ? urls.indexOf(selected) : -1;
  if (index < 0) imagePreviewVisible.value = false;
  else imagePreviewCurrent.value = index;
}, { flush: 'sync' });

function currentCandidates() { return activeTab.value === 'group' ? groups.value : csSessions.value; }

async function loadConversations(selectFirst = true, append = false) {
  if (disposed) return;
  const isCurrent = conversationListGuard.begin();
  conversationLoadError.value = '';
  try {
    const targetPage = append ? conversationPageNo.value + 1 : conversationPageNo.value;
    const records = new Map((append ? conversations.value : []).map(item => [String(item.id), item]));
    let loadedPage = append ? conversationPageNo.value : 0;
    let total = 0;
    for (let page = append ? targetPage : 1; page <= targetPage
      || (!!pendingConversationTarget.value && !records.has(pendingConversationTarget.value)
        && records.size < total && page < targetPage + 5); page += 1) {
      const response = await notifyApi.fetchConversations({ pageNo: page, pageSize: 50 }, { signal: isCurrent.signal });
      if (!isCurrent()) return;
      total = response.total;
      response.records.forEach(item => records.set(String(item.id), item));
      loadedPage = page;
      if (records.size >= total) break;
      if (!response.records.length) throw new Error('会话分页返回空记录，请重新同步');
    }
    conversations.value = [...records.values()];
    conversationPageNo.value = Math.max(1, loadedPage);
    conversationTotal.value = total;
    void notifyStore.refreshUnreadCounts();
    if (selectFirst || selectedConversationId.value === undefined) {
      await selectFirstConversation();
      if (!isCurrent()) return;
    }
  } catch (error) {
    if (!isCurrent()) return;
    conversationLoadError.value = '会话加载失败，请检查网络后重试';
    throw error;
  }
}

async function loadMoreConversations() {
  if (disposed || loadingMoreConversations.value || conversationLoading.value || restSyncing.value || conversations.value.length >= conversationTotal.value) return;
  const lifecycle = conversationLifecycleVersion;
  loadingMoreConversations.value = true;
  try {
    await loadConversations(false, true);
  } catch {
    // 保留已加载会话，错误区域提供重新同步入口。
  } finally {
    if (!disposed && lifecycle === conversationLifecycleVersion) loadingMoreConversations.value = false;
  }
}

async function init() {
  if (disposed) return;
  const lifecycle = conversationLifecycleVersion;
  conversationLoading.value = true;
  loading.value = true;
  try {
    await loadConversations();
    if (!disposed && lifecycle === conversationLifecycleVersion && !messageLoadError.value) lastSyncedAt.value = new Date();
  } catch {
    if (disposed || lifecycle !== conversationLifecycleVersion) return;
    conversations.value = [];
    conversationPageNo.value = 1;
    conversationTotal.value = 0;
    selectedConversationId.value = undefined;
    messages.value = [];
  } finally {
    if (!disposed && lifecycle === conversationLifecycleVersion) {
      loading.value = false;
      conversationLoading.value = false;
    }
  }
}

async function selectFirstConversation() {
  if (disposed) return;
  const target = pendingConversationTarget.value;
  if (target) {
    const requested = conversations.value.find(conversation => sameBusinessId(conversation.id, target));
    if (!requested) {
      targetMessage.value = conversations.value.length < conversationTotal.value
        ? '目标会话尚未加载，请继续加载更多会话定位；不会打开其他会话'
        : '当前会话列表中未找到目标，可能已删除或无权访问；不会打开其他会话';
      return;
    }
    const kind = hasConversationType(requested, 'ORDER_GROUP') ? 'group'
      : hasConversationType(requested, 'SUPPORT') ? 'cs' : undefined;
    if (!kind) { targetMessage.value = '目标会话类型暂不支持'; return; }
    selectingTargetTab = true;
    activeTab.value = kind;
    selectingTargetTab = false;
    await selectConversation(requested);
    return;
  }
  const candidates = currentCandidates();
  if (candidates.length && !candidates.some(conversation => sameBusinessId(conversation.id, selectedConversationId.value))) {
    await selectConversation(candidates[0]);
  }
}

async function selectConversation(conversation: Api.RealNotify.ImConversationVO) {
  if (disposed) return;
  pendingConversationTarget.value = undefined;
  targetMessage.value = '';
  conversationDeleteVersion += 1;
  deletionModal?.close();
  deletingConversationId.value = undefined;
  const conversationId = conversation.id;
  messageWriteVersion += 1;
  recallWriteVersion += 1;
  recallingMessageIds.value = new Set();
  messageSending.value = false;
  const isCurrent = messageListGuard.begin();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  selectedConversationId.value = conversationId;
  conversationOrders.value = [];
  includeHistoryOrders.value = false;
  if (route.query.conversationId !== String(conversationId)) {
    void router.replace({ query: { ...route.query, conversationId: String(conversationId) } });
  }
  readerWatermarks.value = {};
  messages.value = [];
  syncCursor.value = '0';
  syncIncomplete.value = false;
  messageSyncError.value = '';
  newMessagesAvailable.value = false;
  hasOlder.value = false;
  loadingOlder.value = false;
  loading.value = true;
  messageLoadError.value = '';
  pageNo.value = 1;
  if (conversation.type === 'ORDER_GROUP') void loadConversationOrders();
  try {
    const response = await notifyApi.fetchConversationMessages(
      { conversationId, pageNo: 1, pageSize: 50 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    messages.value = mergeMessages(messages.value, response.records || []);
    syncCursor.value = latestServerMessageId(mergeMessages([], response.records || [])) ?? '0';
    syncIncomplete.value = false;
    messageSyncError.value = '';
    newMessagesAvailable.value = false;
    hasOlder.value = messages.value.length < (response.total || 0);
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

async function loadConversationOrders() {
  const conversation = selectedConversation.value;
  if (!conversation || conversation.type !== 'ORDER_GROUP') return;
  const id = conversation.id;
  ordersLoading.value = true;
  try {
    const rows = await notifyApi.fetchConversationOrders(id, includeHistoryOrders.value);
    if (sameBusinessId(selectedConversationId.value, id)) conversationOrders.value = rows;
  } finally {
    if (sameBusinessId(selectedConversationId.value, id)) ordersLoading.value = false;
  }
}
async function toggleHistoryOrders() {
  includeHistoryOrders.value = !includeHistoryOrders.value;
  await loadConversationOrders();
}
async function openSupportConversation() {
  if (supportLoading.value) return;
  supportLoading.value = true;
  try {
    const conversation = await notifyApi.fetchSupportConversation();
    const index = conversations.value.findIndex(item => sameBusinessId(item.id, conversation.id));
    if (index >= 0) conversations.value.splice(index, 1, conversation); else conversations.value.unshift(conversation);
    activeTab.value = 'cs';
    await selectConversation(conversation);
  } finally { supportLoading.value = false; }
}
async function requestIntervention() {
  const conversation = selectedConversation.value;
  if (!conversation || conversation.type !== 'ORDER_GROUP' || conversation.interveneStatus !== 'NONE' || interventionLoading.value) return;
  interventionLoading.value = true;
  try {
    Object.assign(conversation, await notifyApi.requestConversationIntervention({ conversationId: conversation.id }));
    Message.success('已申请平台介入');
  } finally { interventionLoading.value = false; }
}

async function loadOlderMessages() {
  if (!selectedConversation.value || !hasOlder.value || loadingOlder.value) return;
  const conversationId = selectedConversation.value.id;
  const isCurrent = olderMessagesGuard.begin();
  loadingOlder.value = true;
  const container = scrollRef.value;
  try {
    const nextPage = pageNo.value + 1;
    const response = await notifyApi.fetchConversationMessages(
      { conversationId, pageNo: nextPage, pageSize: 50 },
      { signal: isCurrent.signal }
    );
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    const anchor = captureMessageAnchor(container);
    const scrollVersion = historyScrollVersion;
    messages.value = mergeMessages(response.records || [], messages.value);
    pageNo.value = nextPage;
    hasOlder.value = messages.value.length < (response.total || 0);
    await nextTick();
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    if (scrollVersion === historyScrollVersion) restoreMessageAnchor(container, anchor);
    historyAnchor = captureMessageAnchor(container);
  } catch {
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    // 请求层已展示错误；保留当前消息和滚动位置，用户可再次加载历史。
  } finally {
    if (isCurrent() && sameBusinessId(selectedConversationId.value, conversationId)) loadingOlder.value = false;
  }
}

function refreshImUnreadFromConversations() {
  notifyStore.scheduleUnreadRefresh();
}

const readRequests = new Set<string>();
const onReadVisibility = () => { void reportRead(); };
onMounted(() => document.addEventListener('visibilitychange', onReadVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onReadVisibility));
async function reportRead(expectedConversationId?: string | number) {
  if (disposed) return;
  if (!scrollRef.value || scrollRef.value.clientHeight === 0
    || scrollRef.value.scrollHeight - scrollRef.value.scrollTop - scrollRef.value.clientHeight > 1) return;
  const conversation = selectedConversation.value;
  const lastReadMessageId = latestServerMessageId(messages.value);
  if (!conversation || !lastReadMessageId || document.visibilityState !== 'visible') return;
  if (expectedConversationId !== undefined && !sameBusinessId(conversation.id, expectedConversationId)) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  if (conversation.lastReadMessageId !== undefined && compareBusinessId(lastReadMessageId, conversation.lastReadMessageId) <= 0) return;
  const readKey = `${requestedUserId}:${conversation.id}:${lastReadMessageId}`;
  if (readRequests.has(readKey)) return;
  readRequests.add(readKey);
  const operation = ++readWriteVersion;
  try {
    await notifyApi.markConversationRead({ conversationId: conversation.id, lastReadMessageId });
    if (
      operation !== readWriteVersion
      || !isCurrentUser(requestedUserId)
      || !sameBusinessId(selectedConversationId.value, conversation.id)
    ) return;
    conversation.lastReadMessageId = lastReadMessageId;
    conversation.unreadCount = 0;
    notifyStore.scheduleUnreadRefresh();
  } catch {
    // 分页不再隐式已读；失败保留未读水位，下次可见/滚动时重试。
  } finally { readRequests.delete(readKey); }
}

async function syncCurrentConversation() {
  if (disposed) return;
  const conversation = selectedConversation.value;
  if (!conversation || loading.value || messageLoadError.value) return;
  const conversationId = conversation.id;
  const isCurrent = incrementalMessagesGuard.begin();
  const followBottom = isNearMessageBottom(scrollRef.value);
  const scrollVersion = historyScrollVersion;
  let receivedNewMessages = false;
  messageSyncError.value = '';
  try {
    const complete = await syncMessageGap({ conversationId, sinceId: syncCursor.value, signal: isCurrent.signal,
      request: (sinceId, limit) => notifyApi.fetchIncrementalMessages({ conversationId, sinceId, limit }, { signal: isCurrent.signal }),
      accept: (incoming, cursor) => {
        if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
        const previousCount = messages.value.length;
        messages.value = mergeMessages(messages.value, incoming);
        receivedNewMessages ||= messages.value.length > previousCount;
        syncCursor.value = cursor;
        if (receivedNewMessages && !followBottom) newMessagesAvailable.value = true;
      }
    });
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    syncIncomplete.value = !complete;
    if (!isCurrent() || !sameBusinessId(selectedConversationId.value, conversationId)) return;
    if (followBottom && scrollVersion === historyScrollVersion) await scrollToBottom();
    else if (receivedNewMessages) newMessagesAvailable.value = true;
    return complete;
  } catch (error) {
    if (!isCurrent()) return;
    messageSyncError.value = '消息尚未同步完整，请重试；已读取的消息会保留';
    throw error;
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

async function onSend(payload: { type: 'text' | 'image' | 'audio' | 'video'; content?: string; mediaFileId?: string | number; coverFileId?: string | number; coverUrl?: string; duration?: number }) {
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
    role: conversation.myRole
  }));
  await scrollToBottom();
  if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
  try {
    const sent = await notifyApi.sendConversationMessage(params, { showError: false });
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    void loadConversations(false).catch(() => { /* 摘要刷新不阻塞已成功消息的输入框。 */ });
    if (isCurrentMessageWrite(operation, requestedUserId, conversationId)) await scrollToBottom();
  } catch (error) {
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = markUnconfirmedMessageFailed(messages.value, clientMsgId);
    if (messages.value.some(message => message.clientMsgId === clientMsgId && message.failed)) {
      Message.error(error instanceof Error ? error.message : '未取得消息发送结果，请核对后使用原消息重试');
    }
  } finally {
    if (operation === messageWriteVersion) messageSending.value = false;
  }
}

async function retryMessage(message: Api.RealNotify.ImMessageVO) {
  const conversation = selectedConversation.value;
  if (!conversation || !message.failed || messageSending.value || mediaBusy.value) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const conversationId = conversation.id;
  const operation = ++messageWriteVersion;
  messageSending.value = true;
  const clientMsgId = message.clientMsgId || createClientMessageId();
  const params: Api.RealNotify.ImSendMessageParams = {
    conversationId,
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
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = mergeMessages(messages.value, sent);
    void loadConversations(false).catch(() => { /* 摘要刷新不阻塞已成功消息的输入框。 */ });
    if (isCurrentMessageWrite(operation, requestedUserId, conversationId)) await scrollToBottom();
  } catch (error) {
    if (!isCurrentMessageWrite(operation, requestedUserId, conversationId)) return;
    messages.value = markUnconfirmedMessageFailed(messages.value, clientMsgId);
    if (messages.value.some(item => item.clientMsgId === clientMsgId && item.failed)) {
      Message.error(error instanceof Error ? error.message : '未取得消息发送结果，请核对后使用原消息重试');
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
    messages.value = messages.value.map(item => sameBusinessId(item.id, message.id) ? recalledMessage(item) : item);
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
  deletionModal = Modal.warning({
    title: '删除会话',
    content: '会话仅从你的列表移除；对方再次发消息后会自动恢复，历史消息不会删除。',
    hideCancel: false,
    onCancel() {
      if (operation !== conversationDeleteVersion || !isCurrentUser(requestedUserId)) return;
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
        if (!currentCandidates().length) {
          void router.replace({ query: { ...route.query, conversationId: undefined } });
        }
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
  if (selectedConversation.value?.orderId) router.push({ name: 'im-order-group', params: { orderCode: selectedConversation.value.orderId } });
}

function openOrder(orderId: string | number) {
  router.push({ name: 'order-detail', params: { id: orderId } });
}

function lastSyncText() {
  return lastSyncedAt.value ? `最近同步 ${lastSyncedAt.value.toLocaleTimeString()}` : '尚未同步';
}

async function refreshRestData() {
  if (disposed || restSyncing.value) return;
  const lifecycle = conversationLifecycleVersion;
  restSyncing.value = true;
  try {
    const [list, messagesResult] = await Promise.allSettled([loadConversations(false), syncCurrentConversation()]);
    if (disposed || lifecycle !== conversationLifecycleVersion) return;
    if (list.status === 'fulfilled' && messagesResult.status === 'fulfilled' && messagesResult.value) lastSyncedAt.value = new Date();
  } catch {
    // 请求层已展示错误；最近同步时间不前移，保留当前会话和消息供用户重试。
  } finally {
    if (!disposed && lifecycle === conversationLifecycleVersion) restSyncing.value = false;
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
    scheduleConversationRefresh();
    const conversation = conversations.value.find(item => sameBusinessId(item.id, message.conversationId));
    if (selectedConversation.value && sameBusinessId(selectedConversation.value.id, message.conversationId)) {
      const followBottom = isNearMessageBottom(scrollRef.value);
      const scrollVersion = historyScrollVersion;
      messages.value = mergeMessages(messages.value, message);
      if (!sameBusinessId(selectedConversationId.value, message.conversationId) || disposed) return;
      if (followBottom && scrollVersion === historyScrollVersion) await scrollToBottom();
      else newMessagesAvailable.value = true;
    } else if (conversation && !sameBusinessId(message.senderId, userStore.currentUser?.id)) {
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    }
    refreshImUnreadFromConversations();
    return;
  }
  if (event.type === 'IM_RECALL') {
    const recalled = event.payload.message;
    const messageId = recalled?.id ?? event.payload.messageId ?? event.payload.id;
    if (messageId !== undefined) {
      messages.value = messages.value.map(message => sameBusinessId(message.id, messageId)
        ? recalledMessage({ ...message, ...recalled })
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
    readerWatermarks.value = applyReadEvent(readerWatermarks.value, selectedConversationId.value, event.payload);
    return;
  }
  if (event.type === 'IM_INTERVENE') {
    const conversation = conversations.value.find(item => sameBusinessId(item.id, event.payload.conversationId));
    if (conversation) conversation.interveneStatus = event.payload.action === 'INTERVENE_CLOSED' ? 'NONE' : (event.payload.interveneStatus || 'REQUESTED');
    if (sameBusinessId(selectedConversationId.value, event.payload.conversationId)) await loadConversations(false);
  }
});

function readConversationTarget() {
  pendingConversationTarget.value = typeof route.query.conversationId === 'string' && route.query.conversationId
    ? route.query.conversationId : undefined;
  targetMessage.value = '';
}

onMounted(() => { readConversationTarget(); void init(); });
watch(() => route.query.conversationId, async () => {
  readConversationTarget();
  if (disposed) return;
  if (pendingConversationTarget.value && !sameBusinessId(selectedConversationId.value, pendingConversationTarget.value)) {
    messageListGuard.invalidate();
    olderMessagesGuard.invalidate();
    incrementalMessagesGuard.invalidate();
    selectedConversationId.value = undefined;
    messages.value = [];
    await init();
  }
});
onBeforeUnmount(() => {
  disposed = true;
  cancelConversationRefresh();
  deletionModal?.close();
  conversationLifecycleVersion += 1;
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
  if (disposed || selectingTargetTab) return;
  pendingConversationTarget.value = undefined;
  targetMessage.value = '';
  deletionModal?.close();
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
  if (!currentCandidates().length && route.query.conversationId !== undefined) {
    void router.replace({ query: { ...route.query, conversationId: undefined } });
  }
  await selectFirstConversation();
}, { flush: 'sync' });
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  cancelConversationRefresh();
  deletionModal?.close();
  conversationLifecycleVersion += 1;
  messageWriteVersion += 1;
  readWriteVersion += 1;
  recallWriteVersion += 1;
  conversationDeleteVersion += 1;
  conversationListGuard.invalidate();
  messageListGuard.invalidate();
  olderMessagesGuard.invalidate();
  incrementalMessagesGuard.invalidate();
  conversations.value = [];
  conversationPageNo.value = 1;
  conversationTotal.value = 0;
  loadingMoreConversations.value = false;
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
  restSyncing.value = false;
  messageLoadError.value = '';
  lastSyncedAt.value = undefined;
  readConversationTarget();
  if (next !== undefined) void init();
});


</script>

<template>

  <div class="im-page shop-container">
    <header class="page-heading"><h1>消息中心</h1><Button type="button" variant="ghost" size="sm" :disabled="supportLoading" @click="openSupportConversation"><Icon :icon="supportLoading ? 'lucide:loader-circle' : 'lucide:headphones'" :class="{ 'animate-spin': supportLoading }" width="17" />联系客服</Button></header>
    <div class="chat-card layout">
      <aside class="sidebar" aria-label="会话列表">
        <div v-if="targetMessage" class="sidebar-alert warning" role="status">{{ targetMessage }}</div>
        <div v-if="conversationLoadError" class="sidebar-alert error" role="alert"><span>{{ conversationLoadError }}</span><Button type="button" variant="link" size="sm" @click="retryConversationLoad">重新加载</Button></div>
        <div class="sync-bar"><span>{{ lastSyncText() }}</span><Button type="button" variant="ghost" size="icon" aria-label="刷新会话" :disabled="restSyncing" @click="refreshRestData"><Icon icon="lucide:refresh-cw" :class="{ 'animate-spin': restSyncing }" width="16" /></Button></div>
        <Tabs v-model="activeTab" class="sidebar-tabs">
          <TabsList class="tab-list"><TabsTrigger value="group">三方群 <span>{{ groups.length }}</span></TabsTrigger><TabsTrigger value="cs">平台客服</TabsTrigger></TabsList>
          <div v-if="conversationLoading" class="sidebar-loading" role="status"><Skeleton v-for="n in 4" :key="n" class="conversation-skeleton" /><span>正在同步会话</span></div>
          <div v-else-if="currentCandidates().length" class="conv-list chat-scroll">
            <button v-for="item in currentCandidates()" :key="item.id" type="button" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, item.id) }" :aria-current="sameBusinessId(selectedConversationId, item.id) ? 'page' : undefined" @click="selectConversation(item)">
              <img v-if="activeTab === 'group' && item.peerAvatar" :src="item.peerAvatar" :alt="item.peerName || '会话头像'" class="avatar" />
              <span v-else class="avatar" :class="activeTab">{{ activeTab === 'cs' ? '客' : (item.peerName || item.title || '订').slice(0, 1) }}</span>
              <span class="info">
                <span class="conv-title-row"><span class="conv-name" :title="activeTab === 'cs' ? item.title || '平台客服' : item.peerName || item.title || '订单会话'">{{ activeTab === 'cs' ? item.title || '平台客服' : item.peerName || item.title || '订单会话' }}</span><span v-if="item.unreadCount" class="unread-badge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</span></span>
                <span class="preview" :title="lastPreview(item)">{{ lastPreview(item) }}</span>
                <span class="conv-time">{{ activeTab === 'group' ? (item.orderNo ? '最近订单 ' + item.orderNo + ' · ' : '暂无活跃订单 · ') : '' }}{{ previewTime(item) }}</span>
              </span>
            </button>
          </div>
          <EmptyState v-else :title="activeTab === 'group' ? '暂无三方群' : '暂无客服会话'" :description="activeTab === 'group' ? '下单后会自动创建订单三方群' : undefined" />
        </Tabs>
        <div class="sidebar-footer"><span>已加载 {{ conversations.length }} / {{ conversationLoading || conversationLoadError ? '—' : conversationTotal }} 个会话</span><Button v-if="conversations.length < conversationTotal" type="button" variant="outline" size="sm" :disabled="loadingMoreConversations" @click="loadMoreConversations"><Icon v-if="loadingMoreConversations" icon="lucide:loader-circle" class="animate-spin" width="14" />加载更多</Button></div>
      </aside>
      <section class="chat-pane" :aria-busy="loading" aria-label="当前会话">
        <div v-if="loading" class="chat-loading" role="status"><Icon icon="lucide:loader-circle" class="animate-spin" width="24" /><span>正在加载消息</span></div>
        <div v-if="selectedConversation" class="conversation">
          <header class="conversation-header">
            <div class="header-main"><div class="header-product"><img v-if="selectedConversation.productImage" :src="selectedConversation.productImage" alt="订单商品" /><div><h2 :title="selectedConversation.peerName || selectedConversation.title || '会话'">{{ selectedConversation.peerName || selectedConversation.title || '会话' }}</h2><p>{{ selectedConversation.type === 'SUPPORT' ? '平台客服' : '进行中订单 ' + (selectedConversation.activeOrderCount ?? '—') + ' 笔' }} · {{ selectedConversation.orderStatusText || selectedConversation.myRole || '—' }}</p></div></div><RealtimeConnectionStatus :state="notifyStore.socketState" @reconnect="notifyStore.connect" /></div>
            <div class="header-actions">
              <Tooltip v-if="selectedConversation.type === 'ORDER_GROUP'"><TooltipTrigger as-child><span tabindex="0" class="action-trigger"><Button type="button" variant="outline" size="sm" :disabled="interventionLoading || selectedConversation.interveneStatus !== 'NONE'" @click="requestIntervention"><Icon v-if="interventionLoading" icon="lucide:loader-circle" class="animate-spin" width="14" />{{ selectedConversation.interveneStatus === 'REQUESTED' ? '等待客服接入' : selectedConversation.interveneStatus === 'HANDLING' ? '客服处理中' : '申请平台介入' }}</Button></span></TooltipTrigger><TooltipContent>{{ selectedConversation.interveneStatus === 'REQUESTED' ? '已申请介入，请等待平台客服接入' : selectedConversation.interveneStatus === 'HANDLING' ? '平台客服正在处理此会话' : selectedConversation.interveneStatus === 'NONE' ? '申请平台客服协助处理订单' : '当前介入状态不支持重复申请' }}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><Button type="button" variant="ghost" size="sm" aria-label="同步消息" :disabled="restSyncing" @click="refreshRestData"><Icon icon="lucide:refresh-cw" :class="{ 'animate-spin': restSyncing }" width="14" /><span class="action-text">同步消息</span></Button></TooltipTrigger><TooltipContent>同步消息</TooltipContent></Tooltip>
              <Tooltip v-if="selectedConversation.orderId"><TooltipTrigger as-child><Button type="button" variant="ghost" size="sm" aria-label="独立会话" @click="openOrderGroup"><Icon icon="lucide:expand" width="14" /><span class="action-text">独立会话</span></Button></TooltipTrigger><TooltipContent>打开独立会话</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><Button type="button" variant="ghost" size="sm" class="delete-action" aria-label="删除会话" :disabled="deletingConversationId !== undefined" @click="deleteSelectedConversation"><Icon icon="lucide:trash-2" width="14" /><span class="action-text">{{ deletingConversationId !== undefined ? '删除中…' : '删除会话' }}</span></Button></TooltipTrigger><TooltipContent>{{ deletingConversationId !== undefined ? '删除中…' : '删除会话' }}</TooltipContent></Tooltip>
            </div>
          </header>
          <div v-if="selectedConversation.type === 'ORDER_GROUP'" class="order-strip" :aria-busy="ordersLoading"><Icon v-if="ordersLoading" icon="lucide:loader-circle" class="animate-spin" width="16" /><Button v-for="item in conversationOrders" :key="item.orderId" type="button" variant="outline" size="sm" class="order-chip" @click="openOrder(item.orderId)">{{ item.orderNo || item.orderId }} · {{ item.orderStatusText || item.orderStatus }}</Button><Button type="button" variant="link" size="sm" @click="toggleHistoryOrders">{{ includeHistoryOrders ? '只看进行中' : '查看历史订单' }}</Button></div>
          <div v-if="notifyStore.socketState === 'closed'" class="notice warning" role="status"><Icon icon="lucide:wifi-off" width="16" /><span>实时连接暂不可用，消息仍可发送；恢复连接后会自动同步。</span><Button type="button" variant="link" size="sm" @click="notifyStore.connect">立即重连</Button><Button type="button" variant="link" size="sm" :disabled="restSyncing" @click="refreshRestData">刷新数据</Button></div>
          <div v-if="syncIncomplete || messageSyncError" class="notice warning" role="status"><Icon icon="lucide:circle-alert" width="16" /><span>{{ messageSyncError || '还有历史增量消息待同步' }}</span><Button type="button" variant="link" size="sm" :disabled="restSyncing" @click="refreshRestData">继续同步</Button></div>
          <div ref="scrollRef" class="messages chat-scroll" style="overflow-anchor: none" @scroll="onMessageScroll" @load.capture="onMessageMediaLoad">
            <div v-if="hasOlder" class="load-older"><Button type="button" variant="ghost" size="sm" :disabled="loadingOlder" @click="loadOlderMessages"><Icon :icon="loadingOlder ? 'lucide:loader-circle' : 'lucide:history'" :class="{ 'animate-spin': loadingOlder }" width="15" />加载更早消息</Button></div>
            <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="getSenderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
            <EmptyState v-if="messageLoadError" :title="messageLoadError" action-text="重新加载" @action="retryMessageLoad" /><div v-else-if="!messages.length" class="empty-msg">当前会话暂无消息</div>
          </div>
          <div v-if="newMessagesAvailable" class="new-message-bar"><Button type="button" variant="outline" size="sm" @click="scrollToBottom"><Icon icon="lucide:arrow-down" width="15" />有新消息，查看最新消息</Button></div>
          <MessageInput :context-key="String(userStore.currentUser?.id || '') + ':' + String(selectedConversationId || '')" :submitting="messageSending" @media-busy="mediaBusy = $event" @send="onSend" />
          <ImagePreview v-model="imagePreviewVisible" :images="imageUrls" :start-index="imagePreviewCurrent" @update:current="imagePreviewCurrent = $event" />
        </div>
        <div v-else class="placeholder"><EmptyState :title="conversationLoadError || '请选择左侧会话'" :description="conversationLoadError ? '请稍后重试。' : '点击三方群或客服开始聊天'" :action-text="conversationLoadError ? '重新加载' : undefined" @action="retryConversationLoad" /></div>
      </section>
    </div>
  </div>
</template>

<style scoped>

.im-page { padding-top: 28px; padding-bottom: 36px; }.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }.eyebrow { font-size: 11px; letter-spacing: .16em; font-weight: 600; color: var(--yb-primary); margin: 0 0 6px; }.page-heading h1 { margin: 0; color: var(--yb-ink); font-size: 26px; font-weight: 650; }.page-heading p:not(.eyebrow) { margin: 5px 0 0; color: var(--yb-muted); font-size: 13px; }
.chat-card { background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 14px; overflow: hidden; box-shadow: var(--yb-shadow-1); }.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); height: calc(100dvh - 280px); min-height: 620px; }.sidebar { display: flex; flex-direction: column; min-height: 0; background: var(--yb-surface); border-right: 1px solid var(--yb-hairline); }.sidebar-alert { padding: 10px 12px; margin: 12px 12px 0; border-radius: 6px; font-size: 12px; }.sidebar-alert.error { display: flex; flex-direction: column; align-items: flex-start; color: var(--yb-danger); background: var(--yb-danger-soft); }.sync-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; color: var(--yb-muted); font-size: 12px; }.sidebar-tabs { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 0; }.tab-list { width: calc(100% - 24px); margin: 0 12px 12px; }.tab-list > button { flex: 1; gap: 5px; }.tab-list span { font-size: 11px; font-family: var(--font-mono); }.conv-list { overflow-y: auto; flex: 1; min-height: 0; padding: 0 8px; }.conv-row { display: flex; align-items: flex-start; gap: 12px; width: 100%; text-align: left; padding: 14px 10px; margin-bottom: 4px; border: 1px solid transparent; border-radius: 8px; background: transparent; cursor: pointer; transition: background 150ms, border-color 150ms; }.conv-row:hover { background: var(--yb-fill); }.conv-row.active { background: var(--yb-primary-soft); border-color: color-mix(in srgb, var(--yb-primary) 18%, transparent); }.conv-row:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: -2px; }.avatar { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; object-fit: cover; font-weight: 650; background: var(--yb-primary); color: var(--primary-foreground); }.avatar.cs { background: var(--yb-fill); color: var(--yb-primary); }.info { flex: 1; min-width: 0; display: block; }.conv-title-row { display: flex; align-items: center; gap: 8px; }.conv-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--yb-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.unread-badge { min-width: 18px; padding: 1px 5px; border-radius: 999px; background: var(--yb-danger); color: var(--primary-foreground); font-size: 11px; text-align: center; }.preview { display: block; margin-top: 5px; font-size: 12px; color: var(--yb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.conv-time { display: block; margin-top: 5px; font-size: 11px; color: var(--yb-muted); overflow-wrap: anywhere; }.sidebar-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 12px 16px; color: var(--yb-muted); font-size: 12px; }.conversation-skeleton { width: 100%; height: 72px; border-radius: 8px; }.sidebar-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-top: 1px solid var(--yb-hairline); font-size: 11px; color: var(--yb-muted); }

.chat-pane { position: relative; min-width: 0; min-height: 0; background: var(--yb-bg); }.conversation { display: flex; flex-direction: column; height: 100%; min-height: 0; }.conversation-header { flex-shrink: 0; padding: 18px 24px 12px; border-bottom: 1px solid var(--yb-hairline); background: var(--yb-surface); }.header-main { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.header-product { display: flex; align-items: center; gap: 12px; min-width: 0; }.header-product > div { min-width: 0; }.header-product img { width: 44px; height: 44px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }.header-product h2 { font-size: 17px; font-weight: 650; color: var(--yb-ink); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.header-product p { margin: 3px 0 0; color: var(--yb-muted); font-size: 12px; }.header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 12px; flex-wrap: wrap; }.action-trigger { display: inline-flex; border-radius: 6px; }.action-trigger:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 2px; }.delete-action { color: var(--yb-danger); }.order-strip { display: flex; align-items: center; gap: 8px; padding: 10px 24px; flex-shrink: 0; background: var(--yb-surface); border-bottom: 1px solid var(--yb-hairline); overflow-x: auto; }.order-chip { white-space: nowrap; font-size: 12px; }.notice { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 10px 20px 0; flex-shrink: 0; border-radius: 8px; font-size: 12px; }.notice > span { flex: 1; min-width: 0; }.notice > svg { flex-shrink: 0; }.warning { background: color-mix(in srgb, var(--yb-warning) 10%, var(--yb-surface)); color: var(--yb-warning); }.messages { flex: 1 1 auto; min-height: 0; padding: 24px; overflow-y: auto; overscroll-behavior: contain; }.load-older { text-align: center; margin-bottom: 20px; }.empty-msg { text-align: center; color: var(--yb-muted); padding: 60px 0; font-size: 14px; }.placeholder { display: flex; align-items: center; justify-content: center; height: 100%; }.new-message-bar { display: flex; justify-content: center; padding: 8px 16px; }.chat-loading { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--yb-primary); background: color-mix(in srgb, var(--yb-surface) 85%, transparent); font-size: 13px; }

.im-page { display: flex; flex-direction: column; flex: 1; width: 100%; min-height: 0; padding-block: 0; }
.page-heading { flex-shrink: 0; gap: 12px; min-height: 32px; margin-bottom: 10px; }
.page-heading h1 { font-size: 18px; }
.layout { flex: 1; height: auto; min-height: 0; border-radius: 8px; }
.header-product { flex: 1; }.header-product h2 { font-size: 15px; }
.conversation-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }.header-main { flex: 1; min-width: 0; }.header-product { min-width: 0; }.header-product p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.header-actions { margin-top: 0; flex-wrap: nowrap; flex-shrink: 0; }
.order-strip { padding: 6px 16px; }.messages { padding: 18px; }
@media (max-width: 1150px) { .layout { grid-template-columns: 250px minmax(0, 1fr); }.header-main { align-items: flex-start; }.order-strip { padding-inline: 16px; } }
@media (max-width: 1250px) { .header-actions .action-text { display: none; }.header-actions button { padding-inline: 8px; font-size: 11px; }.header-main { gap: 8px; }.header-product img { width: 32px; height: 32px; }.header-product h2 { font-size: 14px; } }
@media (max-width: 1050px) { .conversation-header { flex-wrap: wrap; }.header-main { flex-basis: 100%; }.header-actions { margin-left: auto; } }

</style>
