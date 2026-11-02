import { realNotifyRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';
import { parseSupportRoute } from '@/utils/human-support';

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

export async function fetchSupportConversation() {
  const route = await realNotifyRequest.post<Api.RealNotify.ImConversationVO>('/im/conversations/support', undefined, notifyRequestOptions);
  const version: unknown = route.routingVersion;
  // 安全小整数仅在 API 边界无损转成版本字符串；Long 原文由请求层保留。
  if (typeof version === 'number' && Number.isSafeInteger(version) && version >= 0) return { ...route, routingVersion:String(version) };
  return route;
}

export async function fetchSupportRoute(options: { signal?: AbortSignal } = {}) {
  return parseSupportRoute(await realNotifyRequest.get<unknown>('/im/conversations/support/route', { ...notifyRequestOptions, ...options, showError: false }));
}

export async function applyHumanSupport(conversationId: string, reason?: string) {
  await realNotifyRequest.post('/im/conversations/intervene', { conversationId, reason }, { ...notifyRequestOptions, showError: false, numericSuccessOnly: true });
}

/** 咨询无需先下单，同一顾客与买手由服务端复用三方群。 */
export async function fetchConsultConversation(sellerId: string) {
  const conversation = await realNotifyRequest.post<Api.RealNotify.ImConversationVO>('/im/conversations/consult', { sellerId }, notifyRequestOptions);
  if (!conversation || !/^\d+$/.test(String(conversation.id || '')) || conversation.type !== 'ORDER_GROUP'
    || String(conversation.sellerId) !== sellerId || conversation.myRole !== 'CUSTOMER') {
    throw new Error('咨询会话信息异常，请重新进入');
  }
  return conversation;
}

export function fetchConversationOrders(conversationId: string | number, includeHistory = false, options: { signal?: AbortSignal } = {}) {
  return realNotifyRequest.get<Api.RealNotify.ImConversationOrder[]>('/im/conversations/orders', {
    params: { conversationId, includeHistory }, ...notifyRequestOptions, signal: options.signal
  });
}

export function requestConversationIntervention(params: Api.RealNotify.ImInterveneParams) {
  return realNotifyRequest.post<Api.RealNotify.ImConversationVO, Api.RealNotify.ImInterveneParams>('/im/conversations/intervene', params, notifyRequestOptions);
}

export async function fetchConversationMessages(params: Api.RealNotify.ImMessagePageQuery, options: { signal?: AbortSignal } = {}) {
  const page = await realNotifyRequest.postQuery<Api.RealNotify.PageResult<Api.RealNotify.ImMessageVO>, Api.RealNotify.ImMessagePageQuery & { markRead: false }>(
    '/im/messages/page',
    { ...params, markRead: false },
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

export function uploadImFile(file: File, scene: 'IM_IMAGE' | 'IM_VOICE' | 'IM_VIDEO', duration?: number, conversationId?: string | number) {
  const form = new FormData();
  form.append('file', file);
  return realNotifyRequest.post<Api.RealNotify.ImFileUploadResult, FormData>('/im/files/upload', form, {
    params: { scene, duration, conversationId },
    ...notifyRequestOptions
  });
}
