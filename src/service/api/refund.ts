import { realOrderRequest } from '@/service/request';

export function createRefund(params: Api.RealRefund.RefundApplyParams) {
  return realOrderRequest.post<string | number, Api.RealRefund.RefundApplyParams>('/orders/refunds/create', params);
}

export function fetchMyRefunds(params: Api.RealRefund.RefundPageQuery = {}) {
  return realOrderRequest.post<Api.RealRefund.PageResult<Api.RealRefund.RefundDTO>, Api.RealRefund.RefundPageQuery>(
    '/orders/refunds/bought/page',
    params
  );
}

export function fetchRefundDetail(id: string | number) {
  return realOrderRequest.get<Api.RealRefund.RefundDTO>('/orders/refunds/detail', { params: { id } });
}

export function cancelRefund(refundId: string | number) {
  return realOrderRequest.post<string | number, { refundId: string | number }>('/orders/refunds/cancel', { refundId });
}
