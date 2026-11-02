import { handleLogoutMessage, realUserRequest } from '@/service/request';
import { ACCESS_TOKEN_KEY, getAccessToken, getAcceptedAccessToken } from '@/service/request/token';
import { readEventStream } from '@/service/request/stream';
import { isAuthenticationFailure, RequestError, responseTraceId, type RealResponse } from '@/service/request/type';
import { parseJsonPreservingLong } from '@/utils/json';
import { isProductListCard } from '@/utils/ai-product';
import { isHumanHandoffCard } from '@/utils/human-support';

const invalidEvent = () => new RequestError('客服响应格式异常，回答已中断，请重新提问', { code: 'INVALID_STREAM' });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const safeAiMessage = (value: string) => value.trim() && !/(?:Exception|Traceback|StackTrace|\bSQL\b|java\.|org\.)/i.test(value)
  ? value : '客服暂时不可用，请稍后重试';

const prefix = '/ai/customer-service';
export function requireAiPage<T>(page: { rows: T[]; hasMore: boolean; nextCursor: string | null }) {
  if (!page || !Array.isArray(page.rows) || typeof page.hasMore !== 'boolean'
    || (page.hasMore && (typeof page.nextCursor !== 'string' || !page.nextCursor))) {
    throw new RequestError('客服历史响应格式异常，请重新加载', { code: 'INVALID_AI_PAGE' });
  }
  return page;
}

export async function fetchAiSessions(query: Api.Ai.PageQuery, signal?: AbortSignal) {
  return requireAiPage(await realUserRequest.postQuery<Api.Ai.SessionPage>(`${prefix}/sessions/list`, { ...query, cursor: query.cursor ?? undefined }, { signal, showError: false }));
}
export function createAiSession() {
  // 写操作只发一次；结果未知时由页面回查当前会话。
  return realUserRequest.post<Api.Ai.SessionState>(`${prefix}/sessions/create`, { title: '' }, { showError: false });
}
export function activateAiSession(conversationId: string) {
  return realUserRequest.put<Api.Ai.SessionState>(`${prefix}/sessions/activate`, { conversationId }, { showError: false });
}
export async function fetchAiMessages(query: Api.Ai.MessageQuery, signal?: AbortSignal) {
  const page = await realUserRequest.postQuery<Api.Ai.MessagePage>(`${prefix}/messages/list`, { ...query, cursor: query.cursor ?? undefined }, { signal, showError: false });
  requireAiPage(page);
  page.rows = page.rows.map(row => {
    const snake = (row as unknown as Record<string, unknown>).structured_data;
    return row.structuredData == null && isObject(snake) ? { ...row, structuredData: snake as Api.Ai.Message['structuredData'] } : row;
  });
  if (page.conversationId !== query.conversationId) throw new RequestError('客服消息与当前会话不一致，请刷新', { code: 'INVALID_AI_PAGE' });
  if (!page.rows.every(row => typeof row.messageId === 'string' && typeof row.content === 'string'
    && ['USER', 'ASSISTANT'].includes(row.role) && ['PENDING', 'COMPLETED', 'FAILED', 'INTERRUPTED'].includes(row.status)
    && (row.structuredData == null || (isObject(row.structuredData)
      && (row.structuredData.cards == null || (Array.isArray(row.structuredData.cards)
        && row.structuredData.cards.every(card => isProductListCard(card) || isHumanHandoffCard(card) || (isObject(card) && !('type' in card && card.type === 'product_list') && typeof card.tool === 'string' && isObject(card.data))))))))) {
    throw new RequestError('消息加载异常', { code: 'INVALID_AI_PAGE' });
  }
  if (page.rows.some(row => { const q = row.structuredData?.question; return q != null && (typeof q.text !== 'string' || !Array.isArray(q.options) || q.options.length > 4 || !q.options.every(item => typeof item === 'string') || !['after_cards','in_content'].includes(q.placement)); })) throw new RequestError('追问信息格式异常，请重新加载', {code:'INVALID_AI_PAGE'});
  return page;
}

