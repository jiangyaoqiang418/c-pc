import { toIsoDate } from './date';
import { readLedgerAmount } from './wallet';

function optionalOrderAmount(value: unknown, label: string) {
  return value === undefined || value === null ? undefined : readLedgerAmount(value, label);
}

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
  PROCURED: undefined,
  IN_TRANSIT: 'SHIPPED',
  AFTERSALE_CONFIRM: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  WARRANTY: 'COMPLETED',
  IN_AFTERSALE: 'REFUND_REVIEW',
  REFUNDED: 'REFUNDED',
  ARCHIVED: undefined,
  CANCELLED: 'CANCELED'
};

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
export function toOrderRecord(dto: Api.RealOrder.OrderDTO): Api.RealOrder.Record {
  if (!dto.status || !Object.prototype.hasOwnProperty.call(statusMap, dto.status)) {
    throw new Error('订单状态缺失或暂不支持，无法确认可执行操作');
  }
  const id = dto.orderId;
  const customerId = dto.customerId || '';
  const shopperId = dto.sellerId || '';
  const productId = dto.productId || '';
  const createdAt = toIsoDate(dto.createdAt) || new Date().toISOString();
  const unitPrice = optionalOrderAmount(dto.unitPrice, '订单成交单价');
  // 原价合计及单价都不能代替卖家改价后的当前应付金额。
  const totalAmount = readLedgerAmount(dto.totalAmount, '订单当前应付金额');

  return {
    id,
    orderGroupNo: dto.orderGroupNo,
    reviewEligibility: dto.reviewEligibility,
    code: dto.orderNo || String(dto.orderId || ''),
    productId,
    quantity: dto.quantity,
    productTitle: dto.productTitle || '商品快照',
    productCover: dto.productImage,
    customerId,
    customerName: dto.customerName || '匿名顾客',
    shopperId,
    shopperName: dto.sellerName || (shopperId ? `买手 ${shopperId}` : '买手'),
    price: unitPrice,
    shippingFee: optionalOrderAmount(dto.shippingFee, '订单运费'),
    tax: optionalOrderAmount(dto.taxAmount ?? dto.taxFee, '订单税费'),
    totalAmount,
    paidAmount: dto.paidAt ? totalAmount : '0',
    status: statusMap[dto.status],
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
    logisticsStatus: dto.logisticsStatus,
    logisticsStatusText: dto.logisticsStatusText,
    carrier: dto.logisticsCompanyCode || dto.carrier,
    carrierName: dto.logisticsCompany || dto.carrierName,
    eta: toIsoDate(dto.eta),
    logisticsException: dto.logisticsException,
    purchaseNo: dto.purchaseNo,
    purchaseVouchers: dto.purchaseVouchers,
    paymentBizNo: dto.paymentBizNo,
    refundId: dto.refundId as unknown as string | number | undefined,
    refundStatus: dto.refundStatus,
    refundAmount: dto.refundAmount === undefined ? undefined : String(dto.refundAmount),
    priceHistory: [],
    createdAt,
    paidAt: toIsoDate(dto.paidAt) || undefined,
    shippedAt: toIsoDate(dto.shippedAt) || undefined,
    autoConfirmAt: toIsoDate(dto.autoConfirmAt ?? undefined) || undefined,
    receiveExtendCount: Number.isSafeInteger(dto.receiveExtendCount) && dto.receiveExtendCount! >= 0 ? dto.receiveExtendCount! : undefined,
    receiveExtendable: dto.receiveExtendable === true,
    deliveredAt: toIsoDate(dto.completedAt) || undefined,
    archivedAt: dto.status === 'REFUNDED' || dto.status === 'CANCELED' ? toIsoDate(dto.completedAt) : undefined
  };
}
