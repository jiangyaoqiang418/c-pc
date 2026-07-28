/**
 * IM 消息池 — 全平台单一真实源（R-MOD-15）。
 *
 * 三类会话（platform-cs / presales / groups）seed 阶段会通过 `appendMessage()` 向本池注入 messages，
 * 总数 ≥ 300 条。运行时管理员"发系统消息"也通过本池 append。
 *
 * 任何其他模块要查"该会话/订单的消息"必须调 `/im/messages/list?conversationId=X`（R-MOD-15），
 * 禁止重复 mock。
 */

type Message = Api.Im.Message;

let messageIdCursor = 0;
export function nextMessageId(): number {
  messageIdCursor += 1;
  return messageIdCursor;
}

/** 主真实源（按 sentAt 升序保存；运行时 push 最新消息到末尾） */
export const MESSAGES: Message[] = [];

export function appendMessage(msg: Omit<Message, 'id'> & { id?: number }): Message {
  const next: Message = { ...msg, id: msg.id ?? nextMessageId() } as Message;
  MESSAGES.push(next);
  return next;
}

export function findMessageById(id: number): Message | undefined {
  return MESSAGES.find(m => m.id === id);
}

/**
 * 获取某会话的消息（游标分页）。
 * - beforeMessageId 提供时：取 id < beforeMessageId 的最近 limit 条（向上加载更早历史）。
 * - 否则：取该会话最近 limit 条（按 sentAt 降序后取前 limit，再翻转为升序展示）。
 */
export function findMessagesByConversation(
  conversationId: number,
  beforeMessageId?: number,
  limit: number = 50
): Message[] {
  let pool = MESSAGES.filter(m => m.conversationId === conversationId);
  if (beforeMessageId !== undefined) {
    pool = pool.filter(m => m.id < beforeMessageId);
  }
  // 按 sentAt 升序排（旧 → 新）
  pool.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  // 取最后 limit 条
  return pool.slice(Math.max(0, pool.length - limit));
}

/** 按关键字搜索某会话内消息（不分页，调用端自行截断） */
export function searchMessages(conversationId: number, keyword: string): Message[] {
  const k = keyword.toLowerCase();
  return MESSAGES.filter(m => m.conversationId === conversationId && (m.content || '').toLowerCase().includes(k));
}

/** 统计某会话的消息数 */
export function countMessages(conversationId: number): number {
  return MESSAGES.filter(m => m.conversationId === conversationId).length;
}

/** 获取某会话最后一条消息 */
export function lastMessage(conversationId: number): Message | undefined {
  const list = MESSAGES.filter(m => m.conversationId === conversationId);
  if (!list.length) return undefined;
  return list.reduce((acc, m) => (m.sentAt > acc.sentAt ? m : acc));
}
