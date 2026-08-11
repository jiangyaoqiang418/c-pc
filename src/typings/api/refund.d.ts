declare namespace Api.RealRefund {
  type RefundStatus = 'APPLYING' | 'AGREED' | 'REJECTED' | 'CANCELED' | string;

  interface RefundApplyParams {
    orderId: string | number;
    reason: string;
    evidenceImages?: string[];
  }

  interface RefundPageQuery {
    pageNo?: number;
    pageSize?: number;
    orderNo?: string;
    status?: RefundStatus;
  }

  interface RefundDTO {
    refundId: string | number;
    orderId: string | number;
    orderNo?: string;
    orderStatus?: string;
    buyerId?: string | number;
    buyerName?: string;
    sellerId?: string | number;
    sellerName?: string;
    productTitle?: string;
    productImage?: string;
    refundType?: string;
    refundTypeText?: string;
    amount?: string | number;
    reason?: string;
    evidenceImages?: string[];
    status?: RefundStatus;
    statusText?: string;
    orderStatusBefore?: string;
    reviewRemark?: string;
    reviewerId?: string | number;
    refundBizNo?: string;
    appliedAt?: string | number;
    reviewedAt?: string | number;
    canceledAt?: string | number;
    createdAt?: string | number;
  }

  interface PageResult<T> {
    pageNo?: number;
    pageSize?: number;
    total: number | string;
    records: T[];
  }
}
