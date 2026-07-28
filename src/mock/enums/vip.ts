/**
 * VIP 3 等级（顾客 / 买手）展示元数据。
 * 阈值与 backstage vip-config.ts 对齐。
 */

interface Meta {
  label: string;
  color: string;
  bg: string;
  icon: string;
  /** 上限积分（VIP2 没有上限） */
  maxPoints?: number;
}

export const VIP_META: Record<Api.User.VipLevel, Meta> = {
  VIP0: { label: 'VIP0', color: '#86909C', bg: '#F2F3F5', icon: 'mdi:account', maxPoints: 1000 },
  VIP1: { label: 'VIP1', color: '#165DFF', bg: '#E8F3FF', icon: 'mdi:medal', maxPoints: 10000 },
  VIP2: { label: 'VIP2', color: '#722ED1', bg: '#F5E8FF', icon: 'mdi:crown' }
};

/** 顾客 VIP 特权说明（用于特权对比页） */
export const CUSTOMER_BENEFITS_DESC = [
  { key: 'interestRateBonus', label: '存款利率加成', unit: '%' },
  { key: 'purchaseConcurrent', label: '同时求购数', unit: '个' },
  { key: 'purchasePriority', label: '求购大厅优先级', unit: '级' },
  { key: 'aftersaleResponse', label: '售后响应优先级', unit: '级' },
  { key: 'withdrawFeeDiscount', label: '出金手续费减免', unit: '%' }
] as const;

/** 买手 VIP 特权说明 */
export const BUYER_BENEFITS_DESC = [
  { key: 'pushIntervalMinutes', label: '求购推送间隔', unit: '分钟', smallerBetter: true },
  { key: 'transactionFeeDiscount', label: '交易手续费减免', unit: '%' },
  { key: 'productSlotsMax', label: '在架商品上限', unit: '个' }
] as const;

export function nextVipLevel(level: Api.User.VipLevel): Api.User.VipLevel | undefined {
  if (level === 'VIP0') return 'VIP1';
  if (level === 'VIP1') return 'VIP2';
  return undefined;
}
