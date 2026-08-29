declare namespace Api.RealOrder {
  type Id = string | number;

  /** 真实订单展示模型，与仅支持 number ID 的 Mock 订单模型隔离。 */
  type Record = Omit<
    Api.Order.OrderRecord,
    | 'id'
    | 'groupId'
    | 'productId'
    | 'customerId'
    | 'shopperId'
    | 'activeAftersaleId'
    | 'paymentTxnId'
    | 'settleTxnId'
    | 'pledgeTxnId'
    | 'overseasCustoms'
    | 'aftersaleType'
  > & {
    id: Id;
    groupId?: Id;
    productId: Id;
    customerId: Id;
    shopperId: Id;
    activeAftersaleId?: Id;
    paymentTxnId?: Id;
    settleTxnId?: Id;
    pledgeTxnId?: Id;
    overseasCustoms?: boolean;
    aftersaleType?: Api.Order.OrderRecord['aftersaleType'];
    logisticsStatus?: LogisticsStatus;
    logisticsStatusText?: string;
    carrier?: Carrier;
    carrierName?: string;
    eta?: string | number;
    logisticsException?: string;
    purchaseNo?: string;
    purchaseVouchers?: string[];
  };

  type DisplayRecord = Api.Order.OrderRecord | Record;

  type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'REFUND_REVIEW' | 'REFUNDED' | 'COMPLETED' | 'CANCELED';
  type Carrier = 'SF' | 'JD' | 'EMS' | 'YTO' | 'ZTO' | 'STO' | 'YUNDA' | 'JITU' | 'DHL' | 'UPS' | 'FEDEX' | 'USPS' | 'YAMATO' | 'SAGAWA' | 'JAPAN_POST' | 'OTHER';
  type LogisticsStatus = 'PENDING_SHIPMENT' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERING' | 'SIGNED' | 'EXCEPTION' | 'RETURNED';

  interface OrderDTO {
    orderId: string;
    orderNo?: string;
    orderType?: string;
    status?: OrderStatus;
    statusText?: string;
    customerId?: string;
    customerName?: string;
    sellerId?: string;
    sellerName?: string;
    productId?: string;
    productTitle?: string;
    productImage?: string;
    originalAmount?: string | number;
    totalAmount?: string | number;
    shippingFee?: string | number;
    taxAmount?: string | number;
    taxFee?: string | number;
    quantity?: number;
    unitPrice?: string | number;
    remark?: string;
    receiverName?: string;
    receiverPhone?: string;
    receiverAddress?: string;
    shippingAddress?: string;
    receiverCountry?: string;
    receiverProvince?: string;
    receiverCity?: string;
    receiverDistrict?: string;
    receiverDetailAddress?: string;
    country?: string;
    province?: string;
    city?: string;
    district?: string;
    detailAddress?: string;
    postalCode?: string;
    addressId?: string;
    logisticsCompany?: string;
    logisticsCompanyCode?: string;
    trackingNo?: string;
    logisticsNo?: string;
    logisticsStatus?: LogisticsStatus;
    logisticsStatusText?: string;
    carrier?: Carrier;
    carrierName?: string;
    eta?: string | number;
    logisticsException?: string;
    purchaseNo?: string;
    purchaseVouchers?: string[];
    shipVouchers?: string[];
    shippedRemark?: string;
    purchaseVoucherUrl?: string;
    purchaseVoucherUrls?: string[];
    shippingVoucherUrl?: string;
    shippingVoucherUrls?: string[];
    paymentBizNo?: string;
    refundId?: string;
    refundStatus?: string;
    refundAmount?: string | number;
    paidAt?: string | number;
    shippedAt?: string | number;
    completedAt?: string | number;
    createdAt?: string | number;
  }

  interface OrderPageQuery {
    pageNo?: number;
    pageSize?: number;
    status?: OrderStatus;
  }

  interface ListQuery {
    current?: number;
    size?: number;
    statuses?: Api.Order.OrderStatus[];
    shopperId?: Id;
    customerId?: Id;
  }

  interface OrderIdParams {
    id: string | number;
  }

  interface OrderCreateItemParams {
    productId: string | number;
    quantity?: number;
    sessionId?: string | number;
  }

  interface OrderCreateBatchParams {
    addressId: string | number;
    items: OrderCreateItemParams[];
    idempotencyKey?: string;
    remark?: string;
  }

  interface OrderGroupVO {
    orderGroupNo?: string;
    orderIds: Array<string | number>;
    totalAmount?: string | number;
  }

  interface OrderGroupPayParams {
    orderGroupNo: string;
  }

  interface OrderShipParams {
    id: string | number;
    carrier: Carrier;
    carrierName?: string;
    trackingNo: string;
    eta?: string | number;
    purchaseNo?: string;
    purchaseVouchers?: string[];
    shipVouchers?: string[];
    remark?: string;
  }

  interface LogisticsTrackDTO { trackId: string | number; orderId: string | number; trackingNo?: string; occurredAt?: string | number; status: LogisticsStatus; statusText?: string; description: string; location?: string; exceptionNode?: string; source?: string; sourceText?: string; createdAt?: string | number; }
  interface LogisticsDTO { orderId: string | number; orderNo?: string; logisticsStatus?: LogisticsStatus | null; logisticsStatusText?: string | null; carrier?: Carrier | null; carrierName?: string | null; trackingNo?: string | null; eta?: string | number | null; logisticsException?: string | null; purchaseNo?: string | null; purchaseVouchers: string[]; shipVouchers: string[]; shippedRemark?: string | null; shippingFee?: string | number | null; taxFee?: string | number | null; shippedAt?: string | number | null; completedAt?: string | number | null; tracks: LogisticsTrackDTO[]; }
  interface LogisticsTrackParams { orderId: string | number; occurredAt?: string | number; status: LogisticsStatus; description: string; location?: string; exceptionNode?: string; }
  interface LogisticsExceptionParams { orderId: string | number; exception: string; location?: string; }

  interface OrderPriceChangeParams {
    id: string | number;
    amount: number;
  }
}
