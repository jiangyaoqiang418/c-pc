declare namespace Api.RealRefund {
  type RefundStatus = 'CONFIRMING' | 'APPLYING' | 'AGREED' | 'REJECTED' | 'CANCELED' | string;
  type RefundType = 'REFUND_ONLY' | 'RETURN_REFUND' | 'COMPENSATION' | 'EXCHANGE';
  type RefundAction = 'SELECT' | 'RETURN_SHIP' | 'RETURN_RECEIVE' | 'EXCHANGE_SHIP' | 'EXCHANGE_RECEIVE';

  interface RefundOperateParams {
    refundId: string | number;
    action: RefundAction;
    refundType?: RefundType;
    compensationAmount?: string;
    compensationSource?: 'WALLET' | 'DEPOSIT';
    payPassword?: string;
    trackingNo?: string;
    carrierCode?: string;
    carrierName?: string;
    remark?: string;
  }

  interface RefundConfirmParams {
    refundId: string | number;
    agree: boolean;
    remark: string;
  }

  interface RefundApplyParams {
    orderId: string | number;
    refundType?: RefundType;
    reason: string;
    evidenceImages?: string[];
    idempotencyKey?: string;
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
    preferredType?: RefundType;
    compensationAmount?: string;
    compensationSource?: 'WALLET' | 'DEPOSIT';
    returnTrackingNo?: string;
    returnCarrierCode?: string;
    returnCarrierName?: string;
    exchangeTrackingNo?: string;
    exchangeCarrierCode?: string;
    exchangeCarrierName?: string;
    processRemark?: string;
    paymentError?: string;
    nextPaymentAt?: string;
    completedAt?: string;
    amount?: string | number;
    reason?: string;
    evidenceImages?: string[];
    status?: RefundStatus;
    statusText?: string;
    orderStatusBefore?: string;
    reviewRemark?: string;
    sellerAgree?: boolean | null;
    sellerRemark?: string | null;
    sellerConfirmedAt?: string | number | null;
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
