/**
 * 平台客服会话池 ≥ 30 条（R-MOCK-2）。
 *
 * 分布：10 ACTIVE / 5 QUEUING / 10 CLOSED / 5 ARCHIVED
 * 关联：customerId → mock/data/users.ts；assignedAgentId → mock/data/im-agents.ts
 *
 * 模块加载时为每条会话生成 8-15 条 messages 并 push 到 MESSAGES 池。
 */
import { findUserById } from './users';
import { AGENTS } from './im-agents';
import { appendMessage } from './im-messages';

type PlatformCsSession = Api.Im.PlatformCsSession;
type Message = Api.Im.Message;

let sessionIdCursor = 10000;
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
  customerId: number;
  status: Api.Im.ConversationStatus;
  agentId?: number;
  skillGroup?: Api.Im.SkillGroup;
  queuePosition?: number;
  daysAgo: number;
  satisfactionScore?: 1 | 2 | 3 | 4 | 5;
  firstResponseSec?: number;
  resolutionSec?: number;
  /** 顾客提的问题题目（用于生成 mock 对话） */
  topic: string;
  /** 触发风险（演示用） */
  riskTopic?: 'private_pay' | 'external_link' | 'normal';
}

const SEEDS: SessionSeed[] = [
  // ===== 10 ACTIVE =====
  {
    customerId: 1,
    status: 'ACTIVE',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 0,
    topic: '商品什么时候发货',
    riskTopic: 'normal'
  },
  {
    customerId: 2,
    status: 'ACTIVE',
    agentId: 6,
    skillGroup: 'aftersale',
    daysAgo: 0,
    topic: '收到的商品有破损要怎么处理',
    riskTopic: 'normal'
  },
  {
    customerId: 3,
    status: 'ACTIVE',
    agentId: 6,
    skillGroup: 'finance',
    daysAgo: 1,
    topic: '充值的 U 没到账',
    riskTopic: 'normal'
  },
  {
    customerId: 4,
    status: 'ACTIVE',
    agentId: 13,
    skillGroup: 'crypto',
    daysAgo: 0,
    topic: 'TRC20 和 ERC20 区别是什么',
    riskTopic: 'normal'
  },
  {
    customerId: 7,
    status: 'ACTIVE',
    agentId: 14,
    skillGroup: 'general',
    daysAgo: 1,
    topic: '能不能私下加微信谈一下',
    riskTopic: 'private_pay'
  },
  {
    customerId: 8,
    status: 'ACTIVE',
    agentId: 14,
    skillGroup: 'aftersale',
    daysAgo: 2,
    topic: '7 天无理由退货怎么办',
    riskTopic: 'normal'
  },
  {
    customerId: 10,
    status: 'ACTIVE',
    agentId: 14,
    skillGroup: 'general',
    daysAgo: 0,
    topic: 'KYC 一直没通过',
    riskTopic: 'normal'
  },
  {
    customerId: 11,
    status: 'ACTIVE',
    agentId: 14,
    skillGroup: 'general',
    daysAgo: 1,
    topic: '积分能换什么',
    riskTopic: 'normal'
  },
  {
    customerId: 12,
    status: 'ACTIVE',
    agentId: 14,
    skillGroup: 'crypto',
    daysAgo: 0,
    topic: '能发我一个收款码吗',
    riskTopic: 'private_pay'
  },
  {
    customerId: 15,
    status: 'ACTIVE',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 1,
    topic: '物流追踪链接 https://example.com/track',
    riskTopic: 'external_link'
  },

  // ===== 5 QUEUING =====
  {
    customerId: 16,
    status: 'QUEUING',
    skillGroup: 'general',
    queuePosition: 1,
    daysAgo: 0,
    topic: '想咨询商品规格',
    riskTopic: 'normal'
  },
  {
    customerId: 18,
    status: 'QUEUING',
    skillGroup: 'aftersale',
    queuePosition: 2,
    daysAgo: 0,
    topic: '商品退货流程',
    riskTopic: 'normal'
  },
  {
    customerId: 19,
    status: 'QUEUING',
    skillGroup: 'finance',
    queuePosition: 3,
    daysAgo: 0,
    topic: '出金审核要多久',
    riskTopic: 'normal'
  },
  {
    customerId: 20,
    status: 'QUEUING',
    skillGroup: 'general',
    queuePosition: 4,
    daysAgo: 0,
    topic: 'VIP 等级如何提升',
    riskTopic: 'normal'
  },
  {
    customerId: 1,
    status: 'QUEUING',
    skillGroup: 'crypto',
    queuePosition: 5,
    daysAgo: 0,
    topic: '稳定币兑换汇率',
    riskTopic: 'normal'
  },

  // ===== 10 CLOSED =====
  {
    customerId: 2,
    status: 'CLOSED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 3,
    satisfactionScore: 5,
    firstResponseSec: 25,
    resolutionSec: 540,
    topic: '订单查询',
    riskTopic: 'normal'
  },
  {
    customerId: 3,
    status: 'CLOSED',
    agentId: 13,
    skillGroup: 'crypto',
    daysAgo: 5,
    satisfactionScore: 5,
    firstResponseSec: 18,
    resolutionSec: 720,
    topic: 'TRC20 提现教程',
    riskTopic: 'normal'
  },
  {
    customerId: 4,
    status: 'CLOSED',
    agentId: 14,
    skillGroup: 'aftersale',
    daysAgo: 7,
    satisfactionScore: 4,
    firstResponseSec: 60,
    resolutionSec: 1200,
    topic: '售后赔付方案',
    riskTopic: 'normal'
  },
  {
    customerId: 7,
    status: 'CLOSED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 10,
    satisfactionScore: 4,
    firstResponseSec: 38,
    resolutionSec: 900,
    topic: '商品图片不清晰',
    riskTopic: 'normal'
  },
  {
    customerId: 8,
    status: 'CLOSED',
    agentId: 14,
    skillGroup: 'general',
    daysAgo: 12,
    satisfactionScore: 3,
    firstResponseSec: 90,
    resolutionSec: 2400,
    topic: '物流配送时间长',
    riskTopic: 'normal'
  },
  {
    customerId: 10,
    status: 'CLOSED',
    agentId: 15,
    skillGroup: 'finance',
    daysAgo: 15,
    satisfactionScore: 5,
    firstResponseSec: 45,
    resolutionSec: 600,
    topic: 'KYC 通过后多久能用',
    riskTopic: 'normal'
  },
  {
    customerId: 11,
    status: 'CLOSED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 18,
    satisfactionScore: 2,
    firstResponseSec: 180,
    resolutionSec: 1800,
    topic: '客服响应太慢',
    riskTopic: 'normal'
  },
  {
    customerId: 12,
    status: 'CLOSED',
    agentId: 13,
    skillGroup: 'crypto',
    daysAgo: 20,
    satisfactionScore: 5,
    firstResponseSec: 22,
    resolutionSec: 480,
    topic: 'OKX 充值教程',
    riskTopic: 'normal'
  },
  {
    customerId: 15,
    status: 'CLOSED',
    agentId: 14,
    skillGroup: 'aftersale',
    daysAgo: 22,
    satisfactionScore: 1,
    firstResponseSec: 30,
    resolutionSec: 3600,
    topic: '商品破损赔付争议',
    riskTopic: 'normal'
  },
  {
    customerId: 16,
    status: 'CLOSED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 25,
    satisfactionScore: 4,
    firstResponseSec: 50,
    resolutionSec: 1500,
    topic: '账号被冻结申诉',
    riskTopic: 'normal'
  },

  // ===== 5 ARCHIVED =====
  {
    customerId: 18,
    status: 'ARCHIVED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 35,
    satisfactionScore: 5,
    firstResponseSec: 28,
    resolutionSec: 700,
    topic: '充值未到账已解决',
    riskTopic: 'normal'
  },
  {
    customerId: 19,
    status: 'ARCHIVED',
    agentId: 14,
    skillGroup: 'aftersale',
    daysAgo: 40,
    satisfactionScore: 4,
    firstResponseSec: 65,
    resolutionSec: 1100,
    topic: '7 天无理由完成',
    riskTopic: 'normal'
  },
  {
    customerId: 20,
    status: 'ARCHIVED',
    agentId: 13,
    skillGroup: 'finance',
    daysAgo: 50,
    satisfactionScore: 5,
    firstResponseSec: 40,
    resolutionSec: 800,
    topic: '提现已到账',
    riskTopic: 'normal'
  },
  {
    customerId: 1,
    status: 'ARCHIVED',
    agentId: 6,
    skillGroup: 'general',
    daysAgo: 60,
    satisfactionScore: 4,
    firstResponseSec: 55,
    resolutionSec: 1400,
    topic: '已封存',
    riskTopic: 'normal'
  },
  {
    customerId: 2,
    status: 'ARCHIVED',
    agentId: 14,
    skillGroup: 'general',
    daysAgo: 70,
    satisfactionScore: 3,
    firstResponseSec: 80,
    resolutionSec: 2000,
    topic: '产品咨询完结',
    riskTopic: 'normal'
  }
];

