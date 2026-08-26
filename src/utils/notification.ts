/**
 * 通知跳转只依赖后端明确提供的业务类型与业务 ID。
 * 缺少 ID 的通知仍可正常标记已读，但不能猜测目标页面。
 */
export function notificationOrderId(notification: Pick<Api.RealNotify.NotificationVO, 'bizType' | 'bizId'>) {
  if (String(notification.bizType || '').toUpperCase() !== 'ORDER') return undefined;
  if (notification.bizId === undefined || notification.bizId === null || notification.bizId === '') return undefined;
  return String(notification.bizId);
}

const TEMPLATE_CODES: Record<string, Set<string>> = {
  ORDER: new Set(['order_created', 'order_price_changed', 'order_paid', 'order_shipped', 'order_completed', 'order_settled', 'order_canceled', 'order_refund_applied', 'order_refund_agreed', 'order_refund_rejected', 'order_refund_canceled']),
  PRODUCT_REVIEW: new Set(['review_published']),
  RECHARGE: new Set(['recharge_confirmed']),
  WITHDRAW: new Set(['withdraw_submitted', 'withdraw_approved', 'withdraw_success', 'withdraw_rejected']),
  FINANCE: new Set(['finance_subscribed', 'finance_settled', 'finance_redeemed']),
  KYC: new Set(['kyc_approved', 'kyc_rejected']),
  BUYER_APPLICATION: new Set(['buyer_application_approved', 'buyer_application_rejected']),
  PURCHASE_DEMAND: new Set(['demand_pushed']),
  ACCOUNT: new Set(['welcome']),
  SYSTEM: new Set(['system_notice'])
};

export function notificationRoute(notification: Pick<Api.RealNotify.NotificationVO, 'bizType' | 'bizId' | 'templateCode'>) {
  const bizId = notification.bizId === undefined || notification.bizId === null || notification.bizId === ''
    ? undefined
    : String(notification.bizId);
  const type = String(notification.bizType || '').toUpperCase();
  const template = String(notification.templateCode || '');
  if (!TEMPLATE_CODES[type]?.has(template)) return undefined;
  if (type !== 'SYSTEM' && !bizId) return undefined;
  if (type === 'ORDER' && bizId) return { name: 'order-detail' as const, params: { id: bizId } };
  if (type === 'RECHARGE') return { name: 'wallet-deposit' as const, query: { id: bizId } };
  if (type === 'WITHDRAW') return { name: 'wallet-withdraw' as const, query: { id: bizId } };
  if (type === 'KYC') return { name: 'kyc' as const, query: { id: bizId } };
  if (type === 'BUYER_APPLICATION') return { name: 'buyer-apply' as const, query: { id: bizId } };
  if (type === 'FINANCE' && bizId) return { name: 'finance-lockup-detail' as const, params: { id: bizId } };
  if (type === 'PRODUCT_REVIEW') return { name: 'review-list' as const, query: { id: bizId } };
  if (type === 'PURCHASE_DEMAND') return { name: 'purchase-detail' as const, params: { id: bizId } };
  if (type === 'ACCOUNT') return { name: 'profile' as const, query: { id: bizId } };
  return undefined;
}

/** 从独立订单群返回消息中心时保留当前会话选中态。 */
export function conversationListQuery(conversationId?: string | number) {
  return conversationId === undefined || conversationId === null ? undefined : { conversationId: String(conversationId) };
}
