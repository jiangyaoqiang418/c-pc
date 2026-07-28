/**
 * KYC 提交 mock 数据：30 条覆盖 pending / approved / rejected / expired 4 种状态。
 *
 * R-DATA-13 V1.7：每条提交锚定具体 schemaVersion（不一定是 latest），用以演示
 *   "审核现场按提交时版本快照还原" 与"老版本下提交、新版本下仍可正确审核" 这两种关键场景。
 *
 * V1.7：schema 已统一（不再区分顾客 / 买手 schema），但 Submission 仍保留 audience
 * 标识"提交人身份"（顾客 / 买手），用以触发 KYC_PASS 加分等下游业务。
 *
 * 媒体 URL 用 picsum.photos（图片）与 google sample 视频/音频做演示，不依赖真实上传。
 */
import { SCHEMA_VERSIONS, latestSchema } from './kyc-form-schemas';
import { USERS } from './users';

type Submission = Api.Kyc.Submission;
type SubmissionField = Api.Kyc.SubmissionField;
type MediaAsset = Api.Kyc.MediaAsset;
type AuditEvent = Api.Kyc.AuditEvent;

let subId = 0;
let evtId = 0;
function nextSubId(): number {
  subId += 1;
  return subId;
}
export function nextEventId(): number {
  evtId += 1;
  return evtId;
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

function img(n: number, label: string): MediaAsset {
  return {
    url: `https://picsum.photos/seed/kyc${n}/640/400`,
    name: `${label}.jpg`,
    sizeKB: 280 + (n % 7) * 35,
    width: 640,
    height: 400
  };
}

function video(n: number): MediaAsset {
  // Google 公开 sample 视频，仅 mock 用
  return {
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    name: `face-${n}.mp4`,
    sizeKB: 4200,
    durationSec: 8
  };
}

function audio(n: number): MediaAsset {
  return {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    name: `voice-${n}.mp3`,
    sizeKB: 320,
    durationSec: 12
  };
}

/**
 * 按指定 schema snapshot 生成完整 SubmissionField[]（值是 mock 演示数据）。
 * V1.7：顾客 / 买手共用同一 schema，故只需一个 field 生成器；
 * 仅文本类样例用 audience 微调（顾客取顾客名字池、买手取买手名字池），其余字段类型一致。
 */
function buildSubmissionFields(n: number, snap: Api.Kyc.SchemaSnapshot, audience: Api.Kyc.Audience): SubmissionField[] {
  const NAMES_BUYER = ['张丽琳', '杨建军', '高志远', '吴启明', '苏静', '于天浩'];
  const NAMES_CUSTOMER = ['王小美', '李建华', '赵敏婕', '何思琪', '陈思源', '林海洋'];
  const namePool = audience === 'buyer' ? NAMES_BUYER : NAMES_CUSTOMER;

  return snap.fields.map((f): SubmissionField => {
    const base = { fieldId: f.id, fieldCode: f.code, fieldLabel: f.label, type: f.type };
    let value: SubmissionField['value'];
    switch (f.code) {
      case 'real_name':
        value = namePool[n % namePool.length];
        break;
      case 'id_card_no':
        value = `3201${String(20040601 + n * 31).slice(0, 8)}${String(1000 + n * 73).slice(0, 4)}`;
        break;
      case 'id_card_front':
        value = [img(n * 10 + 1, '身份证人像面')];
        break;
      case 'id_card_back':
        value = [img(n * 10 + 2, '身份证国徽面')];
        break;
      case 'id_card_holding':
        value = [img(n * 10 + 3, '手持身份证')];
        break;
      case 'face_video':
        value = [video(n)];
        break;
      case 'voice_read':
        value = [audio(n)];
        break;
      case 'phone':
        value = `${audience === 'buyer' ? '188' : '189'}${String(10000000 + n * 53).slice(0, 8)}`;
        break;
      case 'address':
        value = ['北京市朝阳区建国路 88 号 1203', '上海市徐汇区漕溪北路 333 弄', '深圳市南山区科技园北区'][n % 3];
        break;
      case 'emergency_name':
        value = ['李华', '王芳', '赵敏'][n % 3];
        break;
      case 'emergency_phone':
        value = `139${String(10000000 + n * 137).slice(0, 8)}`;
        break;
      case 'occupation':
        value = ['employee', 'freelance', 'student', 'other'][n % 4];
        break;
      case 'monthly_income':
        value = ['5k-10k', '10k-30k', '30k-50k', 'gt50k'][n % 4];
        break;
      case 'truth_confirm':
        value = audience === 'buyer' ? ['agree', 'risk'] : ['agree'];
        break;
      default:
        value = '';
    }
    return { ...base, value };
  });
}

/** 演示员工名（用于 auditor / submit history） */
const AUDITORS = ['kyc', 'super', 'risk'];

interface HistoryParams {
  submitAt: string;
  decision: 'approve' | 'reject' | 'pending' | 'expired';
  auditAt?: string;
  auditor?: string;
}
function buildHistory(p: HistoryParams): AuditEvent[] {
  const out: AuditEvent[] = [{ id: nextEventId(), action: 'submit', actor: 'self', time: p.submitAt }];
  const actor = p.auditor || 'kyc';
  if (p.decision === 'approve' && p.auditAt) {
    out.push({ id: nextEventId(), action: 'image-view', actor, time: p.auditAt, note: '查看身份证正面' });
    out.push({ id: nextEventId(), action: 'approve', actor, time: p.auditAt, note: '资料齐全，证件清晰' });
  } else if (p.decision === 'reject' && p.auditAt) {
    out.push({ id: nextEventId(), action: 'reject', actor, time: p.auditAt, note: '身份证反光，无法识别号码' });
  } else if (p.decision === 'expired' && p.auditAt) {
    out.push({ id: nextEventId(), action: 'approve', actor, time: p.auditAt });
    out.push({ id: nextEventId(), action: 'expire', actor: 'system', time: p.submitAt, note: 'KYC 到期自动失效' });
  }
  return out;
}

/** 工具：往用户池里随机挑一个 audience 匹配的用户 */
function pickUser(audience: Api.Kyc.Audience, n: number) {
  const pool = USERS.filter(u => (audience === 'buyer' ? u.isBuyer : !u.isBuyer));
  return pool[n % pool.length];
}

interface SubmissionSpec {
  audience: Api.Kyc.Audience;
  status: Api.Kyc.SubmissionStatus;
  daysSubmitted: number;
  n: number;
  validityDays: number;
}

/**
 * 按提交时间推测当时生效的 schema 版本（统一链）：
 * - 近 30 天提交 → 当前 latest 版本
 * - 30–90 天 → latest-1
 * - 90+ 天 → v1
 * 这样 30 条 mock 自然分布在 3 个版本上，演示跨版本审核还原。
 */
function pickSchemaForSubmission(daysSubmitted: number): Api.Kyc.SchemaSnapshot {
  const latest = latestSchema();
  if (daysSubmitted >= 90) return SCHEMA_VERSIONS[0] || latest;
  if (daysSubmitted >= 30) return SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 2] || latest;
  return latest;
}

