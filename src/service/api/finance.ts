import { realUserRequest } from '@/service/request';
import { toPageTotal } from './page';

export function fetchFinanceProducts() {
  return realUserRequest.get<Api.RealFinance.FinanceProductVO[]>('/finance/products/list');
}

export function fetchFinanceProductDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceProductVO>('/finance/products/detail', { params: { id }, signal: options.signal });
}

export function subscribeFinance(params: Api.RealFinance.FinanceSubscribeParams) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceSubscribeParams>('/finance/orders/subscribe', params);
}

export function redeemFinance(params: Api.RealFinance.FinanceRedeemParams) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceRedeemParams>('/finance/orders/redeem', params);
}

export function fetchFinanceOverview() {
  return realUserRequest.get<Api.RealFinance.FinanceOverviewVO>('/finance/orders/overview');
}

export function fetchFinanceOrderDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceOrderVO>('/finance/orders/detail', { params: { id }, signal: options.signal });
}

export async function fetchFinanceOrders(params: Api.RealFinance.FinanceOrderPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realUserRequest.post<Api.RealFinance.PageResult<Api.RealFinance.FinanceOrderVO>, Api.RealFinance.FinanceOrderPageQuery>('/finance/orders/page', params, options);
  return { records: page.records || [], total: toPageTotal(page.total), current: page.current || page.pageNo || params.pageNo || 1, size: page.size || page.pageSize || params.pageSize || 20 };
}
