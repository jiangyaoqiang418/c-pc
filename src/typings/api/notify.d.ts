declare namespace Api.RealNotify {
  type ConversationBizType = 'ORDER' | 'PRESALE' | 'CUSTOMER_SERVICE' | string;
  type ConversationRole = 'CUSTOMER' | 'SELLER' | 'ADMIN' | string;
  type MessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'ORDER_CARD' | 'SYSTEM' | string;
  type SendMessageType = 'TEXT' | 'IMAGE' | 'VOICE';
  type SocketEventType = 'READY' | 'IM_MESSAGE' | 'IM_READ' | 'IM_RECALL' | 'NOTIFICATION' | 'PONG' | string;

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
    bizType?: ConversationBizType;
    bizId?: string | number;
    myRole?: ConversationRole;
    lastMessageAt?: string | number;
    lastMessagePreview?: string;
    lastReadMessageId?: string | number;
    unreadCount?: number;
    peerName?: string;
    peerAvatar?: string;
    orderNo?: string;
    orderStatus?: string;
    orderStatusText?: string;
    productTitle?: string;
    productImage?: string;
    amount?: string | number;
  }

  interface ImMessageVO {
    id: string | number;
    conversationId: string | number;
    senderId?: string | number;
    senderRole?: ConversationRole;
    senderName?: string;
    senderAvatar?: string;
    msgType?: MessageType;
    content?: string;
    mediaUrl?: string;
    duration?: number;
    eventType?: string;
    params?: Record<string, unknown>;
    clientMsgId?: string;
    recalled?: boolean;
    createdAt?: string | number;
    pending?: boolean;
    failed?: boolean;
  }

  interface ImMessagePageQuery extends PageQuery {
    conversationId: string | number;
  }

  interface ImSendMessageParams {
    conversationId: string | number;
    msgType: SendMessageType;
    content?: string;
    mediaUrl?: string;
    duration?: number;
    clientMsgId?: string;
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
  }
}
