<script setup lang="ts">
import { Icon } from '@iconify/vue';
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
const mobileConversationOpen = ref(typeof route.query.conversationId === 'string' && !!route.query.conversationId);
const mobileBack = ref<HTMLButtonElement>();
const conversationList = ref<HTMLElement>();
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

async function selectConversation(conversation: Api.RealNotify.ImConversationVO, showOnMobile = false) {
  if (disposed) return;
  if (showOnMobile) mobileConversationOpen.value = true;
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
  if (showOnMobile) void nextTick(() => { if (mobileBack.value?.getClientRects().length) mobileBack.value.focus({ preventScroll:true }); });
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
    await selectConversation(conversation, true);
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

function showConversationList() {
  if (mediaBusy.value) return;
  mobileConversationOpen.value = false;
  void nextTick(() => conversationList.value?.querySelector<HTMLButtonElement>('.conv-row[aria-current="page"]')?.focus({ preventScroll:true }));
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
    mobileConversationOpen.value = true;
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

  <div class="im-page" :class="{ 'mobile-conversation-open': (mobileConversationOpen || mediaBusy) && !!selectedConversation }">
    <header class="page-heading compact"><h1>消息中心</h1><button type="button" :disabled="supportLoading" @click="openSupportConversation" class="text-link"><Icon :icon="supportLoading ? 'lucide:loader-circle' : 'lucide:headphones'" :class="{ 'animate-spin': supportLoading }" width="17" />联系客服</button></header>
    <div class="im-layout">
      <aside ref="conversationList" class="paper sidebar" aria-label="会话列表">
        <div v-if="targetMessage" class="sidebar-alert warning" role="status">{{ targetMessage }}</div>
        <div v-if="conversationLoadError" class="sidebar-alert error" role="alert"><span>{{ conversationLoadError }}</span><button type="button" @click="retryConversationLoad" class="text-link">重新加载</button></div>
        <div class="sync-bar"><span>{{ lastSyncText() }}</span><button type="button" aria-label="刷新会话" :disabled="restSyncing" @click="refreshRestData" class="icon-btn"><Icon icon="lucide:refresh-cw" :class="{ 'animate-spin': restSyncing }" width="16" /></button></div>
        <div class="sidebar-tabs">
          <nav class="tabs tab-list" aria-label="会话类型"><button :class="{ active: activeTab === 'group' }" :aria-pressed="activeTab === 'group'" @click="activeTab = 'group'">三方群 <span>{{ groups.length }}</span></button><button :class="{ active: activeTab === 'cs' }" :aria-pressed="activeTab === 'cs'" @click="activeTab = 'cs'">平台客服</button></nav>
          <div v-if="conversationLoading" class="sidebar-loading" role="status"><Skeleton v-for="n in 4" :key="n" class="conversation-skeleton" /><span>正在同步会话</span></div>
          <div v-else-if="currentCandidates().length" class="conv-list chat-scroll">
            <button v-for="item in currentCandidates()" :key="item.id" type="button" class="conv-row" :class="{ active: sameBusinessId(selectedConversationId, item.id) }" :aria-current="sameBusinessId(selectedConversationId, item.id) ? 'page' : undefined" @click="selectConversation(item, true)">
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
        </div>
        <div class="sidebar-footer"><span>已加载 {{ conversations.length }} / {{ conversationLoading || conversationLoadError ? '—' : conversationTotal }} 个会话</span><button v-if="conversations.length < conversationTotal" type="button" class="outline" :disabled="loadingMoreConversations" @click="loadMoreConversations"><Icon v-if="loadingMoreConversations" icon="lucide:loader-circle" class="animate-spin" width="14" />加载更多</button></div>
      </aside>
      <section class="paper chat-panel chat-pane" :aria-busy="loading" aria-label="当前会话">
        <div v-if="loading" class="chat-loading" role="status"><Icon icon="lucide:loader-circle" class="animate-spin" width="24" /><span>正在加载消息</span></div>
        <div v-if="selectedConversation" class="conversation">
          <header class="conversation-header section-heading">
            <button ref="mobileBack" type="button" class="mobile-conversation-back" aria-label="返回会话列表" :disabled="mediaBusy" :title="mediaBusy ? '请先完成当前媒体操作' : '返回会话列表'" @click="showConversationList"><Icon icon="lucide:arrow-left" width="20" /></button>
            <div class="conversation-main"><div class="header-product"><img v-if="selectedConversation.productImage" :src="selectedConversation.productImage" alt="订单商品" /><div><h2 :title="selectedConversation.peerName || selectedConversation.title || '会话'">{{ selectedConversation.peerName || selectedConversation.title || '会话' }}</h2><p>{{ selectedConversation.type === 'SUPPORT' ? '平台客服' : '进行中订单 ' + (selectedConversation.activeOrderCount ?? '—') + ' 笔' }} · {{ selectedConversation.orderStatusText || selectedConversation.myRole || '—' }}</p></div></div><RealtimeConnectionStatus :state="notifyStore.socketState" @reconnect="notifyStore.connect" /></div>
            <div class="conversation-actions">
              <Tooltip v-if="selectedConversation.type === 'ORDER_GROUP'"><TooltipTrigger as-child><span tabindex="0" class="action-trigger"><button type="button" :disabled="interventionLoading || selectedConversation.interveneStatus !== 'NONE'" @click="requestIntervention" class="outline"><Icon v-if="interventionLoading" icon="lucide:loader-circle" class="animate-spin" width="14" />{{ selectedConversation.interveneStatus === 'REQUESTED' ? '等待客服接入' : selectedConversation.interveneStatus === 'HANDLING' ? '客服处理中' : '申请平台介入' }}</button></span></TooltipTrigger><TooltipContent>{{ selectedConversation.interveneStatus === 'REQUESTED' ? '已申请介入，请等待平台客服接入' : selectedConversation.interveneStatus === 'HANDLING' ? '平台客服正在处理此会话' : selectedConversation.interveneStatus === 'NONE' ? '申请平台客服协助处理订单' : '当前介入状态不支持重复申请' }}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><button type="button" aria-label="同步消息" :disabled="restSyncing" @click="refreshRestData" class="text-link"><Icon icon="lucide:refresh-cw" :class="{ 'animate-spin': restSyncing }" width="14" /><span class="action-text">同步消息</span></button></TooltipTrigger><TooltipContent>同步消息</TooltipContent></Tooltip>
              <Tooltip v-if="selectedConversation.orderId"><TooltipTrigger as-child><button type="button" aria-label="独立会话" @click="openOrderGroup" class="text-link"><Icon icon="lucide:expand" width="14" /><span class="action-text">独立会话</span></button></TooltipTrigger><TooltipContent>打开独立会话</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><button type="button" class="text-link delete-action" aria-label="删除会话" :disabled="deletingConversationId !== undefined" @click="deleteSelectedConversation"><Icon icon="lucide:trash-2" width="14" /><span class="action-text">{{ deletingConversationId !== undefined ? '删除中…' : '删除会话' }}</span></button></TooltipTrigger><TooltipContent>{{ deletingConversationId !== undefined ? '删除中…' : '删除会话' }}</TooltipContent></Tooltip>
            </div>
          </header>
          <div v-if="selectedConversation.type === 'ORDER_GROUP'" class="order-strip" :aria-busy="ordersLoading"><Icon v-if="ordersLoading" icon="lucide:loader-circle" class="animate-spin" width="16" /><button v-for="item in conversationOrders" :key="item.orderId" type="button" class="outline order-chip" @click="openOrder(item.orderId)">{{ item.orderNo || item.orderId }} · {{ item.orderStatusText || item.orderStatus }}</button><button type="button" @click="toggleHistoryOrders" class="text-link">{{ includeHistoryOrders ? '只看进行中' : '查看历史订单' }}</button></div>
          <div v-if="notifyStore.socketState === 'closed'" class="notice warning" role="status"><Icon icon="lucide:wifi-off" width="16" /><span>实时连接暂不可用，消息仍可发送；恢复连接后会自动同步。</span><button type="button" @click="notifyStore.connect" class="text-link">立即重连</button><button type="button" :disabled="restSyncing" @click="refreshRestData" class="text-link">刷新数据</button></div>
          <div v-if="syncIncomplete || messageSyncError" class="notice warning" role="status"><Icon icon="lucide:circle-alert" width="16" /><span>{{ messageSyncError || '还有历史增量消息待同步' }}</span><button type="button" :disabled="restSyncing" @click="refreshRestData" class="text-link">继续同步</button></div>
          <div ref="scrollRef" class="messages chat-messages chat-scroll" style="overflow-anchor: none" @scroll="onMessageScroll" @load.capture="onMessageMediaLoad">
            <div v-if="hasOlder" class="load-older"><button type="button" :disabled="loadingOlder" @click="loadOlderMessages" class="text-link"><Icon :icon="loadingOlder ? 'lucide:loader-circle' : 'lucide:history'" :class="{ 'animate-spin': loadingOlder }" width="15" />加载更早消息</button></div>
            <MessageBubble v-for="message in messages" :key="message.id" :msg="message" :side="sideOf(message)" :sender-name="getSenderName(message)" :read-text="readText(message)" :can-recall="isRecallAvailable(message, userStore.currentUser?.id)" @recall="recallMessage" @retry="retryMessage" @open-order="openOrder" @preview-image="previewImage" />
            <EmptyState v-if="messageLoadError" :title="messageLoadError" action-text="重新加载" @action="retryMessageLoad" /><div v-else-if="!messages.length" class="empty-msg">当前会话暂无消息</div>
          </div>
          <div v-if="newMessagesAvailable" class="new-message-bar"><button type="button" @click="scrollToBottom" class="outline"><Icon icon="lucide:arrow-down" width="15" />有新消息，查看最新消息</button></div>
          <MessageInput :context-key="String(userStore.currentUser?.id || '') + ':' + String(selectedConversationId || '')" :submitting="messageSending" @media-busy="mediaBusy = $event" @send="onSend" />
          <ImagePreview v-model="imagePreviewVisible" :images="imageUrls" :start-index="imagePreviewCurrent" @update:current="imagePreviewCurrent = $event" />
        </div>
        <div v-else class="placeholder"><EmptyState :title="conversationLoadError || '请选择左侧会话'" :description="conversationLoadError ? '请稍后重试。' : '点击三方群或客服开始聊天'" :action-text="conversationLoadError ? '重新加载' : undefined" @action="retryConversationLoad" /></div>
      </section>
    </div>
  </div>
</template>

<style scoped src="../../components/im/v47-messaging.css"></style>
