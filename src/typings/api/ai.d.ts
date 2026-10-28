declare namespace Api.Ai {
  interface ChatParams {
    message: string;
    conversationId: string | null;
    clientMessageId?: string;
  }

  type CardKind = 'products' | 'product' | 'order' | 'balance' | 'recharge' | 'withdraw' | 'order_pay';

  type Timestamp = string | number | null;
  interface Session {
    conversationId: string;
    title: string;
    status: 'ACTIVE' | 'ARCHIVED';
    messageCount: number;
    lastMessageAt: Timestamp;
    lastMessagePreview: string | null;
    createdAt: Timestamp;
    current: boolean;
  }
  interface SessionPage { rows: Session[]; hasMore: boolean; nextCursor: string | null; }
  interface SessionState { conversationId: string; current: boolean; }
  interface PageQuery { cursor?: string | null; limit: number; }
  interface MessageQuery extends PageQuery { conversationId: string; }
  type MessageStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  interface Message {
    messageId: string;
    requestId: string | null;
    clientMessageId: string | null;
    role: 'USER' | 'ASSISTANT';
    content: string;
    structuredData: { cards?: { tool: string; data: CardData }[]; truncated?: boolean } | null;
    status: MessageStatus;
    errorCode: string | null;
    createdAt: Timestamp;
    completedAt: Timestamp;
  }
  interface MessagePage { conversationId: string; rows: Message[]; hasMore: boolean; nextCursor: string | null; }

  interface CardData {
    code: string;
    /** 非成功卡片可只提供 code，不包含结果类型或记录。 */
    kind?: string;
    rows?: Record<string, unknown>[];
    has_more?: boolean;
    next_before_id?: string | null;
    /** SSE 时间保持 JSON 数值，与 REST 毫秒字符串不同。 */
    queried_at?: number;
  }

  interface EventBase {
    request_id: string;
    seq: number;
  }

  type ChatEvent =
    | { event: 'start'; data: EventBase & { conversation_id: string } }
    | { event: 'status' | 'delta'; data: EventBase & { text: string } }
    | { event: 'card'; data: EventBase & { tool: string; data: CardData } }
    | { event: 'done'; data: EventBase & { status: 'completed' } }
    | { event: 'error'; data: EventBase & { code: string; message: string; retryable: boolean } };
}
