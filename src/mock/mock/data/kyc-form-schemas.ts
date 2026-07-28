/**
 * KYC schema 版本仓库（事件溯源 / append-only）— R-DATA-13 V1.7 升级。
 *
 * V1.7：统一 KYC schema，顾客 / 买手共用同一份；身份差异保留在 Submission.audience。
 * - 每次保存创建新的 SchemaSnapshot；旧版本不可变。
 * - 单一线性版本号链 v1 → v2 → … → vN；仅有一个 inUse=true 的版本作为 latest 指针。
 * - 保存时即与上一版本计算 diffSummary 并固化（前端零计算）。
 * - 回滚 = 将 target 版本的 fields 复制到新版本，审计链不破。
 *
 * 演示 seed：预置 3 个历史版本，便于在 UI 体验版本切换 / diff / rollback。
 */

type FieldDef = Api.Kyc.FieldDef;
type SchemaSnapshot = Api.Kyc.SchemaSnapshot;
type DiffSummary = Api.Kyc.DiffSummary;
type FieldChange = Api.Kyc.FieldChange;

let idCursor = 0;
function fid(prefix: string): string {
  idCursor += 1;
  return `${prefix}-${idCursor}`;
}

// ===== 默认字段定义（统一 schema 演化链） =====

/** v1: 基础身份 5 字段 */
function defaultV1Fields(): FieldDef[] {
  return [
    {
      id: fid('f'),
      code: 'real_name',
      type: 'text',
      label: '真实姓名',
      placeholder: '请填写身份证上的姓名',
      required: true,
      sort: 1,
      enabled: true,
      minLength: 2,
      maxLength: 30
    },
    {
      id: fid('f'),
      code: 'id_card_no',
      type: 'idCard',
      label: '身份证号',
      description: '18 位中国大陆身份证号；内置校验',
      required: true,
      sort: 2,
      enabled: true
    },
    {
      id: fid('f'),
      code: 'id_card_front',
      type: 'image',
      label: '身份证人像面',
      description: '清晰可见证件号、姓名、有效期',
      required: true,
      sort: 3,
      enabled: true,
      accept: 'image/jpeg,image/png',
      maxSizeMB: 8,
      maxCount: 1,
      aspectHint: '身份证人像面'
    },
    {
      id: fid('f'),
      code: 'id_card_back',
      type: 'image',
      label: '身份证国徽面',
      required: true,
      sort: 4,
      enabled: true,
      accept: 'image/jpeg,image/png',
      maxSizeMB: 8,
      maxCount: 1,
      aspectHint: '身份证国徽面'
    },
    {
      id: fid('f'),
      code: 'phone',
      type: 'phone',
      label: '手机号',
      placeholder: '11 位中国大陆手机号',
      description: '用于接收订单与重要通知',
      required: true,
      sort: 5,
      enabled: true
    }
  ];
}

/** v2: 增加活体视频 + 手持证件 + 地址（风控强化） */
function defaultV2Fields(prev: FieldDef[]): FieldDef[] {
  const holding: FieldDef = {
    id: fid('f'),
    code: 'id_card_holding',
    type: 'image',
    label: '手持身份证照片',
    description: '本人手持本人身份证；五官与证件清晰可辨',
    required: true,
    sort: 0,
    enabled: true,
    accept: 'image/jpeg,image/png',
    maxSizeMB: 8,
    maxCount: 1,
    aspectHint: '手持有效证件正面'
  };
  const faceVideo: FieldDef = {
    id: fid('f'),
    code: 'face_video',
    type: 'video',
    label: '人脸自拍视频',
    description: '正对摄像头，眨眼 / 摇头 3 秒；正常光线',
    required: true,
    sort: 0,
    enabled: true,
    accept: 'video/mp4,video/quicktime',
    maxSizeMB: 20,
    maxCount: 1,
    durationLimitSec: 10
  };
  const address: FieldDef = {
    id: fid('f'),
    code: 'address',
    type: 'textarea',
    label: '常住地址',
    placeholder: '省 / 市 / 区 / 详细地址',
    required: true,
    sort: 0,
    enabled: true,
    minLength: 8,
    maxLength: 120
  };
  return [...prev, holding, faceVideo, address].map((f, i) => ({ ...f, sort: i + 1 }));
}