function makeSubmission(spec: SubmissionSpec): Submission {
  const { audience, status, daysSubmitted, n, validityDays } = spec;
  const u = pickUser(audience, n);
  const submittedAt = daysAgo(daysSubmitted);
  const snap = pickSchemaForSubmission(daysSubmitted);
  let auditedAt: string | undefined;
  let auditor: string | undefined;
  let auditOpinion: string | undefined;
  let expiresAt: string | undefined;
  let history: AuditEvent[];
  if (status === 'approved') {
    auditedAt = daysAgo(daysSubmitted - 1);
    auditor = AUDITORS[n % AUDITORS.length];
    auditOpinion = '资料齐全，已通过';
    const e = new Date(auditedAt);
    e.setDate(e.getDate() + validityDays);
    expiresAt = e.toISOString();
    history = buildHistory({ submitAt: submittedAt, decision: 'approve', auditAt: auditedAt, auditor });
  } else if (status === 'rejected') {
    auditedAt = daysAgo(daysSubmitted - 1);
    auditor = AUDITORS[n % AUDITORS.length];
    auditOpinion = '资料不清晰，请重新提交';
    history = buildHistory({ submitAt: submittedAt, decision: 'reject', auditAt: auditedAt, auditor });
  } else if (status === 'expired') {
    auditedAt = daysAgo(daysSubmitted - 2);
    auditor = AUDITORS[n % AUDITORS.length];
    auditOpinion = '通过（已到期）';
    const e = new Date(auditedAt);
    e.setDate(e.getDate() + Math.min(validityDays, 30)); // 已过期：故意把有效期推到过去
    expiresAt = e.toISOString();
    history = buildHistory({ submitAt: submittedAt, decision: 'expired', auditAt: auditedAt, auditor });
  } else {
    history = buildHistory({ submitAt: submittedAt, decision: 'pending' });
  }
  return {
    id: nextSubId(),
    userId: u.id,
    userName: u.nickname,
    userEmail: u.email,
    audience,
    schemaVersion: snap.version,
    status,
    fields: buildSubmissionFields(n, snap, audience),
    submittedAt,
    auditedAt,
    auditor,
    auditOpinion,
    expiresAt,
    history
  };
}

