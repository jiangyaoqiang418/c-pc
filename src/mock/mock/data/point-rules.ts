/**
 * 11 个积分行为规则（R-DATA-10：code/label/audience/desc/unit 写死，pointsPerUnit/cap/enabled 可配）。
 */
type Rule = Api.Point.Rule;

export const POINT_RULES: Rule[] = [
  {
    code: 'CONSUME',
    label: '消费',
    audience: 'all',
    description: '每消费 1U 得 X 分',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'DEPOSIT_IN',
    label: '入金',
    audience: 'all',
    description: '每入金 1U 得 X 分',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'RECHARGE',
    label: '充值',
    audience: 'all',
    description: '每充值 1U 得 X 分',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'WITHDRAW',
    label: '提现',
    audience: 'all',
    description: '每提现 1U 得 X 分',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'FINANCE_HOLD',
    label: '锁仓持有',
    audience: 'all',
    description: '每 10U 锁仓持有 1 天得 X 分',
    unitLabel: '10U/天',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 100,
    capTotal: 0
  },
  {
    code: 'ORDER_DONE',
    label: '完成订单',
    audience: 'all',
    description: '每完成一笔订单，订单 1U 得 X 分',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'KYC_PASS',
    label: 'KYC 认证通过',
    audience: 'all',
    description: 'KYC 通过一次性奖励 X 分',
    unitLabel: '一次性',
    pointsPerUnit: 100,
    enabled: true,
    capDaily: 0,
    capTotal: 100
  },
  {
    code: 'REVIEW_GOOD',
    label: '收到好评',
    audience: 'all',
    description: '每收到一个好评得 X 分',
    unitLabel: '1 次',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 50,
    capTotal: 0
  },
  {
    code: 'REVIEW_BAD',
    label: '收到差评',
    audience: 'all',
    description: '每收到一个差评扣 X 分',
    unitLabel: '1 次',
    pointsPerUnit: -1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'DEPOSIT_PLEDGE',
    label: '买手押金',
    audience: 'buyer',
    description: '买手每 1U 押金得 X 分（持有型）',
    unitLabel: '1U',
    pointsPerUnit: 1,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  },
  {
    code: 'BUYER_NO_FULFILL',
    label: '接单未履约',
    audience: 'buyer',
    description: '买手每次接单未成功履约扣 X 分（可申诉）',
    unitLabel: '1 次',
    pointsPerUnit: -50,
    enabled: true,
    capDaily: 0,
    capTotal: 0
  }
];

/** 重置为默认值 */
export function resetRulesToDefault() {
  const DEFAULTS: Record<Api.Point.BehaviorCode, Pick<Rule, 'pointsPerUnit' | 'capDaily' | 'capTotal' | 'enabled'>> = {
    CONSUME: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    DEPOSIT_IN: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    RECHARGE: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    WITHDRAW: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    FINANCE_HOLD: { pointsPerUnit: 1, capDaily: 100, capTotal: 0, enabled: true },
    ORDER_DONE: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    KYC_PASS: { pointsPerUnit: 100, capDaily: 0, capTotal: 100, enabled: true },
    REVIEW_GOOD: { pointsPerUnit: 1, capDaily: 50, capTotal: 0, enabled: true },
    REVIEW_BAD: { pointsPerUnit: -1, capDaily: 0, capTotal: 0, enabled: true },
    DEPOSIT_PLEDGE: { pointsPerUnit: 1, capDaily: 0, capTotal: 0, enabled: true },
    BUYER_NO_FULFILL: { pointsPerUnit: -50, capDaily: 0, capTotal: 0, enabled: true }
  };
  POINT_RULES.forEach(r => Object.assign(r, DEFAULTS[r.code]));
}

export function findRule(code: Api.Point.BehaviorCode) {
  return POINT_RULES.find(r => r.code === code);
}
