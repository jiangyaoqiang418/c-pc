import { parseJsonPreservingLong } from './json';

export function parseOrderMessageCard(content?: string) {
  if (!content) return;
  try {
    const card = parseJsonPreservingLong<Record<string, unknown>>(content);
    if (!card || typeof card !== 'object' || Array.isArray(card)) return;
    const id = card.orderId;
    if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) return;
    return {
      orderId: id,
      orderNo: typeof card.orderNo === 'string' ? card.orderNo : undefined,
      productTitle: typeof card.productTitle === 'string' ? card.productTitle : undefined,
      productImage: typeof card.productImage === 'string' ? card.productImage : undefined,
      amount: typeof card.amount === 'string' || typeof card.amount === 'number' ? card.amount : undefined,
      currency: typeof card.currency === 'string' ? card.currency : undefined,
      statusText: typeof card.statusText === 'string' ? card.statusText : undefined
    };
  } catch { return; }
}

/** WebSocket/REST 已取得的服务端确认优先于迟到的发送异常。 */
export function markUnconfirmedMessageFailed(messages: Api.RealNotify.ImMessageVO[], clientMsgId: string) {
  return messages.map(message => message.clientMsgId === clientMsgId && String(message.id).startsWith('local:')
    ? { ...message, pending: false, failed: true } : message);
}

export function sameBusinessId(left?: string | number, right?: string | number) {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

/** 以可见消息为锚点；不将底部新消息或用户等待期间滚动计作顶部插入高度。 */
export function captureMessageAnchor(container?: HTMLElement) {
  if (!container) return;
  const bounds = container.getBoundingClientRect();
  const element = Array.from(container.querySelectorAll<HTMLElement>('.msg-row'))
    .find(row => { const rect = row.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom; });
  if (element) return { element, offset: element.getBoundingClientRect().top - bounds.top };
}

export function restoreMessageAnchor(container: HTMLElement | undefined, anchor: ReturnType<typeof captureMessageAnchor>) {
  if (!container || !anchor || !container.contains(anchor.element)) return;
  container.scrollTop += anchor.element.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset;
}

export function shouldSendOnEnter(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

export function compareBusinessId(left: string | number, right: string | number) {
  const a = String(left);
  const b = String(right);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const normalizedA = a.replace(/^0+/, '') || '0';
    const normalizedB = b.replace(/^0+/, '') || '0';
    if (normalizedA.length !== normalizedB.length) return normalizedA.length - normalizedB.length;
    return normalizedA.localeCompare(normalizedB);
  }
  return a.localeCompare(b);
}

/** 已读事件仅属于指定会话，乱序到达不能回退阅读位置。 */
export function applyReadEvent(
  watermarks: Record<string, string | number>,
  conversationId: string | number | undefined,
  event: Api.RealNotify.ImReadEvent
) {
  const readerId = event.readerUserId ?? event.userId;
  if (!sameBusinessId(conversationId, event.conversationId) || readerId === undefined
    || event.lastReadMessageId === undefined || event.lastReadMessageId === null) return watermarks;
  const previous = watermarks[String(readerId)];
  if (previous !== undefined && compareBusinessId(event.lastReadMessageId, previous) <= 0) return watermarks;
  return { ...watermarks, [String(readerId)]: event.lastReadMessageId };
}

export function mergeMessages(
  current: Api.RealNotify.ImMessageVO[],
  incoming: Api.RealNotify.ImMessageVO | Api.RealNotify.ImMessageVO[]
) {
  const result = [...current];
  const additions = Array.isArray(incoming) ? incoming : [incoming];

  additions.forEach(message => {
    const index = result.findIndex(item =>
      sameBusinessId(item.id, message.id) ||
      (!!message.clientMsgId && item.clientMsgId === message.clientMsgId)
    );
    if (index >= 0) result[index] = { ...result[index], ...message, pending: false, failed: false };
    else result.push(message);
  });

  return result.sort((left, right) => compareBusinessId(left.id, right.id));
}

export function latestServerMessageId(messages: Api.RealNotify.ImMessageVO[]) {
  const serverMessages = messages.filter(message => !String(message.id).startsWith('local:'));
  return serverMessages.at(-1)?.id;
}

export function isNearMessageBottom(container?: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>) {
  return !container || container.scrollHeight - container.scrollTop - container.clientHeight <= 64;
}

/** 连续游标只由正序 REST 批次推进，不能使用先到达的实时消息跳过缺口。 */
export async function syncMessageGap(options: {
  conversationId: string | number;
  sinceId: string | number;
  request: (sinceId: string | number, limit: number) => Promise<Api.RealNotify.ImMessageVO[]>;
  accept: (messages: Api.RealNotify.ImMessageVO[], cursor: string | number) => void;
  signal: AbortSignal;
}) {
  let cursor = options.sinceId;
  const limit = 200;
  for (let batch = 0; batch < 5; batch += 1) {
    options.signal.throwIfAborted();
    const messages = await options.request(cursor, limit);
    options.signal.throwIfAborted();
    let nextCursor = cursor;
    for (const message of messages) {
      if (!sameBusinessId(message.conversationId, options.conversationId) || message.id === undefined
        || compareBusinessId(message.id, nextCursor) <= 0 || String(message.id).startsWith('local:')) {
        throw new Error('增量消息游标未推进或会话不匹配，请重新同步');
      }
      nextCursor = message.id;
    }
    options.accept(messages, nextCursor);
    cursor = nextCursor;
    if (messages.length < limit) return true;
  }
  // 限制单轮工作量，保留已确认游标并明确提示继续，不冒充完整同步。
  return false;
}

export function conversationImageUrls(messages: Api.RealNotify.ImMessageVO[]) {
  return Array.from(new Set(messages
    .filter(message => !message.recalled && String(message.msgType || '').toUpperCase() === 'IMAGE' && Boolean(message.mediaUrl))
    .map(message => message.mediaUrl as string)));
}

export function imagePreviewIndex(imageUrls: string[], url: string) {
  return imageUrls.indexOf(url);
}

export function createClientMessageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createOptimisticMessage(
  params: Api.RealNotify.ImSendMessageParams,
  sender: { id?: string | number; name?: string; avatar?: string; role?: string }
): Api.RealNotify.ImMessageVO {
  return {
    id: `local:${params.clientMsgId}`,
    conversationId: params.conversationId,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    senderRole: sender.role,
    msgType: params.msgType,
    content: params.content,
    mediaFileId: params.mediaFileId,
    clientMsgId: params.clientMsgId,
    createdAt: String(Date.now()),
    pending: true
  };
}

export function isRecallAvailable(message: Api.RealNotify.ImMessageVO, currentUserId?: string | number) {
  if (message.pending || message.failed || message.recalled) return false;
  if (!sameBusinessId(message.senderId, currentUserId)) return false;
  if (['SYSTEM', 'ORDER_CARD'].includes(String(message.msgType || '').toUpperCase())) return false;
  const createdAt = Number(message.createdAt || 0);
  return createdAt > 0 && Date.now() - createdAt <= 2 * 60 * 1000;
}
