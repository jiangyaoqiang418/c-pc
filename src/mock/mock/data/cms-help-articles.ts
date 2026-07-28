/**
 * 帮助文章池（R-DATA-40）：20 条覆盖 6 category。
 */
type HelpArticle = Api.Cms.HelpArticle;

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
  title: string;
  category: Api.Cms.HelpCategory;
  body: string;
  views: number;
  helpful: number;
  notHelpful: number;
  enabled: boolean;
  daysAgo: number;
}

const SEEDS: Seed[] = [
  // guide × 4
  {
    title: '新人入门指南',
    category: 'guide',
    body: '注册→认证→开始购物',
    views: 8200,
    helpful: 230,
    notHelpful: 18,
    enabled: true,
    daysAgo: 90
  },
  {
    title: '如何选择买手',
    category: 'guide',
    body: '查看买手评分 / KYC 状态 / 历史订单',
    views: 4800,
    helpful: 150,
    notHelpful: 12,
    enabled: true,
    daysAgo: 80
  },
  {
    title: '平台基础规则',
    category: 'guide',
    body: '所有交易走平台 USDT',
    views: 3600,
    helpful: 120,
    notHelpful: 9,
    enabled: true,
    daysAgo: 70
  },
  {
    title: '什么是三方群',
    category: 'guide',
    body: '订单产生时自动创建顾客买手平台三方群',
    views: 2400,
    helpful: 88,
    notHelpful: 4,
    enabled: true,
    daysAgo: 60
  },

  // order × 4
  {
    title: '订单状态说明',
    category: 'order',
    body: '待付款 → 采购中 → 待发货 → 待收货 → 已完成',
    views: 6500,
    helpful: 200,
    notHelpful: 15,
    enabled: true,
    daysAgo: 50
  },
  {
    title: '如何申请售后',
    category: 'order',
    body: '订单详情 → 申请售后 → 填写诉求 → 上传证据',
    views: 4200,
    helpful: 130,
    notHelpful: 8,
    enabled: true,
    daysAgo: 50
  },
  {
    title: '改价改运费规则',
    category: 'order',
    body: '商品价只能调小 / 运费税费一经支付不可退',
    views: 2800,
    helpful: 90,
    notHelpful: 6,
    enabled: true,
    daysAgo: 40
  },
  {
    title: '海外过关商品须知',
    category: 'order',
    body: '海外过关商品不可退',
    views: 1500,
    helpful: 50,
    notHelpful: 3,
    enabled: true,
    daysAgo: 30
  },

  // wallet × 4
  {
    title: '钱包余额构成',
    category: 'wallet',
    body: '可用 / 不可提现 / 锁仓中 / 订单冻结 / 风控冻结',
    views: 5800,
    helpful: 180,
    notHelpful: 11,
    enabled: true,
    daysAgo: 60
  },
  {
    title: '如何入金',
    category: 'wallet',
    body: '通过 OKX 或子钱包入金',
    views: 7200,
    helpful: 220,
    notHelpful: 14,
    enabled: true,
    daysAgo: 60
  },
  {
    title: '出金手续费说明',
    category: 'wallet',
    body: '手续费 = 燃料费 + 服务费',
    views: 4900,
    helpful: 145,
    notHelpful: 12,
    enabled: true,
    daysAgo: 50
  },
  {
    title: '锁仓利息计算',
    category: 'wallet',
    body: '简单利息 = 本金 × 年化 / 365 × 天数',
    views: 3100,
    helpful: 95,
    notHelpful: 6,
    enabled: true,
    daysAgo: 45
  },

  // kyc × 3
  {
    title: 'KYC 资料要求',
    category: 'kyc',
    body: '身份证正反面 / 人脸 / 手机号',
    views: 5600,
    helpful: 175,
    notHelpful: 14,
    enabled: true,
    daysAgo: 70
  },
  {
    title: 'KYC 审核时长',
    category: 'kyc',
    body: '工作日 72 小时内',
    views: 3400,
    helpful: 110,
    notHelpful: 8,
    enabled: true,
    daysAgo: 65
  },
  {
    title: 'KYC 失败如何处理',
    category: 'kyc',
    body: '查看驳回原因，按提示补正',
    views: 2200,
    helpful: 70,
    notHelpful: 5,
    enabled: true,
    daysAgo: 55
  },

  // aftersale × 3
  {
    title: '售后类型说明',
    category: 'aftersale',
    body: '退货退款 / 换货 / 修理 / 部分退款 / 仅退款',
    views: 4100,
    helpful: 130,
    notHelpful: 9,
    enabled: true,
    daysAgo: 50
  },
  {
    title: '平台介入流程',
    category: 'aftersale',
    body: '买手拒绝后自动转平台仲裁',
    views: 2800,
    helpful: 88,
    notHelpful: 6,
    enabled: true,
    daysAgo: 45
  },
  {
    title: '强制执行说明',
    category: 'aftersale',
    body: '买手拒不执行时平台强制扣押金',
    views: 1900,
    helpful: 58,
    notHelpful: 4,
    enabled: true,
    daysAgo: 40
  },

  // other × 2
  {
    title: '联系客服方式',
    category: 'other',
    body: '在线客服 / 邮件',
    views: 6800,
    helpful: 210,
    notHelpful: 18,
    enabled: true,
    daysAgo: 80
  },
  {
    title: '协议归档',
    category: 'other',
    body: '过期协议归档（不删除）',
    views: 1200,
    helpful: 38,
    notHelpful: 3,
    enabled: false,
    daysAgo: 30
  }
];

export const HELP_ARTICLES: HelpArticle[] = SEEDS.map(s => ({
  id: nextId(),
  title: s.title,
  category: s.category,
  body: s.body,
  viewsCount: s.views,
  helpful: s.helpful,
  notHelpful: s.notHelpful,
  enabled: s.enabled,
  createdAt: iso(s.daysAgo),
  updatedAt: iso(Math.max(0, s.daysAgo - 7))
}));

export function findHelpArticleById(id: number): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.id === id);
}

export function upsertHelpArticle(p: Api.Cms.HelpSaveParams): HelpArticle {
  const now = new Date().toISOString();
  if (p.id) {
    const existing = findHelpArticleById(p.id);
    if (!existing) throw new Error('文章不存在');
    Object.assign(existing, {
      title: p.title,
      category: p.category,
      body: p.body,
      enabled: p.enabled,
      updatedAt: now
    });
    return existing;
  }
  const created: HelpArticle = {
    id: nextId(),
    title: p.title,
    category: p.category,
    body: p.body,
    viewsCount: 0,
    helpful: 0,
    notHelpful: 0,
    enabled: p.enabled,
    createdAt: now,
    updatedAt: now
  };
  HELP_ARTICLES.unshift(created);
  return created;
}

export function toggleHelpArticle(id: number, enabled: boolean): HelpArticle | undefined {
  const a = findHelpArticleById(id);
  if (!a) return undefined;
  a.enabled = enabled;
  a.updatedAt = new Date().toISOString();
  return a;
}
