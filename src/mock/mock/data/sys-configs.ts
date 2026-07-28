/**
 * 系统配置池（R-DATA-39）：30+ 条覆盖 5 category + 10+ 邮件模板。
 */
type ConfigItem = Api.SysConfig.ConfigItem;
type ConfigHistory = Api.SysConfig.ConfigHistory;
type EmailTemplate = Api.SysConfig.EmailTemplate;

let historyIdCursor = 0;
function nextHistoryId(): number {
  historyIdCursor += 1;
  return historyIdCursor;
}

function iso(daysAgo: number, h = 9): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
}

interface Seed {
  key: string;
  category: Api.SysConfig.ConfigCategory;
  name: string;
  description: string;
  valueType: Api.SysConfig.ValueType;
  value: string;
  defaultValue: string;
  minValue?: string;
  maxValue?: string;
  enumOptions?: string[];
  isSensitive?: boolean;
}

const SEEDS: Seed[] = [
  // business（10）
  {
    key: 'order.timeout.payment_hours',
    category: 'business',
    name: '付款超时（小时）',
    description: '订单创建后超时未付款自动取消时长',
    valueType: 'number',
    value: '48',
    defaultValue: '48',
    minValue: '1',
    maxValue: '720'
  },
  {
    key: 'order.warranty.days',
    category: 'business',
    name: '默认保修天数',
    description: '店铺保修订单默认保修期',
    valueType: 'number',
    value: '90',
    defaultValue: '90',
    minValue: '7',
    maxValue: '365'
  },
  {
    key: 'order.auto_receive_days',
    category: 'business',
    name: '自动签收天数',
    description: '快递签收后顾客未确认自动签收时长',
    valueType: 'number',
    value: '7',
    defaultValue: '7'
  },
  {
    key: 'purchase.push.interval_minutes',
    category: 'business',
    name: '求购推送间隔（分钟）',
    description: '按 VIP 等级阶梯推送的间隔',
    valueType: 'number',
    value: '10',
    defaultValue: '10'
  },
  {
    key: 'aftersale.sla_hours',
    category: 'business',
    name: '售后 SLA（小时）',
    description: '售后工单首次响应时长',
    valueType: 'number',
    value: '24',
    defaultValue: '24'
  },
  {
    key: 'im.message.max_length',
    category: 'business',
    name: 'IM 消息最大长度',
    description: '单条 IM 消息字符上限',
    valueType: 'number',
    value: '2000',
    defaultValue: '2000'
  },
  {
    key: 'kyc.validity.months',
    category: 'business',
    name: 'KYC 有效期（月）',
    description: 'KYC 通过后有效月数',
    valueType: 'number',
    value: '24',
    defaultValue: '24'
  },
  {
    key: 'buyer.deposit.min_pct',
    category: 'business',
    name: '买手押金最低比例（%）',
    description: '商品最贵单价的最低押金比例',
    valueType: 'number',
    value: '100',
    defaultValue: '100'
  },
  {
    key: 'review.appeal_window_days',
    category: 'business',
    name: '评价申诉期（天）',
    description: '评价方可申诉时长',
    valueType: 'number',
    value: '7',
    defaultValue: '7'
  },
  {
    key: 'product.audit_required_for_change',
    category: 'business',
    name: '商品信息变更需审核',
    description: '修改商品信息（非价格库存）需走审核',
    valueType: 'boolean',
    value: 'true',
    defaultValue: 'true'
  },

  // fee（5）
  {
    key: 'order.commission.rate_default',
    category: 'fee',
    name: '默认订单手续费率（%）',
    description: '订单平台手续费率',
    valueType: 'number',
    value: '2.0',
    defaultValue: '2.0',
    minValue: '0',
    maxValue: '20'
  },
  {
    key: 'withdraw.fee.tron_gas',
    category: 'fee',
    name: 'TRON 燃料费固定（U）',
    description: '提现到 TRON 链的燃料费',
    valueType: 'number',
    value: '2.0',
    defaultValue: '2.0'
  },
  {
    key: 'withdraw.fee.eth_gas',
    category: 'fee',
    name: 'ETH 燃料费固定（U）',
    description: '提现到 ETH 链的燃料费',
    valueType: 'number',
    value: '8.0',
    defaultValue: '8.0'
  },
  {
    key: 'withdraw.fee.service_rate',
    category: 'fee',
    name: '提现服务费率（%）',
    description: '平台提现服务费率',
    valueType: 'number',
    value: '0.5',
    defaultValue: '0.5'
  },
  {
    key: 'finance.interest.daily_settle_hour',
    category: 'fee',
    name: '利息每日结算时刻',
    description: '锁仓利息每日结算的小时（0-23）',
    valueType: 'number',
    value: '0',
    defaultValue: '0'
  },

  // sla（5）
  {
    key: 'audit.sla.normal',
    category: 'sla',
    name: '审核 SLA 普通（小时）',
    description: '普通审核 SLA 时长',
    valueType: 'number',
    value: '24',
    defaultValue: '24'
  },
  {
    key: 'audit.sla.urgent',
    category: 'sla',
    name: '审核 SLA 紧急（小时）',
    description: '紧急审核 SLA 时长',
    valueType: 'number',
    value: '4',
    defaultValue: '4'
  },
  {
    key: 'kyc.sla.hours',
    category: 'sla',
    name: 'KYC 审核 SLA（小时）',
    description: 'KYC 审核 SLA 时长',
    valueType: 'number',
    value: '72',
    defaultValue: '72'
  },
  {
    key: 'withdraw.sla.hours',
    category: 'sla',
    name: '出金 SLA（小时）',
    description: '提现审核 SLA 时长',
    valueType: 'number',
    value: '12',
    defaultValue: '12'
  },
  {
    key: 'aftersale.intervene_sla',
    category: 'sla',
    name: '售后介入 SLA（小时）',
    description: '买手拒绝后平台介入的 SLA',
    valueType: 'number',
    value: '24',
    defaultValue: '24'
  },

  // email（5，含敏感）
  {
    key: 'email.from',
    category: 'email',
    name: '发件人邮箱',
    description: '平台对外发件的统一 From',
    valueType: 'string',
    value: 'noreply@example.com',
    defaultValue: 'noreply@example.com'
  },
  {
    key: 'email.smtp.host',
    category: 'email',
    name: 'SMTP 主机',
    description: 'SMTP 服务器地址',
    valueType: 'string',
    value: 'smtp.example.com',
    defaultValue: 'smtp.example.com'
  },
  {
    key: 'email.smtp.port',
    category: 'email',
    name: 'SMTP 端口',
    description: 'SMTP 服务器端口',
    valueType: 'number',
    value: '587',
    defaultValue: '587'
  },
  {
    key: 'email.smtp.user',
    category: 'email',
    name: 'SMTP 用户名',
    description: 'SMTP 认证用户名',
    valueType: 'string',
    value: 'noreply@example.com',
    defaultValue: ''
  },
  {
    key: 'email.smtp.password',
    category: 'email',
    name: 'SMTP 密码',
    description: 'SMTP 认证密码（敏感）',
    valueType: 'string',
    value: 'secret-pwd-1234',
    defaultValue: '',
    isSensitive: true
  },

  // security（5）
  {
    key: 'login.max_attempts',
    category: 'security',
    name: '登录最大失败次数',
    description: '连续失败次数到达后锁定账号',
    valueType: 'number',
    value: '5',
    defaultValue: '5'
  },
  {
    key: 'login.lock_minutes',
    category: 'security',
    name: '账号锁定时长（分钟）',
    description: '失败后锁定时长',
    valueType: 'number',
    value: '15',
    defaultValue: '15'
  },
  {
    key: 'password.min_length',
    category: 'security',
    name: '密码最小长度',
    description: '用户密码最小长度',
    valueType: 'number',
    value: '8',
    defaultValue: '8'
  },
  {
    key: 'pay_pwd.length',
    category: 'security',
    name: '支付密码长度',
    description: '支付密码固定位数',
    valueType: 'number',
    value: '6',
    defaultValue: '6'
  },
  {
    key: 'session.timeout_minutes',
    category: 'security',
    name: '会话超时（分钟）',
    description: '后台会话最大空闲时长',
    valueType: 'number',
    value: '120',
    defaultValue: '120'
  }
];

