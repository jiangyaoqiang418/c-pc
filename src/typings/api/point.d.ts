declare namespace Api.RealPoint {
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
    score: number;
    dailyCap?: number;
    cumulativeCap?: number;
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
}
