/**
 * 1-7 订单管理模块类型（R-DATA-27 / R-DATA-28 / R-MOD-16 / R-MOD-17）。
 *
 * 9 态状态机：PENDING_PAYMENT → PROCURING ↔ PROCURED → IN_TRANSIT → AFTERSALE_CONFIRM
 * → COMPLETED → WARRANTY → ARCHIVED；售后中 IN_AFTERSALE 由 COMPLETED 派生；异常终止 CANCELLED。
 *
 * 单一真实源：mock/data/orders.ts 的 ORDERS 池（R-MOD-16）；
 * IM 三方群 OrderGroup.orderId 字段指向 Order.code。
 *
 * 订单状态变更 → 钱包流水 + 积分流水 + IM 三方群消息 单向触发联动（R-MOD-17）。
 */
declare namespace Api.Order {
  /** R-DATA-27 V2.2：订单状态硬枚举 9 类（实际 10 = 9 主流 + CANCELLED 异常终止） */
  type OrderStatus =
    | 'PENDING_PAYMENT'
    | 'PROCURING'
    | 'PROCURED'
    | 'IN_TRANSIT'
    | 'AFTERSALE_CONFIRM'
    | 'COMPLETED'
    | 'WARRANTY'
    | 'IN_AFTERSALE'
    | 'ARCHIVED'
    | 'CANCELLED';

  /** R-DATA-28 V2.2：售后类型 5 类 + 仲裁判定 4 类 */
  type AftersaleCaseType = 'REFUND' | 'REPLACE' | 'REPAIR' | 'PARTIAL_REFUND' | 'REFUND_ONLY';
  type AftersaleStatus =
    | 'pending'
    | 'shopper_agreed'
    | 'shopper_rejected'
    | 'arbitrating'
    | 'executing'
    | 'completed'
    | 'cancelled';
  type AftersaleVerdict = 'shopper_fault' | 'customer_fault' | 'both_fault' | 'force_majeure';

  type PriceField = 'price' | 'shippingFee' | 'tax';
  type CancelledBy = 'system' | 'customer' | 'shopper' | 'platform';
  type ShippingCarrier = 'SF_INTL' | 'FEDEX' | 'DHL' | '4PX' | 'EMS';

  /** 改价审计记录（append-only） */
  interface PriceChangeLog {
    id: number;
    orderId: number;
    field: PriceField;
    before: string;
    after: string;
    reason: string;
    operator: string;
    operatorId?: number;
    changedAt: string;
    /** 关联三方群 price-change 消息 id（IM R-DATA-24） */
    groupMessageId?: number;
  }

  /** 售后工单事件（append-only） */
  interface AftersaleEvent {
    id: number;
    action: 'create' | 'shopper_respond' | 'platform_intervene' | 'arbitrate' | 'execute' | 'force_execute' | 'close';
    actor: string;
    actorId?: number;
    time: string;
    note?: string;
  }

  /** 售后工单 */
  interface AftersaleCase {
    id: number;
    code: string; // 'AS-2026-XXXXX'
    orderId: number;
    orderCode: string;
    customerId: number;
    customerName: string;
    shopperId: number;
    shopperName: string;
    caseType: AftersaleCaseType;
    appeal: string;
    evidenceUrls: string[];
    status: AftersaleStatus;
    shopperResponse?: 'agreed' | 'rejected';
    shopperResponseNote?: string;
    arbitrator?: string;
    verdict?: AftersaleVerdict;
    verdictNote?: string;
    refundAmount?: string;
    depositDeductAmount?: string;
    createdAt: string;
    closedAt?: string;
    history: AftersaleEvent[];
  }

  /** 物流轨迹事件 */
  interface LogisticsEvent {
    time: string;
    location: string;
    description: string;
    type: 'normal' | 'warning' | 'critical';
    imageUrl?: string;
  }

  /** 订单主记录 */
  interface OrderRecord {
    id: number;
    code: string; // 'ORD-2026-07XXX'
    groupId?: number; // → im-groups.ts OrderGroup.id

