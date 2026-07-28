/**
 * 1-5 求购大厅类型（R-DATA-34 / R-MOD-25）。
 *
 * 设计原则：
 *   - 求购任务接单后自动建 ORDER（R-MOD-25 联动）
 *   - 推送按 VIP 等级 VIP2 → VIP1 → VIP0 分批，每 10 分钟一档（mock 用「手动推下一批」按钮代替 cron）
 *   - 复用 categories / products / users 池，不重定义
 */
declare namespace Api.PurchaseRequest {
  /** 求购任务状态机 5 态硬枚举（R-DATA-34） */
  type RequestStatus =
    | 'pending_audit' // 待审核
    | 'rejected' // 审核驳回
    | 'pushing' // 推送中
    | 'claimed' // 已被买手接单
    | 'cancelled'; // 已取消

  /** 推送批次等级 */
  type PushBatchLevel = 'VIP2' | 'VIP1' | 'VIP0';

  /** 求购任务 */
  interface PurchaseRequest {
    id: number;
    code: string; // 'PUR-2026-XXXXX'
    customerId: number;
    customerName: string;

    productTitle: string;
    productDescription: string;
    categoryId: number;
    categoryPath: string;

    budgetAmount: string;
    expectedDays: number;
    overseasCustoms: boolean;
    aftersaleType: 'none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty';

    evidenceUrls?: string[];
    appeal: string;

    status: RequestStatus;

    // 审核
    auditedBy?: string;
    auditedAt?: string;
    auditNote?: string;
    aiAuditScore?: number;

    // 推送
    currentPushLevel?: PushBatchLevel;
    pushedAt?: string;
    nextPushAt?: string;
    pushedToBuyerIds: number[];

    // 接单
    claimedBy?: number;
    claimedByName?: string;
    claimedAt?: string;
    relatedOrderId?: number;
    relatedOrderCode?: string;

    // 取消
    cancelledBy?: 'system' | 'customer' | 'admin';
    cancelledReason?: string;

    createdAt: string;
  }

  /** 推送日志（append-only） */
  interface PushLog {
    id: number;
    requestId: number;
    requestCode: string;
    pushLevel: PushBatchLevel;
    buyerIds: number[];
    pushedAt: string;
    actor: 'system' | 'admin';
  }

  /** 顶部统计 */
  interface PurchaseStats {
    pendingAudit: number;
    pushing: number;
    claimed: number;
    cancelledToday: number;
    avgClaimMinutes: string;
    aiPassRate: string;
  }

  /** 详情 */
  interface RequestDetail {
    request: PurchaseRequest;
    pushLogs: PushLog[];
    /** 推送已覆盖的买手简要信息 */
    pushedBuyers: { id: number; name: string; vipLevel: Api.User.VipLevel; isBuyer: true }[];
  }

  // ============================================================================
  // 请求参数
  // ============================================================================

  interface ListQuery {
    current?: number;
    size?: number;
    statuses?: RequestStatus[];
    categoryId?: number;
    keyword?: string;
  }

  interface DetailQuery {
    requestId: number;
  }

  interface AuditParams {
    requestId: number;
    decision: 'approve' | 'reject';
    note: string; // ≥ 5 字
  }

  interface AssignParams {
    requestId: number;
    buyerId: number;
    reason: string;
  }

  interface CancelParams {
    requestId: number;
    reason: string; // ≥ 10 字
  }

  interface PushNextParams {
    requestId: number;
  }

  interface ClaimParams {
    requestId: number;
    buyerId: number;
  }
}
