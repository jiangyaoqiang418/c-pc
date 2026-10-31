import { handleLogoutMessage, realUserRequest } from '@/service/request';
import { ACCESS_TOKEN_KEY, getAccessToken, getAcceptedAccessToken } from '@/service/request/token';
import { readEventStream } from '@/service/request/stream';
import { isAuthenticationFailure, RequestError, responseTraceId, type RealResponse } from '@/service/request/type';
import { parseJsonPreservingLong } from '@/utils/json';

const invalidEvent = () => new RequestError('客服响应格式异常，回答已中断，请重新提问', { code: 'INVALID_STREAM' });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const prefix = '/ai/customer-service';
export function requireAiPage<T>(page: { rows: T[]; hasMore: boolean; nextCursor: string | null }) {
  if (!page || !Array.isArray(page.rows) || typeof page.hasMore !== 'boolean'
    || (page.hasMore && (typeof page.nextCursor !== 'string' || !page.nextCursor))) {
    throw new RequestError('客服历史响应格式异常，请重新加载', { code: 'INVALID_AI_PAGE' });
  }
  return page;
}

export async function fetchAiSessions(query: Api.Ai.PageQuery, signal?: AbortSignal) {
  return requireAiPage(await realUserRequest.postQuery<Api.Ai.SessionPage>(`${prefix}/sessions/list`, query, { signal, showError: false }));
}
export function createAiSession() {
  // 写操作只发一次；结果未知时由页面回查当前会话。
  return realUserRequest.post<Api.Ai.SessionState>(`${prefix}/sessions/create`, { title: '' }, { showError: false });
}
export function activateAiSession(conversationId: string) {
  return realUserRequest.put<Api.Ai.SessionState>(`${prefix}/sessions/activate`, { conversationId }, { showError: false });
}
export async function fetchAiMessages(query: Api.Ai.MessageQuery, signal?: AbortSignal) {
  const page = await realUserRequest.postQuery<Api.Ai.MessagePage>(`${prefix}/messages/list`, query, { signal, showError: false });
  requireAiPage(page);
  if (page.conversationId !== query.conversationId) throw new RequestError('客服消息与当前会话不一致，请刷新', { code: 'INVALID_AI_PAGE' });
  if (!page.rows.every(row => typeof row.messageId === 'string' && typeof row.content === 'string'
    && ['USER', 'ASSISTANT'].includes(row.role) && ['PENDING', 'COMPLETED', 'FAILED', 'INTERRUPTED'].includes(row.status)
    && (row.structuredData == null || (isObject(row.structuredData)
      && (row.structuredData.cards == null || (Array.isArray(row.structuredData.cards)
        && row.structuredData.cards.every(card => isObject(card) && typeof card.tool === 'string' && isObject(card.data)))))))) {
    throw new RequestError('历史消息格式异常，请重新加载', { code: 'INVALID_AI_PAGE' });
  }
  return page;
}

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
      if (typeof data.tool !== 'string' || !isObject(data.data) || typeof data.data.code !== 'string') throw invalidEvent();
      const card = data.data;
      if ((card.code === 'OK' && (typeof card.kind !== 'string' || !Array.isArray(card.rows)))
        || (card.kind !== undefined && typeof card.kind !== 'string')
        || (card.rows !== undefined && (!Array.isArray(card.rows) || !card.rows.every(isObject)))) throw invalidEvent();
    } else if (frame.event === 'question') {
      if (typeof data.text !== 'string' || !Array.isArray(data.options) || !data.options.every(value => typeof value === 'string')) throw invalidEvent();
    } else if (frame.event === 'product_cards') {
      // 暂缺商品卡片协议，仅跳过此事件；保持流序列与后续正文正常。
      requestId = data.request_id; sequence = data.seq as number; return false;
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
  if ((!input.message.trim() && !input.imageFileIds?.length) || input.message.length > 2000 || (input.imageFileIds?.length || 0) > 3) throw new RequestError('请输入 1 至 2000 字的问题', { code: 'INVALID_MESSAGE' });
  if (input.clientMessageId !== undefined && (input.clientMessageId.length < 8 || input.clientMessageId.length > 64)) {
    throw new RequestError('消息去重键格式异常', { code: 'INVALID_MESSAGE_KEY' });
  }
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
      // 身份只由当前 X-Access-Token 决定，游客请求不沿用浏览器遗留 Cookie。
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { 'X-Access-Token': token } : {}) },
      body: JSON.stringify({ message: input.message, imageFileIds:input.imageFileIds, conversationId: input.conversationId, clientMessageId: input.clientMessageId }),
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

export async function fetchAiWelcome(signal?: AbortSignal) {
  return realUserRequest.get<{ message: string }>(prefix + '/welcome', { signal, showError:false, skipAuthRedirect:true });
}
export async function uploadAiImage(file: File, signal?: AbortSignal) {
  const owner = getAcceptedAccessToken();
  if (!owner) throw new Error('请先登录后上传图片');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 JPG、PNG 或 WebP 图片');
  const image = await createImageBitmap(file).catch(() => { throw new Error('图片无法解码，请重新选择'); });
  const pixels = image.width * image.height; image.close();
  if (pixels > 20_000_000) throw new Error('图片不能超过 2000 万像素');
  const form = new FormData(); form.append('file', file);
  const result = await realUserRequest.post<Api.Ai.UploadedImage>(prefix + '/images/upload', form, { signal, showError:false });
  if (owner !== getAcceptedAccessToken()) throw new Error('登录状态已变化，请重新上传');
  if (!result?.id || !result.url || !Number.isFinite(Number(result.expireAt))) throw new Error('图片上传结果不完整，请重试');
  if (imageOwner !== owner) { imageOwner = owner; imageAccess.clear(); imageRequests.clear(); }
  imageAccess.set(result.id, {url:result.url,expireAt:Number(result.expireAt)});
  return result;
}
let imageOwner = '';
const imageAccess = new Map<string, { url:string; expireAt:number }>();
const imageRequests = new Map<string, Promise<{ url:string; expireAt:number }>>();
export function fetchAiImageAccess(fileId: string, force = false) {
  const owner = getAcceptedAccessToken();
  if (owner !== imageOwner) { imageOwner = owner; imageAccess.clear(); imageRequests.clear(); }
  if (!owner) return Promise.reject(new Error('请登录后查看图片'));
  const saved = imageAccess.get(fileId);
  if (!force && saved && saved.expireAt - Date.now() > 30_000) return Promise.resolve(saved);
  const pending = imageRequests.get(fileId); if (pending) return pending;
  const request = realUserRequest.get<{ fileId:string; url:string; expireAt:string | number }>(prefix + '/images/access', { params:{fileId}, showError:false }).then(data => {
    if (owner !== getAcceptedAccessToken() || String(data.fileId) !== fileId) throw new Error('图片归属或登录状态已变化');
    if (!data.url || !Number.isFinite(Number(data.expireAt))) throw new Error('图片地址暂不可用');
    const result = { url:data.url, expireAt:Number(data.expireAt) }; imageAccess.set(fileId,result); return result;
  }).finally(() => { if (imageRequests.get(fileId) === request) imageRequests.delete(fileId); });
  imageRequests.set(fileId,request); return request;
}
