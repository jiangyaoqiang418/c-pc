declare namespace Api.RealWallet {
  interface WalletBucketVO {
    type: string;
    name?: string;
    description?: string;
    amount: string | number;
    ratio?: string | number;
  }

  interface WalletVO {
    total: string | number;
    currency?: string;
    todayIn?: string | number;
    todayOut?: string | number;
    distribution?: WalletBucketVO[];
  }

  interface WalletLedgerDTO {
    id: string;
    userId: string;
    bizType: string;
    bizTypeText?: string;
    bizGroup?: string;
    bizGroupText?: string;
    fromType?: string;
    toType?: string;
    amount: string | number;
    fromBalanceAfter?: string | number;
    toBalanceAfter?: string | number;
    remark?: string;
    createdAt?: string | number;
  }

  interface WalletLedgerPageQuery {
    pageNo?: number;
    pageSize?: number;
    bizGroup?: string;
    bizType?: string;
  }
}
