import { realUserRequest } from '@/service/request';
import { requireArray } from './page';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { confirmFinanceRedemption, financialSubmissionIssue, submitFinancialOperation } from '@/utils/financial-submission';

/** 只归一化天数和计数；金额、年率及业务 ID 保留请求层原值。 */
function financeStatistic<T extends number | undefined>(value: T, label: string, minimum = 0, optional = false): T {
  if (value === undefined && optional) return value;
  if (value === null || (typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') throw new Error(`${label}格式异常，请重新读取`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${label}格式异常，请重新读取`);
  return parsed as T;
}

function toFinanceProduct(product: Api.RealFinance.FinanceProductVO): Api.RealFinance.FinanceProductVO {
  return { ...product, lockDays: financeStatistic(product.lockDays, '锁仓期限', 1) };
}

function toFinanceOrder(order: Api.RealFinance.FinanceOrderVO): Api.RealFinance.FinanceOrderVO {
  return {
    ...order,
    lockDays: financeStatistic(order.lockDays, '锁仓期限', 1),
    heldDays: financeStatistic(order.heldDays, '已持有天数', 0, true),
    remainingDays: financeStatistic(order.remainingDays, '剩余天数', 0, true)
  };
}

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

export async function fetchFinanceProducts(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const list = await realUserRequest.get<Api.RealFinance.FinanceProductVO[]>('/finance/products/list', { ...options, preserveDecimals: true });
  return requireArray<Api.RealFinance.FinanceProductVO>(list, '理财产品').map(toFinanceProduct);
}

export function fetchFinanceProductDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceProductVO>('/finance/products/detail', { params: { id }, ...options, preserveDecimals: true }).then(toFinanceProduct);
}

export function subscribeFinance(params: Api.RealFinance.FinanceSubscribeParams, options: { showError?: boolean } = {}) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceSubscribeParams>('/finance/orders/subscribe', params, options);
}

export async function fetchFinanceOrderByKey(idempotencyKey: string) {
  const result = await realUserRequest.get<Api.RealFinance.FinanceOrderVO | null>('/finance/orders/by-key', { params: { idempotencyKey }, showError: false, preserveDecimals: true });
  if (result !== null && (!result || typeof result !== 'object')) throw new Error('申购原单回查响应不完整');
  return result;
}

export function redeemFinance(params: Api.RealFinance.FinanceRedeemParams) {
  return realUserRequest.post<string | number, Api.RealFinance.FinanceRedeemParams>('/finance/orders/redeem', params, { showError: false });
}

export async function redeemFinanceWithReadback(userId: string | number, id: string | number, payPassword: string) {
  const action = `finance-redeem:${id}` as const;
  if (!financialSubmissionIssue(userId, action)) {
    try {
      return await submitFinancialOperation(userId, action, () => redeemFinance({ id, payPassword }), result => String(result) === String(id) ? result : undefined);
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

export function fetchFinanceOverview(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceOverviewVO>('/finance/orders/overview', { ...options, preserveDecimals: true })
    .then(overview => ({ ...overview, holdingCount: financeStatistic(overview.holdingCount, '持仓数量') }));
}

export function fetchFinanceOrderDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealFinance.FinanceOrderVO>('/finance/orders/detail', { params: { id }, ...options, preserveDecimals: true }).then(toFinanceOrder);
}

export async function fetchFinanceOrders(params: Api.RealFinance.FinanceOrderPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realUserRequest.postQuery<Api.RealFinance.PageResult<Api.RealFinance.FinanceOrderVO>, Api.RealFinance.FinanceOrderPageQuery>('/finance/orders/page', params, { ...options, preserveDecimals: true });
  return {
    records: requireArray<Api.RealFinance.FinanceOrderVO>(page.records, '理财订单分页记录').map(toFinanceOrder),
    total: financeStatistic(page.total, '分页总数'),
    current: financeStatistic(page.current ?? page.pageNo ?? params.pageNo ?? 1, '当前页码', 1),
    size: financeStatistic(page.size ?? page.pageSize ?? params.pageSize ?? 20, '分页大小', 1)
  };
}
