/**
 * 1-15 物流管理类型（R-DATA-31）。
 *
 * 设计原则：
 *   - 不重复定义承运商枚举，直接复用 `Api.Order.ShippingCarrier`（R-MOD-20 单一真实源边界）
 *   - 物流模块自有数据仅 CarrierRecord + ApiCallLog
 *   - 在途监控 / 报表均为 ORDERS + LOGISTICS_EVENTS_BY_ORDER 派生视图，不持久化
 */
declare namespace Api.Logistics {
  /** 承运商分类（用于报表分组） */
  type CarrierCategory = 'international' | 'consolidator';

  /** 承运商健康度状态 */
  type CarrierHealthStatus = 'healthy' | 'degraded' | 'down';

  /** API 端点（mock 仅 3 类：查轨迹 / 建运单 / 取消） */
  type ApiEndpoint = 'track' | 'create' | 'cancel';

  /** API 调用结果分类 */
  type ApiCallStatus = 'success' | 'client_error' | 'server_error' | 'timeout';

  /** 监控异常 flag 筛选键 */
  type MonitorFlag = 'all' | 'customsHold' | 'delayed' | 'critical' | 'normal';

  /** 承运商健康度（runtime stub） */
  interface CarrierHealth {
    status: CarrierHealthStatus;
    successRate24h: string; // '98.50'（百分比保留 2 位）
    avgResponseMs: number;
    lastCallAt: string;
    totalCalls24h: number;
    failedCalls24h: number;
  }

  /** 承运商主记录 */
  interface CarrierRecord {
    code: Api.Order.ShippingCarrier;
    name: string;
    category: CarrierCategory;
    enabled: boolean;
    isDefault: boolean;

    apiEndpoint: string;
    accountName: string;
    appKey: string; // 列表展示 masked
    appSecret: string; // 列表展示 masked
    contactPhone?: string;
    contactEmail?: string;

    health: CarrierHealth;

    /** 该承运商当前进行中订单数（IN_TRANSIT + AFTERSALE_CONFIRM）— 列表 API 派生 */
    activeOrderCount?: number;

    createdAt: string;
    updatedAt: string;
  }

  /** API 调用日志条目 */
  interface ApiCallLog {
    id: number;
    carrier: Api.Order.ShippingCarrier;
    endpoint: ApiEndpoint;
    method: 'GET' | 'POST';
    statusCode: number; // 200 / 400 / 500 / 0(timeout)
    callStatus: ApiCallStatus;
    latencyMs: number;
    orderId?: number;
    orderCode?: string;
    requestPayload?: string;
    responseBody?: string;
    errorMsg?: string;
    calledAt: string;
  }

  /** 异常 flag 集合（前端 computed） */
  interface MonitorFlags {
    customsHold: boolean;
    delayed: boolean;
    critical: boolean;
    overseasCustoms: boolean;
  }

  /** 在途监控行（ORDERS 派生 + 最新事件） */
  interface MonitorRow {
    orderId: number;
    orderCode: string;
    productTitle: string;
    customerName: string;
    shopperName: string;
    carrier: Api.Order.ShippingCarrier;
    trackingNumber: string;
    shippedAt: string;
    estimatedArrival?: string;
    latestEventTime: string;
    latestEventDesc: string;
    latestEventType: 'normal' | 'warning' | 'critical';
    eventCount: number;
    flags: MonitorFlags;
  }

  /** 监控详情（行 + 全量事件流 + 异常处置建议） */
  interface MonitorDetail {
    row: MonitorRow;
    events: Api.Order.LogisticsEvent[];
    /** 异常处置建议（mock 文案） */
    interventionTips: string[];
  }

  /** 顶部统计带 */
  interface LogisticsStats {
    inTransitTotal: number;
    customsHold: number;
    delayed: number;
    critical: number;
    carriersOnline: number;
    carriersTotal: number;
    avgDeliveryDays: string;
    successRate24h: string;
    avgResponseMs: number;
  }

  /** 报表行（按承运商） */
  interface CarrierKpiRow {
    carrier: Api.Order.ShippingCarrier;
    shipmentTotal: number;
    inTransit: number;
    completed: number;
    avgDeliveryDays: string;
    customsHoldRate: string;
    abnormalRate: string;
    apiSuccessRate: string;
    avgLatencyMs: number;
  }

  // ============================================================================
  // 请求参数
  // ============================================================================

  interface CarrierListQuery {
    enabled?: boolean;
    category?: CarrierCategory;
    keyword?: string;
  }

  interface CarrierSaveParams {
    code: Api.Order.ShippingCarrier;
    name?: string;
    apiEndpoint: string;
    accountName: string;
    appKey?: string;
    appSecret?: string;
    contactPhone?: string;
    contactEmail?: string;
  }

  interface CarrierToggleParams {
    code: Api.Order.ShippingCarrier;
    enabled: boolean;
    confirmDefaultSwitch?: boolean;
    confirmActiveOrders?: boolean;
  }

  interface SetDefaultCarrierParams {
    code: Api.Order.ShippingCarrier;
  }

  interface MonitorListQuery {
    current?: number;
    size?: number;
    carriers?: Api.Order.ShippingCarrier[];
    flag?: MonitorFlag;
    keyword?: string;
  }

  interface MonitorDetailQuery {
    orderId: number;
  }

  interface ApiLogListQuery {
    current?: number;
    size?: number;
    carriers?: Api.Order.ShippingCarrier[];
    endpoints?: ApiEndpoint[];
    callStatuses?: ApiCallStatus[];
    orderId?: number;
    fromAt?: string;
    toAt?: string;
  }
}
