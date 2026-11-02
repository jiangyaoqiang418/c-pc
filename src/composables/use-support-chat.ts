import { computed, onBeforeUnmount, ref } from 'vue';
import * as notifyApi from '@/service/api/notify';
import { streamCustomerChat } from '@/service/api/ai';
import { useNotifyStore } from '@/stores/notify';
import { useUserStore } from '@/stores/user';
import { createHumanSupportHandler } from '@/utils/human-support';
import { isProductListCard } from '@/utils/ai-product';
import { syncMessageGap } from '@/utils/im';
import { RequestError } from '@/service/request';
import type { AiDisplayMessage } from './use-ai-conversations';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function supportHistoryMessage(row: Api.RealNotify.ImMessageVO): AiDisplayMessage {
  const params = row.params || {};
  const value = params.structuredData ?? params.structured_data ?? params;
  const data = object(value) ? value : {};
  const q = data.question;
  const question = object(q) && typeof q.text === 'string' && Array.isArray(q.options) && q.options.length <= 4
    && q.options.every(option => typeof option === 'string') && ['after_cards','in_content'].includes(String(q.placement))
    ? q as unknown as Api.Ai.Question : undefined;
  const parts: AiDisplayMessage['parts'] = [];
  for (const card of Array.isArray(data.cards) ? data.cards : []) {
    if (isProductListCard(card)) parts.push({ type:'products', card });
    else if (object(card) && object(card.data) && typeof card.data.code === 'string') parts.push({ type:'card', card:card.data as unknown as Api.Ai.CardData });
  }
  return { id: String(row.id), clientMessageId: row.clientMsgId, role: row.senderRole === 'CUSTOMER' ? 'user' : 'assistant',
    text: row.content || '', state: row.failed ? 'FAILED' : 'COMPLETED',
    question, questions: question?.options,
    images: Array.isArray(data.images) ? data.images.filter((image): image is Api.Ai.ImageReference => object(image) && typeof image.fileId === 'string') : [],
    parts,
    rawIm: row.eventType === 'AI_REPLY' ? undefined : row,
    error: row.failed ? '发送结果未确认，请刷新记录后再操作' : undefined };
}

