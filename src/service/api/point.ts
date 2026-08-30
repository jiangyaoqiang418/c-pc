import { realUserRequest } from '@/service/request';
import { isWithinDateRange } from '@/utils/date-range';
import { requireArray, toPageTotal } from './page';
import { toIsoDate } from './date';
import { toFiniteNumber } from './number';

function toBehavior(code?: string) {
  return code || '';
}

function toAudience(identity?: string): Api.Point.Audience {
  const value = identity?.toLowerCase();
  if (value === 'buyer') return 'buyer';
  if (value === 'customer') return 'customer';
  return 'all';
}

function toPointRule(rule: Api.RealPoint.PointRuleVO): Api.RealPoint.Rule {
  return {
    code: toBehavior(rule.behaviorCode),
    label: rule.name,
    audience: toAudience(rule.identity),
    description: rule.description || '',
    unitLabel: rule.unit || '次',
    pointsPerUnit: toFiniteNumber(rule.score ?? rule.defaultScore ?? 0),
    enabled: rule.enabled ?? rule.defaultEnabled ?? true,
    capDaily: toFiniteNumber(rule.dailyCap ?? rule.defaultDailyCap ?? 0),
    capTotal: toFiniteNumber(rule.cumulativeCap ?? rule.defaultCumulativeCap ?? 0),
    sort: rule.sort
  };
}

function toPointLog(item: Api.RealPoint.PointLedgerDTO): Api.RealPoint.Ledger {
  return {
    id: item.id,
    userId: item.userId,
    userName: item.userNickname || '',
    behavior: toBehavior(item.behaviorCode),
    behaviorName: item.behaviorName,
    change: toFiniteNumber(item.score || 0),
    balanceAfter: toFiniteNumber(item.balanceAfter || 0),
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
  fromAt?: string;
  toAt?: string;
}, options: { signal?: AbortSignal } = {}) {
  const behaviorCode = q.behaviors?.length === 1 ? q.behaviors[0] : undefined;
  const result = await realUserRequest.postQuery<Api.Common.PaginatingQueryRecord<Api.RealPoint.PointLedgerDTO>>(
    '/points/ledger/page',
    {
      pageNo: q.current || 1,
      pageSize: q.size || 20,
      userId: q.userId,
      behaviorCode
    }, options
  );
  let records = requireArray<Api.RealPoint.PointLedgerDTO>(result.records, '积分流水').map(toPointLog);
  if (q.behaviors?.length && !behaviorCode) {
    const selected = new Set<string>(q.behaviors);
    records = records.filter(item => selected.has(item.behavior));
  }
  if (q.fromAt || q.toAt) records = records.filter(item => isWithinDateRange(item.createdAt, q.fromAt, q.toAt));
  const page = result as Api.Common.PaginatingQueryRecord<Api.RealPoint.PointLedgerDTO> & {
    pageNo?: number;
    pageSize?: number;
  };
  return {
    current: result.current || page.pageNo || q.current || 1,
    size: result.size || page.pageSize || q.size || 20,
    total: toPageTotal(result.total),
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

export async function fetchMyPointAppeals(q: Api.RealPoint.PointAppealPageQuery, options: { signal?: AbortSignal } = {}) {
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
    current: result.current || page.pageNo || q.pageNo || 1,
    size: result.size || page.pageSize || q.pageSize || 20,
    total: toPageTotal(result.total),
    records: requireArray<Api.RealPoint.PointAppealDTO>(result.records, '积分申诉分页记录')
  };
}
