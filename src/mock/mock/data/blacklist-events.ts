/**
 * 黑名单事件溯源池（R-DATA-21 append-only）。
 *
 * 设计：事件**不**集中存储，而是分散挂在每条 BuyerBlacklistEntry / CustomerBlacklistEntry /
 * ChainBlacklistEntry 的 `history: BlacklistEvent[]` 中。本文件仅暴露：
 *   - nextEventId()：全局自增 id 计数器（保证跨类型唯一）；
 *   - allEvents()：从三个内存池拉平聚合（操作日志 Tab 用）；
 *   - SYNC_EVENTS：独立的"链上黑名单同步"事件（不属于任何具体条目）。
 *
 * 性质类比 KYC 的 nextEventId + Submission.history 模式。
 */

type BlacklistEvent = Api.Blacklist.BlacklistEvent;
type SyncEventLite = BlacklistEvent;

let eventIdCursor = 0;
export function nextEventId(): number {
  eventIdCursor += 1;
  return eventIdCursor;
}

/** 独立的链上同步事件（targetType='address' 但 targetId 用 0 表示"批量同步"，不指向具体条目） */
export const SYNC_EVENTS: SyncEventLite[] = [];

export function appendSyncEvent(evt: Omit<SyncEventLite, 'id'>): SyncEventLite {
  const next: SyncEventLite = { id: nextEventId(), ...evt };
  SYNC_EVENTS.unshift(next);
  return next;
}

/**
 * 聚合全部事件：三类条目的 history + SYNC_EVENTS。
 * 按时间倒序返回。
 */
export function allEvents(
  buyerEntries: { history: BlacklistEvent[] }[],
  customerEntries: { history: BlacklistEvent[] }[],
  chainEntries: { history: BlacklistEvent[] }[]
): BlacklistEvent[] {
  const all: BlacklistEvent[] = [];
  buyerEntries.forEach(e => all.push(...e.history));
  customerEntries.forEach(e => all.push(...e.history));
  chainEntries.forEach(e => all.push(...e.history));
  all.push(...SYNC_EVENTS);
  // 时间倒序（同时间按 id 倒序）
  return all.sort((a, b) => {
    if (a.time === b.time) return b.id - a.id;
    return b.time.localeCompare(a.time);
  });
}
