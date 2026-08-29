import { realUserRequest } from '@/service/request';
import { toFiniteNumber, toOptionalFiniteNumber } from './number';

const benefitCodeMap: Record<string, keyof Api.Vip.CustomerBenefits | keyof Api.Vip.BuyerBenefits> = {
  interestRateBonus: 'interestRateBonus',
  purchaseConcurrent: 'purchaseConcurrent',
  purchasePriority: 'purchasePriority',
  aftersaleResponse: 'aftersaleResponse',
  withdrawFeeDiscount: 'withdrawFeeDiscount',
  pushIntervalMinutes: 'pushIntervalMinutes',
  transactionFeeDiscount: 'transactionFeeDiscount',
  productSlotsMax: 'productSlotsMax',
  C_RATE_BONUS: 'interestRateBonus',
  C_PURCHASE_CONCURRENCY: 'purchaseConcurrent',
  C_PURCHASE_PRIORITY: 'purchasePriority',
  C_AFTERSALE_RESPONSE: 'aftersaleResponse',
  C_WITHDRAW_FEE_DISCOUNT: 'withdrawFeeDiscount',
  B_PUSH_INTERVAL: 'pushIntervalMinutes',
  B_TRADE_FEE_DISCOUNT: 'transactionFeeDiscount',
  B_PRODUCT_LIMIT: 'productSlotsMax'
};

function normalizeAudience(role?: string): Api.Vip.Audience {
  return role?.toUpperCase() === 'BUYER' ? 'buyer' : 'customer';
}

function normalizeLevel(level?: string): Api.Vip.Level {
  if (level === 'VIP1' || level === 'VIP2') return level;
  return 'VIP0';
}

function emptyCustomerBenefits(): Api.Vip.CustomerBenefits {
  return {
    interestRateBonus: 0,
    purchaseConcurrent: 0,
    purchasePriority: 0,
    aftersaleResponse: 0,
    withdrawFeeDiscount: 0
  };
}

function emptyBuyerBenefits(): Api.Vip.BuyerBenefits {
  return {
    pushIntervalMinutes: 0,
    transactionFeeDiscount: 0,
    productSlotsMax: 0
  };
}

function toConfig(role: Api.RealVip.VipRoleGridVO, row: Api.RealVip.VipLevelRowVO): Api.Vip.LevelConfig {
  const audience = normalizeAudience(role.role);
  const benefits = row.benefits || {};
  const target = audience === 'buyer' ? emptyBuyerBenefits() : emptyCustomerBenefits();

  Object.entries(benefits).forEach(([code, value]) => {
    const key = benefitCodeMap[code];
    if (key && key in target) {
      (target as unknown as Record<string, number>)[key] = toFiniteNumber(value || 0);
    }
  });

  return {
    audience,
    level: normalizeLevel(row.level),
    label: normalizeLevel(row.level),
    threshold: toFiniteNumber(row.threshold || 0),
    customerBenefits: audience === 'customer' ? target as Api.Vip.CustomerBenefits : undefined,
    buyerBenefits: audience === 'buyer' ? target as Api.Vip.BuyerBenefits : undefined
  };
}

function roleInfoToBenefits(info?: Api.RealPoint.VipRoleInfoVO, audience: Api.Vip.Audience = 'customer') {
  const target = audience === 'buyer' ? emptyBuyerBenefits() : emptyCustomerBenefits();
  info?.benefits?.forEach(item => {
    const key = benefitCodeMap[item.code];
    if (key && key in target) {
      (target as unknown as Record<string, number>)[key] = toFiniteNumber(item.value || 0);
    }
  });
  return target;
}

export async function fetchVipConfigs(options: { signal?: AbortSignal } = {}) {
  const config = await realUserRequest.get<Api.RealVip.VipLevelCatalogVO>('/points/vip-configs', {
    ...options,
    showError: false,
    skipAuthRedirect: true
  });
  return (config.roles || []).flatMap(role => (role.levels || []).map(row => toConfig({ role: role.role, roleText: role.roleText }, {
    level: row.level,
    threshold: row.threshold,
    benefits: Object.fromEntries((row.benefits || []).map(item => [item.code, item.value || 0]))
  })));
}

export async function fetchMyVipStatus(userId: string | number, options: { signal?: AbortSignal } = {}): Promise<Api.RealVip.Status> {
  const account = await realUserRequest.get<Api.RealPoint.UserPointVO>('/points/account', options);
  const customer = account.customer;
  const buyer = account.buyer;
  const audience: Api.Vip.Audience = buyer ? 'buyer' : 'customer';
  const current = audience === 'buyer' ? buyer : customer;
  const nextThreshold = toOptionalFiniteNumber(current?.nextThreshold);
  const points = toFiniteNumber(account.points || 0);

  return {
    userId: account.userId || userId,
    audience,
    level: normalizeLevel(current?.level),
    vipLevel: normalizeLevel(current?.level),
    points,
    nextThreshold,
    pointsToNext: nextThreshold != null ? Math.max(0, nextThreshold - points) : 0,
    benefits: roleInfoToBenefits(current, audience),
    config: undefined
  };
}