    // 关联实体
    productId: number;
    productTitle: string;
    productCover?: string;
    customerId: number;
    customerName: string;
    shopperId: number;
    shopperName: string;

    // 金额
    price: string;
    shippingFee: string;
    tax: string;
    totalAmount: string;
    paidAmount?: string;

    // 状态
    status: OrderStatus;

    // 地址 / 物流
    shippingAddress: string;
    receiverName: string;
    receiverPhone: string;
    overseasCustoms: boolean;
    purchaseScreenshotUrl?: string;
    shippingScreenshotUrl?: string;
    trackingNumber?: string;
    shippingCarrier?: ShippingCarrier;
    estimatedArrival?: string;

    // 售后配置
    aftersaleType: 'none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty';
    aftersaleDays?: number;
    warrantyEndAt?: string;
    depositFrozenAmount?: string;

    // 收货
    deliveredAt?: string;
    autoConfirmAt?: string;
    receiptVideoUrl?: string;

    // 关联记录
    activeAftersaleId?: number;
    paymentTxnId?: number;
    settleTxnId?: number;
    pledgeTxnId?: number;

    // 改价历史
    priceHistory: PriceChangeLog[];

    // 异常
    cancelledReason?: string;
    cancelledBy?: CancelledBy;

    // 时间戳
    createdAt: string;
    paidAt?: string;
    procuredAt?: string;
    shippedAt?: string;
    archivedAt?: string;
  }

  /** 平台概览 */
  interface OrderStats {
    totalOrders: number;
    pendingPayment: number;
    awaitingShipment: number; // PROCURING + PROCURED
    inTransit: number;
    inAftersale: number;
    completedToday: number;
    archivedAll: number;
    totalGmvToday: string;
    overTimeWarning: number;
  }

  // ===== 请求参数 =====
  interface ListQuery {
    current?: number;
    size?: number;
    keyword?: string;
    statuses?: OrderStatus[];
    productId?: number;
    customerId?: number;
    shopperId?: number;
    aftersaleTypes?: ('none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty')[];
    overseasCustoms?: boolean;
    minAmount?: string;
    maxAmount?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface PriceChangeParams {
    orderId: number;
    field: PriceField;
    after: string;
    reason: string;
  }

  interface CancelParams {
    orderId: number;
    reason: string;
    cancelledBy: 'customer' | 'shopper' | 'platform';
  }

  interface ConfirmAddressParams {
    orderId: number;
    shippingAddress: string;
    receiverName: string;
    receiverPhone: string;
  }

  interface PayParams {
    orderId: number;
  }

  interface UploadPurchaseParams {
    orderId: number;
    screenshotUrl: string;
    note?: string;
  }

  interface UploadShippingParams {
    orderId: number;
    trackingNumber: string;
    shippingCarrier: ShippingCarrier;
    screenshotUrl: string;
  }

  interface ConfirmReceiptParams {
    orderId: number;
    receiptVideoUrl?: string;
  }

  interface AftersaleConfirmParams {
    orderId: number;
    note?: string;
  }

  interface CompleteParams {
    orderId: number;
  }

  interface CreateAftersaleParams {
    orderId: number;
    caseType: AftersaleCaseType;
    appeal: string;
    evidenceUrls?: string[];
  }

  interface ShopperRespondParams {
    aftersaleId: number;
    response: 'agreed' | 'rejected';
    note: string;
  }

  interface ArbitrateParams {
    aftersaleId: number;
    verdict: AftersaleVerdict;
    note: string;
    refundAmount?: string;
    depositDeductAmount?: string;
  }

  interface LogisticsQuery {
    orderId: number;
  }

  interface LogisticsResult {
    orderId: number;
    trackingNumber: string;
    shippingCarrier: ShippingCarrier;
    events: LogisticsEvent[];
    estimatedArrival?: string;
  }

  interface PriceHistoryResult {
    orderId: number;
    records: PriceChangeLog[];
  }
}
