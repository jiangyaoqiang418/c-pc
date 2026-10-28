import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { activateAiSession, createAiSession, fetchAiMessages, fetchAiSessions, streamCustomerChat } from '@/service/api/ai';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';
import { useUserStore } from '@/stores/user';

export interface AiDisplayMessage {
  id: string;
  requestId?: string | null;
  clientMessageId?: string | null;
  temporary?: boolean;
  role: 'user' | 'assistant';
  text: string;
  parts: ({ type: 'text'; text: string } | { type: 'card'; card: Api.Ai.CardData })[];
  state: Api.Ai.MessageStatus;
  progress?: string;
  error?: string;
  truncated?: boolean;
  snapshot?: boolean;
}

export function historyMessage(row: Api.Ai.Message): AiDisplayMessage {
  return { id: row.messageId, requestId: row.requestId, clientMessageId: row.clientMessageId,
    role: row.role === 'USER' ? 'user' : 'assistant', text: row.content, state: row.status,
    parts: (row.structuredData?.cards ?? []).map(card => ({ type: 'card', card: card.data })),
    truncated: row.structuredData?.truncated === true, snapshot: !!row.structuredData?.cards?.length,
    error: row.status === 'FAILED' ? '回答失败' : row.status === 'INTERRUPTED' ? '回答中断' : undefined };
}

/** 服务端记录覆盖临时记录；较早已加载消息保留，不能在刷新最新页时丢失。 */
export function mergeAiMessages(existing: AiDisplayMessage[], rows: Api.Ai.Message[], prepend = false) {
  const saved = rows.map(historyMessage);
  const ids = new Set(saved.map(row => row.id));
  const remaining = existing.filter(row => !ids.has(row.id) && !(row.temporary && saved.some(item => item.role === row.role
    && ((row.requestId && item.requestId === row.requestId) || (row.clientMessageId && item.clientMessageId === row.clientMessageId)))));
  return prepend ? [...saved, ...remaining] : [...remaining.filter(row => !row.temporary), ...saved, ...remaining.filter(row => row.temporary)];
}

export function useAiConversations() {
  const user = useUserStore();
  const sessions = ref<Api.Ai.Session[]>([]);
  const messages = ref<AiDisplayMessage[]>([]);
  const conversationId = ref<string | null>(null);
  const input = ref('');
  const running = ref(false);
  const busy = ref(false);
  const listLoading = ref(false);
  const historyLoading = ref(false);
  const ready = ref(false);
  const error = ref('');
  const listError = ref('');
  const notice = ref('');
  const historyMore = ref(false);
  const sessionMore = ref(false);
  const scrollRef = ref<HTMLElement>();
  let sessionCursor: string | null = null;
  let historyCursor: string | null = null;
  let scope = 0;
  let turn = 0;
  let listVersion = 0;
  let historyVersion = 0;
  let mutationVersion = 0;
  let disposed = false;
  let stream: AbortController | undefined;
  let reads = new AbortController();
  const archived = computed(() => sessions.value.find(row => row.conversationId === conversationId.value)?.status === 'ARCHIVED');
  const canSend = computed(() => ready.value && !running.value && !busy.value && !historyLoading.value
    && !archived.value && !!input.value.trim() && input.value.length <= 2000 && !user.initializing);
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
      // 刷新首屏时保留此前更早页的游标。
      if (earlier || historyCursor === null) { historyCursor = page.nextCursor; historyMore.value = page.hasMore; }
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
    listLoading.value = true; listError.value = '';
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
        historyCursor = null; historyMore.value = false;
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
    busy.value = true; error.value = ''; notice.value = '';
    try {
      const state = id ? await activateAiSession(id) : await createAiSession();
      if (!current(version, token) || operation !== mutationVersion) return;
      if (!/^[0-9a-f]{32}$/.test(state?.conversationId) || state.current !== true
        || (id && state.conversationId !== id)) throw new Error('当前会话确认失败，请刷新会话列表核对');
      conversationId.value = state.conversationId;
      messages.value = []; input.value = ''; historyCursor = null; historyMore.value = false;
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
    const question = input.value.trim(), version = scope, token = getAccessToken(), requestTurn = ++turn;
    const key = `web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const aborter = new AbortController(); stream = aborter;
    const fromUser: AiDisplayMessage = { id: `user-${key}`, clientMessageId: key, temporary: true, role: 'user', text: question, parts: [], state: 'COMPLETED' };
    messages.value.push(fromUser, { id: `answer-${key}`, temporary: true, role: 'assistant', text: '', parts: [], state: 'PENDING', progress: '正在连接客服…' });
    const answer = messages.value[messages.value.length - 1];
    running.value = true; input.value = ''; error.value = ''; notice.value = ''; scrollBottom();
    const active = () => current(version, token) && requestTurn === turn;
    try {
      await streamCustomerChat({ message: question, conversationId: conversationId.value, clientMessageId: key }, aborter.signal, event => {
        if (!active()) return;
        if (event.event === 'start') {
          conversationId.value = event.data.conversation_id;
          answer.requestId = event.data.request_id; fromUser.requestId = event.data.request_id;
          // fromUser 是入 ref 前的对象，显式更新响应式记录上的关联键。
          const questionRow = messages.value.find(row => row.id === fromUser.id);
          if (questionRow) questionRow.requestId = event.data.request_id;
        } else if (event.event === 'status') answer.progress = event.data.text;
        else if (event.event === 'delta') {
          const last = answer.parts.at(-1);
          if (last?.type === 'text') last.text += event.data.text;
          else answer.parts.push({ type: 'text', text: event.data.text });
        } else if (event.event === 'card') answer.parts.push({ type: 'card', card: event.data.data });
        else if (event.event === 'done') { answer.state = 'COMPLETED'; answer.progress = ''; }
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

  watch([() => user.sessionVersion, () => user.currentUser?.id, () => user.initializing], () => {
    scope++; listVersion++; historyVersion++; mutationVersion++;
    invalidateStream(); reads.abort(); reads = new AbortController();
    sessions.value = []; messages.value = []; conversationId.value = null; input.value = '';
    historyCursor = null; sessionCursor = null; historyMore.value = false; sessionMore.value = false;
    listLoading.value = false; historyLoading.value = false; busy.value = false;
    error.value = ''; listError.value = ''; notice.value = '';
    ready.value = !user.initializing && !user.isLoggedIn;
    if (!user.initializing && user.isLoggedIn) void loadSessions(false, true);
  }, { immediate: true, flush: 'sync' });

  onBeforeUnmount(() => { disposed = true; scope++; invalidateStream(); reads.abort(); });
  return { sessions, messages, conversationId, input, running, busy, listLoading, historyLoading, ready, error, listError,
    notice, historyMore, sessionMore, scrollRef, canSend, pending, archived, loadSessions, loadHistory, changeSession, stop, send };
}
