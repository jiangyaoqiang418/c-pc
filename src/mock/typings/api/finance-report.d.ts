/**
 * 财务报表类型（R-MOD-30）。
 *
 * 模块零自有数据池；所有报表 runtime 派生 from TXNS / ACCOUNTS / CHAIN_WALLETS / ORDERS / FINANCE_LOCKUP_ORDERS。
 */
declare namespace Api.FinanceReport {
  type Granularity = 'day' | 'week' | 'month';

  interface CompositionReport {
    totalAssets: string;
    breakdown: {
      available: string;
      nonWithdrawable: string;
      lockedFinance: string;
      frozenOrder: string;
      frozenRisk: string;
      depositAvailable: string;
      depositGuaranteed: string;
    };
    interestAccruedAll: string;
    interestRatioPct: string;
    chainOnChain: string;
    chainSystemDiff: string;
  }

  interface ChainReconRow {
    chainWalletId: number;
    name: string;
    address: string;
    chain: 'TRON' | 'ETH' | 'BSC';
    purpose: 'income' | 'outcome' | 'reserve';
    balanceOnChain: string;
    balanceSystem: string;
    diff: string;
    lastSyncAt: string;
    risk: 'normal' | 'warning' | 'frozen';
  }

  interface CommissionRow {
    period: string;
    orderCount: number;
    totalGmv: string;
    commissionTotal: string;
    avgCommissionRate: string;
  }

  interface DepositDailyRow {
    date: string;
    pledgeAdded: string;
    released: string;
    forfeited: string;
    netChange: string;
    endingDepositTotal: string;
  }

  interface InterestReport {
    totalPaidAll: string;
    avgRatePct: string;
    byProduct: { productCode: string; productName: string; paidAmount: string; orderCount: number }[];
    topUsers: { userId: number; userName: string; receivedAmount: string }[];
  }

  interface CommissionQuery {
    fromAt?: string;
    toAt?: string;
    granularity?: Granularity;
  }

  interface DepositDailyQuery {
    fromAt?: string;
    toAt?: string;
  }

  interface ExportQuery {
    type: 'composition' | 'chain-recon' | 'commission' | 'deposit-daily' | 'interest';
    fromAt?: string;
    toAt?: string;
  }
}
