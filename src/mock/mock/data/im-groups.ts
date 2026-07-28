/**
 * 三方群池 ≥ 30 条（R-MOCK-2），含 7 态状态机分布（R-DATA-25）。
 *
 * 分布：8 ACTIVE / 5 IN_DISPUTE / 5 COOLING / 8 ARCHIVED / 2 DISSOLVED / 2 PENDING
 * orderId 内联伪造：`ORD-2026-XXXX`（4.10 order 模块上线后切换为真实数据源）
 * 关联：productId / customerId / shopperId 同 presale；supervisorEmployeeIds 默认 [13 (fanlu)]
 *
 * 含 8 个 fromPresaleId 引用 PRESALE_SESSIONS 中的「已合并」会话。
 * 模块加载时为每条群生成 10-20 条 messages 并 push 到 MESSAGES 池。
 */
import { findProductById } from './products';
import { findUserById } from './users';
import { appendMessage } from './im-messages';
import { PRESALE_SESSIONS, setMergedToGroup } from './im-presales';
import { findOrderBySeq } from './orders';

type OrderGroup = Api.Im.OrderGroup;
type Message = Api.Im.Message;

let groupIdCursor = 30000;
function nextGroupId(): number {
  groupIdCursor += 1;
  return groupIdCursor;
}

