/**
 * 通知跳转只依赖后端明确提供的业务类型与业务 ID。
 * 缺少 ID 的通知仍可正常标记已读，但不能猜测目标页面。
 */
export function notificationOrderId(notification: Pick<Api.RealNotify.NotificationVO, 'bizType' | 'bizId'>) {
  if (String(notification.bizType || '').toUpperCase() !== 'ORDER') return undefined;
  if (notification.bizId === undefined || notification.bizId === null || notification.bizId === '') return undefined;
  return String(notification.bizId);
}

export function notificationRoute(notification: Pick<Api.RealNotify.NotificationVO, 'bizType' | 'bizId'>) {
  const bizId = notification.bizId === undefined || notification.bizId === null || notification.bizId === ''
    ? undefined
    : String(notification.bizId);
  const type = String(notification.bizType || '').toUpperCase();
  if (type === 'ORDER' && bizId) return { name: 'order-detail' as const, params: { id: bizId } };
  if (type === 'RECHARGE') return { name: 'wallet-deposit' as const };
  if (type === 'WITHDRAW') return { name: 'wallet-withdraw' as const };
  if (type === 'KYC') return { name: 'kyc' as const };
  if (type === 'BUYER_APPLICATION') return { name: 'buyer-apply' as const };
  if (type === 'FINANCE' && bizId) return { name: 'finance-lockup-detail' as const, params: { id: bizId } };
  if (type === 'PRODUCT_REVIEW') return { name: 'review-list' as const };
  return undefined;
}

/** 从独立订单群返回消息中心时保留当前会话选中态。 */
export function conversationListQuery(conversationId?: string | number) {
  return conversationId === undefined || conversationId === null ? undefined : { conversationId: String(conversationId) };
}
