import { realOrderRequest } from '@/service/request';
import { reverseStatusMap, toOrderRecord } from './order-mapper';
import { fetchMergeSourcePages, requireArray, resolvePageSize, toPageTotal } from './page';

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
    }, { signal: q.signal });
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
  const dto = await realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id }, signal: options.signal });
  return toOrderRecord(dto);
}

export function createOrders(
  params: Api.RealOrder.OrderCreateBatchParams,
  options: { showError?: boolean } = {}
) {
  return realOrderRequest.post<Api.RealOrder.OrderGroupVO, Api.RealOrder.OrderCreateBatchParams>(
    '/orders/create-batch',
    params,
    options
  );
}

export async function payOrder(id: string | number, options: { showError?: boolean } = {}) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/pay', { id }, options);
  return { ok: true, message: '' };
}

export async function payOrderGroup(orderGroupNo: string, options: { showError?: boolean } = {}) {
  await realOrderRequest.post<number, Api.RealOrder.OrderGroupPayParams>(
    '/orders/group/pay',
    { orderGroupNo },
    options
  );
  return { ok: true, message: '' };
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

export async function confirmReceipt(id: string | number) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/confirm', { id });
  return { ok: true, message: '' };
}
