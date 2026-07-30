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

function mapPage(
  page: Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
  q: { current?: number; size?: number }
) {
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 10,
    total: page.total,
    records: page.records.map(toOrderRecord)
  };
}

export async function fetchMyOrders(q: Api.Order.ListQuery) {
  const statuses = q.statuses?.map(s => reverseStatusMap[s]).filter(Boolean) as Api.RealOrder.OrderStatus[] | undefined;
  const status = statuses?.[0];
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealOrder.OrderDTO> & { pageNo?: number; pageSize?: number },
    Api.RealOrder.OrderPageQuery
  >(q.shopperId ? '/orders/sold/page' : '/orders/bought/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 10,
    status
  });
  const mapped = mapPage(page, q);
  if (statuses && statuses.length > 1) {
    mapped.records = mapped.records.filter(item => q.statuses!.includes(item.status));
  }
  return mapped;
}

export async function fetchOrderDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealOrder.OrderDTO>('/orders/detail', { params: { id } });
  return toOrderRecord(dto);
}

export async function countMyOrdersByStatus() {
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
      >('/orders/bought/page', { pageNo: 1, pageSize: 1, status: realStatus });
      return [frontStatus, page.total || 0] as const;
    })
  );
  entries.forEach(([status, count]) => {
    counts[status] = count;
  });
  return counts;
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
