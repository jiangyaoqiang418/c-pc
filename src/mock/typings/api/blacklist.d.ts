/**
 * 1-6 封控管理（黑名单管理）模块类型（R-DATA-21 / R-DATA-22 / R-DATA-23 / R-MOD-11 / R-MOD-12）。
 *
 * 三类黑名单：
 *   - 买手黑名单（BuyerBlacklistEntry）：限制上架，仍可作为顾客购买；不联动钱包；
 *   - 顾客黑名单（CustomerBlacklistEntry）：禁止买卖 + 强制整账户冻结 + 出金须人工审核（R-MOD-11 单向联动）；
 *   - 链上黑钱包（ChainBlacklistEntry）：地址级封禁，多链（TRC20/ERC20/BSC）+ AML 三层风险评估
 *     （合约层 / 制裁名单 / AML 评分 → 综合 decision.action）；性质同 GoPlus / MistTrack / OKLink 风格契约。
 *
 * 事件溯源（R-DATA-21）：每条条目挂 history: BlacklistEvent[] append-only；任何 add/remove/note/sync 必须 append。
 */
declare namespace Api.Blacklist {
  /** 黑名单条目当前状态 */
  type EntryStatus = 'active' | 'removed';

  /** 操作动作（事件日志用） */
  type EventAction = 'add' | 'remove' | 'note' | 'sync';

  /** 三类目标对象 */
  type TargetType = 'buyer' | 'customer' | 'address';

  // ============================================================================
  // 买手黑名单
  // ============================================================================
  /** 仅限制上架/卖货；仍可作为顾客购买（doc 1-6 明文） */
  interface BuyerBlacklistEntry {
    id: number;
    userId: number; // 关联 USERS.id（IDs 21-35 段）
    userName: string;
    reason: string; // 加入原因（必填 ≥10 字）
    status: EntryStatus;
    addedBy: string; // actor name
    addedById?: number; // actor id（后台员工，可空）
    addedAt: string; // ISO
    removedBy?: string;
    removedAt?: string;
    removedReason?: string;
    history: BlacklistEvent[]; // append-only
  }

  // ============================================================================
  // 顾客黑名单
  // ============================================================================
  /** 顾客黑名单加入时冻结的整账户余额快照（便于审计还原） */
  interface WalletFreezeSnapshot {
    available: string;
    nonWithdrawable: string;
    frozenOrder: string;
    frozenRisk: string;
    totalAtFreeze: string; // 7 桶合计
    freezeAt: string;
  }

  /** 禁止买卖 + 强制整账户冻结 + 出金须人工审核 */
  interface CustomerBlacklistEntry {
    id: number;
    userId: number; // 关联 USERS.id（IDs 1-35 任意；通常 IDs 1-20 顾客）
    userName: string;
    reason: string;
    status: EntryStatus;
    addedBy: string;
    addedById?: number;
    addedAt: string;
    removedBy?: string;
    removedAt?: string;
    removedReason?: string;
    /** 触发冻结时的余额快照 */
    walletFreezeSnapshot?: WalletFreezeSnapshot;
    /** 联动写入的钱包流水 id（RISK_FREEZE） */
    freezeTxnId?: number;
    /** 移出时联动写入的解冻流水 id（RISK_UNFREEZE） */
    unfreezeTxnId?: number;
    history: BlacklistEvent[];
  }

  // ============================================================================
  // 链上黑钱包
  // ============================================================================
  type Chain = 'TRC20' | 'ERC20' | 'BSC';
  type Asset = 'USDT' | 'USDC';

  /** AML 风险等级 */
  type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /** 命中来源（GoPlus 风格扁平 flag） */
  interface RiskFlags {
    isMalicious: boolean;
    sanctions: boolean; // 制裁名单
    mixerRelated: boolean; // 混币器关联
    darkweb: boolean; // 暗网
    phishing: boolean;
    theft: boolean;
    fraud: boolean;
    moneyLaundering: boolean;
    contractBlacklisted: boolean; // USDT/USDC 合约层 isBlackListed=true
  }

  /** 综合决策（业务规则层输出） */
  interface AmlDecision {
    action: 'ALLOW' | 'MANUAL_REVIEW' | 'BLOCK';
    reason?: 'CONTRACT_BLACKLISTED' | 'SANCTIONED' | 'HIGH_AML_SCORE' | 'MANUAL_ADD' | 'AMOUNT_THRESHOLD';
    holdUntil?: string; // 延迟到账时间（ISO）
    requireKycUpgrade?: boolean;
  }

  /** 命中来源类型 */
  type ChainSource = 'CONTRACT' | 'SANCTIONS' | 'AML_API' | 'MANUAL';

