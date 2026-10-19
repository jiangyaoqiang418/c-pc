import { handleLogoutMessage } from '@/service/request';
import { ACCESS_TOKEN_KEY, getAccessToken, getAcceptedAccessToken } from '@/service/request/token';
import { readEventStream } from '@/service/request/stream';
import { isAuthenticationFailure, RequestError, responseTraceId, type RealResponse } from '@/service/request/type';
import { parseJsonPreservingLong } from '@/utils/json';

const invalidEvent = () => new RequestError('客服响应格式异常，回答已中断，请重新提问', { code: 'INVALID_STREAM' });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** 流只允许当前 Java 请求的递增事件；串流、乱序和不完整结果不能冒充完整回答。 */
export function createChatEventReceiver(onEvent: (event: Api.Ai.ChatEvent) => void) {
  let requestId: string | undefined;
  let sequence = 0;
  return (frame: { event: string; data: string }) => {
    let data: Record<string, unknown>;
    try {
      const parsed = parseJsonPreservingLong<unknown>(frame.data);
      if (!isObject(parsed)) throw invalidEvent();
      data = parsed;
    } catch { throw invalidEvent(); }
    if (typeof data.request_id !== 'string' || !data.request_id || !Number.isSafeInteger(data.seq)
      || (data.seq as number) <= sequence || (requestId !== undefined && data.request_id !== requestId)) throw invalidEvent();
    if (requestId === undefined && frame.event !== 'start') throw invalidEvent();
    if (frame.event === 'start') {
      if (requestId !== undefined || typeof data.conversation_id !== 'string' || !/^[0-9a-f]{32}$/.test(data.conversation_id)) throw invalidEvent();
    } else if (frame.event === 'status' || frame.event === 'delta') {
      if (typeof data.text !== 'string') throw invalidEvent();
    } else if (frame.event === 'card') {
      if (typeof data.tool !== 'string' || !isObject(data.data) || typeof data.data.code !== 'string'
        || typeof data.data.kind !== 'string' || !Array.isArray(data.data.rows) || !data.data.rows.every(isObject)) throw invalidEvent();
    } else if (frame.event === 'done') {
      if (data.status !== 'completed') throw invalidEvent();
    } else if (frame.event === 'error') {
      if (typeof data.code !== 'string' || typeof data.message !== 'string' || typeof data.retryable !== 'boolean') throw invalidEvent();
    } else throw invalidEvent();
    requestId = data.request_id;
    sequence = data.seq as number;
    onEvent({ event: frame.event, data } as unknown as Api.Ai.ChatEvent);
    return frame.event === 'done' || frame.event === 'error';
  };
}

export async function streamCustomerChat(input: Api.Ai.ChatParams, signal: AbortSignal, onEvent: (event: Api.Ai.ChatEvent) => void) {
  const token = getAcceptedAccessToken();
  const sameIdentity = () => token === getAccessToken() && token === getAcceptedAccessToken();
  if (!sameIdentity()) throw new RequestError('登录会话已在其他页面切换，请等待身份核对后重试', { code: 'SESSION_CHANGED' });
  if (!input.message.trim() || input.message.length > 2000) throw new RequestError('请输入 1 至 2000 字的问题', { code: 'INVALID_MESSAGE' });
  const deadline = new AbortController();
  const identity = new AbortController();
  const combinedSignal = AbortSignal.any([signal, deadline.signal, identity.signal]);
  const timer = setTimeout(() => deadline.abort(), 120_000); // Java 总时限为 100 秒，留足网关余量。
  const onStorage = (event: StorageEvent) => {
    if ((event.key === ACCESS_TOKEN_KEY || event.key === null) && !sameIdentity()) identity.abort();
  };
  window.addEventListener?.('storage', onStorage);
  const receive = createChatEventReceiver(event => {
    if (!sameIdentity()) {
      identity.abort();
      throw new RequestError('账号已切换，请重新提问', { code: 'SESSION_CHANGED' });
    }
    onEvent(event);
  });
  try {
    const baseURL = import.meta.env.VITE_REAL_USER_BASE_URL || '/api/user';
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/ai/customer-service/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { 'X-Access-Token': token } : {}) },
      body: JSON.stringify({ message: input.message, conversationId: input.conversationId }),
      signal: combinedSignal
    });
    if (!sameIdentity()) throw new RequestError('账号已切换，请重新提问', { code: 'SESSION_CHANGED' });
    const streamType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'text/event-stream';
    if (response.status !== 200 || !streamType || !response.body) {
      let body: RealResponse | undefined;
      try { body = parseJsonPreservingLong<RealResponse>(await response.text()); } catch { /* 网关 HTML 不作为可执行内容。 */ }
      const code = body?.code === undefined ? undefined : String(body.code);
      const message = typeof body?.message === 'string' ? body.message : '客服暂时不可用，请稍后重新提问';
      if ((response.status === 401 || code === '-200' || code === '-201') && token && sameIdentity()) {
        handleLogoutMessage(message, code === '-201', token);
      }
      throw new RequestError(message, { status: response.status, code, response: body, traceId: responseTraceId(response.headers) });
    }
    await readEventStream(response.body, receive, combinedSignal);
  } catch (error) {
    if (identity.signal.aborted || (!sameIdentity() && !isAuthenticationFailure(error))) throw new RequestError('账号已切换，请重新提问', { code: 'SESSION_CHANGED' });
    if (signal.aborted) throw new DOMException('已停止', 'AbortError');
    if (deadline.signal.aborted) throw new RequestError('客服响应超时，回答已中断，请重新提问', { code: 'REQUEST_TIMEOUT' });
    if (error instanceof RequestError) throw error;
    throw new RequestError('网络连接异常，回答已中断，请重新提问', { code: 'STREAM_INTERRUPTED' });
  } finally {
    clearTimeout(timer);
    window.removeEventListener?.('storage', onStorage);
  }
}
