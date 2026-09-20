declare namespace Api.RealNotify {
  type ConversationType = 'ORDER_GROUP' | 'SUPPORT' | string;
  type InterveneStatus = 'NONE' | 'REQUESTED' | 'HANDLING';
  type ConversationRole = 'CUSTOMER' | 'SELLER' | 'ADMIN' | string;
  type MessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO' | 'ORDER_CARD' | 'SYSTEM' | string;
  type SendMessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO';
  type SocketEventType = 'READY' | 'IM_MESSAGE' | 'IM_READ' | 'IM_RECALL' | 'IM_INTERVENE' | 'NOTIFICATION' | 'PONG' | string;

  interface PageQuery {
    pageNo?: number;
    pageSize?: number;
  }

  interface PageResult<T> {
    pageNo?: number;
    pageSize?: number;
    total: number;
    records: T[];
  }

  interface NotificationVO {
    id: string | number;
    channel?: string;
    templateCode?: string;
    title?: string;
    content?: string;
    bizType?: string;
    bizId?: string | number;
    deptId?: string | number;
    readFlag?: boolean;
    createdAt?: string | number;
  }

  interface NotificationPageQuery extends PageQuery {
    unreadOnly?: boolean;
  }

  interface NotificationReadParams {
    id: string | number;
  }

  interface ImConversationVO {
    id: string | number;
    title?: string;
    type?: ConversationType;
    customerId?: string | number;
    sellerId?: string | number;
    myRole?: ConversationRole;
    lastMessageAt?: string | number;
    lastMessagePreview?: string;
    lastReadMessageId?: string | number;
    unreadCount?: number;
    peerName?: string;
    peerAvatar?: string;
    interveneStatus?: InterveneStatus;
    interveneReason?: string;
    interveneBy?: string | number;
    interveneAt?: string | number;
    interveneOrderId?: string | number;
    orderId?: string | number;
    orderNo?: string;
    orderStatus?: string;
    orderStatusText?: string;
    productTitle?: string;
    productImage?: string;
    amount?: string | number;
    activeOrderCount?: number;
  }
  interface ImConversationOrder { orderId: string | number; orderNo?: string; orderStatus?: string; orderStatusText?: string; active?: boolean; productTitle?: string; productImage?: string; amount?: string | number; lastEventAt?: string | number; }
  interface ImInterveneParams { conversationId: string | number; orderId?: string | number; reason?: string; }
  interface ImInterveneEvent { action: 'INTERVENE_REQUESTED' | 'INTERVENE_CLOSED'; conversationId: string | number; interveneStatus?: InterveneStatus; interveneBy?: string | number; reason?: string; orderId?: string | number; at?: string | number; }

  interface ImMessageVO {
    id: string | number;
    conversationId: string | number;
    senderId?: string | number;
    senderRole?: ConversationRole;
    senderName?: string;
    senderAvatar?: string;
    msgType?: MessageType;
    content?: string | null;
    mediaUrl?: string | null;
    duration?: number | null;
    mediaFileId?: string | number | null;
    coverFileId?: string | number | null;
    coverUrl?: string | null;
    eventType?: string;
    params?: Record<string, unknown> | null;
    clientMsgId?: string;
    recalled?: boolean;
    createdAt?: string | number;
    pending?: boolean;
    failed?: boolean;
  }

  interface ImMessagePageQuery extends PageQuery {
    conversationId: string | number;
    markRead?: false;
  }

  interface ImSendMessageParams {
    conversationId: string | number;
    msgType: SendMessageType;
    content?: string;
    mediaFileId?: string | number;
    coverFileId?: string | number;
    clientMsgId?: string;
  }

  interface ImFileUploadResult {
    id: string | number;
    scene?: string;
    url?: string;
    filePath?: string;
    bucket?: string;
    originalName?: string;
    contentType?: string;
    size?: number;
    duration?: number;
    expireAt?: string | number;
  }

  interface ImIncrementalQuery {
    conversationId: string | number;
    sinceId?: string | number;
    limit?: number;
  }

  interface ImReadParams {
    conversationId: string | number;
    lastReadMessageId: string | number;
  }

  interface ImRecallParams {
    id: string | number;
  }

  interface ImReadEvent {
    conversationId: string | number;
    lastReadMessageId: string | number;
    readerUserId?: string | number;
    userId?: string | number;
  }

  interface ImRecallEvent {
    id?: string | number;
    messageId?: string | number;
    conversationId?: string | number;
    message?: ImMessageVO;
  }

  interface NotificationSocketPayload extends NotificationVO {
    unreadCount?: number;
    notification?: NotificationVO;
  }

  interface SocketFrame<T = unknown> {
    type: SocketEventType;
    data?: T;
    payload?: T;
    message?: T;
    notification?: T;
    unreadCount?: number;
    userId?: string | number;
    serverTime?: string | number;
    heartbeatIntervalMs?: number;
  }
}
