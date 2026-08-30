import { realNotifyRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';

// notify 服务的鉴权问题不应清空整站登录态；调用方仍会收到真实错误并自行展示。
const notifyRequestOptions = { skipAuthRedirect: true };

export async function fetchNotifications(params: Api.RealNotify.NotificationPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realNotifyRequest.postQuery<Api.RealNotify.PageResult<Api.RealNotify.NotificationVO>, Api.RealNotify.NotificationPageQuery>(
    '/notifications/page',
    params,
    { ...notifyRequestOptions, signal: options.signal }
  );
  return { ...page, records: requireArray<Api.RealNotify.NotificationVO>(page.records, '通知分页记录'), total: toPageTotal(page.total) };
}

export function fetchUnreadNotificationCount(options: { signal?: AbortSignal } = {}) {
  return realNotifyRequest.get<number>('/notifications/unread/count', { ...notifyRequestOptions, signal: options.signal });
}

export function markNotificationRead(params: Api.RealNotify.NotificationReadParams) {
  return realNotifyRequest.put<boolean, Api.RealNotify.NotificationReadParams>('/notifications/read', params, notifyRequestOptions);
}

export function markAllNotificationsRead() {
  return realNotifyRequest.put<boolean>('/notifications/read-all', undefined, notifyRequestOptions);
}

export function deleteNotification(id: string | number) {
  return realNotifyRequest.delete<boolean>('/notifications/delete', {
    params: { id },
    ...notifyRequestOptions
  });
}

export function clearNotifications() {
  return realNotifyRequest.delete<boolean>('/notifications/clear', notifyRequestOptions);
}

export async function fetchConversations(params: Api.RealNotify.PageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realNotifyRequest.postQuery<Api.RealNotify.PageResult<Api.RealNotify.ImConversationVO>, Api.RealNotify.PageQuery>(
    '/im/conversations/page',
    params,
    { ...notifyRequestOptions, signal: options.signal }
  );
  return { ...page, records: requireArray<Api.RealNotify.ImConversationVO>(page.records, '会话分页记录'), total: toPageTotal(page.total) };
}

export function fetchOrderConversation(orderId: string | number, options: { signal?: AbortSignal } = {}) {
  return realNotifyRequest.get<Api.RealNotify.ImConversationVO>('/im/conversations/by-order', {
    params: { orderId },
    ...notifyRequestOptions,
    signal: options.signal
  });
}

export async function fetchConversationMessages(params: Api.RealNotify.ImMessagePageQuery, options: { signal?: AbortSignal } = {}) {
  const page = await realNotifyRequest.post<Api.RealNotify.PageResult<Api.RealNotify.ImMessageVO>, Api.RealNotify.ImMessagePageQuery>(
    '/im/messages/page',
    params,
    { ...notifyRequestOptions, signal: options.signal }
  );
  return { ...page, records: requireArray<Api.RealNotify.ImMessageVO>(page.records, '消息分页记录'), total: toPageTotal(page.total) };
}

export async function fetchIncrementalMessages(params: Api.RealNotify.ImIncrementalQuery, options: { signal?: AbortSignal } = {}) {
  const records = await realNotifyRequest.get<Api.RealNotify.ImMessageVO[]>('/im/messages/incr', {
    params: { ...params },
    ...notifyRequestOptions,
    signal: options.signal
  });
  return requireArray<Api.RealNotify.ImMessageVO>(records, '增量消息');
}

export function fetchUnreadMessageCount(options: { signal?: AbortSignal } = {}) {
  return realNotifyRequest.get<number>('/im/unread/count', { ...notifyRequestOptions, signal: options.signal });
}

export function markConversationRead(params: Api.RealNotify.ImReadParams) {
  return realNotifyRequest.put<boolean, Api.RealNotify.ImReadParams>('/im/messages/read', params, notifyRequestOptions);
}

export function recallConversationMessage(params: Api.RealNotify.ImRecallParams) {
  return realNotifyRequest.put<boolean, Api.RealNotify.ImRecallParams>('/im/messages/recall', params, notifyRequestOptions);
}

export function deleteConversation(id: string | number) {
  return realNotifyRequest.delete<boolean>('/im/conversations/delete', {
    params: { id },
    ...notifyRequestOptions
  });
}

export function sendConversationMessage(params: Api.RealNotify.ImSendMessageParams, options: { showError?: boolean } = {}) {
  return realNotifyRequest.post<Api.RealNotify.ImMessageVO, Api.RealNotify.ImSendMessageParams>(
    '/im/messages/send',
    params,
    { ...notifyRequestOptions, ...options }
  );
}

export function uploadImFile(file: File, scene: 'IM_IMAGE' | 'IM_VOICE', duration?: number, conversationId?: string | number) {
  const form = new FormData();
  form.append('file', file);
  return realNotifyRequest.post<Api.RealNotify.ImFileUploadResult, FormData>('/im/files/upload', form, {
    params: { scene, duration, conversationId },
    ...notifyRequestOptions
  });
}
