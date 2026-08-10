declare namespace Api.RealNotify {
  type ConversationBizType = 'ORDER' | 'PRESALE' | 'CUSTOMER_SERVICE' | string;
  type ConversationRole = 'CUSTOMER' | 'SELLER' | 'ADMIN' | string;
  type MessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'ORDER_CARD' | 'SYSTEM' | string;

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
    unreadCount?: number;
  }

  interface ImMessageVO {
    id: string | number;
    conversationId: string | number;
    senderId?: string | number;
    senderRole?: ConversationRole;
    msgType?: MessageType;
    content?: string;
    mediaUrl?: string;
    duration?: number;
    createdAt?: string | number;
  }

  interface ImMessagePageQuery extends PageQuery {
    conversationId: string | number;
  }

  interface ImSendMessageParams {
    conversationId: string | number;
    msgType: MessageType;
    content?: string;
    mediaUrl?: string;
    duration?: number;
  }
}