export const SYS_CONFIGS: ConfigItem[] = SEEDS.map(s => ({
  key: s.key,
  category: s.category,
  name: s.name,
  description: s.description,
  valueType: s.valueType,
  value: s.value,
  defaultValue: s.defaultValue,
  minValue: s.minValue,
  maxValue: s.maxValue,
  enumOptions: s.enumOptions,
  isSensitive: s.isSensitive || false,
  lastModifiedBy: 'super',
  lastModifiedAt: iso(30)
}));

export const SYS_CONFIG_HISTORY: ConfigHistory[] = [];

export function findConfig(key: string): ConfigItem | undefined {
  return SYS_CONFIGS.find(c => c.key === key);
}

export function setConfig(key: string, value: string, operator: string): ConfigItem | undefined {
  const c = findConfig(key);
  if (!c) return undefined;
  const oldValue = c.value;
  c.value = value;
  c.lastModifiedBy = operator;
  c.lastModifiedAt = new Date().toISOString();
  SYS_CONFIG_HISTORY.unshift({
    id: nextHistoryId(),
    key,
    oldValue,
    newValue: value,
    modifiedBy: operator,
    modifiedAt: c.lastModifiedAt
  });
  return c;
}

export function resetConfig(key: string, operator: string): ConfigItem | undefined {
  const c = findConfig(key);
  if (!c) return undefined;
  return setConfig(key, c.defaultValue, operator);
}

