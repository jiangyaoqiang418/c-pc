/**
 * 4.14 钱包管理模块类型（R-DATA-15 / R-DATA-16 / R-MOD-9）。
 *
 * 关键概念区分（严禁混淆）：
 * - 链上 U：平台链上钱包中的真实 USDT（持有于 TRC20/ETH/BSC 等地址）；
 * - 站内 U₊：InternalAccount 内的虚拟内部记账，1:1 锚定 U 但不是 U 本身；
 * - DEPOSIT_IN：链上 U → 站内 U₊（入金）；
 * - WITHDRAW_OUT：站内 U₊ → 链上 U（出金）；
 * - 站内交易（INTERNAL_* / FINANCE_* / ORDER_* / DEPOSIT_*）：纯账本搬运，无链交互、无手续费。
 */
declare namespace Api.Wallet {
  /** R-DATA-15 硬枚举：17 类站内流水类型（账本变动事件） */
  type TxnType =
    | 'DEPOSIT_IN'
    | 'WITHDRAW_OUT'
    | 'INTERNAL_PAY'
    | 'INTERNAL_RECEIVE'
    | 'INTERNAL_REFUND'
    | 'INTEREST_ACCRUE'
    | 'FINANCE_LOCK'
    | 'FINANCE_UNLOCK'
    | 'DEPOSIT_PLEDGE'
    | 'DEPOSIT_RELEASE'
    | 'DEPOSIT_FORFEIT'
    | 'ORDER_FREEZE'
    | 'ORDER_SETTLE'
    | 'RISK_FREEZE'
    | 'RISK_UNFREEZE'
    | 'ADJUST_PLUS'
    | 'ADJUST_MINUS'
    | 'FEE_DEDUCT';

  /** 7 个余额桶 */
  type Bucket =
    | 'available'
    | 'nonWithdrawable'
    | 'lockedFinance'
    | 'frozenOrder'
    | 'frozenRisk'
    | 'depositAvailable'
    | 'depositGuaranteed';

  type Chain = 'TRON' | 'ETH' | 'BSC';
  type Purpose = 'income' | 'outcome' | 'reserve';
  type ChainWalletStatus = '1' | '2'; // 启用 / 停用
  type ChainWalletRisk = 'normal' | 'warning' | 'frozen';

  /** 用户站内钱包账户（每用户一个）—— 主真实源（R-MOD-9） */
  interface InternalAccount {
    userId: number;
    userName: string;
    available: string;
    nonWithdrawable: string;
    lockedFinance: string;
    frozenOrder: string;
    frozenRisk: string;
    depositAvailable: string;
    depositGuaranteed: string;
    interestAccrued: string;
    payPwdSet: boolean;
    frozen: boolean;
    address?: string; // 链上钱包地址（占位）
    updatedAt: string;
  }

  /** 流水（append-only） */
  interface Txn {
    id: number;
    userId: number;
    userName: string;
    type: TxnType;
    direction: 'in' | 'out';
    amount: string;
    balanceAfter: string;
    bucketFrom?: Bucket;
    bucketTo?: Bucket;
    fee?: string;
    feeFromBalance?: string;
    feeFromAmount?: string;
    chainWalletId?: number;
    chainTxHash?: string;
    /** 入金来源链上地址（仅 DEPOSIT_IN 推荐填；R-DATA-22 V2.0） */
    fromAddress?: string;
    /** 出金目标链上地址（仅 WITHDRAW_OUT 推荐填；R-DATA-22 V2.0） */
    toAddress?: string;
    refType?: 'order' | 'finance' | 'kyc' | 'manual' | 'risk' | 'blacklist';
    refId?: string;
    operator?: string;
    remark?: string;
    createdAt: string;
  }

  /** 平台链上钱包（custody wallet，持有真实 U） */
  interface ChainWallet {
    id: number;
    name: string;
    address: string;
    chain: Chain;
    purpose: Purpose;
    balanceOnChain: string;
    balanceLastSyncAt: string;
    status: ChainWalletStatus;
    risk: ChainWalletRisk;
    createdAt: string;
    remark?: string;
  }

  /** 平台聚合概览 */
  interface PlatformOverview {
    internalTotal: string;
    chainTotal: string;
    diff: string;
    internalBreakdown: Record<Bucket | 'interestAccrued', string>;
    userCount: number;
    activeWalletCount: number;
    frozenAccountCount: number;
    todayDepositIn: string;
    todayWithdrawOut: string;
    todayInternalVolume: string;
    chainWallets: ChainWallet[];
  }

  // ===== 请求参数 =====
  interface AccountListQuery {
    current?: number;
    size?: number;
    keyword?: string;
    minBalance?: string;
    maxBalance?: string;
    frozen?: 'all' | 'frozen' | 'normal';
    payPwdSet?: 'all' | 'set' | 'unset';
  }

  interface TxnListQuery {
    current?: number;
    size?: number;
    userId?: number;
    keyword?: string;
    types?: TxnType[];
    direction?: 'all' | 'in' | 'out';
    fromAt?: string;
    toAt?: string;
    minAmount?: string;
    maxAmount?: string;
  }

  interface AdjustParams {
    userId: number;
    direction: 'in' | 'out';
    bucket: 'available' | 'nonWithdrawable' | 'frozenRisk' | 'depositAvailable';
    amount: string;
    reason: string;
  }

  interface FreezeParams {
    userId: number;
    amount?: string;
    reason: string;
  }

  interface UnfreezeParams {
    userId: number;
    amount?: string;
    reason: string;
  }

  interface ResetPayPwdParams {
    userId: number;
    reason: string;
  }

  interface ChainWalletSaveParams {
    id?: number;
    name: string;
    address: string;
    chain: Chain;
    purpose: Purpose;
    status: ChainWalletStatus;
    remark?: string;
  }
}
