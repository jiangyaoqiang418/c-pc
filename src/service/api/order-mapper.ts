export const statusMap: Record<string, Api.Order.OrderStatus> = {
  CREATED: 'PENDING_PAYMENT',
  PAID: 'PROCURING',
  SHIPPED: 'IN_TRANSIT',
  REFUND_REVIEW: 'IN_AFTERSALE',
  REFUNDED: 'REFUNDED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELLED'
};

export const reverseStatusMap: Partial<Record<Api.Order.OrderStatus, Api.RealOrder.OrderStatus>> = {
  PENDING_PAYMENT: 'CREATED',
  PROCURING: 'PAID',
  PROCURED: 'PAID',
  IN_TRANSIT: 'SHIPPED',
  AFTERSALE_CONFIRM: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  WARRANTY: 'COMPLETED',
  IN_AFTERSALE: 'REFUND_REVIEW',
  REFUNDED: 'REFUNDED',
  ARCHIVED: 'REFUNDED',
  CANCELLED: 'CANCELED'
};

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

function toShippingAddress(dto: Api.RealOrder.OrderDTO) {
  if (dto.shippingAddress || dto.receiverAddress) return dto.shippingAddress || dto.receiverAddress || '';
  const parts = [
    dto.receiverCountry || dto.country,
    dto.receiverProvince || dto.province,
    dto.receiverCity || dto.city,
    dto.receiverDistrict || dto.district,
    dto.receiverDetailAddress || dto.detailAddress
  ].filter(Boolean);
  return parts.length ? parts.join('') : '后端暂未返回收货地址';
}

function toShippingCarrier(code?: string): Api.Order.ShippingCarrier | undefined {
  const carriers: Api.Order.ShippingCarrier[] = ['SF_INTL', 'FEDEX', 'DHL', '4PX', 'EMS'];
  return code && carriers.includes(code as Api.Order.ShippingCarrier)
    ? code as Api.Order.ShippingCarrier
    : undefined;
}

/** 将订单服务 DTO 映射为页面模型；不得伪造后端没有返回的履约字段。 */
export function toOrderRecord(dto: Api.RealOrder.OrderDTO): Api.Order.OrderRecord {
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
    shopperName: dto.sellerName || (shopperId ? `买手 ${shopperId}` : '买手'),
    price: unitPrice,
    shippingFee: String(dto.shippingFee ?? 0),
    tax: String(dto.taxAmount ?? dto.taxFee ?? 0),
    totalAmount,
    paidAmount: dto.paidAt ? totalAmount : '0',
    status: statusMap[dto.status || ''] || 'PENDING_PAYMENT',
    shippingAddress: toShippingAddress(dto),
    receiverName: dto.receiverName || '—',
    receiverPhone: dto.receiverPhone || '—',
    addressId: dto.addressId as unknown as string | number | undefined,
    postalCode: dto.postalCode,
    trackingNumber: dto.trackingNo || dto.logisticsNo,
    shippingCarrier: toShippingCarrier(dto.logisticsCompanyCode),
    purchaseScreenshotUrl: dto.purchaseVoucherUrl || dto.purchaseVoucherUrls?.[0],
    shippingScreenshotUrl: dto.shippingVoucherUrl || dto.shippingVoucherUrls?.[0] || dto.shipVouchers?.[0],
    shippingVoucherUrls: dto.shippingVoucherUrls || dto.shipVouchers,
    shippedRemark: dto.shippedRemark,
    logisticsCompany: dto.logisticsCompany,
    paymentBizNo: dto.paymentBizNo,
    refundId: dto.refundId as unknown as string | number | undefined,
    refundStatus: dto.refundStatus,
    refundAmount: dto.refundAmount === undefined ? undefined : String(dto.refundAmount),
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
