import { realOrderRequest } from '@/service/request';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { reverseStatusMap, toOrderRecord } from './order-mapper';
import { fetchMergeSourcePages, requireArray, resolvePageSize, toPageTotal } from './page';
import { submitOrderConfirmation, withOrderSubmissionLocks } from '@/utils/financial-submission';
import { getAccessToken } from '@/service/request/token';
import { getOrderCapabilities } from '@/utils/order';

export async function fetchMyOrders(q: Api.RealOrder.ListQuery & { signal?: AbortSignal }) {
  const current = Math.max(1, Math.floor(q.current || 1));
  const size = Math.max(1, Math.floor(q.size || 10));
  const statuses = [...new Set(q.statuses?.map(s => reverseStatusMap[s]).filter(Boolean) as Api.RealOrder.OrderStatus[] || [])];
  if (q.statuses?.length && !statuses.length) {
    return { current, size, total: 0, records: [] as Api.RealOrder.Record[] };
  }
  const requestedStatuses = new Set(q.statuses || []);
  const url = q.shopperId ? '/orders/sold/page' : '/orders/bought/page';
  const requestPage = (status?: Api.RealOrder.OrderStatus, pageNo = current, pageSize = size) => realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
    Api.RealOrder.OrderPageQuery
    >(url, {
      pageNo,
      pageSize,
      status
    }, { signal: q.signal, preserveDecimals: true });
  let pages: Array<Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number }>;
  let total = 0;
  if (statuses.length > 1) {
    const result = await fetchMergeSourcePages({ sources: statuses, current, size,
      request: requestPage, recordId: record => record.orderId, signal: q.signal });
    pages = result.pages;
    total = result.total;
  } else {
    pages = [await requestPage(statuses[0])];
    total = toPageTotal(pages[0].total);
  }
  const recordsById = new Map<string, Api.RealOrder.Record>();
  pages.forEach(page => {
    requireArray<Api.RealOrder.OrderDTO>(page.records, '订单分页记录').map(toOrderRecord).forEach(record => {
      if (!q.statuses?.length || requestedStatuses.has(record.status)) recordsById.set(String(record.id), record);
    });
  });
  const offset = statuses.length > 1 ? (current - 1) * size : 0;
  const records = [...recordsById.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + size);

  return {
    current,
    size: statuses.length > 1 ? size : resolvePageSize(pages[0], size),
    total,
    records
  };
}

async function countOrdersByStatus(
  url: '/orders/bought/page' | '/orders/sold/page',
  options: { showError?: boolean; signal?: AbortSignal } = {}
) {
  const counts = Object.fromEntries(
    Object.keys(reverseStatusMap).map(status => [status, 0])
  ) as Record<Api.Order.OrderStatus, number>;
  const primaryStatusMap: Array<[Api.Order.OrderStatus, Api.RealOrder.OrderStatus]> = [
    ['PENDING_PAYMENT', 'CREATED'],
    ['PROCURING', 'PAID'],
    ['IN_TRANSIT', 'SHIPPED'],
    ['IN_AFTERSALE', 'REFUND_REVIEW'],
    ['REFUNDED', 'REFUNDED'],
    ['COMPLETED', 'COMPLETED'],
    ['CANCELLED', 'CANCELED']
  ];
  const entries = await Promise.all(
    primaryStatusMap.map(async ([frontStatus, realStatus]) => {
      const page = await realOrderRequest.postQuery<
        Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
        Api.RealOrder.OrderPageQuery
      >(url, { pageNo: 1, pageSize: 1, status: realStatus }, { showError: options.showError, signal: options.signal });
      return [frontStatus, toPageTotal(page.total)] as const;
    })
  );
  entries.forEach(([status, count]) => {
    counts[status] = count;
  });
  return counts;
}

export function countMyOrdersByStatus(options?: { showError?: boolean; signal?: AbortSignal }) {
  return countOrdersByStatus('/orders/bought/page', options);
}

export function countMySoldOrdersByStatus(options?: { showError?: boolean; signal?: AbortSignal }) {
  return countOrdersByStatus('/orders/sold/page', options);
}

export async function fetchOrderDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  const dto = await realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id }, signal: options.signal, preserveDecimals: true });
  return toOrderRecord(dto);
}

