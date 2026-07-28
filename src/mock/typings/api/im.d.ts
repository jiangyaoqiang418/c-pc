/**
 * 1-9 客服系统（IM 监管后台）模块类型（R-DATA-24 / R-DATA-25 / R-DATA-26 / R-MOD-13 / R-MOD-14 / R-MOD-15）。
 *
 * 三类会话：
 *   - PLATFORM_CS：平台客服（员工 ↔ 顾客）
 *   - PRESALE：售前咨询（买手 ↔ 顾客，关联 productId）
 *   - ORDER_GROUP：三方小群（顾客+买手+监管，关联 orderId，含 7 态生命周期）
 *
 * AI 风险检测：关键字规则（同源 src/views/im/hooks/use-risk-keywords.ts）+ 链上地址联动 blacklist /aml/address/check（R-MOD-14）。
 * 消息存证：im-messages.ts 内存池为全平台单一真实源（R-MOD-15）。
 */
declare namespace Api.Im {
  // ============================================================================
  // 枚举（R-DATA-24/25/26 硬枚举）
  // ============================================================================

  /** 会话类型（3 类） */
  type ConversationType = 'PLATFORM_CS' | 'PRESALE' | 'ORDER_GROUP';

  /** 会话状态（5 态） */
  type ConversationStatus = 'QUEUING' | 'ACTIVE' | 'TRANSFERRING' | 'CLOSED' | 'ARCHIVED';

  /** 三方群状态机（R-DATA-25 共 7 态） */
  type OrderGroupStatus =
    | 'PENDING' // 等待付款
    | 'ACTIVE' // 进行中
    | 'IN_DISPUTE' // 纠纷介入中
    | 'COOLING' // 售后冷却（默认 7 天）
    | 'ARCHIVING' // 归档中
    | 'ARCHIVED' // 已归档（只读）
    | 'DISSOLVED'; // 强制解散

  /** 坐席状态机（5 态） */
  type AgentStatus = 'ONLINE' | 'BUSY' | 'AWAY' | 'TRAINING' | 'OFFLINE';

  /** 参与者角色 */
  type ParticipantRole = 'customer' | 'shopper' | 'agent' | 'supervisor' | 'ai_bot';

  /** 消息类型硬枚举（R-DATA-24 共 18 类） */
  type MessageType =
    // 基础媒体（5）
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'file'
    // 卡片（3）
    | 'card-order'
    | 'card-product'
    | 'card-payment'
    // 系统（2）
    | 'system'
    | 'system-banner'
    // 业务事件（5）
    | 'order-paid'
    | 'order-shipped'
    | 'order-delivered'
    | 'price-change'
    | 'refund-request'
    // 风险（2）
    | 'risk-warning'
    | 'risk-intercept'
    // 售前合并（1）
    | 'presale-merged';

  /** 风险维度硬枚举（R-DATA-26 共 6 类） */
  type RiskCategory =
    | 'OFF_PLATFORM_PAYMENT'
    | 'EXTERNAL_LINK'
    | 'BLACKLIST_WALLET'
    | 'FRAUD_INDICATION'
    | 'SENSITIVE_CONTENT'
    | 'LOGISTICS_FAKE';

  type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type RiskReviewStatus = 'pending' | 'confirmed' | 'dismissed';
  type SkillGroup = 'general' | 'aftersale' | 'finance' | 'crypto';

  // ============================================================================
  // 主要数据模型
  // ============================================================================

  /** 参与者 */
  interface Participant {
    userId: number; // 关联 USERS.id（顾客/买手）或 employee id（客服/管理员）
    role: ParticipantRole;
    displayName: string;
    avatar?: string;
    joinedAt: string;
    leftAt?: string;
    isSilenced: boolean;
    isReadOnly: boolean; // supervisor 默认 true
  }

  /** 卡片消息 payload */
  interface CardPayload {
    title: string;
    subtitle?: string;
    coverUrl?: string;
    fields?: { label: string; value: string }[];
    linkText?: string;
    linkUrl?: string;
  }

  /** 消息（append-only / R-MOD-15 单一真实源） */
  interface Message {
    id: number;
    conversationId: number;
    type: MessageType;
    senderId: number; // 0 = ai_bot
    senderName: string;
    senderRole: ParticipantRole;
    content?: string;
    mediaUrl?: string;
    mediaName?: string;
    cardPayload?: CardPayload;
    eventPayload?: Record<string, unknown>;
    quoteMessageId?: number;
    mentionedIds?: number[];
    riskFlagId?: number; // 命中风险则关联
    isIntercepted: boolean;
    interceptReason?: string;
    /** 内容 hash（R-WORK-2 仅预埋字段，本期不计算） */
    contentHash?: string;
    sentAt: string;
    readByIds: number[];
  }

  /** 会话基类（三种会话共用） */
  interface ConversationBase {
    id: number;
    type: ConversationType;
    status: ConversationStatus;
    participants: Participant[];
    createdAt: string;
    activatedAt?: string;
    closedAt?: string;
    archivedAt?: string;
    riskLevel: RiskSeverity | 'NONE';
    riskFlagIds: number[];
    lastMessageAt?: string;
    lastMessagePreview?: string;
    unreadCount: number;
    messageCount: number;
  }

  /** 平台客服会话 */
  interface PlatformCsSession extends ConversationBase {
    type: 'PLATFORM_CS';
    customerId: number;
    customerName: string;
    assignedAgentId?: number;
    assignedAgentName?: string;
    skillGroup?: SkillGroup;
    queuePosition?: number;
    firstResponseSec?: number;
    resolutionSec?: number;
    satisfactionScore?: 1 | 2 | 3 | 4 | 5;
  }

