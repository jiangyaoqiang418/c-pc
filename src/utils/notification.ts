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
  const orderId = notificationOrderId(notification);
  return orderId ? { name: 'order-detail' as const, params: { id: orderId } } : undefined;
}

/** 从独立订单群返回消息中心时保留当前会话选中态。 */
export function conversationListQuery(conversationId?: string | number) {
  return conversationId === undefined || conversationId === null ? undefined : { conversationId: String(conversationId) };
}
