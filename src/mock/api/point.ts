/**
 * 积分 mock API：明细 / 规则 / 申诉。
 */
import { POINT_LOGS } from '../mock/data/point-logs';
import { POINT_RULES } from '../mock/data/point-rules';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface LogQuery {
  current?: number;
  size?: number;
  userId: number;
  behaviors?: Api.Point.BehaviorCode[];
  fromAt?: string;
  toAt?: string;
}

export async function fetchMyPointLogs(q: LogQuery) {
  let list = POINT_LOGS.filter(l => l.userId === q.userId);
  if (q.behaviors?.length) list = list.filter(l => q.behaviors!.includes(l.behavior));
  if (q.fromAt) list = list.filter(l => l.createdAt >= q.fromAt!);
  if (q.toAt) list = list.filter(l => l.createdAt <= q.toAt!);
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchPointRules() {
  return delay(POINT_RULES, 100);
}

export interface AppealParams {
  logId: number;
  reason: string;
}

export async function appealPointLogMock(p: AppealParams): Promise<{ ok: boolean; message?: string }> {
  const log = POINT_LOGS.find(l => l.id === p.logId);
  if (!log) return delay({ ok: false, message: '记录不存在' }, 200);
  if (!log.isAppealable) return delay({ ok: false, message: '该记录不可申诉' }, 200);
  log.appealStatus = 'pending';
  return delay({ ok: true }, 500);
}
