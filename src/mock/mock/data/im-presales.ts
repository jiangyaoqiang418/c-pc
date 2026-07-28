/**
 * 售前会话池 ≥ 30 条（R-MOCK-2）。
 *
 * 分布：15 ACTIVE 未合并 / 8 ACTIVE 已合并到三方群 / 5 CLOSED / 2 ARCHIVED
 * 关联：productId → mock/data/products.ts；customerId/shopperId → mock/data/users.ts
 *
 * 模块加载时为每条会话生成 5–10 条 messages 并 push 到 MESSAGES 池。
 */
import { findProductById } from './products';
import { findUserById } from './users';
import { appendMessage } from './im-messages';

type PresaleSession = Api.Im.PresaleSession;
type Message = Api.Im.Message;

let sessionIdCursor = 20000;
function nextSessionId(): number {
  sessionIdCursor += 1;
  return sessionIdCursor;
}

function dt(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

interface SessionSeed {
  productId: number;
  customerId: number;
  /** 若 ACTIVE+已合并，提供 mergedToGroupId（指向 im-groups 中的 group.id） */
  mergedToGroupId?: number;
  status: Api.Im.ConversationStatus;
  daysAgo: number;
  /** 顾客咨询的核心问题 */
  question: string;
  /** 是否触发风险（私下转账） */
  triggerRisk?: boolean;
}

const SEEDS: SessionSeed[] = [
  // ===== 15 ACTIVE 未合并 =====
  { productId: 1, customerId: 1, status: 'ACTIVE', daysAgo: 0, question: 'M3 Pro 和 M2 Pro 性能差距大吗' },
  { productId: 2, customerId: 2, status: 'ACTIVE', daysAgo: 0, question: 'ThinkPad X1 有美版可选吗' },
  { productId: 3, customerId: 3, status: 'ACTIVE', daysAgo: 1, question: 'iPhone 15 Pro Max 钛原色现货吗' },
  { customerId: 4, productId: 4, status: 'ACTIVE', daysAgo: 0, question: 'Mate 60 Pro+ 是国行还是港版' },
  { customerId: 5, productId: 5, status: 'ACTIVE', daysAgo: 1, question: 'SK-II 神仙水保质期到什么时候' },
  { customerId: 7, productId: 6, status: 'ACTIVE', daysAgo: 2, question: '小棕瓶精华是不是日上免税店发货' },
  { customerId: 8, productId: 7, status: 'ACTIVE', daysAgo: 1, question: 'V15 Detect 颜色都有什么' },
  { customerId: 10, productId: 8, status: 'ACTIVE', daysAgo: 0, question: 'Chicago AJ1 尺码有 42 吗' },
  { customerId: 11, productId: 9, status: 'ACTIVE', daysAgo: 1, question: 'Samba 现货可发货时间' },
  {
    customerId: 12,
    productId: 10,
    status: 'ACTIVE',
    daysAgo: 2,
    question: 'Aptamil 白金版 1 段保质期',
    triggerRisk: true
  },
  { customerId: 15, productId: 11, status: 'ACTIVE', daysAgo: 3, question: 'Lindt 巧克力礼盒能寄家吗' },
  { customerId: 16, productId: 12, status: 'ACTIVE', daysAgo: 1, question: '羽绒服尺码偏大还是偏小' },
  { customerId: 18, productId: 13, status: 'ACTIVE', daysAgo: 0, question: '瑜伽裤洗后会缩水吗' },
  { customerId: 19, productId: 14, status: 'ACTIVE', daysAgo: 2, question: 'WH-1000XM5 有 ANC 模式吗' },
  { customerId: 20, productId: 15, status: 'ACTIVE', daysAgo: 1, question: 'EOS R5 含原装电池套装吗' },

  // ===== 8 ACTIVE 已合并到三方群 =====（mergedToGroupId 留空，im-groups 加载后回填）
  {
    customerId: 1,
    productId: 16,
    status: 'ACTIVE',
    mergedToGroupId: 0,
    daysAgo: 5,
    question: 'Apple Watch 9 表带可换吗'
  },
  { customerId: 2, productId: 17, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 6, question: '乐高歼星舰是双盒装吗' },
  {
    customerId: 3,
    productId: 18,
    status: 'ACTIVE',
    mergedToGroupId: 0,
    daysAgo: 7,
    question: '1984 是哪个版本的英文原版'
  },
  { customerId: 4, productId: 19, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 4, question: '该商品发货地址' },
  { customerId: 7, productId: 20, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 8, question: '保修期限' },
  { customerId: 8, productId: 21, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 5, question: '是否支持 7 天无理由' },
  { customerId: 10, productId: 22, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 6, question: '颜色选择' },
  { customerId: 11, productId: 23, status: 'ACTIVE', mergedToGroupId: 0, daysAgo: 9, question: '是否含配件' },

  // ===== 5 CLOSED =====
  { customerId: 12, productId: 24, status: 'CLOSED', daysAgo: 15, question: '已经下单' },
  { customerId: 15, productId: 25, status: 'CLOSED', daysAgo: 20, question: '已下单，谢谢' },
  { customerId: 16, productId: 26, status: 'CLOSED', daysAgo: 18, question: '太贵了，先不买了' },
  { customerId: 18, productId: 27, status: 'CLOSED', daysAgo: 25, question: '考虑下' },
  { customerId: 19, productId: 28, status: 'CLOSED', daysAgo: 22, question: '不需要了' },

  // ===== 2 ARCHIVED =====
  { customerId: 20, productId: 29, status: 'ARCHIVED', daysAgo: 40, question: '已归档' },
  { customerId: 1, productId: 30, status: 'ARCHIVED', daysAgo: 45, question: '长期未活动' }
];

/** 主真实源 */
export const PRESALE_SESSIONS: Api.Im.PresaleSession[] = [];

function avatarChar(name: string): string {
  return name.charAt(0);
}

function buildMessages(session: PresaleSession, s: SessionSeed): Message[] {
  const seed = s;
  const customer = findUserById(seed.customerId)!;
  const shopper = findUserById(session.shopperId)!;
  const baseDays = seed.daysAgo;
  const list: Message[] = [];

  // 1. 顾客咨询
  list.push(
    appendMessage({
      conversationId: session.id,
      type: 'text',
      senderId: customer.id,
      senderName: customer.nickname,
      senderRole: 'customer',
      content: seed.question,
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 0),
      readByIds: [shopper.id]
    })
  );

  // 2. 商品卡片（系统注入）
  list.push(
    appendMessage({
      conversationId: session.id,
      type: 'card-product',
      senderId: 0,
      senderName: '系统',
      senderRole: 'ai_bot',
      cardPayload: {
        title: session.productTitle,
        subtitle: `商品编号 #${session.productId}`,
        fields: [{ label: '类目', value: '海外代购' }]
      },
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 1),
      readByIds: []
    })
  );

  // 3. 买手回复
  list.push(
    appendMessage({
      conversationId: session.id,
      type: 'text',
      senderId: shopper.id,
      senderName: shopper.nickname,
      senderRole: 'shopper',
      content: '您好，这款商品现货充足，可以为您发货',
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 2),
      readByIds: [customer.id]
    })
  );

  // 4. 议价 / 风险触发
  if (seed.triggerRisk) {
    list.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: customer.id,
        senderName: customer.nickname,
        senderRole: 'customer',
        content: '能不能直接微信转账给你，便宜一点？',
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 3),
        readByIds: []
      })
    );
    list.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: shopper.id,
        senderName: shopper.nickname,
        senderRole: 'shopper',
        content: '抱歉，平台禁止私下交易，请走平台付款',
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 4),
        readByIds: []
      })
    );
  } else {
    list.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: customer.id,
        senderName: customer.nickname,
        senderRole: 'customer',
        content: '能便宜一些吗？',
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 3),
        readByIds: []
      })
    );
    list.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: shopper.id,
        senderName: shopper.nickname,
        senderRole: 'shopper',
        content: '已经是最优惠价格了，可以为您附赠小礼品',
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 4),
        readByIds: []
      })
    );
  }

  if (seed.status === 'CLOSED' || seed.status === 'ARCHIVED') {
    list.push(
      appendMessage({
        conversationId: session.id,
        type: 'system',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: '会话已结束',
        isIntercepted: false,
        sentAt: dt(baseDays, 11, 0),
        readByIds: []
      })
    );
  }
  return list;
}