function dt(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

/**
 * 订单号生成（R-MOD-16 V2.2）：
 * 优先从 ORDERS 池读取真实 Order.code；如未找到则 fallback 到 ORD-2026-XXXXX 格式。
 */
function makeOrderId(seq: number): string {
  const order = findOrderBySeq(seq);
  if (order) return order.code;
  return `ORD-2026-${String(7000 + seq).padStart(5, '0')}`;
}

interface GroupSeed {
  productId: number;
  customerId: number;
  /** 订单金额（U） */
  amount: string;
  status: Api.Im.ConversationStatus;
  orderGroupStatus: Api.Im.OrderGroupStatus;
  daysAgo: number;
  /** 是否含 AI 风险消息演示 */
  withRiskMessage?: boolean;
  /** 是否包含黑钱包地址（演示 BLACKLIST_WALLET 维度） */
  withBlackAddress?: boolean;
  /** 是否来自售前合并（指向 PRESALE_SESSIONS 中 mergedToGroupId 为 0 的索引 0-7） */
  fromPresaleIndex?: number;
  dissolveReason?: string;
}

/** 8 ACTIVE / 5 IN_DISPUTE / 5 COOLING / 8 ARCHIVED / 2 DISSOLVED / 2 PENDING */
const SEEDS: GroupSeed[] = [
  // ===== 8 ACTIVE =====
  {
    productId: 1,
    customerId: 1,
    amount: '15800.00',
    status: 'ACTIVE',
    orderGroupStatus: 'ACTIVE',
    daysAgo: 0,
    withRiskMessage: true
  },
  {
    productId: 2,
    customerId: 2,
    amount: '12500.00',
    status: 'ACTIVE',
    orderGroupStatus: 'ACTIVE',
    daysAgo: 1,
    withBlackAddress: true
  },
  { productId: 3, customerId: 3, amount: '9800.00', status: 'ACTIVE', orderGroupStatus: 'ACTIVE', daysAgo: 0 },
  {
    productId: 4,
    customerId: 4,
    amount: '8200.00',
    status: 'ACTIVE',
    orderGroupStatus: 'ACTIVE',
    daysAgo: 1,
    withRiskMessage: true
  },
  { productId: 5, customerId: 7, amount: '2800.00', status: 'ACTIVE', orderGroupStatus: 'ACTIVE', daysAgo: 2 },
  { productId: 6, customerId: 8, amount: '1450.00', status: 'ACTIVE', orderGroupStatus: 'ACTIVE', daysAgo: 0 },
  { productId: 7, customerId: 10, amount: '4500.00', status: 'ACTIVE', orderGroupStatus: 'ACTIVE', daysAgo: 1 },
  {
    productId: 8,
    customerId: 11,
    amount: '12000.00',
    status: 'ACTIVE',
    orderGroupStatus: 'ACTIVE',
    daysAgo: 0,
    withRiskMessage: true
  },

  // ===== 5 IN_DISPUTE =====
  { productId: 9, customerId: 12, amount: '3200.00', status: 'ACTIVE', orderGroupStatus: 'IN_DISPUTE', daysAgo: 3 },
  {
    productId: 10,
    customerId: 15,
    amount: '850.00',
    status: 'ACTIVE',
    orderGroupStatus: 'IN_DISPUTE',
    daysAgo: 5,
    withBlackAddress: true
  },
  {
    productId: 11,
    customerId: 16,
    amount: '650.00',
    status: 'ACTIVE',
    orderGroupStatus: 'IN_DISPUTE',
    daysAgo: 4,
    withRiskMessage: true
  },
  { productId: 12, customerId: 18, amount: '4200.00', status: 'ACTIVE', orderGroupStatus: 'IN_DISPUTE', daysAgo: 6 },
  { productId: 13, customerId: 19, amount: '780.00', status: 'ACTIVE', orderGroupStatus: 'IN_DISPUTE', daysAgo: 2 },

  // ===== 5 COOLING =====
  { productId: 14, customerId: 20, amount: '5500.00', status: 'ACTIVE', orderGroupStatus: 'COOLING', daysAgo: 8 },
  { productId: 15, customerId: 1, amount: '28000.00', status: 'ACTIVE', orderGroupStatus: 'COOLING', daysAgo: 10 },
  {
    productId: 16,
    customerId: 2,
    amount: '6200.00',
    status: 'ACTIVE',
    orderGroupStatus: 'COOLING',
    daysAgo: 7,
    fromPresaleIndex: 0
  },
  {
    productId: 17,
    customerId: 3,
    amount: '2200.00',
    status: 'ACTIVE',
    orderGroupStatus: 'COOLING',
    daysAgo: 9,
    fromPresaleIndex: 1
  },
  {
    productId: 18,
    customerId: 4,
    amount: '180.00',
    status: 'ACTIVE',
    orderGroupStatus: 'COOLING',
    daysAgo: 8,
    fromPresaleIndex: 2
  },

  // ===== 8 ARCHIVED =====
  {
    productId: 19,
    customerId: 7,
    amount: '1200.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'ARCHIVED',
    daysAgo: 18,
    fromPresaleIndex: 3
  },
  {
    productId: 20,
    customerId: 8,
    amount: '3800.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'ARCHIVED',
    daysAgo: 22,
    fromPresaleIndex: 4
  },
  {
    productId: 21,
    customerId: 10,
    amount: '950.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'ARCHIVED',
    daysAgo: 25,
    fromPresaleIndex: 5
  },
  {
    productId: 22,
    customerId: 11,
    amount: '7800.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'ARCHIVED',
    daysAgo: 30,
    fromPresaleIndex: 6
  },
  {
    productId: 23,
    customerId: 12,
    amount: '350.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'ARCHIVED',
    daysAgo: 32,
    fromPresaleIndex: 7
  },
  { productId: 24, customerId: 15, amount: '4200.00', status: 'ARCHIVED', orderGroupStatus: 'ARCHIVED', daysAgo: 40 },
  { productId: 25, customerId: 16, amount: '2100.00', status: 'ARCHIVED', orderGroupStatus: 'ARCHIVED', daysAgo: 45 },
  { productId: 26, customerId: 18, amount: '8500.00', status: 'ARCHIVED', orderGroupStatus: 'ARCHIVED', daysAgo: 50 },

  // ===== 2 DISSOLVED =====
  {
    productId: 27,
    customerId: 19,
    amount: '3500.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'DISSOLVED',
    daysAgo: 15,
    dissolveReason: '买卖双方多次违规引导私下转账，平台强制解散此群以保护双方权益'
  },
  {
    productId: 28,
    customerId: 20,
    amount: '1800.00',
    status: 'ARCHIVED',
    orderGroupStatus: 'DISSOLVED',
    daysAgo: 28,
    dissolveReason: '买手长时间不发货且无合理解释，平台强制解散并启动退款流程'
  },

  // ===== 2 PENDING =====
  { productId: 29, customerId: 1, amount: '650.00', status: 'ACTIVE', orderGroupStatus: 'PENDING', daysAgo: 0 },
  { productId: 30, customerId: 2, amount: '1200.00', status: 'ACTIVE', orderGroupStatus: 'PENDING', daysAgo: 0 }
];

const SUPERVISOR_EMPLOYEE_ID = 13; // fanlu 客服组长

export const ORDER_GROUPS: Api.Im.OrderGroup[] = [];

function avatarChar(name: string): string {
  return name.charAt(0);
}

function buildMessages(group: OrderGroup, s: GroupSeed): Message[] {
  const seed = s;
  const customer = findUserById(seed.customerId)!;
  const shopper = findUserById(group.shopperId)!;
  const baseDays = seed.daysAgo;
  const list: Message[] = [];

  // 1. 群创建系统消息
  list.push(
    appendMessage({
      conversationId: group.id,
      type: 'system',
      senderId: 0,
      senderName: '系统',
      senderRole: 'ai_bot',
      content: `订单 #${group.orderId} 三方群已创建`,
      isIntercepted: false,
      sentAt: dt(baseDays, 9, 0),
      readByIds: []
    })
  );

  // 2. 订单卡片
  list.push(
    appendMessage({
      conversationId: group.id,
      type: 'card-order',
      senderId: 0,
      senderName: '系统',
      senderRole: 'ai_bot',
      cardPayload: {
        title: `订单 ${group.orderId}`,
        subtitle: group.productTitle,
        fields: [
          { label: '金额', value: `${group.orderAmount} U` },
          { label: '买手', value: shopper.nickname },
          { label: '顾客', value: customer.nickname }
        ]
      },
      isIntercepted: false,
      sentAt: dt(baseDays, 9, 1),
      readByIds: []
    })
  );

  // 3. 若来自售前合并：插入 presale-merged 消息
  if (seed.fromPresaleIndex !== undefined) {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'presale-merged',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: `已合并售前咨询记录（${baseDays + 2} 天前 - ${baseDays + 1} 天前），共 6 条消息`,
        eventPayload: { presaleId: group.fromPresaleId, messageCount: 6 },
        isIntercepted: false,
        sentAt: dt(baseDays, 9, 2),
        readByIds: []
      })
    );
  }

  if (seed.orderGroupStatus === 'PENDING') {
    // 仅等待付款，群刚建好
    return list;
  }

  // 4. 付款 / 业务事件
  list.push(
    appendMessage({
      conversationId: group.id,
      type: 'order-paid',
      senderId: 0,
      senderName: '系统',
      senderRole: 'ai_bot',
      content: `顾客已付款 ${group.orderAmount} U，等待买手发货`,
      eventPayload: { orderId: group.orderId, amount: group.orderAmount },
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 0),
      readByIds: []
    })
  );

  // 5. 顾客 / 买手对话
  list.push(
    appendMessage({
      conversationId: group.id,
      type: 'text',
      senderId: customer.id,
      senderName: customer.nickname,
      senderRole: 'customer',
      content: '已付款，麻烦尽快发货',
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 1),
      readByIds: []
    })
  );
  list.push(
    appendMessage({
      conversationId: group.id,
      type: 'text',
      senderId: shopper.id,
      senderName: shopper.nickname,
      senderRole: 'shopper',
      content: '好的，今天就采购，明天发货',
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 2),
      readByIds: []
    })
  );

  // 6. 风险消息演示
  if (seed.withRiskMessage) {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'text',
        senderId: customer.id,
        senderName: customer.nickname,
        senderRole: 'customer',
        content: '能不能我私转 USDT 给你，便宜一点',
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 3),
        readByIds: []
      })
    );
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'risk-warning',
        senderId: 0,
        senderName: 'AI 助手',
        senderRole: 'ai_bot',
        content: '⚠ AI 检测：当前消息涉嫌引导私下转账，请通过平台付款',
        eventPayload: { category: 'OFF_PLATFORM_PAYMENT', severity: 'HIGH' },
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 4),
        readByIds: []
      })
    );
  }
  if (seed.withBlackAddress) {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'text',
        senderId: customer.id,
        senderName: customer.nickname,
        senderRole: 'customer',
        // 包含一个 blacklist 模块 seed 中已知的黑钱包地址
        content: '钱包地址：TJ8Pq3Rk2Vn9Yw7Mt5Cz1Lf6Hj4Bs2Xn7q 转给我',
        isIntercepted: true,
        interceptReason: '链上地址命中黑名单（合约层封禁），平台已自动拦截',
        sentAt: dt(baseDays, 10, 3),
        readByIds: []
      })
    );
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'risk-intercept',
        senderId: 0,
        senderName: 'AI 助手',
        senderRole: 'ai_bot',
        content: '⚠ 检测到黑钱包地址，消息已被平台拦截',
        eventPayload: { category: 'BLACKLIST_WALLET', severity: 'CRITICAL' },
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 4),
        readByIds: []
      })
    );
  }

  // 7. 物流 / 签收
  if (
    seed.orderGroupStatus === 'IN_DISPUTE' ||
    seed.orderGroupStatus === 'COOLING' ||
    seed.orderGroupStatus === 'ARCHIVED' ||
    seed.orderGroupStatus === 'DISSOLVED'
  ) {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'order-shipped',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: '买手已发货，物流单号 SF1234567890',
        eventPayload: { trackingNumber: 'SF1234567890' },
        isIntercepted: false,
        sentAt: dt(baseDays - 1, 14, 0),
        readByIds: []
      })
    );
  }
  if (seed.orderGroupStatus === 'COOLING' || seed.orderGroupStatus === 'ARCHIVED') {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'order-delivered',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: '顾客已签收，进入售后冷却期',
        eventPayload: { deliveredAt: dt(baseDays - 2, 10, 0) },
        isIntercepted: false,
        sentAt: dt(baseDays - 2, 10, 0),
        readByIds: []
      })
    );
  }
  if (seed.orderGroupStatus === 'IN_DISPUTE') {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'system-banner',
        senderId: SUPERVISOR_EMPLOYEE_ID,
        senderName: '范璐',
        senderRole: 'supervisor',
        content: '⚠ 平台已介入此订单，请双方耐心配合调解',
        isIntercepted: false,
        sentAt: dt(baseDays - 1, 15, 0),
        readByIds: []
      })
    );
  }
  if (seed.orderGroupStatus === 'DISSOLVED') {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'system-banner',
        senderId: SUPERVISOR_EMPLOYEE_ID,
        senderName: '范璐',
        senderRole: 'supervisor',
        content: `⚠ 平台已强制解散此群：${seed.dissolveReason}`,
        isIntercepted: false,
        sentAt: dt(baseDays, 16, 0),
        readByIds: []
      })
    );
  }
  if (seed.orderGroupStatus === 'ARCHIVED') {
    list.push(
      appendMessage({
        conversationId: group.id,
        type: 'system',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: '订单已归档，群进入只读状态',
        isIntercepted: false,
        sentAt: dt(baseDays - 8, 10, 0),
        readByIds: []
      })
    );
  }

  return list;
}

