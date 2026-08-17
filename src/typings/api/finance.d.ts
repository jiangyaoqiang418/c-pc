declare namespace Api.RealFinance {
  type ProductStatus = 'ON_SALE' | 'OFF_SALE' | 'SOLD_OUT';
  type OrderStatus = 'HOLDING' | 'REDEEMED' | 'SETTLED' | 'CANCELED';

  interface FinanceProductVO {
    id: string | number;
    name: string;
    code: string;
    annualRate: string | number;
    lockDays: number;
    minAmount: string | number;
    maxAmount?: string | number;
    totalQuota?: string | number;
    remainingQuota?: string | number;
    earlyRedeemEnabled: boolean;
    earlyRedeemFeeRate?: string | number;
    status: ProductStatus;
    statusText?: string;
    description?: string;
    sort?: number;
  }

  interface FinanceOrderVO {
    id: string | number;
    productId: string | number;
    productCode?: string;
    productName?: string;
    annualRate: string | number;
    lockDays: number;
    principal: string | number;
    expectedInterest: string | number;
    accruedInterest: string | number;
    settledInterest?: string | number;
    redeemFee?: string | number;
    startAt?: string | number;
    maturityAt?: string | number;
    redeemedAt?: string | number;
    settledAt?: string | number;
    heldDays?: number;
    remainingDays?: number;
    status: OrderStatus;
    statusText?: string;
    earlyRedeemEnabled?: boolean;
    earlyRedeemFeeRate?: string | number;
    canRedeem?: boolean;
    redeemableInterest?: string | number;
    forceRedeemed?: boolean;
    redeemReason?: string;
    createdAt?: string | number;
  }

  interface FinanceOverviewVO {
    holdingPrincipal: string | number;
    totalInterest: string | number;
    pendingInterest: string | number;
    expectedInterest: string | number;
    holdingCount: number;
  }

  interface FinanceSubscribeParams { productId: string | number; amount: string | number; }
  interface FinanceRedeemParams { id: string | number; }
  interface FinanceOrderPageQuery { pageNo?: number; pageSize?: number; status?: OrderStatus; productId?: string | number; }
  interface PageResult<T> { records: T[]; total: number; current?: number; size?: number; pageNo?: number; pageSize?: number; }
}
