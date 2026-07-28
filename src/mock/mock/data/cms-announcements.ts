/**
 * 公告池（R-DATA-40）：15 条覆盖 4 type × 3 status。
 */
type Announcement = Api.Cms.Announcement;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `ANN-2026-${String(seq).padStart(5, '0')}`;
}

function iso(daysAgo: number, h = 10): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
}

interface Seed {
  title: string;
  summary: string;
  body: string;
  type: Api.Cms.AnnouncementType;
  status: Api.Cms.AnnouncementStatus;
  audience: Api.Cms.Audience;
  pinned: boolean;
  daysAgo: number;
  views: number;
}

const SEEDS: Seed[] = [
  // system × 5
  {
    title: '系统正式上线公告',
    summary: '平台已正式开放，欢迎注册',
    body: '## 平台上线\n\n本日起，全平台正式开放。',
    type: 'system',
    status: 'published',
    audience: 'all',
    pinned: true,
    daysAgo: 60,
    views: 5240
  },
  {
    title: '订阅协议更新通知',
    summary: '用户协议 v2.0 已上线',
    body: '请用户重新阅读最新版用户协议。',
    type: 'system',
    status: 'published',
    audience: 'all',
    pinned: false,
    daysAgo: 30,
    views: 1820
  },
  {
    title: '客服工作时间公告',
    summary: '工作日 9:00-22:00',
    body: '客服在线时间为工作日 9:00-22:00。',
    type: 'system',
    status: 'published',
    audience: 'all',
    pinned: false,
    daysAgo: 15,
    views: 780
  },
  {
    title: '隐私协议更新',
    summary: '隐私条款新增第 X 条',
    body: '隐私协议新增数据处理相关条款。',
    type: 'system',
    status: 'draft',
    audience: 'all',
    pinned: false,
    daysAgo: 1,
    views: 0
  },
  {
    title: '春节放假安排',
    summary: '春节假期客服调整',
    body: '春节假期客服在线时间调整。',
    type: 'system',
    status: 'archived',
    audience: 'all',
    pinned: false,
    daysAgo: 120,
    views: 3120
  },

  // maintenance × 4
  {
    title: '系统维护通知（已结束）',
    summary: '已完成维护',
    body: '本次维护已圆满完成。',
    type: 'maintenance',
    status: 'archived',
    audience: 'all',
    pinned: false,
    daysAgo: 90,
    views: 980
  },
  {
    title: '钱包模块短暂维护',
    summary: '6/15 凌晨 1:00-2:00',
    body: '为保障安全，钱包模块将进行短暂维护。',
    type: 'maintenance',
    status: 'published',
    audience: 'all',
    pinned: true,
    daysAgo: 3,
    views: 1340
  },
  {
    title: '物流系统升级',
    summary: '6/20 凌晨',
    body: '物流系统升级 30 分钟。',
    type: 'maintenance',
    status: 'draft',
    audience: 'all',
    pinned: false,
    daysAgo: 1,
    views: 0
  },
  {
    title: 'IM 系统紧急维护',
    summary: '已紧急修复',
    body: '5/30 紧急维护已结束。',
    type: 'maintenance',
    status: 'archived',
    audience: 'all',
    pinned: false,
    daysAgo: 30,
    views: 560
  },

  // campaign × 3
  {
    title: '6 月新人福利',
    summary: '新人注册送积分',
    body: '## 新人专享\n\n注册即送 100 积分。',
    type: 'campaign',
    status: 'published',
    audience: 'customer',
    pinned: false,
    daysAgo: 10,
    views: 4200
  },
  {
    title: '买手招募专项活动',
    summary: '买手满 10 单返佣',
    body: '买手累计 10 单订单返佣。',
    type: 'campaign',
    status: 'published',
    audience: 'buyer',
    pinned: false,
    daysAgo: 5,
    views: 1820
  },
  {
    title: '年中大促预告',
    summary: '7 月年中大促',
    body: '敬请期待 7 月年中大促。',
    type: 'campaign',
    status: 'draft',
    audience: 'all',
    pinned: false,
    daysAgo: 0,
    views: 0
  },

  // risk × 3
  {
    title: '私下交易风险提示',
    summary: '请勿绕过平台交易',
    body: '## 风险提示\n\n请勿走任何非平台渠道交易。',
    type: 'risk',
    status: 'published',
    audience: 'all',
    pinned: true,
    daysAgo: 7,
    views: 6500
  },
  {
    title: '钓鱼链接警告',
    summary: '勿点击不明链接',
    body: '近期发现部分钓鱼链接，请谨慎。',
    type: 'risk',
    status: 'published',
    audience: 'all',
    pinned: false,
    daysAgo: 12,
    views: 2400
  },
  {
    title: '员工内部风控公告',
    summary: '员工合规要求',
    body: '员工不得透露用户信息。',
    type: 'risk',
    status: 'published',
    audience: 'staff',
    pinned: false,
    daysAgo: 20,
    views: 220
  }
];

export const ANNOUNCEMENTS: Announcement[] = SEEDS.map((s, i) => ({
  id: nextId(),
  code: makeCode(i + 1),
  title: s.title,
  summary: s.summary,
  body: s.body,
  type: s.type,
  status: s.status,
  audience: s.audience,
  publishAt: s.status !== 'draft' ? iso(s.daysAgo - 1, 9) : undefined,
  viewsCount: s.views,
  pinned: s.pinned,
  createdAt: iso(s.daysAgo),
  updatedAt: iso(Math.max(0, s.daysAgo - 1)),
  createdBy: 'ops'
}));

export function findAnnouncementById(id: number): Announcement | undefined {
  return ANNOUNCEMENTS.find(a => a.id === id);
}

export function upsertAnnouncement(p: Api.Cms.AnnSaveParams): Announcement {
  const now = new Date().toISOString();
  if (p.id) {
    const existing = findAnnouncementById(p.id);
    if (!existing) throw new Error('公告不存在');
    Object.assign(existing, {
      title: p.title,
      summary: p.summary,
      body: p.body,
      type: p.type,
      audience: p.audience,
      pinned: p.pinned,
      publishAt: p.publishAt,
      expireAt: p.expireAt,
      status: p.status,
      updatedAt: now
    });
    return existing;
  }
  const created: Announcement = {
    id: nextId(),
    code: makeCode(ANNOUNCEMENTS.length + 1),
    title: p.title,
    summary: p.summary,
    body: p.body,
    type: p.type,
    status: p.status,
    audience: p.audience,
    publishAt: p.publishAt,
    expireAt: p.expireAt,
    viewsCount: 0,
    pinned: p.pinned,
    createdAt: now,
    updatedAt: now,
    createdBy: 'ops'
  };
  ANNOUNCEMENTS.unshift(created);
  return created;
}

export function publishAnnouncement(id: number): Announcement | undefined {
  const a = findAnnouncementById(id);
  if (!a) return undefined;
  a.status = 'published';
  a.publishAt = new Date().toISOString();
  a.updatedAt = a.publishAt;
  return a;
}

export function archiveAnnouncement(id: number): Announcement | undefined {
  const a = findAnnouncementById(id);
  if (!a) return undefined;
  a.status = 'archived';
  a.updatedAt = new Date().toISOString();
  return a;
}