  /** 链上黑钱包条目 */
  interface ChainBlacklistEntry {
    id: number;
    address: string;
    chain: Chain;
    asset?: Asset; // 主要资产（USDT/USDC，可不指定）
    source: ChainSource;
    sourceLabel: string; // 'Tether Contract' / 'OFAC SDN' / 'GoPlus' / '管理员手工'
    riskLevel: RiskLevel;
    score: number; // 0-100
    flags: RiskFlags;
    labels: string[]; // ['Mixer', 'Hacker', 'OFAC SDN'] 等
    entity?: string; // 'Tornado Cash' / null
    /** 反向关联：如该地址在历史入金中出现过，关联用户 id */
    relatedUserIds: number[];
    reason: string;
    status: EntryStatus;
    addedBy: string;
    addedById?: number;
    addedAt: string;
    removedBy?: string;
    removedAt?: string;
    removedReason?: string;
    history: BlacklistEvent[];
  }

  // ============================================================================
  // 审计事件（append-only · R-DATA-21）
  // ============================================================================
  interface BlacklistEvent {
    id: number;
    targetType: TargetType;
    targetId: number; // BlacklistEntry.id
    targetLabel: string; // 冗余便于检索：用户名 / 链上地址前 6 后 4
    action: EventAction;
    actor: string;
    actorId?: number;
    time: string;
    note?: string;
    /** 关联钱包流水 id（顾客黑名单冻结/解冻时填） */
    relatedTxnId?: number;
  }

  // ============================================================================
  // AML 检查结果（入金前置检查接口返回 · R-DATA-23 三层契约）
  // ============================================================================
  interface ContractCheckResult {
    checked: boolean;
    isBlacklisted: boolean;
    source: 'TETHER_CONTRACT' | 'CIRCLE_CONTRACT' | 'SKIPPED';
  }

  interface SanctionsCheckResult {
    checked: boolean;
    isSanctioned: boolean;
    source: 'CHAINALYSIS_ORACLE' | 'OFAC_LIST' | 'SKIPPED';
    lists: string[]; // ['OFAC_SDN', 'UN', 'EU'] 等
  }

  interface AmlScoreResult {
    checked: boolean;
    score: number; // 0-100
    riskLevel: RiskLevel;
    source: 'GOPLUS' | 'MISTTRACK' | 'OKLINK' | 'MANUAL_DB' | 'SKIPPED';
    flags: RiskFlags;
    labels: string[];
    entity?: string;
  }

  interface AmlCheckResult {
    requestId: string;
    address: string;
    chain: Chain;
    asset?: Asset;
    amount?: string;
    timestamp: string;
    contractCheck: ContractCheckResult;
    sanctionsCheck: SanctionsCheckResult;
    amlScore: AmlScoreResult;
    decision: AmlDecision;
  }

  // ============================================================================
  // 请求参数
  // ============================================================================
  interface ListBuyerQuery {
    current?: number;
    size?: number;
    keyword?: string; // 用户名/手机/email
    statuses?: EntryStatus[];
    fromAt?: string;
    toAt?: string;
  }
  // 顾客黑名单查询与买手一致字段
  type ListCustomerQuery = ListBuyerQuery;

  interface ListChainQuery {
    current?: number;
    size?: number;
    keyword?: string; // 地址搜索（前缀 / 后缀 / 完整 / 实体名）
    chains?: Chain[];
    sources?: ChainSource[];
    riskLevels?: RiskLevel[];
    statuses?: EntryStatus[];
    fromAt?: string;
    toAt?: string;
  }

  interface AddBuyerParams {
    userId: number;
    reason: string;
  }
  interface AddCustomerParams {
    userId: number;
    reason: string;
  }
  interface AddChainParams {
    address: string;
    chain: Chain;
    asset?: Asset;
    riskLevel: RiskLevel;
    score?: number;
    flags?: Partial<RiskFlags>;
    labels?: string[];
    entity?: string;
    reason: string;
  }
  interface RemoveParams {
    id: number;
    reason: string; // 移出原因（必填 ≥5 字）
  }

  interface AmlCheckParams {
    address: string;
    chain: Chain;
    asset?: Asset;
    amount?: string; // 入金金额（用于阈值判断）
    checkLevel?: 'BASIC' | 'FULL';
  }

  interface EventListQuery {
    current?: number;
    size?: number;
    targetTypes?: TargetType[];
    actions?: EventAction[];
    actorId?: number;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }

  /** 链上黑名单同步演示（模拟 GoPlus webhook） */
  interface SyncResult {
    added: number;
    items: ChainBlacklistEntry[];
  }

  // ============================================================================
  // 平台概览（顶部统计带）
  // ============================================================================
  interface BlacklistStats {
    buyer: { active: number; removed: number; addedLast7d: number };
    customer: { active: number; removed: number; addedLast7d: number };
    chain: {
      active: number;
      byChain: Record<Chain, number>;
      byRiskLevel: Record<RiskLevel, number>;
    };
    amlChecksLast7d: number; // 本周入金检查次数
    blockedLast7d: number; // 本周拦截次数
  }

  /** 用户 mini（关联用户列表使用） */
  interface RelatedUserMini {
    id: number;
    nickname: string;
    email: string;
    isBuyer: boolean;
    kycStatus: Api.User.KycStatus;
    status: Api.User.Status;
    vipLevel: Api.User.VipLevel;
    inCustomerBlacklist: boolean; // 是否已在顾客黑名单
  }
}
