import { realOrderRequest } from '@/service/request';
import { reverseStatusMap, toOrderRecord } from './order-mapper';
import { toPageTotal } from './page';

export async function fetchMyOrders(q: Api.RealOrder.ListQuery) {
  const statuses = [...new Set(q.statuses?.map(s => reverseStatusMap[s]).filter(Boolean) as Api.RealOrder.OrderStatus[] || [])];
  const url = q.shopperId ? '/orders/sold/page' : '/orders/bought/page';
  const requestPage = (status?: Api.RealOrder.OrderStatus) => realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
    Api.RealOrder.OrderPageQuery
  >(url, {
    pageNo: q.current || 1,
    pageSize: q.size || 10,
    status
  });
  const pages = statuses.length > 1
    ? await Promise.all(statuses.map(status => requestPage(status)))
    : [await requestPage(statuses[0])];
  const recordsById = new Map<string, Api.Order.OrderRecord>();
  pages.forEach(page => {
    page.records.map(toOrderRecord).forEach(record => {
      if (!q.statuses?.length || q.statuses.includes(record.status)) recordsById.set(String(record.id), record);
    });
  });
  const records = [...recordsById.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, q.size || 10);

  return {
    current: q.current || 1,
    size: q.size || 10,
    total: pages.reduce((sum, page) => sum + toPageTotal(page.total), 0),
    records
  };
}

async function countOrdersByStatus(
  url: '/orders/bought/page' | '/orders/sold/page',
  options: { showError?: boolean } = {}
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
      const page = await realOrderRequest.post<
        Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
        Api.RealOrder.OrderPageQuery
      >(url, { pageNo: 1, pageSize: 1, status: realStatus }, { showError: options.showError });
      return [frontStatus, toPageTotal(page.total)] as const;
    })
  );
  entries.forEach(([status, count]) => {
    counts[status] = count;
  });
  return counts;
}

export function countMyOrdersByStatus(options?: { showError?: boolean }) {
  return countOrdersByStatus('/orders/bought/page', options);
}

export function countMySoldOrdersByStatus(options?: { showError?: boolean }) {
  return countOrdersByStatus('/orders/sold/page', options);
}

export async function fetchOrderDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id } });
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