function buildGroup(s: GroupSeed, seq: number): OrderGroup {
  const seed = s;
  const id = nextGroupId();
  const product = findProductById(seed.productId)!;
  const customer = findUserById(seed.customerId)!;
  const shopperId = product.sellerId;
  const shopper = findUserById(shopperId)!;
  const orderId = makeOrderId(seq);
  const participants: Api.Im.Participant[] = [
    {
      userId: customer.id,
      role: 'customer',
      displayName: customer.nickname,
      avatar: avatarChar(customer.nickname),
      joinedAt: dt(seed.daysAgo, 9, 0),
      isSilenced: false,
      isReadOnly: false
    },
    {
      userId: shopper.id,
      role: 'shopper',
      displayName: shopper.nickname,
      avatar: avatarChar(shopper.nickname),
      joinedAt: dt(seed.daysAgo, 9, 0),
      isSilenced: false,
      isReadOnly: false
    },
    {
      userId: SUPERVISOR_EMPLOYEE_ID,
      role: 'supervisor',
      displayName: '范璐',
      avatar: '范',
      joinedAt: dt(seed.daysAgo, 9, 0),
      isSilenced: false,
      isReadOnly: true
    }
  ];

  // 回填 fromPresaleId
  let fromPresaleId: number | undefined;
  if (seed.fromPresaleIndex !== undefined) {
    // PRESALE_SESSIONS 中 mergedToGroupId=0 的占位是 index 15-22（即第 16-23 个 seed）
    const presaleIdx = 15 + seed.fromPresaleIndex;
    const presale = PRESALE_SESSIONS[presaleIdx];
    if (presale) {
      fromPresaleId = presale.id;
      setMergedToGroup(presale.id, id);
    }
  }

  const group: OrderGroup = {
    id,
    type: 'ORDER_GROUP',
    status: seed.status,
    participants,
    createdAt: dt(seed.daysAgo, 9, 0),
    activatedAt: seed.orderGroupStatus !== 'PENDING' ? dt(seed.daysAgo, 10, 0) : undefined,
    closedAt:
      seed.orderGroupStatus === 'ARCHIVED' || seed.orderGroupStatus === 'DISSOLVED'
        ? dt(seed.daysAgo - 8, 10, 0)
        : undefined,
    archivedAt: seed.orderGroupStatus === 'ARCHIVED' ? dt(seed.daysAgo - 8, 10, 0) : undefined,
    riskLevel: ((): Api.Im.RiskSeverity | 'NONE' => {
      if (seed.withBlackAddress) return 'CRITICAL';
      if (seed.withRiskMessage) return 'HIGH';
      return 'NONE';
    })(),
    riskFlagIds: [],
    orderId,
    orderAmount: seed.amount,
    productId: product.id,
    productTitle: product.title,
    customerId: customer.id,
    customerName: customer.nickname,
    shopperId: shopper.id,
    shopperName: shopper.nickname,
    supervisorEmployeeIds: [SUPERVISOR_EMPLOYEE_ID],
    aiAssisted: seed.withRiskMessage || seed.withBlackAddress || false,
    orderGroupStatus: seed.orderGroupStatus,
    fromPresaleId,
    dissolveReason: seed.dissolveReason,
    unreadCount: 0,
    messageCount: 0
  };

  const msgs = buildMessages(group, seed);
  if (msgs.length) {
    const last = msgs[msgs.length - 1];
    group.lastMessageAt = last.sentAt;
    group.lastMessagePreview = (last.content || '').slice(0, 30);
    group.messageCount = msgs.length;
  }
  return group;
}

function runSeed() {
  ORDER_GROUPS.length = 0;
  SEEDS.forEach((s, i) => ORDER_GROUPS.push(buildGroup(s, i + 1)));
}
runSeed();

// PRODUCTS / MESSAGES 引用已通过 import 加载（ESM eager）

export function findGroup(id: number): OrderGroup | undefined {
  return ORDER_GROUPS.find(g => g.id === id);
}

export function findGroupByOrderId(orderId: string): OrderGroup | undefined {
  return ORDER_GROUPS.find(g => g.orderId === orderId);
}

export function appendGroup(g: Omit<OrderGroup, 'id'>): OrderGroup {
  const next: OrderGroup = { id: nextGroupId(), ...g };
  ORDER_GROUPS.unshift(next);
  return next;
}