/** 主真实源 */
export const PLATFORM_CS_SESSIONS: Api.Im.PlatformCsSession[] = [];

function avatarChar(name: string): string {
  return name.charAt(0);
}

function buildMessages(session: PlatformCsSession, s: SessionSeed): Message[] {
  const seed = s;
  const created: Message[] = [];
  const customer = findUserById(seed.customerId)!;
  const agent = seed.agentId ? AGENTS.find(a => a.employeeId === seed.agentId) : undefined;
  const baseDays = seed.daysAgo;

  // 1. 系统消息（会话创建）
  created.push(
    appendMessage({
      conversationId: session.id,
      type: 'system',
      senderId: 0,
      senderName: '系统',
      senderRole: 'ai_bot',
      content: '客户已进入会话，请稍候。',
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 0),
      readByIds: []
    })
  );

  // 2. 顾客开场
  created.push(
    appendMessage({
      conversationId: session.id,
      type: 'text',
      senderId: customer.id,
      senderName: customer.nickname,
      senderRole: 'customer',
      content: seed.topic,
      isIntercepted: false,
      sentAt: dt(baseDays, 10, 1),
      readByIds: agent ? [agent.employeeId] : []
    })
  );

  if (seed.status === 'QUEUING') {
    // 排队中：只到这里
    return created;
  }

  // 3. 客服回复（若已分配）
  if (agent) {
    const REPLY_BY_GROUP: Record<Api.Im.SkillGroup, string> = {
      finance: '您好，已为您查询账户记录，请提供订单号',
      crypto: '您好，加密资产相关问题请咨询，我会一一解答',
      aftersale: '您好，售后问题已为您接入，请描述具体情况',
      general: `您好，我是客服 ${agent.realName}，请问有什么可以帮您？`
    };
    const reply = REPLY_BY_GROUP[seed.skillGroup || 'general'];
    created.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: agent.employeeId,
        senderName: agent.realName,
        senderRole: 'agent',
        content: reply,
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 2),
        readByIds: [customer.id]
      })
    );
  }

  // 4. 顾客追问 + 客服解答（演示对话）
  const followups: { role: 'customer' | 'agent'; text: string }[] = [];
  if (seed.riskTopic === 'private_pay') {
    followups.push({ role: 'customer', text: '我想私下给你转账，方便吗？' });
    followups.push({ role: 'agent', text: '抱歉，平台禁止私下交易，请通过平台付款链接' });
  } else if (seed.riskTopic === 'external_link') {
    followups.push({ role: 'customer', text: '我把链接发给你看下 https://example.com/track' });
    followups.push({ role: 'agent', text: '请尽量发文字描述，外链需要审核' });
  } else {
    followups.push({ role: 'agent', text: '已为您查询，请稍候 30 秒' });
    followups.push({ role: 'customer', text: '好的，谢谢' });
    if (seed.status === 'CLOSED' || seed.status === 'ARCHIVED') {
      followups.push({ role: 'agent', text: '已为您处理完成，请确认' });
      followups.push({ role: 'customer', text: '已确认，感谢' });
    }
  }
  followups.forEach((f, idx) => {
    const sender = f.role === 'customer' ? customer : agent;
    if (!sender) return;
    const sId = f.role === 'customer' ? (sender as Api.User.UserRecord).id : (sender as Api.Im.Agent).employeeId;
    const sName = f.role === 'customer' ? (sender as Api.User.UserRecord).nickname : (sender as Api.Im.Agent).realName;
    created.push(
      appendMessage({
        conversationId: session.id,
        type: 'text',
        senderId: sId,
        senderName: sName,
        senderRole: f.role,
        content: f.text,
        isIntercepted: false,
        sentAt: dt(baseDays, 10, 3 + idx),
        readByIds: []
      })
    );
  });

  // 5. 关闭系统消息
  if (seed.status === 'CLOSED' || seed.status === 'ARCHIVED') {
    created.push(
      appendMessage({
        conversationId: session.id,
        type: 'system',
        senderId: 0,
        senderName: '系统',
        senderRole: 'ai_bot',
        content: '会话已结束，感谢您的咨询。',
        isIntercepted: false,
        sentAt: dt(baseDays, 11, 0),
        readByIds: []
      })
    );
  }

  return created;
}

