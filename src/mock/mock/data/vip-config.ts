/**
 * VIP 等级配置（R-DATA-10：等级与维度写死，阈值/数值可配）。
 * 顾客 × 3 + 买手 × 3 = 6 条 LevelConfig
 */
type LevelConfig = Api.Vip.LevelConfig;

export const VIP_CONFIGS: LevelConfig[] = [
  // ===== 顾客 =====
  {
    audience: 'customer',
    level: 'VIP0',
    label: 'VIP0',
    threshold: 0,
    customerBenefits: {
      interestRateBonus: 0,
      purchaseConcurrent: 1,
      purchasePriority: 0,
      aftersaleResponse: 0,
      withdrawFeeDiscount: 0
    }
  },
  {
    audience: 'customer',
    level: 'VIP1',
    label: 'VIP1',
    threshold: 1000,
    customerBenefits: {
      interestRateBonus: 0.1,
      purchaseConcurrent: 3,
      purchasePriority: 1,
      aftersaleResponse: 1,
      withdrawFeeDiscount: 0.1
    }
  },
  {
    audience: 'customer',
    level: 'VIP2',
    label: 'VIP2',
    threshold: 10000,
    customerBenefits: {
      interestRateBonus: 0.2,
      purchaseConcurrent: 5,
      purchasePriority: 2,
      aftersaleResponse: 2,
      withdrawFeeDiscount: 0.2
    }
  },
  // ===== 买手 =====
  {
    audience: 'buyer',
    level: 'VIP0',
    label: 'VIP0',
    threshold: 0,
    buyerBenefits: {
      pushIntervalMinutes: 10,
      transactionFeeDiscount: 0,
      productSlotsMax: 5
    }
  },
  {
    audience: 'buyer',
    level: 'VIP1',
    label: 'VIP1',
    threshold: 1000,
    buyerBenefits: {
      pushIntervalMinutes: 5,
      transactionFeeDiscount: 0.5,
      productSlotsMax: 10
    }
  },
  {
    audience: 'buyer',
    level: 'VIP2',
    label: 'VIP2',
    threshold: 10000,
    buyerBenefits: {
      pushIntervalMinutes: 1,
      transactionFeeDiscount: 1,
      productSlotsMax: 20
    }
  }
];

/** 默认值快照（重置用） */
const DEFAULTS = JSON.parse(JSON.stringify(VIP_CONFIGS)) as LevelConfig[];

export function resetVipConfigToDefault() {
  VIP_CONFIGS.length = 0;
  VIP_CONFIGS.push(...JSON.parse(JSON.stringify(DEFAULTS)));
}

export function thresholdsByAudience(): {
  customer: { VIP0: number; VIP1: number; VIP2: number };
  buyer: { VIP0: number; VIP1: number; VIP2: number };
} {
  const pick = (a: Api.Vip.Audience): { VIP0: number; VIP1: number; VIP2: number } => {
    const get = (lv: Api.Vip.Level) => VIP_CONFIGS.find(c => c.audience === a && c.level === lv)?.threshold || 0;
    return { VIP0: get('VIP0'), VIP1: get('VIP1'), VIP2: get('VIP2') };
  };
  return { customer: pick('customer'), buyer: pick('buyer') };
}

export function findConfig(audience: Api.Vip.Audience, level: Api.Vip.Level): LevelConfig | undefined {
  return VIP_CONFIGS.find(c => c.audience === audience && c.level === level);
}

export function computeLevel(points: number, audience: Api.Vip.Audience): Api.Vip.Level {
  const t = audience === 'customer' ? thresholdsByAudience().customer : thresholdsByAudience().buyer;
  if (points >= t.VIP2) return 'VIP2';
  if (points >= t.VIP1) return 'VIP1';
  return 'VIP0';
}

export function nextThreshold(points: number, audience: Api.Vip.Audience): number | undefined {
  const t = audience === 'customer' ? thresholdsByAudience().customer : thresholdsByAudience().buyer;
  if (points < t.VIP1) return t.VIP1;
  if (points < t.VIP2) return t.VIP2;
  return undefined;
}
