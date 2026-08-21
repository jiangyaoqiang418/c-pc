declare namespace Api.RealBuyer {
  type DepositLedger = Api.RealWallet.Ledger;
  type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

  interface BuyerApplyParams {
    realName: string;
    contact: string;
    reason: string;
  }

  interface BuyerApplicationVO {
    id: string | number;
    userId: string | number;
    realName: string;
    contact: string;
    reason: string;
    status: ApplicationStatus;
    reviewRemark?: string;
    reviewerId?: string | number;
    appliedAt?: string | number;
    reviewedAt?: string | number;
  }

  type DepositBizType = 'PAY' | 'REFUND' | 'DEDUCT' | 'FREEZE' | 'UNFREEZE' | string;

  interface DepositLedgerDTO {
    id: string | number;
    buyerId: string | number;
    userId: string | number;
    bizType: DepositBizType;
    amount: string | number;
    balanceAfter: string | number;
    bizNo?: string;
    remark?: string;
    createdAt?: string | number;
  }

  interface DepositLedgerPageQuery {
    pageNo?: number;
    pageSize?: number;
    buyerId?: string | number;
    userId?: string | number;
    bizType?: DepositBizType;
  }

  interface DepositOperationParams {
    amount: number;
    idempotencyKey: string;
  }

  interface DepositPageResult {
    pageNo?: number;
    pageSize?: number;
    current?: number;
    size?: number;
    total: number;
    records: DepositLedgerDTO[];
  }
}
