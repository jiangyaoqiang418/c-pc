/**
 * 售后仲裁聚合视图类型（R-MOD-26）。
 *
 * 本模块为聚合视图，不持有自有数据池：
 *   - 工单 = AFTERSALE_CASES（复用 R-DATA-28）
 *   - 关联审核 = AUDIT_RECORDS where type=ORDER_AFTERSALE
 *   - 关联订单 = ORDERS
 */
declare namespace Api.Aftersale {
  /** 工单视图行（含派生 daysOpen） */
  interface CaseRow {
    case: Api.Order.AftersaleCase;
    orderStatus: Api.Order.OrderStatus;
    daysOpen: number;
    relatedAuditId?: number;
    relatedAuditStatus?: Api.Audit.AuditStatus;
  }

  /** 详情 — 含订单 + 关联审核 */
  interface CaseDetail {
    case: Api.Order.AftersaleCase;
    order: Api.Order.OrderRecord;
    relatedAudit?: Api.Audit.AuditRecord;
  }

  interface Stats {
    pendingResponse: number;
    arbitrating: number;
    executing: number;
    completedToday: number;
    avgResolveHours: string;
    forceExecutedTotal: number;
  }

  // 请求
  interface ListQuery {
    current?: number;
    size?: number;
    statuses?: Api.Order.AftersaleStatus[];
    caseTypes?: Api.Order.AftersaleCaseType[];
    customerId?: number;
    shopperId?: number;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }
  interface DetailQuery {
    caseId: number;
  }
  interface InterveneParams {
    caseId: number;
    note: string;
  }
  interface ArbitrateParams {
    caseId: number;
    verdict: Api.Order.AftersaleVerdict;
    refundAmount?: string;
    depositDeductAmount?: string;
    note: string;
  }
  interface ForceExecuteParams {
    caseId: number;
    reason: string;
  }
  interface CloseParams {
    caseId: number;
    note: string;
  }
}