/** v3: 增加声纹 / 紧急联系人 / 职业 / 月收入 / 真实性勾选 */
function defaultV3Fields(prev: FieldDef[]): FieldDef[] {
  const extra: FieldDef[] = [
    {
      id: fid('f'),
      code: 'voice_read',
      type: 'audio',
      label: '语音朗读编号',
      description: '请朗读身份证后 6 位；用于声纹辅助',
      required: false,
      sort: 0,
      enabled: true,
      accept: 'audio/mp3,audio/wav,audio/x-m4a',
      maxSizeMB: 5,
      durationLimitSec: 15
    },
    {
      id: fid('f'),
      code: 'emergency_name',
      type: 'text',
      label: '紧急联系人',
      required: false,
      sort: 0,
      enabled: true,
      maxLength: 30
    },
    {
      id: fid('f'),
      code: 'emergency_phone',
      type: 'phone',
      label: '紧急联系人手机',
      required: false,
      sort: 0,
      enabled: true
    },
    {
      id: fid('f'),
      code: 'occupation',
      type: 'select',
      label: '职业',
      required: true,
      sort: 0,
      enabled: true,
      options: [
        { label: '上班族', value: 'employee' },
        { label: '自由职业', value: 'freelance' },
        { label: '学生', value: 'student' },
        { label: '退休', value: 'retired' },
        { label: '其他', value: 'other' }
      ]
    },
    {
      id: fid('f'),
      code: 'monthly_income',
      type: 'select',
      label: '月收入区间',
      required: false,
      sort: 0,
      enabled: true,
      options: [
        { label: '5000 以下', value: 'lt5k' },
        { label: '5000 – 10000', value: '5k-10k' },
        { label: '10000 – 30000', value: '10k-30k' },
        { label: '30000 – 50000', value: '30k-50k' },
        { label: '50000 以上', value: 'gt50k' }
      ]
    },
    {
      id: fid('f'),
      code: 'truth_confirm',
      type: 'checkbox',
      label: '信息真实性确认',
      required: true,
      sort: 0,
      enabled: true,
      options: [
        { label: '我承诺以上信息真实有效', value: 'agree' },
        { label: '我同意平台依据 KYC 信息进行风控审查', value: 'risk' }
      ]
    }
  ];
  return [...prev, ...extra].map((f, i) => ({ ...f, sort: i + 1 }));
}

// ===== diff 工具 =====

const COMPARE_KEYS: (keyof FieldDef)[] = [
  'type',
  'label',
  'required',
  'enabled',
  'sort',
  'description',
  'placeholder',
  'minLength',
  'maxLength',
  'pattern',
  'patternMsg',
  'min',
  'max',
  'accept',
  'maxSizeMB',
  'maxCount',
  'aspectHint',
  'durationLimitSec'
];

function fieldChanges(prev: FieldDef, next: FieldDef): FieldChange['changes'] {
  const out: FieldChange['changes'] = [];
  COMPARE_KEYS.forEach(k => {
    const a = prev[k];
    const b = next[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ key: String(k), from: serialize(a), to: serialize(b) });
    }
  });
  if (JSON.stringify(prev.options || []) !== JSON.stringify(next.options || [])) {
    out.push({
      key: 'options',
      from: `${(prev.options || []).length} 项`,
      to: `${(next.options || []).length} 项`
    });
  }
  return out;
}

function serialize(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}

export function computeDiff(prev: FieldDef[] | undefined, next: FieldDef[]): DiffSummary {
  const prevMap = new Map((prev || []).map(f => [f.code, f]));
  const nextMap = new Map(next.map(f => [f.code, f]));
  const added: DiffSummary['added'] = [];
  const removed: DiffSummary['removed'] = [];
  const modified: FieldChange[] = [];
  next.forEach(n => {
    const p = prevMap.get(n.code);
    if (!p) {
      added.push({ code: n.code, label: n.label, type: n.type });
      return;
    }
    const changes = fieldChanges(p, n);
    if (changes.length) modified.push({ code: n.code, label: n.label, changes });
  });
  (prev || []).forEach(p => {
    if (!nextMap.has(p.code)) removed.push({ code: p.code, label: p.label, type: p.type });
  });
  return { added, removed, modified };
}

