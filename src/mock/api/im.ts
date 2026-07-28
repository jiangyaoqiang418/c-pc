/**
 * IM mock API：会话 / 消息 / 发送。
 *
 * 仅覆盖三方群（ORDER_GROUP）+ 平台客服（PLATFORM_CS）+ 售前（PRESALE）展示。
 * 不创建新会话——直接返回 seed 池中已存在的会话。
 */
import { ORDER_GROUPS, findGroupByOrderId } from '../mock/data/im-groups';
import { MESSAGES, appendMessage, findMessagesByConversation } from '../mock/data/im-messages';
import { PLATFORM_CS_SESSIONS } from '../mock/data/im-platform-cs';
import { PRESALE_SESSIONS } from '../mock/data/im-presales';
import { findUserById } from '../mock/data/users';
import { delay } from '../utils/mock-delay';

void MESSAGES;
void ORDER_GROUPS;

export async function fetchOrderGroupByOrderCode(orderCode: string) {
  return delay(findGroupByOrderId(orderCode), 150);
}

/** 列出当前用户的所有三方群 */
export async function fetchMyOrderGroups(userId: number) {
  return delay(
    ORDER_GROUPS.filter(g => g.customerId === userId || g.shopperId === userId).slice(0, 30),
    200
  );
}

export async function fetchMessages(conversationId: number) {
  return delay(findMessagesByConversation(conversationId), 200);
}

export interface SendMessageParams {
  conversationId: number;
  senderId: number;
  type?: Api.Im.MessageType;
  content?: string;
  mediaUrl?: string;
}

export async function sendMessageMock(p: SendMessageParams): Promise<Api.Im.Message> {
  const sender = findUserById(p.senderId);
  const msg = appendMessage({
    conversationId: p.conversationId,
    type: p.type || 'text',
    senderId: p.senderId,
    senderName: sender?.nickname || '我',
    senderRole: sender?.isBuyer ? 'shopper' : 'customer',
    content: p.content,
    mediaUrl: p.mediaUrl,
    isIntercepted: false,
    sentAt: new Date().toISOString(),
    readByIds: [p.senderId]
  });
  return delay(msg, 200);
}

export async function fetchPlatformCsConversation(userId: number) {
  const conv =
    PLATFORM_CS_SESSIONS.find(c => c.customerId === userId) || PLATFORM_CS_SESSIONS[0];
  return delay(conv, 150);
}

export async function fetchPresaleConversations(userId: number) {
  return delay(PRESALE_SESSIONS.filter(p => p.customerId === userId).slice(0, 20), 150);
}
