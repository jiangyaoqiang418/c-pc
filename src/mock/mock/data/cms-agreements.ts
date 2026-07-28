/**
 * 协议池（R-DATA-40）：5 kind × 2-3 version（含 isCurrent）。
 */
type Agreement = Api.Cms.Agreement;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function iso(daysAgo: number): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  return t.toISOString();
}

interface Seed {
  kind: Api.Cms.AgreementKind;
  version: string;
  title: string;
  daysAgo: number;
  isCurrent: boolean;
}

const SEEDS: Seed[] = [
  // user × 3
  { kind: 'user', version: 'v2.0.0', title: '用户服务协议', daysAgo: 30, isCurrent: true },
  { kind: 'user', version: 'v1.5.0', title: '用户服务协议', daysAgo: 180, isCurrent: false },
  { kind: 'user', version: 'v1.0.0', title: '用户服务协议', daysAgo: 365, isCurrent: false },

  // privacy × 2
  { kind: 'privacy', version: 'v1.2.0', title: '隐私协议', daysAgo: 60, isCurrent: true },
  { kind: 'privacy', version: 'v1.0.0', title: '隐私协议', daysAgo: 300, isCurrent: false },

  // service × 2
  { kind: 'service', version: 'v1.1.0', title: '平台服务条款', daysAgo: 90, isCurrent: true },
  { kind: 'service', version: 'v1.0.0', title: '平台服务条款', daysAgo: 200, isCurrent: false },

  // kyc × 1
  { kind: 'kyc', version: 'v1.0.0', title: 'KYC 同意书', daysAgo: 120, isCurrent: true },

  // aml × 1
  { kind: 'aml', version: 'v1.0.0', title: 'AML 反洗钱政策', daysAgo: 120, isCurrent: true }
];

export const AGREEMENTS: Agreement[] = SEEDS.map(s => ({
  id: nextId(),
  kind: s.kind,
  version: s.version,
  title: s.title,
  body: `## ${s.title} ${s.version}\n\n本协议自 ${iso(s.daysAgo).slice(0, 10)} 起生效。\n\n（mock 文档内容）`,
  effectiveAt: iso(s.daysAgo),
  isCurrent: s.isCurrent,
  publishedBy: 'legal'
}));

export function findAgreementById(id: number): Agreement | undefined {
  return AGREEMENTS.find(a => a.id === id);
}

export function findCurrentAgreement(kind: Api.Cms.AgreementKind): Agreement | undefined {
  return AGREEMENTS.find(a => a.kind === kind && a.isCurrent);
}

export function upsertAgreement(p: Api.Cms.AgreementSaveParams): Agreement {
  const created: Agreement = {
    id: nextId(),
    kind: p.kind,
    version: p.version,
    title: p.title,
    body: p.body,
    effectiveAt: p.effectiveAt,
    isCurrent: false,
    publishedBy: 'legal'
  };
  AGREEMENTS.unshift(created);
  return created;
}

export function setCurrentAgreement(id: number): Agreement | undefined {
  const target = findAgreementById(id);
  if (!target) return undefined;
  AGREEMENTS.forEach(a => {
    if (a.kind === target.kind) a.isCurrent = a.id === id;
  });
  return target;
}
