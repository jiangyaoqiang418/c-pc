import { realNotifyRequest } from '@/service/request';

// notify 服务的鉴权问题不应清空整站登录态；调用方仍会收到真实错误并自行展示。
const notifyRequestOptions = { skipAuthRedirect: true };

export function fetchNotifications(params: Api.RealNotify.NotificationPageQuery = {}) {
  return realNotifyRequest.post<Api.RealNotify.PageResult<Api.RealNotify.NotificationVO>, Api.RealNotify.NotificationPageQuery>(
    '/notifications/page',
    params,
    notifyRequestOptions
  );
}

export function fetchUnreadNotificationCount() {
  return realNotifyRequest.get<number>('/notifications/unread/count', notifyRequestOptions);
}

export function markNotificationRead(params: Api.RealNotify.NotificationReadParams) {
  return realNotifyRequest.put<boolean, Api.RealNotify.NotificationReadParams>('/notifications/read', params, notifyRequestOptions);
}

export function markAllNotificationsRead() {
  return realNotifyRequest.put<boolean>('/notifications/read-all', undefined, notifyRequestOptions);
}

export function fetchConversations(params: Api.RealNotify.PageQuery = {}) {
  return realNotifyRequest.post<Api.RealNotify.PageResult<Api.RealNotify.ImConversationVO>, Api.RealNotify.PageQuery>(
    '/im/conversations/page',
    params,
    notifyRequestOptions
  );
}

export function fetchOrderConversation(orderId: string | number) {
  return realNotifyRequest.get<Api.RealNotify.ImConversationVO>('/im/conversations/by-order', {
    params: { orderId },
    ...notifyRequestOptions
  });
}

export function fetchConversationMessages(params: Api.RealNotify.ImMessagePageQuery) {
  return realNotifyRequest.post<Api.RealNotify.PageResult<Api.RealNotify.ImMessageVO>, Api.RealNotify.ImMessagePageQuery>(
    '/im/messages/page',
    params,
    notifyRequestOptions
  );
}

export function sendConversationMessage(params: Api.RealNotify.ImSendMessageParams) {
  return realNotifyRequest.post<string | number, Api.RealNotify.ImSendMessageParams>(
    '/im/messages/send',
    params,
    notifyRequestOptions
  );
}