function buildSession(s: SessionSeed): PlatformCsSession {
  const seed = s;
  const id = nextSessionId();
  const customer = findUserById(seed.customerId)!;
  const agent = seed.agentId ? AGENTS.find(a => a.employeeId === seed.agentId) : undefined;
  const participants: Api.Im.Participant[] = [
    {
      userId: customer.id,
      role: 'customer',
      displayName: customer.nickname,
      avatar: avatarChar(customer.nickname),
      joinedAt: dt(seed.daysAgo, 10, 0),
      isSilenced: false,
      isReadOnly: false
    }
  ];
  if (agent) {
    participants.push({
      userId: agent.employeeId,
      role: 'agent',
      displayName: agent.realName,
      avatar: avatarChar(agent.realName),
      joinedAt: dt(seed.daysAgo, 10, 1),
      isSilenced: false,
      isReadOnly: false
    });
  }

  const session: PlatformCsSession = {
    id,
    type: 'PLATFORM_CS',
    status: seed.status,
    participants,
    createdAt: dt(seed.daysAgo, 10, 0),
    activatedAt: seed.status !== 'QUEUING' ? dt(seed.daysAgo, 10, 2) : undefined,
    closedAt: seed.status === 'CLOSED' || seed.status === 'ARCHIVED' ? dt(seed.daysAgo, 11, 0) : undefined,
    archivedAt: seed.status === 'ARCHIVED' ? dt(seed.daysAgo, 11, 30) : undefined,
    riskLevel: ((): Api.Im.RiskSeverity | 'NONE' => {
      if (seed.riskTopic === 'private_pay') return 'HIGH';
      if (seed.riskTopic === 'external_link') return 'MEDIUM';
      return 'NONE';
    })(),
    riskFlagIds: [],
    customerId: customer.id,
    customerName: customer.nickname,
    assignedAgentId: agent?.employeeId,
    assignedAgentName: agent?.realName,
    skillGroup: seed.skillGroup,
    queuePosition: seed.queuePosition,
    firstResponseSec: seed.firstResponseSec,
    resolutionSec: seed.resolutionSec,
    satisfactionScore: seed.satisfactionScore,
    unreadCount: 0,
    messageCount: 0,
    lastMessageAt: undefined,
    lastMessagePreview: undefined
  };

  const msgs = buildMessages(session, seed);
  if (msgs.length) {
    const last = msgs[msgs.length - 1];
    session.lastMessageAt = last.sentAt;
    session.lastMessagePreview = (last.content || '').slice(0, 30);
    session.messageCount = msgs.length;
  }
  return session;
}

function runSeed() {
  PLATFORM_CS_SESSIONS.length = 0;
  SEEDS.forEach(s => PLATFORM_CS_SESSIONS.push(buildSession(s)));
}
runSeed();

// USERS / MESSAGES 引用已通过 import 加载（ESM eager）

export function findPlatformCsSession(id: number): PlatformCsSession | undefined {
  return PLATFORM_CS_SESSIONS.find(s => s.id === id);
}

export function appendPlatformCsSession(s: Omit<PlatformCsSession, 'id'>): PlatformCsSession {
  const next: PlatformCsSession = { id: nextSessionId(), ...s };
  PLATFORM_CS_SESSIONS.unshift(next);
  return next;
}