  /** 售前会话 */
  interface PresaleSession extends ConversationBase {
    type: 'PRESALE';
    productId: number;
    productTitle: string;
    customerId: number;
    customerName: string;
    shopperId: number;
    shopperName: string;
    mergedToGroupId?: number;
    mergedAt?: string;
  }

  /** 三方群（R-DATA-25 状态机） */
  interface OrderGroup extends ConversationBase {
    type: 'ORDER_GROUP';
    orderId: string; // 'ORD-2026-XXXX' 伪造
    orderAmount: string;
    productId: number;
    productTitle: string;
    customerId: number;
    customerName: string;
    shopperId: number;
    shopperName: string;
    supervisorEmployeeIds: number[];
    aiAssisted: boolean;
    orderGroupStatus: OrderGroupStatus;
    fromPresaleId?: number;
    dissolveReason?: string;
  }

  /** 任意会话（discriminated union） */
  type AnyConversation = PlatformCsSession | PresaleSession | OrderGroup;

  /** 风险标记 */
  interface RiskFlag {
    id: number;
    messageId: number;
    conversationId: number;
    conversationType: ConversationType;
    category: RiskCategory;
    severity: RiskSeverity;
    triggeredBy: 'keyword' | 'aml_api' | 'manual';
    triggerDetail: string;
    flaggedAt: string;
    reviewStatus: RiskReviewStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNote?: string;
    actionTaken?: 'intercepted' | 'warned' | 'group_dissolved' | 'no_action';
    /** category=BLACKLIST_WALLET 时填（R-MOD-14 联动 blacklist） */
    amlCheckSnapshot?: Api.Blacklist.AmlCheckResult;
  }

  /** 客服坐席 */
  interface Agent {
    employeeId: number;
    userName: string;
    realName: string;
    isLeader: boolean;
    status: AgentStatus;
    skillGroups: SkillGroup[];
    currentSessionCount: number;
    maxConcurrent: number;
    totalSessionsToday: number;
    avgResponseSec: number;
    satisfactionScore: number;
    lastActiveAt: string;
  }

  /** 干预事件（append-only） */
  type InterventionAction =
    | 'create'
    | 'assign'
    | 'transfer'
    | 'intervene'
    | 'pull-in'
    | 'silence'
    | 'unsilence'
    | 'send-system'
    | 'change-status'
    | 'merge-presale'
    | 'dissolve';

  interface InterventionEvent {
    id: number;
    conversationId: number;
    action: InterventionAction;
    actor: string;
    actorId?: number;
    targetUserId?: number;
    note?: string;
    time: string;
  }

  /** 平台概览（顶部 5 卡） */
  interface ImStats {
    agents: { online: number; busy: number; away: number; offline: number };
    sessions: {
      activeCs: number;
      activePresale: number;
      activeGroup: number;
      queuingCs: number;
    };
    risk: { pendingReview: number; criticalCount: number; todayInterceptedCount: number };
    today: {
      newCsSessions: number;
      newPresaleSessions: number;
      newGroups: number;
      avgFirstResponseSec: number;
      avgResolutionSec: number;
    };
  }

  // ============================================================================
  // 请求参数
  // ============================================================================

  interface SessionListQuery {
    current?: number;
    size?: number;
    type?: ConversationType;
    statuses?: ConversationStatus[];
    keyword?: string;
    riskLevels?: RiskSeverity[];
    agentId?: number;
    customerId?: number;
    shopperId?: number;
    productId?: number;
    orderId?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface OrderGroupListQuery extends SessionListQuery {
    orderGroupStatuses?: OrderGroupStatus[];
    aiAssisted?: boolean;
  }

  interface MessageListQuery {
    conversationId: number;
    beforeMessageId?: number;
    limit?: number;
    types?: MessageType[];
    keyword?: string;
  }

  interface SendSystemMessageParams {
    conversationId: number;
    type: 'system' | 'system-banner';
    content: string;
  }

  interface InterveneParams {
    conversationId: number;
    mode: 'enter-readonly' | 'force-active' | 'exit';
    note?: string;
  }

  interface PullInParams {
    conversationId: number;
    userId: number;
    role: ParticipantRole;
    note: string;
  }

  interface SilenceParams {
    conversationId: number;
    userId: number;
    silenced: boolean;
    reason?: string;
  }

  interface TransferParams {
    conversationId: number;
    toAgentId: number;
    note: string;
  }

  interface AssignParams {
    conversationId: number;
    agentId: number;
  }

  interface CloseSessionParams {
    conversationId: number;
    reason: string;
  }

  interface MergePresaleParams {
    presaleId: number;
    orderGroupId: number;
  }

  interface DissolveGroupParams {
    groupId: number;
    reason: string;
  }

  interface RiskFlagListQuery {
    current?: number;
    size?: number;
    severities?: RiskSeverity[];
    categories?: RiskCategory[];
    reviewStatuses?: RiskReviewStatus[];
    conversationType?: ConversationType;
    fromAt?: string;
    toAt?: string;
    keyword?: string;
  }

  interface ReviewRiskParams {
    riskFlagId: number;
    decision: 'confirmed' | 'dismissed';
    note: string;
    action?: 'intercepted' | 'warned' | 'group_dissolved' | 'no_action';
  }

  interface AgentListQuery {
    statuses?: AgentStatus[];
    skillGroups?: SkillGroup[];
  }

  interface UpdateAgentStatusParams {
    employeeId: number;
    status: AgentStatus;
  }
}
