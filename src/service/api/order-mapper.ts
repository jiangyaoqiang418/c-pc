import { toIsoDate } from './date';
import { readLedgerAmount } from './wallet';

function optionalOrderAmount(value: unknown, label: string) {
  return value === undefined || value === null ? undefined : readLedgerAmount(value, label);
}

export const statusMap: Record<string, Api.Order.OrderStatus> = {
  CREATED: 'PENDING_PAYMENT',
  PAID: 'PROCURING',
  SHIPPED: 'IN_TRANSIT',
  AFTERSALE_CONFIRM: 'AFTERSALE_CONFIRM',
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
  AFTERSALE_CONFIRM: 'AFTERSALE_CONFIRM',
  COMPLETED: 'COMPLETED',
  WARRANTY: 'COMPLETED',
  IN_AFTERSALE: 'REFUND_REVIEW',
  REFUNDED: 'REFUNDED',
  ARCHIVED: undefined,
  CANCELLED: 'CANCELED'
};

/** PAID 的采购细分必须按 stage 分页，不能复用一份 PAID 总数。 */
export const reverseStageMap: Partial<Record<Api.Order.OrderStatus, Api.RealOrder.OrderStage>> = {
  PENDING_PAYMENT: 'CREATED', PROCURING: 'PROCURING', PROCURED: 'PROCURED',
  IN_TRANSIT: 'SHIPPED', AFTERSALE_CONFIRM: 'AFTERSALE_CONFIRM',
  COMPLETED: 'COMPLETED', WARRANTY: 'COMPLETED', IN_AFTERSALE: 'REFUND_REVIEW',
  REFUNDED: 'REFUNDED', CANCELLED: 'CANCELED'
};
const stageStatusMap: Record<Api.RealOrder.OrderStage, Api.Order.OrderStatus> = {
  CREATED: 'PENDING_PAYMENT', PROCURING: 'PROCURING', PROCURED: 'PROCURED',
  SHIPPED: 'IN_TRANSIT', AFTERSALE_CONFIRM: 'AFTERSALE_CONFIRM', REFUND_REVIEW: 'IN_AFTERSALE',
  REFUNDED: 'REFUNDED', COMPLETED: 'COMPLETED', CANCELED: 'CANCELLED'
};
const stageRawStatusMap: Record<Api.RealOrder.OrderStage, Api.RealOrder.OrderStatus> = {
  CREATED: 'CREATED', PROCURING: 'PAID', PROCURED: 'PAID', SHIPPED: 'SHIPPED',
  AFTERSALE_CONFIRM: 'AFTERSALE_CONFIRM', REFUND_REVIEW: 'REFUND_REVIEW',
  REFUNDED: 'REFUNDED', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED'
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
  if (dto.stage != null && (!Object.prototype.hasOwnProperty.call(stageStatusMap, dto.stage)
    || stageRawStatusMap[dto.stage] !== dto.status)) {
    throw new Error('订单阶段与状态无法核对，请刷新后重试');
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
    skuId: dto.skuId,
    skuSpecs: dto.skuSpecs,
    sessionId: dto.flashSessionId ?? undefined,
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
    status: dto.stage ? stageStatusMap[dto.stage] : statusMap[dto.status],
    rawStatus: dto.status,
    stage: dto.stage ?? undefined,
    canProcure: dto.canProcure === true,
    canShip: dto.canShip === true,
    canConfirmAftersale: dto.canConfirmAftersale === true,
    procuredAt: toIsoDate(dto.procuredAt ?? undefined) || undefined,
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
