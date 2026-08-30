declare namespace Api.RealWallet {
  type Id = string | number;

  /** 真实钱包展示模型，不复用仅支持 number ID 的 Mock 钱包类型。 */
  type BalanceKey = 'available' | 'nonWithdrawable' | 'lockedFinance' | 'frozenOrder' | 'frozenRisk'
    | 'depositAvailable' | 'depositGuaranteed' | 'interestAccrued';
  type Account = Omit<Api.Wallet.InternalAccount, 'userId' | BalanceKey> & Partial<Pick<Api.Wallet.InternalAccount, BalanceKey>> & {
    userId: Id;
  };

  type Ledger = Omit<Api.Wallet.Txn, 'id' | 'userId'> & {
    id: Id;
    userId: Id;
    /** 后端原始业务分类，保留用于详情、筛选审计和问题定位。 */
    bizType?: string;
    bizTypeText?: string;
    bizGroup?: string;
    bizGroupText?: string;
  };

  type DisplayLedger = Api.Wallet.Txn | Ledger;

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
