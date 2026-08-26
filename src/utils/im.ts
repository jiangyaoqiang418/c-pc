export function sameBusinessId(left?: string | number, right?: string | number) {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

export function compareBusinessId(left: string | number, right: string | number) {
  const a = String(left);
  const b = String(right);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const normalizedA = a.replace(/^0+/, '') || '0';
    const normalizedB = b.replace(/^0+/, '') || '0';
    if (normalizedA.length !== normalizedB.length) return normalizedA.length - normalizedB.length;
    return normalizedA.localeCompare(normalizedB);
  }
  return a.localeCompare(b);
}

export function mergeMessages(
  current: Api.RealNotify.ImMessageVO[],
  incoming: Api.RealNotify.ImMessageVO | Api.RealNotify.ImMessageVO[]
) {
  const result = [...current];
  const additions = Array.isArray(incoming) ? incoming : [incoming];

  additions.forEach(message => {
    const index = result.findIndex(item =>
      sameBusinessId(item.id, message.id) ||
      (!!message.clientMsgId && item.clientMsgId === message.clientMsgId)
    );
    if (index >= 0) result[index] = { ...result[index], ...message, pending: false, failed: false };
    else result.push(message);
  });

  return result.sort((left, right) => compareBusinessId(left.id, right.id));
}

export function latestServerMessageId(messages: Api.RealNotify.ImMessageVO[]) {
  const serverMessages = messages.filter(message => !String(message.id).startsWith('local:'));
  return serverMessages.at(-1)?.id;
}

export function conversationImageUrls(messages: Api.RealNotify.ImMessageVO[]) {
  return Array.from(new Set(messages
    .filter(message => !message.recalled && String(message.msgType || '').toUpperCase() === 'IMAGE' && Boolean(message.mediaUrl))
    .map(message => message.mediaUrl as string)));
}

export function imagePreviewIndex(imageUrls: string[], url: string) {
  return imageUrls.indexOf(url);
}

export function createClientMessageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createOptimisticMessage(
  params: Api.RealNotify.ImSendMessageParams,
  sender: { id?: string | number; name?: string; avatar?: string; role?: string }
): Api.RealNotify.ImMessageVO {
  return {
    id: `local:${params.clientMsgId}`,
    conversationId: params.conversationId,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    senderRole: sender.role,
    msgType: params.msgType,
    content: params.content,
    mediaFileId: params.mediaFileId,
    clientMsgId: params.clientMsgId,
    createdAt: String(Date.now()),
    pending: true
  };
}

export function isRecallAvailable(message: Api.RealNotify.ImMessageVO, currentUserId?: string | number) {
  if (message.pending || message.failed || message.recalled) return false;
  if (!sameBusinessId(message.senderId, currentUserId)) return false;
  if (['SYSTEM', 'ORDER_CARD'].includes(String(message.msgType || '').toUpperCase())) return false;
  const createdAt = Number(message.createdAt || 0);
  return createdAt > 0 && Date.now() - createdAt <= 2 * 60 * 1000;
}
