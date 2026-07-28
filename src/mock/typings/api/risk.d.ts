/**
 * 风控管理类型（R-DATA-36）。复用 Api.Im.RiskCategory 6 类硬枚举（R-DATA-26）。
 */
declare namespace Api.Risk {
  /** 规则类型 6 类硬枚举（R-DATA-36） */
  type RuleType = 'amount_threshold' | 'velocity' | 'keyword' | 'device' | 'ip_velocity' | 'aml_score';

  type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';
  type RuleAction = 'log' | 'flag_review' | 'auto_block' | 'auto_freeze';
  type RuleStatus = 'active' | 'paused' | 'archived';

  interface RuleRecord {
    id: number;
    code: string;
    name: string;
    type: RuleType;
    severity: RuleSeverity;
    action: RuleAction;
    status: RuleStatus;
    config: Record<string, any>;
    description?: string;
    createdAt: string;
    updatedAt: string;
    hitsLast7d?: number; // 派生
  }

  type WordCategory = 'fraud' | 'sensitive' | 'illegal' | 'spam';
  interface SensitiveWord {
    id: number;
    word: string;
    category: WordCategory;
    severity: RuleSeverity;
    enabled: boolean;
    hitsTotal: number;
    createdAt: string;
    createdBy: string;
  }

  /** 风险事件 — 派生自 IM 风险标记 + 黑名单事件 + 规则命中 */
  type EventSource = 'im_risk_flag' | 'blacklist_event' | 'rule_hit';
  interface EventRow {
    id: string; // source + ':' + sourceRefId 组合
    source: EventSource;
    sourceRefId: string;
    category: Api.Im.RiskCategory;
    severity: RuleSeverity;
    targetUserId?: number;
    targetUserName?: string;
    summary: string;
    status: 'pending' | 'handled' | 'dismissed';
    handledBy?: string;
    handledAt?: string;
    handlerNote?: string;
    occurredAt: string;
  }

  interface Stats {
    activeRules: number;
    pausedRules: number;
    sensitiveWordsTotal: number;
    pendingEvents: number;
    handledToday: number;
    critical24h: number;
  }

  interface RuleListQuery {
    type?: RuleType;
    status?: RuleStatus;
    keyword?: string;
  }
  interface RuleSaveParams {
    id?: number;
    name: string;
    type: RuleType;
    severity: RuleSeverity;
    action: RuleAction;
    status: RuleStatus;
    config: Record<string, any>;
    description?: string;
  }
  interface RuleToggleParams {
    ruleId: number;
    status: RuleStatus;
  }

  interface WordListQuery {
    category?: WordCategory;
    enabled?: boolean;
    keyword?: string;
  }
  interface WordSaveParams {
    id?: number;
    word: string;
    category: WordCategory;
    severity: RuleSeverity;
    enabled: boolean;
  }
  interface WordDeleteParams {
    wordId: number;
  }
  interface WordBatchImportParams {
    words: { word: string; category: WordCategory; severity: RuleSeverity }[];
  }

  interface EventListQuery {
    current?: number;
    size?: number;
    sources?: EventSource[];
    categories?: Api.Im.RiskCategory[];
    severities?: RuleSeverity[];
    status?: 'pending' | 'handled' | 'dismissed';
    keyword?: string;
  }
  interface HandleEventParams {
    eventId: string;
    decision: 'handled' | 'dismissed';
    note: string;
  }
}
