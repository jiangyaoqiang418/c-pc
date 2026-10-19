declare namespace Api.Ai {
  interface ChatParams {
    message: string;
    conversationId: string | null;
  }

  type CardKind = 'product' | 'order' | 'balance' | 'recharge' | 'withdraw' | 'order_pay';

  interface CardData {
    code: string;
    kind: string;
    rows: Record<string, unknown>[];
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