/** 常驻客服使用 Java IM 时间线；Python ID 只保存当前模型上下文。 */
export function useSupportChat(conversationId: string) {
  const user = useUserStore();
  const notify = useNotifyStore();
  const owner = user.sessionVersion;
  const route = ref<Api.RealNotify.ImConversationVO>();
  const messages = ref<AiDisplayMessage[]>([]);
  const input = ref('');
  const attachments = ref<Api.Ai.UploadedImage[]>([]);
  const running = ref(false);
  const loading = ref(false);
  const applying = ref(false);
  const notice = ref('');
  const error = ref('');
  const hasMore = ref(false);
  const records = new Map<string, Api.RealNotify.ImMessageVO>();
  const handleAction = createHumanSupportHandler(text => { notice.value = text; });
  let disposed = false;
  let generation = 0;
  let routeSequence = 0;
  let historySequence = 0;
  let pageNo = 1;
  let cursor: string | number = '0';
  let syncing = false;
  const reads = new AbortController();
  let pythonId: string | undefined;
  let stream: AbortController | undefined;
  const live = () => !disposed && user.sessionVersion === owner && user.isLoggedIn;
  const handling = computed(() => route.value?.interveneStatus === 'HANDLING');
  const canSend = computed(() => live() && !!route.value && !running.value && !loading.value
    && ['NONE','REQUESTED','HANDLING'].includes(route.value.interveneStatus || '')
    && (!!input.value.trim() || attachments.value.length > 0) && input.value.length <= 2000);
  function merge(rows: Api.RealNotify.ImMessageVO[], earlier = false) {
    for (const row of rows) {
      if (String(row.conversationId) !== conversationId) continue;
      records.set(String(row.id), row);
      const item = supportHistoryMessage(row);
      const index = messages.value.findIndex(value => value.id === item.id || (!!item.clientMessageId && value.clientMessageId === item.clientMessageId));
      if (index >= 0) {
        const current = messages.value[index];
        // SSE 尚未结束时仅关联正式 ID，流中的文字和卡片保留，终态再采用 IM 最终版本。
        if (current.temporary && current.role === 'assistant' && current.state === 'PENDING' && running.value) current.id = item.id;
        else messages.value.splice(index, 1, item);
      } else if (earlier) messages.value.unshift(item);
      else messages.value.push(item);
    }
    messages.value = messages.value.filter((row, index, all) => all.findIndex(item => item.id === row.id || (!!row.clientMessageId && item.clientMessageId === row.clientMessageId)) === index);
  }
  function stop() {
    generation++; stream?.abort(); stream = undefined; running.value = false;
    for (const row of messages.value) if (row.temporary && row.state === 'PENDING') { row.state = 'INTERRUPTED'; row.progress = ''; row.error = '回答中断'; }
    merge([...records.values()]);
  }
  async function refreshRoute() {
    const sequence = ++routeSequence;
    const next = await notifyApi.fetchSupportConversation();
    if (!live() || sequence !== routeSequence) return;
    if (String(next.id) !== conversationId || next.type !== 'SUPPORT' || !['NONE','REQUESTED','HANDLING'].includes(next.interveneStatus || '')
      || typeof next.routingVersion !== 'string' || !/^\d+$/.test(next.routingVersion)) throw new Error('客服接待状态不完整，请稍后刷新');
    if (route.value && (next.routingVersion !== route.value.routingVersion || (next.interveneStatus === 'HANDLING' && route.value.interveneStatus !== 'HANDLING'))) { stop(); pythonId = undefined; }
    route.value = next;
  }
  async function load(earlier = false) {
    if (!live() || loading.value || (earlier && !hasMore.value)) return;
    const sequence = ++historySequence; loading.value = true; error.value = '';
    try {
      await refreshRoute();
      if (!live() || sequence !== historySequence) return;
      const nextPage = earlier ? pageNo + 1 : 1;
      const page = await notifyApi.fetchConversationMessages({ conversationId, pageNo: nextPage, pageSize: 30, markRead: false });
      if (!live() || sequence !== historySequence) return;
      // Java 分页为 ID 倒序，较早页逐条前插；最新页按时间正序合并。
      merge(earlier ? page.records : [...page.records].reverse(), earlier);
      if (!earlier && cursor === '0' && page.records[0]) cursor = page.records[0].id;
      if (earlier || pageNo === 1) { pageNo = nextPage; hasMore.value = page.total > nextPage * 30; }
    } catch (e) { if (live() && sequence === historySequence) { error.value = e instanceof Error ? e.message : '客服读取失败'; route.value = undefined; } }
    finally { if (live() && sequence === historySequence) loading.value = false; }
  }
  async function refresh() {
    if (!live() || syncing) return;
    syncing = true;
    try {
      await refreshRoute();
      if (!live()) return;
      if (cursor !== '0') {
        const complete = await syncMessageGap({conversationId, sinceId:cursor, signal:reads.signal,
          request:(sinceId,limit) => notifyApi.fetchIncrementalMessages({conversationId,sinceId,limit},{signal:reads.signal}),
          accept:(incoming,next) => { if (live()) { merge(incoming); cursor = next; } }
        });
        if (!complete && live()) error.value = '还有较早消息待同步，请再次刷新';
      } else await load();
    } catch (e) { if (live()) { stop(); route.value = undefined; error.value = e instanceof Error ? e.message : '客服状态同步失败，请刷新'; } }
    finally { syncing = false; }
  }
  async function requestHuman() {
    if (!live() || applying.value) return;
    applying.value = true;
    try {
      await refreshRoute(); if (!live() || !route.value) return;
      if (route.value.interveneStatus === 'REQUESTED') { notice.value = '已申请转人工，等待客服接入'; return; }
      if (route.value.interveneStatus !== 'NONE' || route.value.aiEnabled === false) return;
      const version = route.value.routingVersion;
      await notifyApi.applyHumanSupport(conversationId);
      if (!live()) return;
      notice.value = '已申请转人工，等待客服接入';
      if (route.value.routingVersion === version) route.value.interveneStatus = 'REQUESTED';
      await refreshRoute();
    } catch { if (live()) notice.value = '申请结果暂未确认，请刷新接待状态后再重试'; }
    finally { if (live()) applying.value = false; }
  }
  function canAnswer(row: AiDisplayMessage) {
    return !handling.value && !!route.value && !loading.value && !running.value && row === messages.value.at(-1)
      && row.state === 'COMPLETED' && !row.questionConsumed && !!row.question;
  }
  const failedSends = new Map<string, Api.RealNotify.ImSendMessageParams>();
  async function sendHuman(payload: { type: 'text' | 'image' | 'audio' | 'video'; content?: string; mediaFileId?: string | number; coverFileId?: string | number; duration?: number }, retryKey?: string) {
    if (!live() || running.value || !handling.value) return;
    const key = retryKey || crypto.randomUUID();
    const params = retryKey ? failedSends.get(key) : { conversationId, clientMsgId: key,
      msgType: ({ text:'TEXT', image:'IMAGE', audio:'VOICE', video:'VIDEO' } as const)[payload.type],
      content: payload.content, mediaFileId:payload.mediaFileId, coverFileId:payload.coverFileId, duration:payload.duration };
    if (!params) return;
    failedSends.set(key, params); running.value = true;
    const operation = ++generation;
    try {
      await refreshRoute();
      if (!live() || operation !== generation || !handling.value) { error.value = '接待状态已变化，请刷新后核对消息'; return; }
      const result = await notifyApi.sendConversationMessage(params, { showError: false });
      if (live() && operation === generation) { failedSends.delete(key); merge([result]); }
    } catch (e) {
      if (live() && operation === generation) {
        merge([{ ...params, id: `failed-${key}`, senderRole:'CUSTOMER', failed:true }]);
        error.value = e instanceof Error ? e.message : '消息结果暂未确认，可使用原消息重试';
      }
    } finally { if (live() && operation === generation) running.value = false; }
  }
  async function send() {
    if (!canSend.value) return;
    const text = input.value.trim(), images = attachments.value.map(image => ({ ...image }));
    running.value = true; error.value = ''; notice.value = '';
    const operation = ++generation;
    const active = () => live() && operation === generation;
    try {
      await refreshRoute();
      if (!active() || !route.value) return;
      if (handling.value && images.length) { error.value = '人工接待时请使用消息页的图片发送通道'; return; }
      for (const row of messages.value) row.questionConsumed = true;
      const key = crypto.randomUUID();
      const fromUser: AiDisplayMessage = { id: `user-${key}`, clientMessageId: key, role: 'user', text, parts: [], images: images.map(image => ({ fileId: image.id })), state: 'PENDING', temporary: true };
      messages.value.push(fromUser); input.value = ''; attachments.value = [];
      if (handling.value) {
        const result = await notifyApi.sendConversationMessage({ conversationId, msgType: 'TEXT', content: text, clientMsgId: key }, { showError: false });
        if (active()) merge([result]);
        return;
      }
      const reply: AiDisplayMessage = { id: `ai-${key}`, role: 'assistant', text: '', parts: [], state: 'PENDING', temporary: true };
      messages.value.push(reply);
      const answer = messages.value.at(-1)!;
      const aborter = new AbortController(); stream = aborter;
      await streamCustomerChat({ message: text, imageFileIds: images.map(image => image.id), conversationId: pythonId, clientMessageId: key }, aborter.signal, event => {
        if (!active()) return;
        if (event.event === 'start') {
          pythonId = event.data.conversation_id; answer.requestId = event.data.request_id; answer.imSync = event.data.im_sync;
          const sync = event.data.im_sync;
          if (!sync || sync.im_conversation_id !== conversationId || sync.routing_version !== route.value?.routingVersion) { stop(); notice.value = '接待状态已变化，请刷新后继续'; void load(); return; }
          const question = messages.value.find(row => row.id === fromUser.id);
          if (question) question.clientMessageId = sync.user_client_msg_id;
          answer.clientMessageId = sync.ai_client_msg_id;
          merge([...records.values()]);
        } else if (event.event === 'status') answer.progress = event.data.text;
        else if (event.event === 'delta') {
          answer.progress = ''; const last = answer.parts.at(-1);
          if (last?.type === 'text') last.text += event.data.text; else answer.parts.push({ type: 'text', text: event.data.text });
        } else if (event.event === 'card') answer.parts.push({ type: 'card', card: event.data.data });
        else if (event.event === 'product_cards') answer.parts.push({ type: 'products', card: { type: 'product_list', items: event.data.items } });
        else if (event.event === 'question') { answer.question = { text: event.data.text, options: event.data.options, placement: 'after_cards' }; answer.questions = event.data.options; }
        else if (event.event === 'action' && answer.imSync) {
          void handleAction(event.data, { requestId: answer.requestId!, sync: answer.imSync, owner: String(user.currentUser?.id || ''), active }).then(() => { if (active()) void refreshRoute().catch(() => { route.value = undefined; }); });
        } else if (event.event === 'done') { answer.state = 'COMPLETED'; answer.progress = ''; if (event.data.im_sync) answer.imSync = event.data.im_sync; }
        else if (event.event === 'error') { answer.state = 'FAILED'; answer.progress = ''; answer.error = event.data.message; }
      });
    } catch (e) {
      if (!active()) return;
      for (const row of messages.value) if (row.temporary && row.state === 'PENDING') { row.state = 'INTERRUPTED'; row.progress = ''; row.error = e instanceof Error ? e.message : '消息结果暂未确认，请刷新'; }
      if (e instanceof RequestError && ['AI_ROUTING_CHANGED','SUPPORT_UNAVAILABLE'].includes(e.code || '')) route.value = undefined;
    } finally {
      if (active()) { running.value = false; stream = undefined; merge([...records.values()]); await load(); }
    }
  }
  notify.subscribe(event => {
    if (!live()) return;
    if (event.type === 'IM_MESSAGE' && String(event.payload.conversationId) === conversationId) {
      merge([event.payload]);
      if (event.payload.eventType !== 'AI_REPLY' && event.payload.senderRole !== 'CUSTOMER') void refreshRoute().catch(() => { if (live()) route.value = undefined; });
    } else if (event.type === 'SYNC' || ((event.type === 'IM_INTERVENE' || event.type === 'IM_ASSIGN') && String(event.payload.conversationId) === conversationId)) {
      void refresh();
    }
  });
  onBeforeUnmount(() => { disposed = true; stop(); reads.abort(); routeSequence++; historySequence++; });
  void load();
  return { route, messages, input, attachments, running, loading, applying, notice, error, hasMore, handling, canSend, canAnswer, send, sendHuman, stop, load, refresh, requestHuman };
}