/** 流只允许当前 Java 请求的递增事件；串流、乱序和不完整结果不能冒充完整回答。 */
export function createChatEventReceiver(onEvent: (event: Api.Ai.ChatEvent) => void) {
  let requestId: string | undefined;
  let sequence = 0;
  const seen = new Set<number>();
  return (frame: { event: string; data: string }) => {
    let data: Record<string, unknown>;
    try {
      const parsed = parseJsonPreservingLong<unknown>(frame.data);
      if (!isObject(parsed)) throw invalidEvent();
      data = parsed;
    } catch { throw invalidEvent(); }
    // 新确认卡可仅含 type/data；仍只能归属已经 start 的本次活跃流。
    if (frame.event === 'card' && data.type === 'human_handoff') {
      if (!requestId || !isHumanHandoffCard(data)) throw invalidEvent();
      if (data.request_id === undefined && data.seq === undefined) {
        onEvent({ event: 'card', data }); return false;
      }
    }
    if (typeof data.request_id !== 'string' || !data.request_id || !Number.isSafeInteger(data.seq)
      || (data.seq as number) < 1 || (requestId !== undefined && data.request_id !== requestId)) throw invalidEvent();
    if (seen.has(data.seq as number)) return false;
    if ((data.seq as number) < sequence) throw invalidEvent();
    if (data.im_sync !== undefined && (!isObject(data.im_sync) || typeof data.im_sync.im_conversation_id !== 'string' || typeof data.im_sync.routing_version !== 'string')) throw invalidEvent();
    if (requestId === undefined && (frame.event !== 'start' || data.seq !== 1)) throw invalidEvent();
    if (frame.event === 'start') {
      if (requestId !== undefined || typeof data.conversation_id !== 'string' || !/^[0-9a-f]{32}$/.test(data.conversation_id)) throw invalidEvent();
    } else if (frame.event === 'status' || frame.event === 'delta') {
      if (typeof data.text !== 'string') throw invalidEvent();
    } else if (frame.event === 'card' && isHumanHandoffCard(data)) {
      // 与旧查询结果卡分开校验，不读取模型 URL、身份或接口参数。
    } else if (frame.event === 'card') {
      if (typeof data.tool !== 'string' || !isObject(data.data) || typeof data.data.code !== 'string') throw invalidEvent();
      const card = data.data;
      if ((card.code === 'OK' && (typeof card.kind !== 'string' || !Array.isArray(card.rows)))
        || (card.kind !== undefined && typeof card.kind !== 'string')
        || (card.rows !== undefined && (!Array.isArray(card.rows) || !card.rows.every(isObject)))) throw invalidEvent();
    } else if (frame.event === 'question') {
      if (typeof data.text !== 'string' || !Array.isArray(data.options) || data.options.length > 4 || !data.options.every(value => typeof value === 'string' && !!value.trim())) throw invalidEvent();
    } else if (frame.event === 'action') {
      if (typeof data.type !== 'string' || typeof data.action_id !== 'string') throw invalidEvent();
    } else if (frame.event === 'product_cards') {
      if (!isProductListCard(data)) throw invalidEvent();
    } else if (frame.event === 'done') {
      if (data.status !== 'completed') throw invalidEvent();
    } else if (frame.event === 'error') {
      if (typeof data.code !== 'string' || typeof data.message !== 'string' || typeof data.retryable !== 'boolean') throw invalidEvent();
      data.message = safeAiMessage(data.message);
    } else throw invalidEvent();
    requestId = data.request_id;
    sequence = data.seq as number; seen.add(sequence);
    onEvent({ event: frame.event, data } as unknown as Api.Ai.ChatEvent);
    return frame.event === 'done' || frame.event === 'error';
  };
}

export async function streamCustomerChat(input: Api.Ai.ChatParams, signal: AbortSignal, onEvent: (event: Api.Ai.ChatEvent) => void) {
  const token = getAcceptedAccessToken();
  const sameIdentity = () => token === getAccessToken() && token === getAcceptedAccessToken();
  if (!sameIdentity()) throw new RequestError('登录会话已在其他页面切换，请等待身份核对后重试', { code: 'SESSION_CHANGED' });
  if ((!(input.message ?? '').trim() && !input.imageFileIds?.length) || (input.message?.length || 0) > 2000 || (input.imageFileIds?.length || 0) > 3) throw new RequestError('请提供文字或图片，文字最多 2000 字、图片最多 3 张', { code: 'INVALID_MESSAGE' });
  if (input.conversationId != null && !/^[0-9a-f]{32}$/.test(input.conversationId)) throw new RequestError('会话信息异常，请刷新后重试', { code: 'INVALID_CONVERSATION' });
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
      const message = typeof body?.message === 'string' ? safeAiMessage(body.message) : '客服暂时不可用，请稍后重新提问';
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
