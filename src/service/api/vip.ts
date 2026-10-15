import { realUserRequest } from '@/service/request';
import { requireArray } from './page';
import { pointDataError, readPointNumber } from './point';

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
  if (role?.toUpperCase() === 'BUYER') return 'buyer';
  if (role?.toUpperCase() === 'CUSTOMER') return 'customer';
  throw pointDataError('VIP 角色');
}

function normalizeLevel(level?: string): Api.Vip.Level {
  if (level === 'VIP0' || level === 'VIP1' || level === 'VIP2') return level;
  throw pointDataError('VIP 等级');
}

function toBenefits(benefits: Api.RealVip.VipBenefitVO[] | undefined, audience: Api.Vip.Audience) {
  const allowed = audience === 'buyer' ? ['pushIntervalMinutes', 'transactionFeeDiscount', 'productSlotsMax']
    : ['interestRateBonus', 'purchaseConcurrent', 'purchasePriority', 'aftersaleResponse', 'withdrawFeeDiscount'];
  const target: Record<string, number> = {};
  if (benefits === undefined || benefits === null) return target;
  requireArray<Api.RealVip.VipBenefitVO>(benefits, 'VIP 权益').forEach(item => {
    const key = benefitCodeMap[item.code];
    if (key && allowed.includes(key)) {
      const value = readPointNumber(item.value, 'VIP 权益值', {
        integer: !['interestRateBonus', 'withdrawFeeDiscount', 'transactionFeeDiscount'].includes(key), minimum: 0, optional: true
      });
      if (value !== undefined) target[key] = value;
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
  return requireArray<Api.RealVip.VipCatalogRoleVO>(config.roles, 'VIP 角色配置').flatMap(role => {
    const audience = normalizeAudience(role.role);
    return requireArray<Api.RealVip.VipCatalogLevelVO>(role.levels, 'VIP 等级配置').map((row): Api.RealVip.LevelConfig => {
      const level = normalizeLevel(row.level);
      const benefits = toBenefits(row.benefits, audience);
      return {
        audience, level, label: level,
        threshold: readPointNumber(row.threshold, 'VIP 积分阈值', { integer: true, minimum: 0 })!,
        customerBenefits: audience === 'customer' ? benefits : undefined,
        buyerBenefits: audience === 'buyer' ? benefits : undefined
      };
    });
  });
}

export async function fetchMyVipStatus(userId: string | number, options: { signal?: AbortSignal; showError?: boolean; audience?: Api.Vip.Audience } = {}): Promise<Api.RealVip.Status> {
  // The endpoint returns both VIP dimensions; their presence does not grant buyer qualification.
  const { audience = 'customer', ...requestOptions } = options;
  const account = await realUserRequest.get<Api.RealPoint.UserPointVO>('/points/account', requestOptions);
  if (!account || (typeof account.userId !== 'string' && typeof account.userId !== 'number') || String(account.userId).trim() === ''
    || (typeof account.userId === 'number' && !Number.isSafeInteger(account.userId))
    || String(account.userId) !== String(userId)) throw pointDataError('积分账户归属');
  const current = audience === 'buyer' ? account.buyer : account.customer;
  if (!current || normalizeAudience(current.role) !== audience) throw pointDataError('当前视角 VIP 角色');
  const level = normalizeLevel(current.level);
  const nextThreshold = readPointNumber(current.nextThreshold, 'VIP 下一等级阈值', { integer: true, minimum: 0, optional: true });
  const points = readPointNumber(account.points, '当前积分', { integer: true })!;
  const pointsToNext = nextThreshold !== undefined ? Math.max(0, nextThreshold - points) : undefined;
  if (pointsToNext !== undefined && !Number.isSafeInteger(pointsToNext)) throw pointDataError('升级剩余积分');

  return {
    userId: account.userId,
    audience,
    level,
    vipLevel: level,
    points,
    nextThreshold,
    pointsToNext,
    benefits: toBenefits(current.benefits, audience),
    config: undefined
  };
}
