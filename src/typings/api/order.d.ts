declare namespace Api.RealOrder {
  type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'REFUND_REVIEW' | 'REFUNDED' | 'COMPLETED' | 'CANCELED';

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
    shopperId?: Api.RealSession.Id;
    customerId?: Api.RealSession.Id;
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
    logisticsCompany: string;
    logisticsCompanyCode?: string;
    trackingNo: string;
    shipVouchers?: string[];
    remark?: string;
  }

  interface OrderPriceChangeParams {
    id: string | number;
    amount: number;
  }
}
