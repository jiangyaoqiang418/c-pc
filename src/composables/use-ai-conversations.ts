import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { activateAiSession, createAiSession, fetchAiMessages, fetchAiSessions, streamCustomerChat } from '@/service/api/ai';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';
import { fetchSupportConversation } from '@/service/api/notify';
import { useNotifyStore } from '@/stores/notify';
import { createHumanSupportHandler } from '@/utils/human-support';
import { useUserStore } from '@/stores/user';

export interface AiDisplayMessage {
  id: string;
  requestId?: string | null;
  clientMessageId?: string | null;
  temporary?: boolean;
  role: 'user' | 'assistant';
  text: string;
  images?: Api.Ai.ImageReference[];
  questions?: string[];
  question?: Api.Ai.Question;
  questionConsumed?: boolean;
  imSync?: Api.Ai.ImSync;
  rawIm?: Api.RealNotify.ImMessageVO;
  parts: ({ type: 'text'; text: string } | { type: 'card'; card: Api.Ai.CardData } | { type: 'products'; card: Api.Ai.ProductListCard })[];
  state: Api.Ai.MessageStatus;
  progress?: string;
  error?: string;
  truncated?: boolean;
  snapshot?: boolean;
}

export function historyMessage(row: Api.Ai.Message): AiDisplayMessage {
  return { id: row.messageId, requestId: row.requestId, clientMessageId: row.clientMessageId,
    question: row.structuredData?.question || undefined, questions: row.structuredData?.question?.options, imSync: row.im_sync || undefined,
    role: row.role === 'USER' ? 'user' : 'assistant', text: row.content, images:row.images || [], state: row.status,
    parts: (row.structuredData?.cards ?? []).map(card => 'type' in card && card.type === 'product_list'
      ? { type: 'products', card } : { type: 'card', card: (card as { data: Api.Ai.CardData }).data }),
    truncated: row.structuredData?.truncated === true, snapshot: !!row.structuredData?.cards?.some(card => 'tool' in card),
    error: row.status === 'FAILED' ? '回答失败' : row.status === 'INTERRUPTED' ? '回答中断' : undefined };
}

/** 服务端记录覆盖临时记录；较早已加载消息保留，不能在刷新最新页时丢失。 */
export function mergeAiMessages(existing: AiDisplayMessage[], rows: Api.Ai.Message[], prepend = false) {
  const saved = rows.map(historyMessage);
  const ids = new Set(saved.map(row => row.id));
  const requestByClientId = new Map<string, string>();
  for (const row of [...existing, ...saved]) if (row.role === 'user' && row.clientMessageId && row.requestId) {
    requestByClientId.set(row.clientMessageId, row.requestId);
  }
  const remaining = existing.filter(row => {
    if (ids.has(row.id)) return false;
    if (!row.temporary) return true;
    // start 到达前断流时，从已保存问题的去重键找回请求 ID，才能替换对应的临时回答。
    const requestId = row.requestId || (row.clientMessageId ? requestByClientId.get(row.clientMessageId) : undefined);
    return !saved.some(item => item.role === row.role && ((requestId && item.requestId === requestId)
      || (row.clientMessageId && item.clientMessageId === row.clientMessageId)));
  });
  return prepend ? [...saved, ...remaining] : [...remaining.filter(row => !row.temporary), ...saved, ...remaining.filter(row => row.temporary)];
}

