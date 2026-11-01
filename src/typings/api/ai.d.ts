declare namespace Api.Ai {
  interface ProductSnapshot {
    title: string;
    brief: string | null;
    image_ref: { bucket: string; file_path: string } | null;
    price_label: string;
    price_from: string;
    sales_text: string | null;
    seller_name: string | null;
    after_sale: string;
    action: { type: 'NAVIGATE'; target_type: 'commodity'; view: 'detail'; target_id: string; params: Record<string, never> };
  }
  interface ProductListCard { type: 'product_list'; items: ProductSnapshot[] }
  type CurrentProduct = { id: string; available: false } | {
    id: string; available: true; title: string; brief?: string; coverImage?: string;
    hasSku: boolean; priceFrom: string; priceTo: string; priceLabel: string; stock: string;
    salesCount?: string; sellerName?: string; afterSale?: string;
  };
  type HistoryCard = ProductListCard | { tool: string; data: CardData };
  interface ChatParams {
    message?: string;
    imageFileIds?: string[];
    conversationId?: string | null;
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
    images?: ImageReference[];
    messageId: string;
    requestId: string | null;
    clientMessageId: string | null;
    role: 'USER' | 'ASSISTANT';
    content: string;
    structuredData: { cards?: HistoryCard[] | null; truncated?: boolean | null } | null;
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
    | { event: 'product_cards'; data: EventBase & ProductListCard }
    | { event: 'question'; data: EventBase & { text: string; options: string[] } }
    | { event: 'done'; data: EventBase & { status: 'completed' } }
    | { event: 'error'; data: EventBase & { code: string; message: string; retryable: boolean } };

  interface ImageReference { fileId: string; imageUrl?: string; expireAt?: string | number | null }
  interface UploadedImage { id: string; url: string; expireAt: string | number | null }
}