/** 内存池 */
export const SUBMISSIONS: Submission[] = [];

/** 统计指定版本被多少条 Submission 引用（用于版本元数据 submissionCount） */
export function countSubmissionsByVersion(version: number): number {
  return SUBMISSIONS.filter(s => s.schemaVersion === version).length;
}

/**
 * 演示池强制 seed：确保 MOCK_USERS 里的账号（王小美 1 / 陈乔乔 6 / 张丽琳 21 / 杨建军 22）
 * 都有可展示的 SUBMISSION 记录。fetchMyKycStatus 用 `.pop()` 取最后一条，
 * 所以放在 seedAll 之后 append 一定会被选中。
 *
 * 名字与用户 nickname 精确匹配，避免出现「陈乔乔审核卡片显示李四」的错位。
 */
function makeDemoSubmission(opts: {
  userId: number;
  audience: Api.Kyc.Audience;
  status: Api.Kyc.SubmissionStatus;
  realName: string;
  daysSubmitted: number;
  validityDays: number;
}): Submission {
  const u = USERS.find(x => x.id === opts.userId);
  if (!u) throw new Error(`Demo user id ${opts.userId} not found`);
  const submittedAt = daysAgo(opts.daysSubmitted);
  const snap = pickSchemaForSubmission(opts.daysSubmitted);
  const fields = snap.fields.map((f): SubmissionField => {
    const base = { fieldId: f.id, fieldCode: f.code, fieldLabel: f.label, type: f.type };
    let value: SubmissionField['value'] = '';
    switch (f.code) {
      case 'real_name': value = opts.realName; break;
      case 'id_card_no': value = `3101${'20040601'}${(opts.userId * 137 + 31).toString().padStart(4, '0').slice(-4)}`; break;
      case 'id_card_front': value = [img(opts.userId * 10 + 1, '身份证人像面')]; break;
      case 'id_card_back': value = [img(opts.userId * 10 + 2, '身份证国徽面')]; break;
      case 'id_card_holding': value = [img(opts.userId * 10 + 3, '手持身份证')]; break;
      case 'face_video': value = [video(opts.userId)]; break;
      case 'voice_read': value = [audio(opts.userId)]; break;
      case 'phone': value = u.phone || '18800000000'; break;
      case 'address': value = '上海市浦东新区世纪大道 100 号'; break;
      case 'emergency_name': value = '张三'; break;
      case 'emergency_phone': value = '13900000000'; break;
      case 'occupation': value = opts.audience === 'buyer' ? 'freelance' : 'employee'; break;
      case 'monthly_income': value = '10k-30k'; break;
      case 'truth_confirm': value = opts.audience === 'buyer' ? ['agree', 'risk'] : ['agree']; break;
    }
    return { ...base, value };
  });
  const auditedAt = daysAgo(opts.daysSubmitted - 1);
  const expires = new Date(auditedAt);
  expires.setDate(expires.getDate() + opts.validityDays);
  return {
    id: nextSubId(),
    userId: u.id,
    userName: u.nickname,
    userEmail: u.email,
    audience: opts.audience,
    schemaVersion: snap.version,
    status: opts.status,
    fields,
    submittedAt,
    auditedAt: opts.status === 'pending' ? undefined : auditedAt,
    auditor: opts.status === 'pending' ? undefined : 'kyc',
    auditOpinion: opts.status === 'approved' ? '资料齐全，已通过' :
                  opts.status === 'rejected' ? '资料不清晰，请重新提交' : undefined,
    expiresAt: opts.status === 'approved' ? expires.toISOString() : undefined,
    history: buildHistory({
      submitAt: submittedAt,
      decision: opts.status === 'approved' ? 'approve' :
                opts.status === 'rejected' ? 'reject' : 'pending',
      auditAt: opts.status === 'pending' ? undefined : auditedAt,
      auditor: 'kyc'
    })
  };
}

