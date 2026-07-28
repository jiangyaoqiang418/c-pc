/**
 * 1-17 理财产品管理类型（R-DATA-32 / R-DATA-33）。
 *
 * 设计原则：
 *   - 复用 Api.User.VipLevel（不重定义 VIP 等级）
 *   - 利率快照在订阅时锁定到 LockupOrder.rate，已锁仓订单不受产品后续改动影响
 *   - 利息流水视图直接 filter Wallet TXNS（R-MOD-23 / R-MOD-9 边界）
 */
declare namespace Api.FinanceProduct {
  /** 产品状态机 4 态硬枚举（R-DATA-32） */
  type ProductStatus = 'draft' | 'active' | 'paused' | 'archived';

  /** 锁仓订单状态机 4 态硬枚举（R-DATA-33） */
  type LockupStatus = 'active' | 'matured' | 'early_unlocked' | 'cancelled';

  /** 受众 */
  type Audience = 'all' | 'customer' | 'buyer';

  /** 利率快照（订阅时刻冻结） */
  interface RateSnapshot {
    baseRate: string; // '4.50' 百分比，2 位精度字符串
    vipBonusRate: string; // '0.10' 来自 vip-config.customerBenefits.interestRateBonus
    effectiveRate: string; // '4.60' = base + bonus
    vipLevelAtLock: Api.User.VipLevel;
  }

  /** 理财产品（管理员配置） */
  interface ProductRecord {
    id: number;
    code: string; // 'FIN-30D-001'
    name: string;
    status: ProductStatus;

    lockupDays: number;
    baseRate: string; // 年化基础利率

    minAmount: string;
    maxAmount?: string;
    perUserMaxOrders?: number;

    audience: Audience;
    description?: string;

    // 运营统计（runtime 派生，list API 附带 — R-MOD-23 不持久化）
    activeOrders?: number;
    totalPrincipal?: string;
    totalInterestPaid?: string;

    createdAt: string;
    updatedAt: string;
  }

  /** 锁仓订单 */
  interface LockupOrder {
    id: number;
    code: string; // 'FIN-2026-00001'

    // 产品快照
    productId: number;
    productCode: string;
    productName: string;
    lockupDays: number;

    // 用户快照
    userId: number;
    userName: string;
    isBuyer: boolean;

    // 金额
    principalAmount: string;
    rate: RateSnapshot;

    // 状态机
    status: LockupStatus;
    startAt: string;
    maturityAt: string;
    unlockedAt?: string;

    // 计息（runtime 累计）
    accruedInterest: string;
    expectedInterest: string;
    forfeitedInterest?: string; // early_unlocked / cancelled 时标记
    pointsAccrued: number;

    // 关联流水
    lockTxnId?: number;
    unlockTxnId?: number;

    // 异常
    cancelledReason?: string;
    cancelledBy?: 'admin' | 'system';

    // runtime 派生（detail API 附带）
    daysElapsed?: number;
    daysRemaining?: number;
  }

  /** 顶部统计 */
  interface FinanceStats {
    activeProducts: number;
    pausedProducts: number;
    archivedProducts: number;
    activeOrders: number;
    maturedToday: number;
    maturingIn7Days: number;
    totalPrincipalLocked: string;
    totalInterestPaid24h: string;
    totalInterestPaidAll: string;
    avgEffectiveRate: string;
  }

  /** 产品 KPI 行（总览用） */
  interface ProductKpiRow {
    productId: number;
    productCode: string;
    productName: string;
    status: ProductStatus;
    activeOrders: number;
    totalPrincipal: string;
    totalInterestPaid: string;
    lockupDays: number;
    baseRate: string;
  }

  /** VIP 加成预览（编辑产品时附带 — 派生自 vip-config） */
  interface VipBonusPreview {
    level: Api.User.VipLevel;
    bonusRate: string;
    effectiveRate: string;
  }

  /** 订单详情（含派生数据 + 关联利息流水） */
  interface LockupOrderDetail {
    order: LockupOrder;
    /** 关联 INTEREST_ACCRUE 流水 */
    interestTxns: Api.Wallet.Txn[];
    /** 当前用户钱包概要 */
    accountSnapshot?: {
      available: string;
      lockedFinance: string;
      nonWithdrawable: string;
      interestAccrued: string;
    };
  }

  // ============================================================================
  // 请求参数
  // ============================================================================

  interface ProductListQuery {
    status?: ProductStatus;
    audience?: Audience;
    keyword?: string;
  }

  interface ProductSaveParams {
    id?: number;
    name: string;
    lockupDays: number;
    baseRate: string;
    minAmount: string;
    maxAmount?: string;
    perUserMaxOrders?: number;
    audience: Audience;
    description?: string;
    status: ProductStatus;
  }

  interface ProductToggleStatusParams {
    productId: number;
    status: ProductStatus;
  }

  interface LockupOrderListQuery {
    current?: number;
    size?: number;
    statuses?: LockupStatus[];
    userId?: number;
    productId?: number;
    productCode?: string;
    vipLevels?: Api.User.VipLevel[];
    audience?: Audience; // all / customer (isBuyer=false) / buyer (isBuyer=true)
    fromAt?: string;
    toAt?: string;
    keyword?: string;
  }

  interface LockupOrderDetailQuery {
    orderId: number;
  }

  interface SubscribeParams {
    productId: number;
    userId: number;
    principalAmount: string;
  }

  interface EarlyUnlockParams {
    orderId: number;
    reason: string; // ≥ 5 字
  }

  interface MatureParams {
    orderId: number;
  }

  interface CancelLockupParams {
    orderId: number;
    reason: string; // ≥ 10 字
  }

  interface SettleInterestParams {
    /** 可选 — 单订单结算；不填则全平台 */
    orderId?: number;
  }

  interface SettleInterestResult {
    settledOrders: number;
    totalInterestPaid: string;
    totalPointsAccrued: number;
  }

  interface InterestLogListQuery {
    current?: number;
    size?: number;
    userId?: number;
    productCode?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface InterestLogRow {
    txnId: number;
    userId: number;
    userName: string;
    amount: string;
    /** runtime 派生：从 refId 反查 order */
    orderId?: number;
    orderCode?: string;
    productCode?: string;
    productName?: string;
    calledAt: string;
  }
}
