declare namespace Api.RealOrder {
  type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'REFUND_REVIEW' | 'REFUNDED' | 'COMPLETED' | 'CANCELED';

  interface OrderDTO {
    orderId: string;
    orderNo?: string;
    orderType?: string;
    status?: OrderStatus;
    statusText?: string;
    customerId?: string;
    sellerId?: string;
    productId?: string;
    productTitle?: string;
    productImage?: string;
    originalAmount?: string | number;
    totalAmount?: string | number;
    quantity?: number;
    unitPrice?: string | number;
    remark?: string;
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
