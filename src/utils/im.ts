import { parseJsonPreservingLong } from './json';

export function parseOrderMessageCard(content?: string | null) {
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

function validReadCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 快照不提供成员明细，不能与实时人数相加；回读分页取得精确人数。 */
export function messageReadCount(message: Api.RealNotify.ImMessageVO, watermarks: Record<string, string | number>) {
  const liveCount = Object.entries(watermarks).filter(([reader, id]) =>
    !sameBusinessId(reader, message.senderId) && compareBusinessId(id, message.id) >= 0).length;
  return Math.max(validReadCount(message.readCount) ? message.readCount : 0, liveCount);
}

/** by-order 的订单字段属于群最近一单，独立订单页只展示路由所指订单。 */
export function orderConversationMetadata(
  conversation: Api.RealNotify.ImConversationVO,
  orderId: string | number,
  orders: Api.RealNotify.ImConversationOrder[]
): Api.RealNotify.ImConversationVO {
  const order = orders.find(item => sameBusinessId(item.orderId, orderId));
  if (!order && sameBusinessId(conversation.orderId, orderId)) return conversation;
  return { ...conversation, orderId,
    orderNo: order?.orderNo, orderStatus: order?.orderStatus, orderStatusText: order?.orderStatusText,
    productTitle: order?.productTitle, productImage: order?.productImage, amount: order?.amount };
}

export function isOrderConversationEvent(message: Api.RealNotify.ImMessageVO) {
  const type = String(message.msgType || '').toUpperCase();
  return type === 'ORDER_CARD' || (type === 'SYSTEM' && Boolean(message.eventType));
}

/** 重连和已读回执需回读旧消息；增量接口不会返回旧消息更新后的 readCount。 */
export async function refreshMessageReadCounts(options: {
  messages: Api.RealNotify.ImMessageVO[];
  conversationId: string | number;
  request: (pageNo: number, pageSize: number) => Promise<Api.RealNotify.PageResult<Api.RealNotify.ImMessageVO>>;
  accept: (messages: Api.RealNotify.ImMessageVO[]) => void;
  signal: AbortSignal;
}) {
  const ids = new Set(options.messages.filter(message => !String(message.id).startsWith('local:')).map(message => String(message.id)));
  if (!ids.size) return;
  const pageSize = 50;
  const pages = Math.ceil(ids.size / pageSize) + 1;
  for (let page = 1; page <= pages && ids.size; page += 1) {
    options.signal.throwIfAborted();
    const response = await options.request(page, pageSize);
    options.signal.throwIfAborted();
    if (response.records.some(message => !sameBusinessId(message.conversationId, options.conversationId))) {
      throw new Error('已读状态返回了其他会话的消息，请重新同步');
    }
    const updates = response.records.filter(message => ids.has(String(message.id))).map(message => {
      ids.delete(String(message.id));
      return message;
    });
    options.accept(updates);
    if (response.records.length < pageSize) break;
  }
  if (ids.size) throw new Error('已读状态尚未同步完整，请重新同步');
}

export function recalledMessage(message: Api.RealNotify.ImMessageVO): Api.RealNotify.ImMessageVO {
  return { ...message, recalled: true, content: undefined, mediaUrl: undefined, mediaFileId: undefined, coverUrl: undefined, coverFileId: undefined, duration: undefined, params: undefined };
}

export function mergeMessages(
  current: Api.RealNotify.ImMessageVO[],
  incoming: Api.RealNotify.ImMessageVO | Api.RealNotify.ImMessageVO[]
) {
  const result = current.map(message => message.recalled ? recalledMessage(message) : message);
  const additions = Array.isArray(incoming) ? incoming : [incoming];

  additions.forEach(message => {
    const index = result.findIndex(item =>
      sameBusinessId(item.id, message.id) ||
      (!!message.clientMsgId && item.clientMsgId === message.clientMsgId)
    );
    const merged = index >= 0 ? { ...result[index], ...message, pending: false, failed: false } : { ...message };
    // 发送响应缺省 readCount，历史快照和重复回执均不能降低已经确认的人数。
    const counts = [index >= 0 ? result[index].readCount : undefined, message.readCount].filter(validReadCount);
    if (counts.length) merged.readCount = Math.max(...counts);
    // 撤回为终态；迟到分页或发送回执不能让旧内容/媒体复活，null 不回退旧值。
    if (message.recalled || (index >= 0 && result[index].recalled)) {
      Object.assign(merged, recalledMessage(merged));
    }
    if (index >= 0) result[index] = merged;
    else result.push(merged);
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
    coverFileId: params.coverFileId,
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
