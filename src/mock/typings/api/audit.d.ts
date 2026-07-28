/**
 * 1-13 审核管理模块类型（R-DATA-29 / R-MOD-18）。
 *
 * 审核中心同时承担两种角色（R-MOD-18）：
 *   - 聚合视图：PRODUCT_CREATE / CATEGORY_CREATE 派生自 product / category 模块本地审核
 *   - 原生审核：FUND_TRANSFER / DEPOSIT_WITHDRAW / ORDER_AFTERSALE 由 audit 模块原生实现
 *
 * 所有审核记录写入 mock/data/audit-records.ts；含 relatedOrderId / relatedGroupId 字段
 * 供"快速打开三方群"（R-MOD-19 IM 深链）。
 */
declare namespace Api.Audit {
  /** R-DATA-29 V2.2：审核类型 5 类硬枚举 */
  type AuditType = 'PRODUCT_CREATE' | 'CATEGORY_CREATE' | 'FUND_TRANSFER' | 'DEPOSIT_WITHDRAW' | 'ORDER_AFTERSALE';

  type AuditStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
  type AuditPriority = 'low' | 'normal' | 'high' | 'urgent';
  type AuditEventAction =
    | 'submit'
    | 'assign'
    | 'approve'
    | 'reject'
    | 'note'
    | 'escalate'
    | 'force-execute'
    | 'advance';

  interface AuditEvent {
    id: number;
    action: AuditEventAction;
    actor: string;
    actorId?: number;
    time: string;
    note?: string;
  }

  /** FUND_TRANSFER 专属 payload */
  interface FundTransferPayload {
    orderId: number;
    orderCode: string;
    customerId: number;
    customerName: string;
    shopperId: number;
    shopperName: string;
    transferAmount: string;
    feeAmount: string;
    netAmount: string;
    splitAvailable?: string;
    splitDeposit?: string;
  }

  /** DEPOSIT_WITHDRAW 专属 payload */
  interface DepositWithdrawPayload {
    shopperId: number;
    shopperName: string;
    requestedAmount: string;
    safeAmount: string;
    affectedProductIds: number[];
    affectedOrderIds: number[];
    systemCheckResult: string;
    workflowStep: 'system_check' | 'manual_review' | 'manager_approval' | 'completed';
  }

  /** ORDER_AFTERSALE 专属 payload */
  interface OrderAftersalePayload {
    aftersaleCaseId: number;
    aftersaleCode: string;
    caseType: Api.Order.AftersaleCaseType;
    appeal: string;
    shopperResponse?: 'agreed' | 'rejected';
    shopperResponseNote?: string;
    evidenceUrls: string[];
  }

  /** PRODUCT_CREATE / CATEGORY_CREATE 仅引用 target，不带 payload */

  type AuditPayload = FundTransferPayload | DepositWithdrawPayload | OrderAftersalePayload;

  /** 审核记录（统一聚合视图） */
  interface AuditRecord {
    id: number;
    code: string; // 'AUD-2026-XXXXX'
    type: AuditType;
    title: string;
    summary: string;

    status: AuditStatus;
    priority: AuditPriority;
    slaHours: number;

    submittedBy: string;
    submittedById?: number;
    submittedAt: string;

    // 关联实体
    targetId?: number;
    targetCode?: string;
    relatedOrderId?: number;
    relatedOrderCode?: string;
    relatedGroupId?: number;

    // 处理方
    assignedTo?: string;
    assignedToId?: number;
    auditedBy?: string;
    auditedById?: number;
    auditedAt?: string;
    decision?: 'approved' | 'rejected';
    decisionNote?: string;

    payload?: AuditPayload;
    history: AuditEvent[];
  }

  /** 概览 */
  interface AuditStats {
    pendingMine: number;
    pendingAll: number;
    processedTodayMine: number;
    byType: Record<AuditType, number>;
    overdueSla: number;
  }

  // ===== 请求参数 =====
  interface ListQuery {
    current?: number;
    size?: number;
    types?: AuditType[];
    statuses?: AuditStatus[];
    priorities?: AuditPriority[];
    onlyMine?: boolean;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface ApproveParams {
    auditId: number;
    note: string;
    /** FUND_TRANSFER 可修改 split 比例 */
    payloadOverride?: Partial<FundTransferPayload>;
  }

  interface RejectParams {
    auditId: number;
    note: string;
  }

  interface AssignParams {
    auditId: number;
    assignedToId: number;
  }

  interface EscalateParams {
    auditId: number;
    note: string;
  }

  interface DepositWithdrawAdvanceParams {
    auditId: number;
    note: string;
  }
}