// 邮件模板
interface TplSeed {
  code: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  enabled: boolean;
}

const TPL_SEEDS: TplSeed[] = [
  {
    code: 'welcome',
    name: '欢迎注册',
    subject: '欢迎加入 {{platformName}}！',
    body: '亲爱的 {{nickname}}，欢迎您加入。\n\n请尽快完成 KYC 认证以解锁更多功能。',
    variables: ['platformName', 'nickname'],
    enabled: true
  },
  {
    code: 'kyc_passed',
    name: 'KYC 通过',
    subject: 'KYC 认证已通过 - {{platformName}}',
    body: '您的 KYC 认证已审核通过！\n\nKYC 有效期至：{{validUntil}}',
    variables: ['platformName', 'validUntil'],
    enabled: true
  },
  {
    code: 'kyc_rejected',
    name: 'KYC 驳回',
    subject: 'KYC 认证未通过 - 请补正',
    body: '很遗憾，您的 KYC 申请被驳回。\n\n原因：{{reason}}\n\n请根据提示重新提交。',
    variables: ['reason'],
    enabled: true
  },
  {
    code: 'withdraw_pending',
    name: '提现待审核',
    subject: '提现申请已提交 - {{platformName}}',
    body: '您的提现申请已提交：\n\n金额：{{amount}} U\n地址：{{toAddress}}\n\n预计 {{slaHours}} 小时内审核完成。',
    variables: ['platformName', 'amount', 'toAddress', 'slaHours'],
    enabled: true
  },
  {
    code: 'withdraw_paid',
    name: '提现已打款',
    subject: '提现已到账 - {{platformName}}',
    body: '您的提现已成功打款：\n\n金额：{{amount}} U\n链上哈希：{{txHash}}',
    variables: ['platformName', 'amount', 'txHash'],
    enabled: true
  },
  {
    code: 'order_paid',
    name: '订单付款成功',
    subject: '订单 {{orderCode}} 付款成功',
    body: '您的订单 {{orderCode}} 已付款，等待买手采购。',
    variables: ['orderCode'],
    enabled: true
  },
  {
    code: 'order_shipped',
    name: '订单发货',
    subject: '订单 {{orderCode}} 已发货',
    body: '订单已发货：\n\n运单号：{{trackingNumber}}\n承运商：{{carrier}}',
    variables: ['orderCode', 'trackingNumber', 'carrier'],
    enabled: true
  },
  {
    code: 'order_completed',
    name: '订单完成',
    subject: '订单 {{orderCode}} 已完成',
    body: '订单 {{orderCode}} 已完成交易，欢迎互评。',
    variables: ['orderCode'],
    enabled: true
  },
  {
    code: 'aftersale_arbitrate',
    name: '售后仲裁通知',
    subject: '售后工单 {{caseCode}} 进入仲裁',
    body: '您的售后工单已进入平台仲裁，仲裁员将在 {{slaHours}} 小时内给出判决。',
    variables: ['caseCode', 'slaHours'],
    enabled: true
  },
  {
    code: 'blacklist_added',
    name: '账号被列入黑名单',
    subject: '重要：您的账号已被冻结',
    body: '您的账号因 {{reason}} 已被冻结。如有疑问请联系客服。',
    variables: ['reason'],
    enabled: true
  }
];

export const EMAIL_TEMPLATES: EmailTemplate[] = TPL_SEEDS.map(t => ({
  code: t.code,
  name: t.name,
  subject: t.subject,
  body: t.body,
  variables: t.variables,
  enabled: t.enabled,
  lastModifiedAt: iso(30)
}));

export function findTemplate(code: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.code === code);
}

export function setTemplate(p: Api.SysConfig.EmailTemplateSaveParams): EmailTemplate | undefined {
  const t = findTemplate(p.code);
  if (!t) return undefined;
  t.subject = p.subject;
  t.body = p.body;
  t.enabled = p.enabled;
  t.lastModifiedAt = new Date().toISOString();
  return t;
}