function buildSession(s: SessionSeed): PresaleSession {
  const seed = s;
  const id = nextSessionId();
  const product = findProductById(seed.productId)!;
  const customer = findUserById(seed.customerId)!;
  const shopperId = product.sellerId;
  const shopper = findUserById(shopperId)!;
  const participants: Api.Im.Participant[] = [
    {
      userId: customer.id,
      role: 'customer',
      displayName: customer.nickname,
      avatar: avatarChar(customer.nickname),
      joinedAt: dt(seed.daysAgo, 10, 0),
      isSilenced: false,
      isReadOnly: false
    },
    {
      userId: shopper.id,
      role: 'shopper',
      displayName: shopper.nickname,
      avatar: avatarChar(shopper.nickname),
      joinedAt: dt(seed.daysAgo, 10, 0),
      isSilenced: false,
      isReadOnly: false
    }
  ];

  const session: PresaleSession = {
    id,
    type: 'PRESALE',
    status: seed.status,
    participants,
    createdAt: dt(seed.daysAgo, 10, 0),
    activatedAt: dt(seed.daysAgo, 10, 0),
    closedAt: seed.status === 'CLOSED' || seed.status === 'ARCHIVED' ? dt(seed.daysAgo, 11, 0) : undefined,
    archivedAt: seed.status === 'ARCHIVED' ? dt(seed.daysAgo, 11, 30) : undefined,
    riskLevel: seed.triggerRisk ? 'HIGH' : 'NONE',
    riskFlagIds: [],
    productId: product.id,
    productTitle: product.title,
    customerId: customer.id,
    customerName: customer.nickname,
    shopperId: shopper.id,
    shopperName: shopper.nickname,
    mergedToGroupId: undefined, // 由 im-groups 加载完成后回填
    mergedAt: seed.mergedToGroupId !== undefined ? dt(seed.daysAgo, 11, 30) : undefined,
    unreadCount: 0,
    messageCount: 0
  };

  const msgs = buildMessages(session, seed);
  if (msgs.length) {
    const last = msgs[msgs.length - 1];
    session.lastMessageAt = last.sentAt;
    session.lastMessagePreview = (last.content || '商品咨询').slice(0, 30);
    session.messageCount = msgs.length;
  }
  return session;
}

function runSeed() {
  PRESALE_SESSIONS.length = 0;
  SEEDS.forEach(s => PRESALE_SESSIONS.push(buildSession(s)));
}
runSeed();

// PRODUCTS / MESSAGES 引用已通过 import 加载（ESM eager）

export function findPresaleSession(id: number): PresaleSession | undefined {
  return PRESALE_SESSIONS.find(s => s.id === id);
}

export function appendPresaleSession(s: Omit<PresaleSession, 'id'>): PresaleSession {
  const next: PresaleSession = { id: nextSessionId(), ...s };
  PRESALE_SESSIONS.unshift(next);
  return next;
}

/** 标记某售前会话已合并到三方群（由 im-groups.ts 加载时回填） */
export function setMergedToGroup(presaleId: number, groupId: number): void {
  const s = findPresaleSession(presaleId);
  if (!s) return;
  s.mergedToGroupId = groupId;
}
