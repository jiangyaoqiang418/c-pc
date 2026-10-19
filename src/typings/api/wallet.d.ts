declare namespace Api.RealWallet {
  type Id = string | number;
  type Asset = 'USDT' | 'USDC';
  type Chain = 'ETH' | 'TRON' | 'BSC';

  /** 真实钱包展示模型，不复用仅支持 number ID 的 Mock 钱包类型。 */
  type BalanceKey = 'available' | 'nonWithdrawable' | 'lockedFinance' | 'frozenOrder' | 'frozenRisk'
    | 'depositAvailable' | 'depositGuaranteed' | 'interestAccrued';
  type Account = Omit<Api.Wallet.InternalAccount, 'userId' | BalanceKey> & Partial<Pick<Api.Wallet.InternalAccount, BalanceKey>> & {
    userId: Id;
  };

  type Ledger = Omit<Api.Wallet.Txn, 'id' | 'userId'> & {
    id: Id;
    userId: Id;
    currency?: Asset;
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
    amount: string | number | null;
    ratio?: string | number | null;
    key?: BalanceKey;
  }

  interface WalletVO {
    total: string | number | null;
    currency?: string;
    todayIn?: string | number | null;
    todayOut?: string | number | null;
    distribution?: WalletBucketVO[];
  }

  interface WalletLedgerDTO {
    currency?: string;
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
    currency?: Asset;
    pageNo?: number;
    pageSize?: number;
    bizGroup?: string;
    bizType?: string;
    balanceType?: string;
    keyword?: string;
    startAt?: number;
    endAt?: number;
  }

  type RechargeStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | string;
  type RechargeMethod = 'ADDRESS' | 'DECLARATION' | 'WALLET';
  type WithdrawStatus = 'REVIEWING' | 'APPROVED' | 'SUCCESS' | 'REJECTED' | string;

  interface RechargeCreateParams {
    asset?: Asset;
    idempotencyKey?: string;
    chain: string;
    amount: string | number;
  }

  interface RechargeChainVO {
    chain: string;
    label: string;
    decimals: number;
    depositAddress?: string;
    minAmount?: string | number | null;
    enabled: boolean;
  }

  interface RechargeAssetVO extends RechargeChainVO {
    asset: 'USDT' | 'USDC';
    tokenContract?: string | null;
    minConfirmations?: number | null;
    walletNetwork?: string | null;
    memoRule?: string | null;
    methods: RechargeMethod[];
  }

  interface RechargeAddressVO {
    asset?: string;
    chain: string;
    chainLabel?: string;
    address: string;
    tokenContract?: string;
    decimals?: number;
    memo?: string | null;
    minAmount?: string | number | null;
    minConfirmations?: number | null;
  }

  interface RechargePageQuery {
    asset?: Asset;
    chain?: string;
    pageNo?: number;
    pageSize?: number;
    status?: RechargeStatus;
  }

  interface RechargeVO {
    id: string | number;
    asset?: string;
    bizType?: string;
    bizTypeText?: string;
    chain: string;
    chainLabel?: string;
    amount: string | number;
    depositAddress?: string;
    memo?: string;
    txHash?: string;
    source?: RechargeMethod | null;
    reportedTxHash?: string | null;
    logIndex?: number | null;
    tokenContract?: string | null;
    confirmations?: number | null;
    minConfirmations?: number | null;
    status?: RechargeStatus;
    statusText?: string;
    confirmedAt?: string | number;
    createdAt?: string | number;
  }

  interface WithdrawCreateParams {
    asset?: Asset;
    idempotencyKey?: string;
    chain: 'ETH' | 'TRON' | 'BSC';
    toAddress: string;
    payPassword: string;
    amount: string | number;
  }

  interface WithdrawChainVO {
    asset: Asset;
    chain: Chain;
    label: string;
    decimals: number;
    enabled: boolean;
    minAmount?: string | number | null;
    maxAmount?: string | number | null;
    estimatedNetworkFee?: string | number | null;
  }

  interface WithdrawFeePreviewParams {
    chain: Chain;
    tokenSymbol: Asset;
    toAddress: string;
    amount: string | number;
  }

  interface WithdrawFeePreviewVO {
    chain: Chain;
    tokenSymbol: Asset;
    platformId: string;
    fromAddress: string;
    estimatedNetworkFee: string | number | null;
    networkFeeSymbol: 'ETH' | 'BNB' | 'TRX';
    feeLimitAtomic: string | null;
    expiresAt: string | number;
    isEstimate: boolean;
  }

  interface WithdrawPageQuery {
    asset?: Asset;
    pageNo?: number;
    pageSize?: number;
    status?: WithdrawStatus;
  }

  interface WithdrawVO {
    id: string | number;
    asset?: string;
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
    total: string | number;
    records: T[];
    pageNo?: number;
    pageSize?: number;
  }
}
