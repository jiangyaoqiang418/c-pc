import { realUserRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { confirmFinanceRedemption, financialSubmissionIssue, submitFinancialOperation } from '@/utils/financial-submission';

export function financeSubscriptionIssue(product: Pick<Api.RealFinance.FinanceProductVO, 'status'>) {
  if (product.status === 'ON_SALE') return '';
  if (product.status === 'OFF_SALE') return '产品已下架，暂不可申购';
  if (product.status === 'SOLD_OUT') return '产品已售罄，暂不可申购';
  return '产品状态未确认，暂不可申购';
}

export function financeRedemptionIssue(order: Api.RealFinance.FinanceOrderVO) {
  if (order.status !== 'HOLDING' || order.canRedeem !== true) return '当前锁仓不可提前赎回，请核对最新状态';
  for (const value of [order.redeemFee, order.redeemableInterest]) {
    if (value === undefined || value === null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      return '赎回费用或可到账利息尚未确认，请重新读取后再确认';
    }
  }
  return '';
}

export async function fetchFinanceProducts(options: { signal?: AbortSignal } = {}) {
  const list = await realUserRequest.get<Api.RealFinance.FinanceProductVO[]>('/finance/products/list', options);
  return requireArray<Api.RealFinance.FinanceProductVO>(list, '理财产品');
}

export function fetchFinanceProductDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceProductVO>('/finance/products/detail', { params: { id }, signal: options.signal });
}

export function subscribeFinance(params: Api.RealFinance.FinanceSubscribeParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceSubscribeParams>('/finance/orders/subscribe', params, options);
}

export function redeemFinance(params: Api.RealFinance.FinanceRedeemParams) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceRedeemParams>('/finance/orders/redeem', params, { showError: false });
}

export async function redeemFinanceWithReadback(userId: string | number, id: string | number) {
  const action = `finance-redeem:${id}` as const;
  if (!financialSubmissionIssue(userId, action)) {
    try {
      return await submitFinancialOperation(userId, action, () => redeemFinance({ id }), result => String(result) === String(id) ? result : undefined);
    } catch (error) {
      if (isDefinitiveRejection(error) || (error instanceof RequestError
        && ['LOCAL_STORAGE_UNAVAILABLE', 'SUBMISSION_LOCK_UNAVAILABLE', 'SUBMISSION_IN_PROGRESS'].includes(error.code || ''))) throw error;
    }
  }
  // 原请求可能已经执行：后续确认只按已知锁仓 ID 查询，不再次发送赎回。
  try {
    const detail = await fetchFinanceOrderDetail(id, { showError: false });
    if (confirmFinanceRedemption(userId, id, detail)) return detail.id;
  } catch { /* 保留原待确认标记，页面提供明确的只读核实入口。 */ }
  throw new RequestError('赎回结果待确认。再次确认仅核实原锁仓状态，不会重复提交；仍未确认时请联系平台核实。', { code: 'FINANCIAL_PENDING' });
}

export function fetchFinanceOverview(options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceOverviewVO>('/finance/orders/overview', options);
}

export function fetchFinanceOrderDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceOrderVO>('/finance/orders/detail', { params: { id }, ...options });
}

export async function fetchFinanceOrders(params: Api.RealFinance.FinanceOrderPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realUserRequest.postQuery<Api.RealFinance.PageResult<Api.RealFinance.FinanceOrderVO>, Api.RealFinance.FinanceOrderPageQuery>('/finance/orders/page', params, options);
  return { records: requireArray<Api.RealFinance.FinanceOrderVO>(page.records, '理财订单分页记录'), total: toPageTotal(page.total), current: page.current || page.pageNo || params.pageNo || 1, size: page.size || page.pageSize || params.pageSize || 20 };
}
