declare namespace Api.RealPoint {
  type Ledger = Omit<Api.Point.LogEntry, 'id' | 'userId'> & {
    id: string | number;
    userId: string | number;
  };

  interface VipBenefitItemVO {
    code: string;
    name: string;
    unit?: string;
    value?: string | number;
  }

  interface VipRoleInfoVO {
    role: string;
    roleText?: string;
    level: string;
    threshold?: string | number;
    nextLevel?: string;
    nextThreshold?: string | number;
    benefits?: VipBenefitItemVO[];
  }

  interface UserPointVO {
    userId: string;
    points: string | number;
    customer?: VipRoleInfoVO;
    buyer?: VipRoleInfoVO;
  }

  interface PointRuleVO {
    behaviorCode: string;
    name: string;
    identity?: string;
    identityText?: string;
    unit?: string;
    description?: string;
    score: string | number;
    dailyCap?: string | number;
    cumulativeCap?: string | number;
    defaultScore?: string | number;
    defaultDailyCap?: string | number;
    defaultCumulativeCap?: string | number;
    defaultEnabled?: boolean;
    enabled?: boolean;
    appealable?: boolean;
    sort?: number;
  }

  interface PointLedgerPageQuery {
    pageNo?: number;
    pageSize?: number;
    userId?: string | number;
    behaviorCode?: string;
  }

  interface PointLedgerDTO {
    id: string;
    userId: string;
    userNickname?: string;
    behaviorCode: string;
    behaviorName?: string;
    quantity?: number;
    score: number;
    balanceAfter: number;
    bizNo?: string;
    remark?: string;
    appealable?: boolean;
    appealStatus?: string;
    reversed?: boolean;
    createdAt: string;
  }

  type PointAppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

  interface PointAppealPageQuery {
    pageNo?: number;
    pageSize?: number;
    keyword?: string;
    status?: PointAppealStatus;
    userId?: string;
  }

  interface PointAppealDTO {
    id: string;
    ledgerId: string;
    userId: string;
    userNickname?: string;
    behaviorCode?: string;
    behaviorName?: string;
    originalScore?: number;
    reason: string;
    status: PointAppealStatus;
    decision?: string;
    reviewComment?: string;
    reviewerId?: string;
    createdAt: string;
    reviewedAt?: string;
  }
}
