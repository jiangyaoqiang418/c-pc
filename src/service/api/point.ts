import { realAdminRequest, realUserRequest } from '@/service/request';
import { toPageTotal } from './page';

const behaviorMap: Partial<Record<string, Api.Point.BehaviorCode>> = {
  CONSUME: 'CONSUME',
  DEPOSIT_IN: 'DEPOSIT_IN',
  RECHARGE: 'RECHARGE',
  WITHDRAW: 'WITHDRAW',
  FINANCE_HOLD: 'FINANCE_HOLD',
  ORDER_DONE: 'ORDER_DONE',
  KYC_PASS: 'KYC_PASS',
  REVIEW_GOOD: 'REVIEW_GOOD',
  REVIEW_BAD: 'REVIEW_BAD',
  DEPOSIT_PLEDGE: 'DEPOSIT_PLEDGE',
  BUYER_NO_FULFILL: 'BUYER_NO_FULFILL'
};

function toBehavior(code?: string): Api.Point.BehaviorCode {
  return behaviorMap[code || ''] || 'CONSUME';
}

function toAudience(identity?: string): Api.Point.Audience {
  const value = identity?.toLowerCase();
  if (value === 'buyer') return 'buyer';
  if (value === 'customer') return 'customer';
  return 'all';
}

function toPointRule(rule: Api.RealPoint.PointRuleVO): Api.Point.Rule {
  return {
    code: toBehavior(rule.behaviorCode),
    label: rule.name,
    audience: toAudience(rule.identity),
    description: rule.description || '',
    unitLabel: rule.unit || '次',
    pointsPerUnit: Number(rule.score || 0),
    enabled: rule.enabled !== false,
    capDaily: Number(rule.dailyCap || 0),
    capTotal: Number(rule.cumulativeCap || 0)
  };
}

function toPointLog(item: Api.RealPoint.PointLedgerDTO): Api.RealPoint.Ledger {
  return {
    id: item.id,
    userId: item.userId,
    userName: item.userNickname || '',
    behavior: toBehavior(item.behaviorCode),
    change: Number(item.score || 0),
    balanceAfter: Number(item.balanceAfter || 0),
    refId: item.bizNo,
    isAppealable: !!item.appealable,
    appealStatus: item.appealStatus?.toLowerCase() as Api.RealPoint.Ledger['appealStatus'],
    createdAt: item.createdAt
  };
}

export async function fetchPointRules() {
  const list = await realAdminRequest.get<Api.RealPoint.PointRuleVO[]>('/point-rules/list', {
    showError: false,
    skipAuthRedirect: true
  });
  return list.map(toPointRule).sort((a, b) => a.code.localeCompare(b.code));
}

export async function fetchMyPointLogs(q: {
  current?: number;
  size?: number;
  userId: number | string;
  behaviors?: Api.Point.BehaviorCode[];
  fromAt?: string;
  toAt?: string;
}) {
  const behaviorCode = q.behaviors?.length === 1 ? q.behaviors[0] : undefined;
  const result = await realUserRequest.post<Api.Common.PaginatingQueryRecord<Api.RealPoint.PointLedgerDTO>>(
    '/points/ledger/page',
    {
      pageNo: q.current || 1,
      pageSize: q.size || 20,
      userId: q.userId,
      behaviorCode
    }
  );
  let records = result.records.map(toPointLog);
  if (q.behaviors?.length && !behaviorCode) {
    records = records.filter(item => q.behaviors?.includes(item.behavior));
  }
  if (q.fromAt) records = records.filter(item => item.createdAt >= q.fromAt!);
  if (q.toAt) records = records.filter(item => item.createdAt <= q.toAt!);
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

export async function fetchMyPointAppeals(q: Api.RealPoint.PointAppealPageQuery) {
  const result = await realUserRequest.post<Api.Common.PaginatingQueryRecord<Api.RealPoint.PointAppealDTO>>(
    '/points/appeals/page',
    q
  );
  const page = result as Api.Common.PaginatingQueryRecord<Api.RealPoint.PointAppealDTO> & {
    pageNo?: number;
    pageSize?: number;
  };
  return {
    current: result.current || page.pageNo || q.pageNo || 1,
    size: result.size || page.pageSize || q.pageSize || 20,
    total: toPageTotal(result.total),
    records: result.records
  };
}