// ===== 版本仓库（单一线性链） =====

export const SCHEMA_VERSIONS: SchemaSnapshot[] = [];

function pushSnapshot(snap: SchemaSnapshot) {
  SCHEMA_VERSIONS.forEach(s => {
    s.inUse = false;
  });
  SCHEMA_VERSIONS.push(snap);
}

/**
 * 追加新版本（事件溯源核心 API）。
 * @returns 新创建的 SchemaSnapshot（inUse=true）
 */
export function addVersion(p: {
  fields: FieldDef[];
  validityDays: number;
  createdBy: string;
  changeNote?: string;
  createdAt?: string;
}): SchemaSnapshot {
  const lastVersion = SCHEMA_VERSIONS.at(-1)?.version || 0;
  const prevFields = SCHEMA_VERSIONS.at(-1)?.fields;
  const sorted = [...p.fields].sort((a, b) => a.sort - b.sort).map((f, i) => ({ ...f, sort: i + 1 }));
  const snap: SchemaSnapshot = {
    version: lastVersion + 1,
    validityDays: p.validityDays,
    fields: sorted,
    createdAt: p.createdAt || new Date().toISOString(),
    createdBy: p.createdBy,
    changeNote: p.changeNote,
    diffSummary: lastVersion === 0 ? undefined : computeDiff(prevFields, sorted),
    inUse: true
  };
  pushSnapshot(snap);
  return snap;
}

/** 获取当前 latest（inUse=true）快照 */
export function latestSchema(): SchemaSnapshot {
  const latest = SCHEMA_VERSIONS.find(s => s.inUse) || SCHEMA_VERSIONS.at(-1);
  if (!latest) throw new Error('无 schema 快照');
  return latest;
}

/** 取指定版本 */
export function findVersion(version: number): SchemaSnapshot | undefined {
  return SCHEMA_VERSIONS.find(s => s.version === version);
}

/** 回滚 = 复制 target 的 fields 创建新版本 */
export function rollbackToVersion(p: {
  targetVersion: number;
  createdBy: string;
  changeNote?: string;
}): SchemaSnapshot | { error: string } {
  const target = findVersion(p.targetVersion);
  if (!target) return { error: `版本 v${p.targetVersion} 不存在` };
  return addVersion({
    fields: target.fields.map(f => ({ ...f })), // 深拷贝
    validityDays: target.validityDays,
    createdBy: p.createdBy,
    changeNote: p.changeNote || `回滚到 v${p.targetVersion}`
  });
}

/** 重置默认 = 用 v1 默认 fields 追加新版本 */
export function resetSchemaToDefault(createdBy = 'super'): SchemaSnapshot {
  return addVersion({
    fields: defaultV1Fields(),
    validityDays: 365,
    createdBy,
    changeNote: '重置为默认 schema'
  });
}

// ===== 种子数据（演示用：预置 3 个历史版本） =====

function seed() {
  const v1 = defaultV1Fields();
  addVersion({
    fields: v1,
    validityDays: 365,
    createdBy: 'super',
    changeNote: '初始版本：基础身份信息（姓名 / 证件号 / 证件双面 / 手机号）',
    createdAt: '2026-01-08T10:00:00+08:00'
  });
  const v2 = defaultV2Fields(v1);
  addVersion({
    fields: v2,
    validityDays: 365,
    createdBy: 'kyc',
    changeNote: '风控强化：增加手持证件 / 活体视频 / 常住地址',
    createdAt: '2026-02-25T16:00:00+08:00'
  });
  const v3 = defaultV3Fields(v2);
  addVersion({
    fields: v3,
    validityDays: 365,
    createdBy: 'kyc',
    changeNote: '画像补全：增加声纹 / 紧急联系人 / 职业 / 月收入 / 真实性确认',
    createdAt: '2026-04-01T10:00:00+08:00'
  });
}
seed();