export function createOrders(
  params: Api.RealOrder.OrderCreateBatchParams,
  options: { showError?: boolean } = {}
) {
  return realOrderRequest.post<Api.RealOrder.OrderGroupVO, Api.RealOrder.OrderCreateBatchParams>(
    '/orders/create-batch',
    params,
    { ...options, preserveDecimals: true }
  );
}

async function submitOrderPayment(id: string | number, confirmedAmount: string, payPassword: string, options: { showError?: boolean } = {}) {
  const receipt = await realOrderRequest.post<string | number, Api.RealOrder.OrderPayParams>('/orders/pay', { id, confirmedAmount, payPassword }, options);
  if (!((typeof receipt === 'string' && receipt.trim()) || (typeof receipt === 'number' && Number.isSafeInteger(receipt)))) throw new Error('付款回执缺失，请核对原订单状态');
  return { ok: true, message: '' };
}

function submitOrderGroupPayment(orderGroupNo: string, confirmedAmount: string, payPassword: string, options: { showError?: boolean } = {}) {
  return realOrderRequest.post<Api.RealOrder.OrderGroupPayResult, Api.RealOrder.OrderGroupPayParams>(
    '/orders/group/pay',
    { orderGroupNo, confirmedAmount, payPassword },
    { ...options, preserveDecimals: true }
  );
}

export interface OrderPaymentActions {
  payOrder: typeof submitOrderPayment;
  payOrderGroup: (confirmedAmount: string, payPassword: string, options?: { showError?: boolean }) => Promise<Api.RealOrder.OrderGroupPayResult>;
}

/** 原始付款请求仅在持有原订单锁的回调内可用，结算逐单付款不再次嵌套取得同锁。 */
export function withOrderPayment<T>(userId: string | number, orderIds: readonly (string | number)[], orderGroupNo: string | undefined,
  action: (payment: OrderPaymentActions) => Promise<T>): Promise<T> {
  const ids = new Set(orderIds.map(String));
  return withOrderSubmissionLocks(userId, orderIds, async () => {
    const session = getAccessToken();
    let active = true;
    const assertActive = () => {
      if (!active || getAccessToken() !== session) throw new Error('原付款操作已结束或会话已切换，请重新核对');
    };
    try {
      return await action({
        payOrder: async (id, amount, payPassword, options) => {
          assertActive();
          if (!ids.has(String(id))) throw new Error('付款订单不属于原结算，请重新核对');
          return submitOrderPayment(id, amount, payPassword, options);
        },
        payOrderGroup: async (amount, payPassword, options) => {
          assertActive();
          if (!orderGroupNo?.trim()) throw new Error('原订单组缺失，请重新核对');
          return submitOrderGroupPayment(orderGroupNo, amount, payPassword, options);
        }
      });
    } finally { active = false; }
  });
}

export function payOrder(id: string | number, confirmedAmount: string, payPassword: string, userId: string | number, options: { showError?: boolean } = {}) {
  return withOrderPayment(userId, [id], undefined, payment => payment.payOrder(id, confirmedAmount, payPassword, options));
}

export function fetchOrderGroupPayResult(orderGroupNo: string, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealOrder.OrderGroupPayResult>('/orders/group/pay-result', { params: { orderGroupNo }, ...options, showError: false, preserveDecimals: true });
}

export async function fetchCarriers(options: { signal?: AbortSignal } = {}) {
  const items = await realOrderRequest.get<Api.RealOrder.CarrierDTO[]>('/orders/carriers', { ...options, showError: false });
  return requireArray<Api.RealOrder.CarrierDTO>(items, '承运商字典').filter(item => item.enabled).sort((a, b) => a.sortNo - b.sortNo);
}

export async function shipOrder(params: Api.RealOrder.OrderShipParams) {
  await realOrderRequest.post<string | number, Api.RealOrder.OrderShipParams>('/orders/ship', params);
  return { ok: true, message: '' };
}

export function fetchOrderLogistics(orderId: string | number, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealOrder.LogisticsDTO>('/orders/logistics', { params: { orderId }, signal: options.signal });
}

export function createLogisticsTrack(params: Api.RealOrder.LogisticsTrackParams) {
  return realOrderRequest.post<string | number, Api.RealOrder.LogisticsTrackParams>('/orders/logistics/track/create', params);
}

export function markLogisticsException(params: Api.RealOrder.LogisticsExceptionParams) {
  return realOrderRequest.put<string | number, Api.RealOrder.LogisticsExceptionParams>('/orders/logistics/exception/mark', params);
}

