/**
 * 简化的 AML 检查 stub（C 端原型用）。
 * backstage 完整 GoPlus 三层校验在 [backstage/mock/api/blacklist.ts#L845](../../backstage/mock/api/blacklist.ts) `performAmlCheck`。
 * C 端仅按地址 hash 给一个稳定的伪结果，供 fund-deposits seed + 出金 UI 演示用。
 */

function addrHash(addr: string): number {
  let h = 0;
  for (let i = 0; i < addr.length; i += 1) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  return h;
}

const EMPTY_FLAGS: Api.Blacklist.RiskFlags = {
  isMalicious: false,
  sanctions: false,
  mixerRelated: false,
  darkweb: false,
  phishing: false,
  theft: false,
  fraud: false,
  moneyLaundering: false,
  contractBlacklisted: false
};

export function performAmlCheck(
  p: Api.Blacklist.AmlCheckParams
): Api.Blacklist.AmlCheckResult | { error: string } {
  if (!p.address) return { error: 'address 必填' };
  if (!p.chain) return { error: 'chain 必填' };

  const h = addrHash(p.address);
  const score = h % 100;
  const isHigh = score >= 80;
  const isMedium = !isHigh && score >= 50;

  const riskLevel: Api.Blacklist.RiskLevel = isHigh ? 'HIGH' : isMedium ? 'MEDIUM' : score >= 25 ? 'LOW' : 'NONE';
  const action: Api.Blacklist.AmlDecision['action'] = isHigh ? 'BLOCK' : isMedium ? 'MANUAL_REVIEW' : 'ALLOW';
  const reason: Api.Blacklist.AmlDecision['reason'] = isHigh ? 'HIGH_AML_SCORE' : isMedium ? 'AMOUNT_THRESHOLD' : undefined;

  return {
    requestId: `req_stub_${h}`,
    address: p.address,
    chain: p.chain,
    asset: p.asset,
    amount: p.amount,
    timestamp: new Date('2026-06-30T10:00:00+08:00').toISOString(),
    contractCheck: { checked: true, isBlacklisted: false, source: 'SKIPPED' },
    sanctionsCheck: { checked: true, isSanctioned: false, source: 'SKIPPED', lists: [] },
    amlScore: {
      checked: true,
      score,
      riskLevel,
      source: 'GOPLUS',
      flags: { ...EMPTY_FLAGS, moneyLaundering: isHigh },
      labels: isHigh ? ['HIGH_RISK_ADDRESS'] : []
    },
    decision: { action, reason }
  };
}