function seedDemoUsersOverride() {
  // 王小美 (id 1) — 顾客已通过
  SUBMISSIONS.push(makeDemoSubmission({
    userId: 1, audience: 'customer', status: 'approved',
    realName: '王小美', daysSubmitted: 60, validityDays: 730
  }));
  // 陈乔乔 (id 6) — 顾客已驳回
  SUBMISSIONS.push(makeDemoSubmission({
    userId: 6, audience: 'customer', status: 'rejected',
    realName: '陈乔乔', daysSubmitted: 20, validityDays: 730
  }));
  // 张丽琳 (id 21) — 买手已通过
  SUBMISSIONS.push(makeDemoSubmission({
    userId: 21, audience: 'buyer', status: 'approved',
    realName: '张丽琳', daysSubmitted: 45, validityDays: 365
  }));
  // 杨建军 (id 22) — 买手已通过
  SUBMISSIONS.push(makeDemoSubmission({
    userId: 22, audience: 'buyer', status: 'approved',
    realName: '杨建军', daysSubmitted: 90, validityDays: 365
  }));
}

function seedAll() {
  SUBMISSIONS.length = 0;
  // 8 待审
  for (let i = 0; i < 6; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'buyer', status: 'pending', daysSubmitted: 1 + i, n: i, validityDays: 365 })
    );
  for (let i = 0; i < 2; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'customer', status: 'pending', daysSubmitted: 1 + i, n: i + 6, validityDays: 730 })
    );
  // 15 通过：6 条近期（v3）+ 6 条中期 30–90 天（v2）+ 3 条顾客近期（v3）
  for (let i = 0; i < 6; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'buyer', status: 'approved', daysSubmitted: 10 + i, n: i + 10, validityDays: 365 })
    );
  for (let i = 0; i < 6; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'buyer', status: 'approved', daysSubmitted: 45 + i * 5, n: i + 16, validityDays: 365 })
    );
  for (let i = 0; i < 3; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'customer', status: 'approved', daysSubmitted: 5 + i, n: i + 22, validityDays: 730 })
    );
  // 4 驳回：2 近期（v3）+ 1 中期（v2）+ 1 顾客
  for (let i = 0; i < 2; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'buyer', status: 'rejected', daysSubmitted: 20 + i, n: i + 30, validityDays: 365 })
    );
  SUBMISSIONS.push(
    makeSubmission({ audience: 'buyer', status: 'rejected', daysSubmitted: 60, n: 32, validityDays: 365 })
  );
  SUBMISSIONS.push(
    makeSubmission({ audience: 'customer', status: 'rejected', daysSubmitted: 15, n: 33, validityDays: 730 })
  );
  // 3 过期
  for (let i = 0; i < 3; i += 1)
    SUBMISSIONS.push(
      makeSubmission({ audience: 'buyer', status: 'expired', daysSubmitted: 200 + i, n: i + 40, validityDays: 365 })
    );
}
seedAll();
seedDemoUsersOverride();

export function appendSubmission(s: Submission) {
  SUBMISSIONS.push(s);
}

export function findSubmission(id: number): Submission | undefined {
  return SUBMISSIONS.find(s => s.id === id);
}

export function appendAuditEvent(sub: Submission, ev: Omit<AuditEvent, 'id'>) {
  sub.history.push({ id: nextEventId(), ...ev });
}

/** 加载时按 expiresAt 把已到期的 approved 标记为 expired（模拟到期失效） */
export function autoExpire(now = Date.now()) {
  SUBMISSIONS.forEach(s => {
    if (s.status === 'approved' && s.expiresAt && Date.parse(s.expiresAt) < now) {
      s.status = 'expired';
      appendAuditEvent(s, { action: 'expire', actor: 'system', time: new Date(now).toISOString(), note: '自动到期' });
    }
  });
}
autoExpire();
