/**
 * 出入金 / 汇率类型（R-DATA-38 / R-MOD-29）。
 */
declare namespace Api.Fund {
  type ChannelKind = 'okx' | 'sub_wallet' | 'direct_transfer';

  /** 入金记录 5 态硬枚举（R-DATA-38） */
  type DepositStatus = 'pending_aml' | 'aml_blocked' | 'pending_credit' | 'credited' | 'reversed';

  type Chain = 'TRON' | 'ETH' | 'BSC';

  interface DepositRecord {
    id: number;
    code: string;
    userId: number;
    userName: string;
    channel: ChannelKind;
    fromAddress: string;
    toChainWalletId: number;
    toChainWalletName: string;
    chain: Chain;
    amount: string;
    chainTxHash: string;
    status: DepositStatus;
    amlSnapshot?: Api.Blacklist.AmlCheckResult;
    creditedAt?: string;
    creditTxnId?: number;
    reversedReason?: string;
    reversedBy?: string;
    callbackAt: string;
    createdAt: string;
  }

  type RateQuote = 'CNY' | 'USD' | 'JPY' | 'EUR';
  type RateSource = 'OKX' | 'Binance' | 'manual';

  interface RateRecord {
    id: number;
    base: 'USDT';
    quote: RateQuote;
    rate: string;
    source: RateSource;
    fetchedAt: string;
    enabled: boolean;
  }

  interface Stats {
    pendingAml: number;
    amlBlockedToday: number;
    creditedToday: number;
    totalDepositInAll: string;
    okxDepositSharePct: string;
    avgCreditMinutes: string;
  }

  interface DepositListQuery {
    current?: number;
    size?: number;
    channels?: ChannelKind[];
    statuses?: DepositStatus[];
    userId?: number;
    chain?: Chain;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }
  interface DepositDetailQuery {
    depositId: number;
  }
  interface ReviewAmlParams {
    depositId: number;
    decision: 'credit' | 'reverse';
    note: string;
  }
  interface RateSaveParams {
    id?: number;
    quote: RateQuote;
    rate: string;
    source: RateSource;
    enabled: boolean;
  }
  interface RateToggleParams {
    rateId: number;
    enabled: boolean;
  }
  interface CallbackOkxParams {
    userId: number;
    fromAddress: string;
    chainWalletId: number;
    chain: Chain;
    amount: string;
    chainTxHash: string;
  }
}
