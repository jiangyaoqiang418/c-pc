/**
 * VIP mock API：等级配置 / 用户特权。
 */
import { VIP_CONFIGS, computeLevel, findConfig, nextThreshold } from '../mock/data/vip-config';
import { findUserById } from '../mock/data/users';
import { delay } from '../utils/mock-delay';

export async function fetchVipConfigs() {
  return delay(VIP_CONFIGS, 100);
}

export async function fetchVipBenefits(audience: Api.Vip.Audience, level: Api.Vip.Level) {
  return delay(findConfig(audience, level), 100);
}

export async function fetchMyVipStatus(userId: number) {
  const user = findUserById(userId);
  if (!user) return delay(undefined);
  const audience: Api.Vip.Audience = user.isBuyer ? 'buyer' : 'customer';
  const computed = computeLevel(user.points, audience);
  const cfg = findConfig(audience, computed);
  const next = nextThreshold(user.points, audience);
  return delay({
    userId: user.id,
    points: user.points,
    vipLevel: computed,
    audience,
    config: cfg,
    nextThreshold: next,
    pointsToNext: next != null ? Math.max(0, next - user.points) : 0
  });
}
