import { realUserRequest } from '@/service/request';
import { parseDateValue } from '@/utils/date-range';
import { requireArray } from './page';
import { toIsoDate } from './date';
import { RequestError } from '@/service/request/type';

/** 只读取分值、阈值和分页统计；不用于转换业务 ID。 */
export function readPointNumber(value: unknown, label: string, options: { integer?: boolean; minimum?: number; optional?: boolean } = {}) {
  if ((value === undefined || value === null) && options.optional) return undefined;
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === ''
    || !/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(value).trim())) throw pointDataError(label);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (options.integer && !Number.isSafeInteger(parsed))
    || (options.minimum !== undefined && parsed < options.minimum)) throw pointDataError(label);
  return parsed;
}

export function pointDataError(label: string) {
  return new RequestError(`${label}尚未确认，请重新读取`, { code: 'POINT_DATA_UNCONFIRMED' });
}

function toBehavior(code?: string) {
  return code || '';
}

function toAudience(identity?: string): Api.Point.Audience {
  const value = identity?.toLowerCase();
  if (value === 'buyer') return 'buyer';
  if (value === 'customer') return 'customer';
  if (value === 'common') return 'all';
  throw pointDataError('积分规则适用身份');
}

function toPointRule(rule: Api.RealPoint.PointRuleVO): Api.RealPoint.Rule {
  if (typeof rule.enabled !== 'boolean') throw pointDataError('积分规则启用状态');
  return {
    code: toBehavior(rule.behaviorCode),
    label: rule.name,
    audience: toAudience(rule.identity),
    description: rule.description || '',
    unitLabel: rule.unit || '次',
    pointsPerUnit: readPointNumber(rule.score, '积分规则当前分值')!,
    enabled: rule.enabled,
    capDaily: readPointNumber(rule.dailyCap, '积分规则每日上限', { integer: true, minimum: 0, optional: true }),
    capTotal: readPointNumber(rule.cumulativeCap, '积分规则累计上限', { integer: true, minimum: 0, optional: true }),
    sort: readPointNumber(rule.sort, '积分规则排序', { integer: true, optional: true })
  };
}

function toPointLog(item: Api.RealPoint.PointLedgerDTO): Api.RealPoint.Ledger {
  return {
    id: item.id,
    userId: item.userId,
    userName: item.userNickname || '',
    behavior: toBehavior(item.behaviorCode),
    behaviorName: item.behaviorName,
    change: readPointNumber(item.score, '积分流水分值', { integer: true })!,
    balanceAfter: readPointNumber(item.balanceAfter, '积分流水余额', { integer: true })!,
    refId: item.bizNo,
    isAppealable: !!item.appealable,
    appealStatus: item.appealStatus?.toLowerCase() as Api.RealPoint.Ledger['appealStatus'],
    createdAt: toIsoDate(item.createdAt)
  };
}

export async function fetchPointRules(options: { signal?: AbortSignal } = {}) {
  const list = await realUserRequest.get<Api.RealPoint.PointRuleVO[]>('/points/rules', { ...options, showError: false, skipAuthRedirect: true });
  return requireArray<Api.RealPoint.PointRuleVO>(list, '积分规则')
    .map(toPointRule)
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));
}

export async function fetchMyPointLogs(q: {
  current?: number;
  size?: number;
  userId: number | string;
  behaviors?: Api.Point.BehaviorCode[];
  earned?: boolean;
  fromAt?: string;
  toAt?: string;
}, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const result = await realUserRequest.postQuery<Api.Common.PaginatingQueryRecord<Api.RealPoint.PointLedgerDTO>>(
    '/points/ledger/page',
    {
      pageNo: q.current || 1,
      pageSize: q.size || 20,
      behaviorCodes: q.behaviors?.length ? [...q.behaviors] : undefined,
      earned: q.earned,
      startAt: parseDateValue(q.fromAt),
      endAt: parseDateValue(q.toAt, true)
    }, options
  );
  const records = requireArray<Api.RealPoint.PointLedgerDTO>(result.records, '积分流水').map(toPointLog);
  const page = result as Api.Common.PaginatingQueryRecord<Api.RealPoint.PointLedgerDTO> & {
    pageNo?: number;
    pageSize?: number;
  };
  return {
    current: readPointNumber(result.current ?? page.pageNo ?? q.current ?? 1, '积分流水页码', { integer: true, minimum: 1 })!,
    size: readPointNumber(result.size ?? page.pageSize ?? q.size ?? 20, '积分流水页大小', { integer: true, minimum: 1 })!,
    total: readPointNumber(result.total, '积分流水总数', { integer: true, minimum: 0 })!,
    records
  };
}

export async function appealPointLog(p: { logId: number | string; reason: string }) {
  await realUserRequest.post<string>('/points/appeals/submit', {
    ledgerId: p.logId,
    reason: p.reason
  });
  return { ok: true, message: '' };
}

export async function fetchMyPointAppeals(q: Api.RealPoint.PointAppealPageQuery, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const result = await realUserRequest.postQuery<Api.Common.PaginatingQueryRecord<Api.RealPoint.PointAppealDTO>>(
    '/points/appeals/page',
    q,
    options
  );
  const page = result as Api.Common.PaginatingQueryRecord<Api.RealPoint.PointAppealDTO> & {
    pageNo?: number;
    pageSize?: number;
  };
  return {
    current: readPointNumber(result.current ?? page.pageNo ?? q.pageNo ?? 1, '积分申诉页码', { integer: true, minimum: 1 })!,
    size: readPointNumber(result.size ?? page.pageSize ?? q.pageSize ?? 20, '积分申诉页大小', { integer: true, minimum: 1 })!,
    total: readPointNumber(result.total, '积分申诉总数', { integer: true, minimum: 0 })!,
    records: requireArray<Api.RealPoint.PointAppealDTO>(result.records, '积分申诉分页记录')
  };
}
