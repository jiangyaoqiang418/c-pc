import { realOrderRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';

function normalizePage<T>(page: Api.RealRefund.PageResult<T>) {
  return { ...page, records: requireArray<T>(page.records, '售后分页记录'), total: toPageTotal(page.total) };
}

export function createRefund(params: Api.RealRefund.RefundApplyParams, options: { showError?: boolean } = {}) {
  return realOrderRequest.post<string | number, Api.RealRefund.RefundApplyParams>('/orders/refunds/create', params, options);
}

export async function fetchMyRefunds(params: Api.RealRefund.RefundPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealRefund.PageResult<Api.RealRefund.RefundDTO>, Api.RealRefund.RefundPageQuery>(
    '/orders/refunds/bought/page',
    params,
    options
  );
  return normalizePage(page);
}

/**
 * 买手仅可查看卖出商品的售后申请；审核与退款资金处理均由平台后台完成。
 */
export async function fetchSoldRefunds(params: Api.RealRefund.RefundPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealRefund.PageResult<Api.RealRefund.RefundDTO>, Api.RealRefund.RefundPageQuery>(
    '/orders/refunds/sold/page',
    params,
    options
  );
  return normalizePage(page);
}

export function fetchRefundDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealRefund.RefundDTO>('/orders/refunds/detail', { params: { id }, signal: options.signal });
}

export function cancelRefund(refundId: string | number) {
  return realOrderRequest.post<string | number, { refundId: string | number }>('/orders/refunds/cancel', { refundId });
}
