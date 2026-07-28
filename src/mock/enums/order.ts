/**
 * 订单状态 + 售后类型 + 物流商展示元数据。
 * 抽取自 backstage/src/views/order/enums.ts，保持 label/color/icon 完全一致。
 */

export interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const ORDER_STATUS_META: Record<Api.Order.OrderStatus, Meta> = {
  PENDING_PAYMENT: { label: '待付款', color: 'orange', icon: 'mdi:credit-card-clock-outline' },
  PROCURING: { label: '采购中', color: 'arcoblue', icon: 'mdi:cart-arrow-down' },
  PROCURED: { label: '已采购待发货', color: 'cyan', icon: 'mdi:package-variant-closed' },
  IN_TRANSIT: { label: '运输中', color: 'blue', icon: 'mdi:truck-fast-outline' },
  AFTERSALE_CONFIRM: { label: '售后确认', color: 'purple', icon: 'mdi:clipboard-text-clock-outline' },
  COMPLETED: { label: '已完成', color: 'green', icon: 'mdi:check-circle-outline' },
  WARRANTY: { label: '保修期', color: 'cyan', icon: 'mdi:shield-check-outline' },
  IN_AFTERSALE: { label: '售后中', color: 'red', icon: 'mdi:alert-octagon-outline' },
  ARCHIVED: { label: '已归档', color: 'gray', icon: 'mdi:archive-outline' },
  CANCELLED: { label: '已取消', color: 'gray', icon: 'mdi:close-octagon-outline' }
};

export const AFTERSALE_TYPE_META: Record<Api.Product.AftersaleType, Meta> = {
  none: { label: '无售后', color: 'gray', icon: 'mdi:close-circle-outline' },
  '7day-no-reason': { label: '7 天无理由', color: 'green', icon: 'mdi:undo-variant' },
  'shop-warranty': { label: '店铺保修', color: 'orange', icon: 'mdi:tools' },
  'national-warranty': { label: '全国联保', color: 'blue', icon: 'mdi:shield-check' }
};

export const AFTERSALE_CASE_TYPE_META: Record<Api.Order.AftersaleCaseType, Meta> = {
  REFUND: { label: '退货退款', color: 'red', icon: 'mdi:cash-refund' },
  REPLACE: { label: '换货', color: 'orange', icon: 'mdi:swap-horizontal' },
  REPAIR: { label: '修理', color: 'gold', icon: 'mdi:tools' },
  PARTIAL_REFUND: { label: '部分退款', color: 'cyan', icon: 'mdi:cash-minus' },
  REFUND_ONLY: { label: '仅退款', color: 'magenta', icon: 'mdi:cash' }
};

export const AFTERSALE_STATUS_META: Record<Api.Order.AftersaleStatus, Meta> = {
  pending: { label: '待买手响应', color: 'orange', icon: 'mdi:clock-outline' },
  shopper_agreed: { label: '买手同意', color: 'green', icon: 'mdi:check-circle' },
  shopper_rejected: { label: '买手拒绝', color: 'red', icon: 'mdi:close-circle' },
  arbitrating: { label: '平台仲裁中', color: 'purple', icon: 'mdi:gavel' },
  executing: { label: '执行中', color: 'cyan', icon: 'mdi:run' },
  completed: { label: '已完成', color: 'green', icon: 'mdi:check-decagram' },
  cancelled: { label: '已取消', color: 'gray', icon: 'mdi:close-octagon-outline' }
};

export const CARRIER_META: Record<Api.Order.ShippingCarrier, Meta> = {
  SF_INTL: { label: '顺丰国际', color: 'red', icon: 'mdi:truck-delivery' },
  FEDEX: { label: 'FedEx', color: 'purple', icon: 'mdi:truck-fast' },
  DHL: { label: 'DHL', color: 'gold', icon: 'mdi:airplane' },
  '4PX': { label: '4PX 递四方', color: 'orange', icon: 'mdi:cube-outline' },
  EMS: { label: 'EMS', color: 'green', icon: 'mdi:mailbox' }
};