export async function cancelOrder(id: string | number, reason: string) {
  await realOrderRequest.post<string, Api.RealOrder.OrderCancelParams>('/orders/cancel', { id, reason });
  return { ok: true, message: '' };
}

export async function changeOrderPrice(p: Api.RealOrder.OrderPriceChangeParams) {
  await realOrderRequest.put<string, Api.RealOrder.OrderPriceChangeParams>('/orders/price', p);
  return { ok: true };
}

export async function confirmReceipt(id: string | number, userId: string | number, payPassword: string) {
  if (!/^\d{6}$/.test(payPassword)) throw new Error('请输入6位数字支付密码');
  await submitOrderConfirmation(userId, id, {
    submit: () => realOrderRequest.post<string, Api.RealOrder.OrderConfirmParams>('/orders/confirm', { id, payPassword }, { showError: false })
  });
  return { ok: true, message: '' };
}

/** 无幂等键的顺延操作：未知结果只回查原订单，不自动重发。 */
export function extendReceipt(id: string | number, userId: string | number) {
  return withOrderSubmissionLocks(userId, [id], async () => {
    const session = getAccessToken();
    const key = `cpc:extend-receipt:${encodeURIComponent(String(userId))}:${encodeURIComponent(String(id))}`;
    const assertSession = () => {
      if (getAccessToken() !== session) throw new Error('登录会话已切换，请重新核对订单');
    };
    const latest = await fetchOrderDetail(id);
    assertSession();
    if (String(latest.id) !== String(id) || String(latest.customerId) !== String(userId)) throw new Error('订单归属已变化，请刷新后核对');
    const wasExtended = (count: number, autoConfirmAt: string, current: Api.RealOrder.Record) =>
      String(current.id) === String(id) && String(current.customerId) === String(userId)
      && current.receiveExtendCount !== undefined && current.receiveExtendCount > count
      && !!current.autoConfirmAt && new Date(current.autoConfirmAt).getTime() > new Date(autoConfirmAt).getTime();
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      let previous: { count: number; autoConfirmAt: string };
      try { previous = JSON.parse(raw); } catch { throw new Error('上次延长收货结果无法核对，请联系平台，勿重复提交'); }
      if (!Number.isSafeInteger(previous.count) || !previous.autoConfirmAt) throw new Error('上次延长收货记录无效，请联系平台，勿重复提交');
      if (wasExtended(previous.count, previous.autoConfirmAt, latest)) {
        localStorage.removeItem(key);
        return { recovered: true };
      }
      throw new Error('上次延长收货结果尚未确认，请核对自动收货时间或联系平台，勿重复提交');
    }
    if (!getOrderCapabilities(latest, userId).extendReceipt) throw new Error('当前订单不能延长收货，请刷新后核对');
    const initialCount = latest.receiveExtendCount;
    const initialAutoConfirmAt = latest.autoConfirmAt;
    if (initialCount === undefined || !initialAutoConfirmAt) throw new Error('订单缺少延长次数或自动收货时间，请刷新后核对');
    const marker = JSON.stringify({ count: initialCount, autoConfirmAt: initialAutoConfirmAt });
    localStorage.setItem(key, marker);
    try {
      const receipt = await realOrderRequest.post<string | number, Api.RealOrder.OrderIdParams>(
        '/orders/extend-receipt', { id }, { showError: false }
      );
      assertSession();
      if (String(receipt) !== String(id)) throw new Error('延长收货回执无法核对，请先查看订单最新状态');
      localStorage.removeItem(key);
      return { recovered: false };
    } catch (error) {
      const rejected = isDefinitiveRejection(error) || (error instanceof RequestError && [
        '仅待收货订单可延长收货', '每笔订单最多延长收货 5 次', '订单即将自动确认收货，无法延长'
      ].some(message => error.message.includes(message)));
      if (rejected) localStorage.removeItem(key);
      else if (getAccessToken() === session) {
        try {
          const current = await fetchOrderDetail(id);
          assertSession();
          if (wasExtended(initialCount, initialAutoConfirmAt, current)) {
            localStorage.removeItem(key);
            return { recovered: true };
          }
        } catch { /* 回查失败时保留原标记，不自动重发。 */ }
      }
      throw error;
    }
  });
}
