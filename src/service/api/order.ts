import { realOrderRequest } from '@/service/request';
import { reverseStatusMap, toOrderRecord } from './order-mapper';
import { fetchMergeSourcePages, requireArray, resolvePageSize, toPageTotal } from './page';
import { submitOrderConfirmation } from '@/utils/financial-submission';

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

export async function payOrder(id: string | number, confirmedAmount: string, options: { showError?: boolean } = {}) {
  const receipt = await realOrderRequest.post<string | number, Api.RealOrder.OrderPayParams>('/orders/pay', { id, confirmedAmount }, options);
  if (!((typeof receipt === 'string' && receipt.trim()) || (typeof receipt === 'number' && Number.isSafeInteger(receipt)))) throw new Error('付款回执缺失，请核对原订单状态');
  return { ok: true, message: '' };
}

export function payOrderGroup(orderGroupNo: string, confirmedAmount: string, options: { showError?: boolean } = {}) {
  return realOrderRequest.post<Api.RealOrder.OrderGroupPayResult, Api.RealOrder.OrderGroupPayParams>(
    '/orders/group/pay',
    { orderGroupNo, confirmedAmount },
    { ...options, preserveDecimals: true }
  );
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

export async function cancelOrder(id: string | number) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/cancel', { id });
  return { ok: true, message: '' };
}

export async function changeOrderPrice(p: Api.RealOrder.OrderPriceChangeParams) {
  await realOrderRequest.put<string, Api.RealOrder.OrderPriceChangeParams>('/orders/price', p);
  return { ok: true };
}

export async function confirmReceipt(id: string | number, userId: string | number, restoring = false) {
  await submitOrderConfirmation(userId, id, {
    submit: () => realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/confirm', { id }, { showError: false }),
    lookup: () => realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id }, showError: false })
      .then(dto => ({ id: dto.orderId, customerId: dto.customerId, status: dto.status || '' }))
  }, restoring);
  return { ok: true, message: '' };
}
