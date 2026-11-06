import { sameBusinessId } from '@/utils/im';

// 路由往返保留未知提交标记；不保存支付密码或资金操作请求体。
const uncertainOperations = new Map<string, { revision: string; action: Api.RealRefund.RefundAction }>();
const refundRevision = (refund: Api.RealRefund.RefundDTO) => JSON.stringify([refund.status, refund.refundType, refund.preferredType]);
export function markRefundOperationUncertain(key: string, refund: Api.RealRefund.RefundDTO, action: Api.RealRefund.RefundAction) { uncertainOperations.set(key, { revision: refundRevision(refund), action }); }
export function clearRefundOperationUncertain(key: string) { uncertainOperations.delete(key); }
export function refundOperationUncertain(key: string, refund: Api.RealRefund.RefundDTO, userId?: string | number) {
  const pending = uncertainOperations.get(key);
  if (pending === undefined) return false;
  if (pending.revision === refundRevision(refund) || userId === undefined || refundActionAllowed(refund, userId, pending.action)) return true;
  uncertainOperations.delete(key);
  return false;
}

export const refundTypes: { value: Api.RealRefund.RefundType; label: string }[] = [
  { value: 'REFUND_ONLY', label: '仅退款' }, { value: 'RETURN_REFUND', label: '退货退款' },
  { value: 'COMPENSATION', label: '赔偿红包' }, { value: 'EXCHANGE', label: '换货' }
];
export const refundStatusLabels: Record<string, string> = {
  CONFIRMING: '待处理', APPLYING: '待平台审核', RETURNING: '待买家退货',
  RETURN_RECEIVING: '待退货收货', EXCHANGING: '待换货发货', EXCHANGE_RECEIVING: '待买家确认换货收货',
  PAYING: '售后支付中', COMPLETED: '售后完成', AGREED: '已同意退款', REJECTED: '已驳回', CANCELED: '已撤销'
};
export const refundStatusDefs = [
  { key: 'all', label: '全部' }, ...Object.entries(refundStatusLabels).map(([key, label]) => ({ key, label }))
];
export const refundTypeLabel = (value?: string) => refundTypes.find(item => item.value === value)?.label || '待确认';
export function refundCapabilities(refund: Api.RealRefund.RefundDTO | undefined, userId?: string | number) {
  const buyer = !!refund && sameBusinessId(refund.buyerId, userId);
  const seller = !!refund && sameBusinessId(refund.sellerId, userId);
  const pending = !!refund && ['CONFIRMING', 'APPLYING'].includes(String(refund.status));
  return {
    buyer, seller, select: (buyer || seller) && pending, cancel: buyer && pending,
    returnShip: buyer && refund?.status === 'RETURNING',
    returnReceive: seller && refund?.status === 'RETURN_RECEIVING',
    exchangeShip: seller && refund?.status === 'EXCHANGING',
    exchangeReceive: buyer && refund?.status === 'EXCHANGE_RECEIVING'
  };
}
export function refundActionAllowed(refund: Api.RealRefund.RefundDTO, userId: string | number, action: Api.RealRefund.RefundAction) {
  const caps = refundCapabilities(refund, userId);
  return ({ SELECT: caps.select, RETURN_SHIP: caps.returnShip, RETURN_RECEIVE: caps.returnReceive,
    EXCHANGE_SHIP: caps.exchangeShip, EXCHANGE_RECEIVE: caps.exchangeReceive })[action];
}
