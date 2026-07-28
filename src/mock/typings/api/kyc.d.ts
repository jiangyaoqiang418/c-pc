/**
 * 4.6 KYC 认证模块类型（R-DATA-12 + R-DATA-13）。
 *
 * 设计要点：
 * - 13 种 FieldType 由代码层写死（R-DATA-12）；UI 仅能增删字段实例 / 编辑属性。
 * - 提交记录冗余 schemaVersion + fieldLabel/code/type（R-DATA-13）：
 *   审核现场严格按提交时的 schema 还原，schema 后续变化不影响历史审核。
 */
declare namespace Api.Kyc {
  /** R-DATA-12 硬枚举：13 种字段类型 */
  type FieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'radio'
    | 'checkbox'
    | 'date'
    | 'phone'
    | 'email'
    | 'idCard'
    | 'image'
    | 'video'
    | 'audio';

  type Audience = 'customer' | 'buyer';
  type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

  interface FieldOption {
    label: string;
    value: string;
  }

  /** 单字段定义 */
  interface FieldDef {
    id: string;
    code: string;
    type: FieldType;
    label: string;
    placeholder?: string;
    description?: string;
    required: boolean;
    sort: number;
    enabled: boolean;
    // 文本/textarea
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    patternMsg?: string;
    // number
    min?: number;
    max?: number;
    // 选项类
    options?: FieldOption[];
    // 媒体类
    accept?: string;
    maxSizeMB?: number;
    maxCount?: number;
    aspectHint?: string;
    durationLimitSec?: number;
  }

  /**
   * 单次字段变更（modified 描述） — V1.6
   * 列出该字段在前后两版间发生变化的属性键 / 新旧值对照（值序列化为字符串以方便展示）。
   */
  interface FieldChange {
    code: string;
    label: string; // 取 next 版本的 label，便于审计阅读
    changes: { key: string; from: string; to: string }[];
  }

  /** 与上一版本的 diff 汇总 — V1.6 */
  interface DiffSummary {
    added: { code: string; label: string; type: FieldType }[];
    removed: { code: string; label: string; type: FieldType }[];
    modified: FieldChange[];
  }

  /**
   * 不可变快照（append-only） — V1.7：统一 KYC schema，不再按 audience 分套。
   *
   * 同一条线性版本号链 v1 → v2 → … → vN；仅一个 inUse=true 的版本作为 latest 指针。
   * 顾客 / 买手共用同一 schema；身份差异保留在 Submission.audience（提交人角色）。
   * 保存时即与前版 diff 物化为 diffSummary，供前端直接展示。
   */
  interface SchemaSnapshot {
    version: number;
    validityDays: number;
    fields: FieldDef[];
    createdAt: string;
    createdBy: string;
    changeNote?: string; // 修订说明
    diffSummary?: DiffSummary; // 与上一版 diff（v1 无）
    inUse: boolean; // 当前是否为生效版本
  }

  /** 兼容别名：业务侧消费的 FormSchema 永远 = latest SchemaSnapshot */
  type FormSchema = SchemaSnapshot;

  /** 版本列表的轻量元数据（不含完整 fields） */
  interface SchemaVersionMeta {
    version: number;
    validityDays: number;
    createdAt: string;
    createdBy: string;
    changeNote?: string;
    fieldCount: number;
    enabledFieldCount: number;
    inUse: boolean;
    diffSummary?: DiffSummary;
    submissionCount: number; // 当前有多少条 Submission 引用此版本
  }

  interface SaveSchemaParams {
    validityDays: number;
    fields: FieldDef[];
    changeNote?: string; // V1.6 新增
  }

  interface RollbackParams {
    targetVersion: number;
    changeNote?: string;
  }

  /** 媒体资源（mock 用 placeholder） */
  interface MediaAsset {
    url: string;
    name: string;
    sizeKB: number;
    width?: number;
    height?: number;
    durationSec?: number;
  }

  /** 提交字段值：冗余 label/type/code 保证审核现场可还原（R-DATA-13） */
  interface SubmissionField {
    fieldId: string;
    fieldCode: string;
    fieldLabel: string;
    type: FieldType;
    value: string | string[] | MediaAsset[];
  }

  interface AuditEvent {
    id: number;
    action: 'submit' | 'approve' | 'reject' | 'resubmit' | 'expire' | 'image-view';
    actor: string;
    note?: string;
    time: string;
  }

  interface Submission {
    id: number;
    userId: number;
    userName: string;
    userEmail: string;
    audience: Audience;
    schemaVersion: number;
    status: SubmissionStatus;
    fields: SubmissionField[];
    submittedAt: string;
    auditedAt?: string;
    auditor?: string;
    auditOpinion?: string;
    expiresAt?: string;
    history: AuditEvent[];
  }

  interface ListQuery {
    current?: number;
    size?: number;
    keyword?: string;
    audiences?: Audience[];
    statuses?: SubmissionStatus[];
    fromAt?: string;
    toAt?: string;
    onlyPending?: boolean;
  }

  interface AuditParams {
    id: number;
    decision: 'approve' | 'reject';
    opinion: string;
    validityDays?: number;
  }

  interface ImageViewParams {
    id: number;
    fieldCode: string;
    note?: string;
  }

  interface Stats {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    passRate: number;
    avgAuditHours: number;
  }
}
