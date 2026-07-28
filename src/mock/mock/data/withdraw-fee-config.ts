/**
 * 提现费率配置（R-DATA-37）：3 链 × {gas, service, min, max, audit}。
 */
type FeeConfig = Api.Withdraw.FeeConfig;

const SEEDS: {
  chain: Api.Withdraw.Chain;
  gasFlat: string;
  serviceRate: string;
  minWithdraw: string;
  maxWithdraw: string;
  requiresAuditAmount: string;
}[] = [
  {
    chain: 'TRON',
    gasFlat: '2.00',
    serviceRate: '0.5',
    minWithdraw: '10.00',
    maxWithdraw: '100000.00',
    requiresAuditAmount: '5000.00'
  },
  {
    chain: 'ETH',
    gasFlat: '8.00',
    serviceRate: '1.0',
    minWithdraw: '50.00',
    maxWithdraw: '100000.00',
    requiresAuditAmount: '5000.00'
  },
  {
    chain: 'BSC',
    gasFlat: '3.00',
    serviceRate: '0.5',
    minWithdraw: '20.00',
    maxWithdraw: '100000.00',
    requiresAuditAmount: '5000.00'
  }
];

const now = new Date('2026-06-01T08:00:00+08:00').toISOString();

export const WITHDRAW_FEE_CONFIGS: FeeConfig[] = SEEDS.map(s => ({
  chain: s.chain,
  gasFlat: s.gasFlat,
  serviceRate: s.serviceRate,
  minWithdraw: s.minWithdraw,
  maxWithdraw: s.maxWithdraw,
  requiresAuditAmount: s.requiresAuditAmount,
  updatedAt: now
}));

export function findFeeConfig(chain: Api.Withdraw.Chain): FeeConfig | undefined {
  return WITHDRAW_FEE_CONFIGS.find(c => c.chain === chain);
}

export function upsertFeeConfig(p: Api.Withdraw.FeeSaveParams): FeeConfig {
  let existing = findFeeConfig(p.chain);
  if (!existing) {
    existing = { ...p, updatedAt: new Date().toISOString() };
    WITHDRAW_FEE_CONFIGS.push(existing);
    return existing;
  }
  existing.gasFlat = p.gasFlat;
  existing.serviceRate = p.serviceRate;
  existing.minWithdraw = p.minWithdraw;
  existing.maxWithdraw = p.maxWithdraw;
  existing.requiresAuditAmount = p.requiresAuditAmount;
  existing.updatedAt = new Date().toISOString();
  return existing;
}
