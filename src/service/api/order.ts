import { realOrderRequest } from '@/service/request';

const statusMap: Record<string, Api.Order.OrderStatus> = {
  CREATED: 'PENDING_PAYMENT',
  PAID: 'PROCURING',
  SHIPPED: 'IN_TRANSIT',
  REFUND_REVIEW: 'IN_AFTERSALE',
  REFUNDED: 'ARCHIVED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELLED'
};

const reverseStatusMap: Partial<Record<Api.Order.OrderStatus, Api.RealOrder.OrderStatus>> = {
  PENDING_PAYMENT: 'CREATED',
  PROCURING: 'PAID',
  PROCURED: 'PAID',
  IN_TRANSIT: 'SHIPPED',
  AFTERSALE_CONFIRM: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  WARRANTY: 'COMPLETED',
  IN_AFTERSALE: 'REFUND_REVIEW',
  ARCHIVED: 'REFUNDED',
  CANCELLED: 'CANCELED'
};

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

function toTotal(value?: string | number) {
  return Number(value || 0);
}

function toOrderRecord(dto: Api.RealOrder.OrderDTO): Api.Order.OrderRecord {
  const id = dto.orderId as unknown as number;
  const customerId = dto.customerId as unknown as number;
  const shopperId = dto.sellerId as unknown as number;
  const productId = dto.productId as unknown as number;
  const createdAt = toIso(dto.createdAt) || new Date().toISOString();
  const unitPrice = String(dto.unitPrice ?? dto.originalAmount ?? dto.totalAmount ?? 0);
  const totalAmount = String(dto.totalAmount ?? unitPrice);

  return {
    id,
    code: dto.orderNo || String(dto.orderId || ''),
    productId,
    productTitle: dto.productTitle || '商品快照',
    productCover: dto.productImage,
    customerId,
    customerName: customerId ? `顾客 ${customerId}` : '当前顾客',
    shopperId,
    shopperName: shopperId ? `买手 ${shopperId}` : '买手',
    price: unitPrice,
    shippingFee: '0',
    tax: '0',
    totalAmount,
    paidAmount: dto.paidAt ? totalAmount : '0',
    status: statusMap[dto.status || ''] || 'PENDING_PAYMENT',
    shippingAddress: '后端暂未返回收货地址',
    receiverName: '—',
    receiverPhone: '—',
    overseasCustoms: false,
    aftersaleType: '7day-no-reason',
    priceHistory: [],
    createdAt,
    paidAt: toIso(dto.paidAt) || undefined,
    shippedAt: toIso(dto.shippedAt) || undefined,
    deliveredAt: toIso(dto.completedAt) || undefined,
    archivedAt: dto.status === 'REFUNDED' || dto.status === 'CANCELED' ? toIso(dto.completedAt) : undefined
  };
}

export async function fetchMyOrders(q: Api.Order.ListQuery) {
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
    total: pages.reduce((sum, page) => sum + toTotal(page.total), 0),
    records
  };
}

async function countOrdersByStatus(url: '/orders/bought/page' | '/orders/sold/page') {
  const counts = Object.fromEntries(
    Object.keys(reverseStatusMap).map(status => [status, 0])
  ) as Record<Api.Order.OrderStatus, number>;
  const primaryStatusMap: Array<[Api.Order.OrderStatus, Api.RealOrder.OrderStatus]> = [
    ['PENDING_PAYMENT', 'CREATED'],
    ['PROCURING', 'PAID'],
    ['IN_TRANSIT', 'SHIPPED'],
    ['IN_AFTERSALE', 'REFUND_REVIEW'],
    ['ARCHIVED', 'REFUNDED'],
    ['COMPLETED', 'COMPLETED'],
    ['CANCELLED', 'CANCELED']
  ];
  const entries = await Promise.all(
    primaryStatusMap.map(async ([frontStatus, realStatus]) => {
      const page = await realOrderRequest.post<
        Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
        Api.RealOrder.OrderPageQuery
      >(url, { pageNo: 1, pageSize: 1, status: realStatus });
      return [frontStatus, toTotal(page.total)] as const;
    })
  );
  entries.forEach(([status, count]) => {
    counts[status] = count;
  });
  return counts;
}

export function countMyOrdersByStatus() {
  return countOrdersByStatus('/orders/bought/page');
}

export function countMySoldOrdersByStatus() {
  return countOrdersByStatus('/orders/sold/page');
}

export async function fetchOrderDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id } });
  return toOrderRecord(dto);
}

export async function payOrder(id: string | number) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/pay', { id });
  return { ok: true, message: '' };
}

export async function cancelOrder(id: string | number) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/cancel', { id });
  return { ok: true, message: '' };
}

export async function confirmReceipt(id: string | number) {
  await realOrderRequest.post<string, Api.RealOrder.OrderIdParams>('/orders/confirm', { id });
  return { ok: true, message: '' };
}
