/**
 * 4.4 积分模块 API 类型（R-DATA-10：行为代码与适用身份写死，分值/上限/启用可配）。
 */
declare namespace Api {
  namespace Point {
    /** 11 个行为代码 —— 代码层写死，UI 不可增删 */
    type BehaviorCode =
      | 'CONSUME'
      | 'DEPOSIT_IN'
      | 'RECHARGE'
      | 'WITHDRAW'
      | 'FINANCE_HOLD'
      | 'ORDER_DONE'
      | 'KYC_PASS'
      | 'REVIEW_GOOD'
      | 'REVIEW_BAD'
      | 'DEPOSIT_PLEDGE'
      | 'BUYER_NO_FULFILL';

    type Audience = 'all' | 'customer' | 'buyer';

    interface Rule {
      code: BehaviorCode;
      label: string;
      audience: Audience;
      description: string;
      unitLabel: string;
      pointsPerUnit: number;
      enabled: boolean;
      capDaily: number;
      capTotal: number;
    }

    interface LogEntry {
      id: number;
      userId: number;
      userName: string;
      behavior: BehaviorCode;
      change: number;
      balanceAfter: number;
      refType?: string;
      refId?: string;
      isAppealable: boolean;
      appealStatus?: 'none' | 'pending' | 'approved' | 'rejected';
      createdAt: string;
    }

    type LogSearchParams = Partial<{
      userId: number;
      keyword: string; // userName / userId / refId
      behaviors: BehaviorCode[];
      fromAt: string;
      toAt: string;
      onlyAppealable: '' | 'true' | 'false';
    }> &
      Api.Common.CommonSearchParams;

    type LogList = Api.Common.PaginatingQueryRecord<LogEntry>;

    interface Appeal {
      id: number;
      logId: number;
      userId: number;
      userName: string;
      behavior: BehaviorCode;
      originChange: number;
      reason: string;
      status: 'pending' | 'approved' | 'rejected';
      auditOpinion?: string;
      submitAt: string;
      auditAt?: string;
      auditor?: string;
    }

    type AppealSearchParams = Partial<{
      keyword: string;
      statuses: Appeal['status'][];
    }> &
      Api.Common.CommonSearchParams;

    type AppealList = Api.Common.PaginatingQueryRecord<Appeal>;

    interface AppealCreateParams {
      logId: number;
      reason: string;
    }

    interface AppealAuditParams {
      id: number;
      decision: 'approve' | 'reject';
      opinion: string;
    }

    interface AdjustParams {
      userId: number;
      delta: number;
      reason: string;
    }
  }
}
