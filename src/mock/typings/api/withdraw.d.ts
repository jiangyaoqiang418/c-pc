/**
 * 提现管理类型（R-DATA-37 / R-MOD-28）。
 */
declare namespace Api.Withdraw {
  /** 提现状态 5 态硬枚举（R-DATA-37） */
  type RequestStatus = 'pending' | 'auditing' | 'approved' | 'paid' | 'rejected';

  /** 驳回原因 6 类 */
  type RejectReason = 'kyc_invalid' | 'aml_block' | 'balance_insufficient' | 'frozen' | 'manual_review' | 'other';

  type Chain = 'TRON' | 'ETH' | 'BSC';

  interface RequestRecord {
    id: number;
    code: string;
    userId: number;
    userName: string;
    isBuyer: boolean;
    requestAmount: string;
    toAddress: string;
    chain: Chain;
    feeGas: string;
    feeService: string;
    feeTotal: string;
    feeFromBalance: string;
    feeFromAmount: string;
    netAmount: string;
    status: RequestStatus;
    requiresAudit: boolean;
    auditReason?: string;
    auditedBy?: string;
    auditedAt?: string;
    auditNote?: string;
    rejectReason?: RejectReason;
    paidBy?: string;
    paidAt?: string;
    chainWalletId?: number;
    chainTxHash?: string;
    txnId?: number;
    createdAt: string;
  }

  interface FeeConfig {
    chain: Chain;
    gasFlat: string;
    serviceRate: string;
    minWithdraw: string;
    maxWithdraw: string;
    requiresAuditAmount: string;
    updatedAt: string;
  }

  interface Stats {
    pending: number;
    auditing: number;
    approvedToday: number;
    paidToday: number;
    rejectedToday: number;
    totalPaidAll: string;
    totalFeeAll: string;
    blacklistAuditCount: number;
  }

  interface ListQuery {
    current?: number;
    size?: number;
    statuses?: RequestStatus[];
    userId?: number;
    chain?: Chain;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface DetailQuery {
    requestId: number;
  }
  interface CreateParams {
    userId: number;
    amount: string;
    toAddress: string;
    chain: Chain;
  }
  interface AuditParams {
    requestId: number;
    decision: 'approve' | 'reject';
    rejectReason?: RejectReason;
    note: string;
  }
  interface PayParams {
    requestId: number;
    chainWalletId: number;
    note?: string;
  }
  interface FeeSaveParams {
    chain: Chain;
    gasFlat: string;
    serviceRate: string;
    minWithdraw: string;
    maxWithdraw: string;
    requiresAuditAmount: string;
  }
}