export function useAiConversations() {
  const user = useUserStore();
  const realtime = useNotifyStore();
  const humanHandling = ref(false);
  const supportReady = ref(false);
  const supportVersion = ref<string>();
  let supportCheck = 0;
  const sessions = ref<Api.Ai.Session[]>([]);
  const messages = ref<AiDisplayMessage[]>([]);
  const conversationId = ref<string | null>(null);
  const input = ref('');
  const attachments = ref<Api.Ai.UploadedImage[]>([]);
  const uploading = ref(false);
  const running = ref(false);
  const busy = ref(false);
  const listLoading = ref(false);
  const historyLoading = ref(false);
  const ready = ref(false);
  const error = ref('');
  const listError = ref('');
  const notice = ref('');
  const handleHumanAction = createHumanSupportHandler(text => { notice.value = text; });
  function canAnswer(row: AiDisplayMessage) {
    return row.role === 'assistant' && (!user.isLoggedIn || (supportReady.value && row.imSync?.routing_version === supportVersion.value)) && !humanHandling.value && row.state === 'COMPLETED' && !row.questionConsumed && messages.value.at(-1) === row && !running.value && !busy.value && !historyLoading.value && ready.value;
  }
  function answerQuestion(row: AiDisplayMessage, text: string) {
    if (!canAnswer(row) || !row.questions?.includes(text)) return;
    input.value = text; void send();
  }
  const historyMore = ref(false);
  const sessionMore = ref(false);
  const scrollRef = ref<HTMLElement>();
  let sessionCursor: string | null = null;
  let historyCursor: string | null = null;
  let historyLoaded = false;
  let scope = 0;
  let turn = 0;
  let listVersion = 0;
  let historyVersion = 0;
  let mutationVersion = 0;
  let disposed = false;
  let stream: AbortController | undefined;
  let reads = new AbortController();
  // 只过滤展示，当前会话恢复和分页仍使用服务端原始记录。
  const visibleSessions = computed(() => sessions.value.filter(row => row.messageCount !== 0));
  const archived = computed(() => sessions.value.find(row => row.conversationId === conversationId.value)?.status === 'ARCHIVED');
  const canSend = computed(() => !humanHandling.value && ready.value && !running.value && !busy.value && !historyLoading.value
    && !archived.value && !uploading.value && (!!input.value.trim() || attachments.value.length > 0) && input.value.length <= 2000 && !user.initializing);
  const pending = computed(() => messages.value.some(row => row.state === 'PENDING' && !row.temporary));
  const current = (version: number, token: string) => !disposed && version === scope && token === getAccessToken();
  const problem = (e: unknown) => e instanceof Error ? e.message : '客服读取失败，请重试';

  function scrollBottom() { void nextTick(() => { if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight; }); }
  function stop() { stream?.abort(); }
  function invalidateStream() {
    turn++;
    stream?.abort();
    stream = undefined;
    running.value = false;
    for (const row of messages.value) if (row.temporary && row.role === 'assistant' && row.state === 'PENDING') {
      row.state = 'INTERRUPTED'; row.progress = ''; row.error = '回答中断';
    }
  }

  async function loadHistory(earlier = false) {
    const id = conversationId.value;
    if (!user.isLoggedIn || !id || historyLoading.value || (earlier && !historyMore.value)) return;
    const version = scope, token = getAccessToken(), operation = ++historyVersion;
    const cursor = earlier ? historyCursor : null;
    const element = scrollRef.value, height = element?.scrollHeight ?? 0, top = element?.scrollTop ?? 0;
    historyLoading.value = true;
    error.value = '';
    try {
      const page = await fetchAiMessages({ conversationId: id, cursor, limit: 20 }, reads.signal);
      if (!current(version, token) || operation !== historyVersion || id !== conversationId.value) return;
      if (page.hasMore && page.nextCursor === cursor) throw new Error('历史游标未推进，请刷新后重试');
      messages.value = mergeAiMessages(messages.value, page.rows, earlier);
      ready.value = true;
      // 首屏初始化和翻页才推进历史游标；翻到底后刷新不能重新打开已加载的早页。
      if (earlier || !historyLoaded) { historyCursor = page.nextCursor; historyMore.value = page.hasMore; }
      historyLoaded = true;
      if (earlier) { await nextTick(); if (element && id === conversationId.value) element.scrollTop = top + element.scrollHeight - height; }
      else scrollBottom();
    } catch (e) {
      if (!current(version, token) || operation !== historyVersion) return;
      error.value = problem(e);
      ready.value = false;
      if (e instanceof RequestError && e.code === '-325') {
        conversationId.value = null; messages.value = []; ready.value = false;
        void loadSessions();
      }
    } finally { if (current(version, token) && operation === historyVersion) historyLoading.value = false; }
  }

  async function loadSessions(more = false, restore = false) {
    if (!user.isLoggedIn || listLoading.value || (more && !sessionMore.value)) return;
    const version = scope, token = getAccessToken(), operation = ++listVersion;
    let restored = false;
    listLoading.value = true; listError.value = ''; void refreshSupportStatus();
    try {
      let cursor = more ? sessionCursor : null;
      const rows: Api.Ai.Session[] = more ? [...sessions.value] : [];
      const seen = new Set<string>();
      let page: Api.Ai.SessionPage;
      do {
        page = await fetchAiSessions({ cursor, limit: 20 }, reads.signal);
        if (!current(version, token) || operation !== listVersion) return;
        for (const row of page.rows) {
          const index = rows.findIndex(item => item.conversationId === row.conversationId);
          if (index < 0) rows.push(row); else rows[index] = row;
        }
        if (page.hasMore && (page.nextCursor === cursor || seen.has(page.nextCursor!))) throw new Error('会话游标未推进，请重试');
        if (cursor) seen.add(cursor);
        cursor = page.nextCursor;
      } while (restore && !rows.some(row => row.current) && page.hasMore);
      sessions.value = rows;
      sessionCursor = page.nextCursor; sessionMore.value = page.hasMore;
      if (restore) {
        conversationId.value = rows.find(row => row.current)?.conversationId ?? null;
        // 没有服务端会话时保留未确认首轮的中断提示，避免把失败显示成空对话。
        if (conversationId.value || !messages.value.every(row => row.temporary)) messages.value = [];
        historyCursor = null; historyMore.value = false; historyLoaded = false;
        ready.value = true;
        restored = true;
      }
    } catch (e) { if (current(version, token) && operation === listVersion) listError.value = problem(e); }
    finally { if (current(version, token) && operation === listVersion) listLoading.value = false; }
    // 列表请求已结束后再读历史，失效会话才能立即重新查询列表。
    if (restored && current(version, token) && operation === listVersion) await loadHistory();
  }

  async function changeSession(id?: string) {
    if (!ready.value || busy.value || listLoading.value || historyLoading.value || !user.isLoggedIn || (id && id === conversationId.value)) return;
    invalidateStream();
    const version = scope, token = getAccessToken(), operation = ++mutationVersion;
    if (!id) {
      conversationId.value = null;
      messages.value = []; input.value = ''; attachments.value = []; historyCursor = null; historyMore.value = false; historyLoaded = false;
      error.value = ''; notice.value = '';
      return;
    }
    busy.value = true; error.value = ''; notice.value = '';
    try {
      const state = await activateAiSession(id);
      if (!current(version, token) || operation !== mutationVersion) return;
      if (!/^[0-9a-f]{32}$/.test(state?.conversationId) || state.current !== true
        || (id && state.conversationId !== id)) throw new Error('当前会话确认失败，请刷新会话列表核对');
      conversationId.value = state.conversationId;
      messages.value = []; input.value = ''; attachments.value = []; historyCursor = null; historyMore.value = false; historyLoaded = false;
      ready.value = true;
      await loadHistory();
      await loadSessions();
    } catch (e) {
      if (current(version, token) && operation === mutationVersion) {
        error.value = `${problem(e)}；已保留原会话。请刷新会话确认结果后再操作。`;
        ready.value = false;
      }
    } finally { if (current(version, token) && operation === mutationVersion) busy.value = false; }
  }

  async function send() {
    if (!canSend.value) return;
    const question = input.value.trim(), images = attachments.value.map(row => ({...row})), version = scope, token = getAccessToken(), requestTurn = ++turn;
    const key = `web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const aborter = new AbortController(); stream = aborter;
    const active = () => current(version, token) && requestTurn === turn;
    for (const row of messages.value) row.questionConsumed = true;
    running.value = true; error.value = ''; notice.value = '';
    if (user.isLoggedIn) {
      try {
        const support = await fetchSupportConversation();
        if (!active()) return;
        if (aborter.signal.aborted) { running.value = false; stream = undefined; return; }
        supportReady.value = true; supportVersion.value = support.routingVersion;
        humanHandling.value = support.interveneStatus === 'HANDLING';
        if (humanHandling.value) { notice.value = '人工客服正在接待，请进入客服会话继续'; running.value = false; stream = undefined; return; }
        if (!['NONE','REQUESTED'].includes(support.interveneStatus || '') || support.aiEnabled === false) throw new Error('客服接待状态暂不可用，请稍后重试');
      } catch (e) { if (active()) { error.value = problem(e); running.value = false; stream = undefined; } return; }
    }
    if (user.isLoggedIn && !conversationId.value) {
      busy.value = true; notice.value = '正在创建会话…';
      try {
        // 首次实际发送才创建；拿到 ID 后始终复用，避免发送失败又创建空会话。
        const state = await createAiSession();
        if (!active()) return;
        if (!/^[0-9a-f]{32}$/.test(state?.conversationId) || state.current !== true) throw new Error('新会话确认失败');
        conversationId.value = state.conversationId;
      } catch (e) {
        if (active()) {
          ready.value = false; running.value = false; stream = undefined; notice.value = '';
          error.value = `${problem(e)}；问题尚未发送，请刷新会话确认创建结果后再操作。`;
        }
        return;
      } finally { if (active()) busy.value = false; }
      if (aborter.signal.aborted) {
        running.value = false; stream = undefined; notice.value = '已停止，问题尚未发送。';
        return;
      }
      notice.value = '';
    }
    const fromUser: AiDisplayMessage = { id: `user-${key}`, clientMessageId: key, temporary: true, role: 'user', text: question, images:images.map(row => ({fileId:row.id})), parts: [], state: 'COMPLETED' };
    messages.value.push(fromUser, { id: `answer-${key}`, clientMessageId: key, temporary: true, role: 'assistant', text: '', parts: [], state: 'PENDING', progress: '正在连接客服…' });
    const answer = messages.value[messages.value.length - 1];
    if (input.value.trim() === question) input.value = '';
    attachments.value = [];
    scrollBottom();
    try {
      await streamCustomerChat({ message: question, imageFileIds:images.map(row => row.id), conversationId: conversationId.value, clientMessageId: key }, aborter.signal, event => {
        if (!active()) return;
        if (event.event === 'start') {
          conversationId.value = event.data.conversation_id;
          answer.imSync = event.data.im_sync;
          answer.requestId = event.data.request_id; fromUser.requestId = event.data.request_id;
          // fromUser 是入 ref 前的对象，显式更新响应式记录上的关联键。
          const questionRow = messages.value.find(row => row.id === fromUser.id);
          if (questionRow) questionRow.requestId = event.data.request_id;
        } else if (event.event === 'status') answer.progress = event.data.text;
        else if (event.event === 'delta') {
          answer.progress = '';
          const last = answer.parts.at(-1);
          if (last?.type === 'text') last.text += event.data.text;
          else answer.parts.push({ type: 'text', text: event.data.text });
        } else if (event.event === 'card') answer.parts.push({ type: 'card', card: event.data.data });
        else if (event.event === 'product_cards') answer.parts.push({ type: 'products', card: { type: event.data.type, items: event.data.items } });
        else if (event.event === 'done') { answer.state = 'COMPLETED'; answer.progress = ''; if (event.data.im_sync) answer.imSync = event.data.im_sync; }
        else if (event.event === 'action' && answer.imSync) {
          void handleHumanAction(event.data, { requestId: answer.requestId!, sync: answer.imSync, active, owner: String(user.currentUser?.id || '') });
        }
        else if (event.event === 'question') { answer.questions = event.data.options; answer.question = { text:event.data.text, options:event.data.options, placement:'after_cards' }; }
        else if (event.event === 'error') { answer.state = 'FAILED'; answer.progress = ''; answer.error = event.data.message; }
        scrollBottom();
      });
    } catch (e) {
      if (!active()) return;
      answer.progress = ''; answer.state = 'INTERRUPTED'; answer.error = aborter.signal.aborted ? '已停止生成，回答可能不完整。' : problem(e);
      if (e instanceof RequestError && e.code === '-326') {
        notice.value = '消息已记录，正在读取已保存内容。请勿重复发送。';
        messages.value = messages.value.filter(row => row.id !== answer.id);
      } else if (e instanceof RequestError && e.code === '-325') {
        conversationId.value = null; messages.value = []; ready.value = false;
        if (!input.value) input.value = question;
        error.value = '会话不存在或不可访问，请刷新会话列表。';
      }
    } finally {
      if (active()) {
        running.value = false; stream = undefined;
        if (user.isLoggedIn) {
          await loadHistory();
          // 首轮在 start 到达前断开时，从服务端当前会话恢复，不重发问题。
          if (active()) await loadSessions(false, !conversationId.value && ready.value);
        }
      }
    }
  }

  async function refreshSupportStatus() {
    if (!user.isLoggedIn) return;
    const version = scope, token = getAccessToken(), check = ++supportCheck;
    try {
      const route = await fetchSupportConversation();
      if (!current(version, token) || check !== supportCheck) return;
      if (!['NONE','REQUESTED','HANDLING'].includes(route.interveneStatus || '')) throw new Error('接待状态暂不可用');
      if (supportVersion.value !== undefined && route.routingVersion !== supportVersion.value) {
        invalidateStream(); for (const row of messages.value) row.questionConsumed = true;
      }
      supportReady.value = true; supportVersion.value = route.routingVersion;
      humanHandling.value = route.interveneStatus === 'HANDLING';
      if (humanHandling.value) { invalidateStream(); notice.value = '人工客服正在接待，请进入客服会话继续'; }
    } catch {
      if (current(version, token) && check === supportCheck) { supportReady.value = false; invalidateStream(); error.value = '接待状态暂不可用，请刷新后继续'; }
    }
  }
  realtime.subscribe(event => {
    if (['SYNC','IM_INTERVENE','IM_ASSIGN'].includes(event.type)) void refreshSupportStatus();
  });

  watch([() => user.sessionVersion, () => user.currentUser?.id, () => user.initializing], () => {
    humanHandling.value = false; supportReady.value = false; supportVersion.value = undefined; supportCheck++;
    scope++; listVersion++; historyVersion++; mutationVersion++;
    invalidateStream(); reads.abort(); reads = new AbortController();
    sessions.value = []; messages.value = []; conversationId.value = null; input.value = ''; attachments.value = []; uploading.value = false;
    historyCursor = null; sessionCursor = null; historyMore.value = false; sessionMore.value = false; historyLoaded = false;
    listLoading.value = false; historyLoading.value = false; busy.value = false;
    error.value = ''; listError.value = ''; notice.value = '';
    ready.value = !user.initializing && !user.isLoggedIn;
    if (!user.initializing && user.isLoggedIn) { void loadSessions(false, true); void refreshSupportStatus(); }
  }, { immediate: true, flush: 'sync' });

  onBeforeUnmount(() => { disposed = true; scope++; invalidateStream(); reads.abort(); });
  return { sessions, visibleSessions, messages, conversationId, input, attachments, uploading, running, busy, listLoading, historyLoading, ready, error, listError,
    notice, humanHandling, historyMore, sessionMore, scrollRef, canSend, canAnswer, answerQuestion, pending, archived, loadSessions, loadHistory, changeSession, stop, send };
}
