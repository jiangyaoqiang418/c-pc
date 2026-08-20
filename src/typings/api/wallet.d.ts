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

  type RechargeStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | string;
  type WithdrawStatus = 'REVIEWING' | 'APPROVED' | 'SUCCESS' | 'REJECTED' | string;

  interface RechargeCreateParams {
    chain: string;
    amount: number;
  }

  interface RechargeChainVO {
    chain: string;
    label: string;
    decimals: number;
    depositAddress?: string;
    minAmount?: string | number;
    enabled: boolean;
  }

  interface RechargeAddressVO {
    chain: string;
    address: string;
    tokenContract?: string;
    decimals?: number;
    memo?: string;
    minAmount?: string | number;
    minConfirmations?: number;
  }

  interface RechargePageQuery {
    pageNo?: number;
    pageSize?: number;
    status?: RechargeStatus;
  }

  interface RechargeVO {
    id: string | number;
    chain: string;
    amount: string | number;
    depositAddress?: string;
    memo?: string;
    txHash?: string;
    status?: RechargeStatus;
    statusText?: string;
    confirmedAt?: string | number;
    createdAt?: string | number;
  }

  interface WithdrawCreateParams {
    chain: 'ETH' | 'TRON' | 'BSC';
    toAddress: string;
    amount: number;
  }

  interface WithdrawPageQuery {
    pageNo?: number;
    pageSize?: number;
    status?: WithdrawStatus;
  }

  interface WithdrawVO {
    id: string | number;
    chain: string;
    toAddress: string;
    amount: string | number;
    fee?: string | number;
    actualAmount?: string | number;
    txHash?: string;
    status?: WithdrawStatus;
    statusText?: string;
    reviewComment?: string;
    failReason?: string;
    paidAt?: string | number;
    confirmedAt?: string | number;
    createdAt?: string | number;
  }

  interface PageResult<T> {
    current?: number;
    size?: number;
    total: number;
    records: T[];
    pageNo?: number;
    pageSize?: number;
  }
}
