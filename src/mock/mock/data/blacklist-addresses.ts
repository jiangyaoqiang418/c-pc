/**
 * 链上黑钱包内存池（≥ 20 条 seed），多链分布：
 *   TRC20 ≥ 14（项目主链）：4 CONTRACT / 4 AML_API / 3 MANUAL / 3 SANCTIONS
 *   ERC20 ≥ 4：含 CONTRACT + SANCTIONS
 *   BSC ≥ 3：AML_API
 *
 * riskLevel 分布：3 NONE / 4 LOW / 6 MEDIUM / 5 HIGH / 2 CRITICAL；status：17 active + 3 removed。
 * relatedUserIds：5 条关联到具体顾客（演示反向关联，关联到 IDs 5/6/11/14/17 — 与 customer 黑名单同步）。
 *
 * 地址生成：合法 base58（TRC20）/ hex（ERC20/BSC），不含会被 TRC20_RE 拒绝的 `X`。
 */
import { nextEventId } from './blacklist-events';

type ChainBlacklistEntry = Api.Blacklist.ChainBlacklistEntry;
type RiskFlags = Api.Blacklist.RiskFlags;
type BlacklistEvent = Api.Blacklist.BlacklistEvent;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

/** 默认全 false 风险旗帜 */
function emptyFlags(): RiskFlags {
  return {
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
}

function makeFlags(overrides: Partial<RiskFlags>): RiskFlags {
  return { ...emptyFlags(), ...overrides };
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface AddrSeed {
  address: string;
  chain: Api.Blacklist.Chain;
  asset?: Api.Blacklist.Asset;
  source: Api.Blacklist.ChainSource;
  sourceLabel: string;
  riskLevel: Api.Blacklist.RiskLevel;
  score: number;
  flags: RiskFlags;
  labels: string[];
  entity?: string;
  relatedUserIds: number[];
  reason: string;
  addedBy: string;
  addedDaysAgo: number;
  removedBy?: string;
  removedReason?: string;
  removedDaysAgo?: number;
}

// 真实风格的伪 TRC20 地址（T + 33 base58）
const TRC20_ADDRESSES = [
  'TJ8Pq3Rk2Vn9Yw7Mt5Cz1Lf6Hj4Bs2Xn7q', // CONTRACT
  'TKp7m4Zr3Hf8Vk2Cj5Ln9Pq6Rs4Mt1Yw8z', // CONTRACT
  'TLn5h9Wf3Bp7Vk2Cj4Mt8Yq6Rs1Hf5Zr3a', // CONTRACT
  'TMr3k7Vp2Wn8Cj5Lf4Hq6Yt9Bs1Zn3Pq7m', // CONTRACT (removed)
  'TNp7r4Yk2Hf8Vn5Cj3Mt9Bs6Lq1Wp4Zr5h', // AML_API
  'TPq3m8Wf5Hk2Cn7Lj4Bs6Yt9Vr1Pq3Mn8w', // AML_API
  'TQk5r2Yp9Vf3Hn6Bj4Mt8Cs1Lq7Wp5Zn3r', // AML_API
  'TRn8m4Wp7Hf2Vk5Cj9Lt3Yq6Bs1Mr8Zp4w', // AML_API
  'TSp4r9Yk2Hf7Vn5Cj3Mt8Bs1Lq6Wp4Zr3h', // MANUAL (related to user 5)
  'TUk2m7Wf5Hn4Cj9Vp3Lt8Bs6Yq1Mr2Zp7w', // MANUAL (related to user 6)
  'TVn7r3Yp4Hf8Vk2Cj5Mt9Bs6Lq1Wp4Zr2h', // MANUAL (related to user 11)
  'TWk4m9Wf2Hn5Cj7Vp3Lt8Bs6Yq1Mr2Zp5r', // SANCTIONS
  'TXp2r7Yk5Hf3Vn8Cj4Mt9Bs1Lq6Wp4Zr2m', // SANCTIONS
  'TYn5m3Wf8Hk2Cn7Lj4Bs6Yt9Vr1Pq3Mn8w' // SANCTIONS (removed)
];

const ERC20_ADDRESSES = [
  '0xa3f1b8e9c2d4567890abcdef1234567890abcdef',
  '0xb4e2c9da3f5678910bcdef234567890abcdef123',
  '0xc5d3eab4067890ab23456789cdef0abcdef12345',
  '0xd6e4fbc56078901bcdef34567890def123456abc'
];

const BSC_ADDRESSES = [
  '0xe7f5ced670789012cdef45678901ef234567bcde',
  '0xf806dfe781890123def56789012f0345678cdef0',
  '0x0917fef89290123ef0678901234567890de12345'
];

const SEEDS: AddrSeed[] = [
  // ===== TRC20: 4 CONTRACT =====
  {
    address: TRC20_ADDRESSES[0],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'CONTRACT',
    sourceLabel: 'Tether Contract isBlackListed',
    riskLevel: 'CRITICAL',
    score: 98,
    flags: makeFlags({ contractBlacklisted: true, sanctions: true, moneyLaundering: true }),
    labels: ['Tether Blacklisted', 'Sanctioned'],
    relatedUserIds: [],
    reason: 'USDT TRC20 合约层 isBlackListed=true（链上自动同步）',
    addedBy: 'system',
    addedDaysAgo: 30
  },
  {
    address: TRC20_ADDRESSES[1],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'CONTRACT',
    sourceLabel: 'Tether Contract isBlackListed',
    riskLevel: 'HIGH',
    score: 88,
    flags: makeFlags({ contractBlacklisted: true, theft: true }),
    labels: ['Tether Blacklisted', 'Stolen Funds'],
    entity: 'Unknown Hacker Wallet',
    relatedUserIds: [],
    reason: 'Tether 官方封禁地址（被盗资金）',
    addedBy: 'system',
    addedDaysAgo: 45
  },
  {
    address: TRC20_ADDRESSES[2],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'CONTRACT',
    sourceLabel: 'Tether Contract isBlackListed',
    riskLevel: 'HIGH',
    score: 85,
    flags: makeFlags({ contractBlacklisted: true, fraud: true }),
    labels: ['Tether Blacklisted', 'Fraud'],
    relatedUserIds: [],
    reason: '链上同步：合约层 isBlackListed',
    addedBy: 'system',
    addedDaysAgo: 60
  },
  {
    address: TRC20_ADDRESSES[3],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'CONTRACT',
    sourceLabel: 'Tether Contract isBlackListed',
    riskLevel: 'MEDIUM',
    score: 65,
    flags: makeFlags({ contractBlacklisted: true }),
    labels: ['Tether Blacklisted'],
    relatedUserIds: [],
    reason: '链上同步（已被 Tether 解封）',
    addedBy: 'system',
    addedDaysAgo: 90,
    removedBy: 'system',
    removedReason: 'Tether 已解除地址限制（合约 unblacklist 事件触发）',
    removedDaysAgo: 30
  },

  // ===== TRC20: 4 AML_API =====
  {
    address: TRC20_ADDRESSES[4],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'CRITICAL',
    score: 95,
    flags: makeFlags({ isMalicious: true, mixerRelated: true, darkweb: true, moneyLaundering: true }),
    labels: ['Mixer', 'Darkweb Marketplace', 'Money Laundering'],
    entity: 'TornadoCash-like Mixer',
    relatedUserIds: [14],
    reason: 'GoPlus 推送：综合评分 95，混币器关联 + 暗网交易',
    addedBy: 'risk',
    addedDaysAgo: 12
  },
  {
    address: TRC20_ADDRESSES[5],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'HIGH',
    score: 78,
    flags: makeFlags({ isMalicious: true, fraud: true, phishing: true }),
    labels: ['Phishing', 'Fraud'],
    relatedUserIds: [],
    reason: 'GoPlus 推送：钓鱼诈骗集群关联',
    addedBy: 'risk',
    addedDaysAgo: 20
  },
  {
    address: TRC20_ADDRESSES[6],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'MEDIUM',
    score: 55,
    flags: makeFlags({ mixerRelated: true }),
    labels: ['Mixer Adjacent'],
    relatedUserIds: [],
    reason: 'GoPlus：与混币器有间接接触（2 跳）',
    addedBy: 'risk',
    addedDaysAgo: 25
  },
  {
    address: TRC20_ADDRESSES[7],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'MistTrack',
    riskLevel: 'MEDIUM',
    score: 48,
    flags: makeFlags({ fraud: true }),
    labels: ['Fraud Reported'],
    relatedUserIds: [],
    reason: 'MistTrack：用户举报涉嫌欺诈',
    addedBy: 'risk',
    addedDaysAgo: 18
  },

  // ===== TRC20: 3 MANUAL =====（关联具体顾客，演示反向关联）
  {
    address: TRC20_ADDRESSES[8],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'MANUAL',
    sourceLabel: '管理员手工',
    riskLevel: 'HIGH',
    score: 80,
    flags: makeFlags({ moneyLaundering: true }),
    labels: ['Manual Add', '关联顾客黑名单'],
    relatedUserIds: [5], // 刘亦菲
    reason: '关联顾客 5 刘亦菲（黑U入金记录的来源地址）',
    addedBy: 'risk',
    addedDaysAgo: 18
  },
  {
    address: TRC20_ADDRESSES[9],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'MANUAL',
    sourceLabel: '管理员手工',
    riskLevel: 'MEDIUM',
    score: 60,
    flags: makeFlags({ fraud: true }),
    labels: ['Manual Add', '关联身份盗用'],
    relatedUserIds: [6], // 陈乔乔
    reason: '关联顾客 6 陈乔乔（身份盗用嫌疑）',
    addedBy: 'risk',
    addedDaysAgo: 25
  },
  {
    address: TRC20_ADDRESSES[10],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'MANUAL',
    sourceLabel: '管理员手工',
    riskLevel: 'MEDIUM',
    score: 52,
    flags: makeFlags({ fraud: true }),
    labels: ['Manual Add', 'Chargeback'],
    relatedUserIds: [11], // 吴心然
    reason: '关联顾客 11 吴心然（chargeback 资金回流地址）',
    addedBy: 'risk',
    addedDaysAgo: 10
  },

  // ===== TRC20: 3 SANCTIONS =====
  {
    address: TRC20_ADDRESSES[11],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'SANCTIONS',
    sourceLabel: 'OFAC SDN List',
    riskLevel: 'CRITICAL',
    score: 99,
    flags: makeFlags({ sanctions: true, moneyLaundering: true }),
    labels: ['OFAC SDN', 'Sanctioned'],
    entity: 'OFAC Designated Entity',
    relatedUserIds: [],
    reason: 'OFAC SDN 制裁名单命中（TRON 链下管控）',
    addedBy: 'system',
    addedDaysAgo: 100
  },
  {
    address: TRC20_ADDRESSES[12],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'SANCTIONS',
    sourceLabel: 'UN Sanctions List',
    riskLevel: 'HIGH',
    score: 85,
    flags: makeFlags({ sanctions: true }),
    labels: ['UN Sanctions'],
    relatedUserIds: [],
    reason: 'UN 制裁名单',
    addedBy: 'system',
    addedDaysAgo: 80
  },
  {
    address: TRC20_ADDRESSES[13],
    chain: 'TRC20',
    asset: 'USDT',
    source: 'SANCTIONS',
    sourceLabel: 'EU Sanctions',
    riskLevel: 'LOW',
    score: 28,
    flags: makeFlags({ sanctions: true }),
    labels: ['EU Sanctions (Lifted)'],
    relatedUserIds: [],
    reason: 'EU 制裁名单（后已解除）',
    addedBy: 'system',
    addedDaysAgo: 200,
    removedBy: 'system',
    removedReason: 'EU 已解除该地址制裁',
    removedDaysAgo: 50
  },

  // ===== ERC20: 4 =====
  {
    address: ERC20_ADDRESSES[0],
    chain: 'ERC20',
    asset: 'USDT',
    source: 'CONTRACT',
    sourceLabel: 'Tether ERC20 getBlackListStatus',
    riskLevel: 'HIGH',
    score: 88,
    flags: makeFlags({ contractBlacklisted: true, theft: true }),
    labels: ['Tether ERC20 Blacklisted', 'Stolen'],
    relatedUserIds: [],
    reason: 'USDT ERC20 合约层 getBlackListStatus=true',
    addedBy: 'system',
    addedDaysAgo: 35
  },
  {
    address: ERC20_ADDRESSES[1],
    chain: 'ERC20',
    asset: 'USDC',
    source: 'CONTRACT',
    sourceLabel: 'Circle USDC isBlacklisted',
    riskLevel: 'CRITICAL',
    score: 96,
    flags: makeFlags({ contractBlacklisted: true, sanctions: true }),
    labels: ['USDC Blacklisted', 'Sanctioned'],
    relatedUserIds: [],
    reason: 'Circle USDC 合约层封禁（被盗资金）',
    addedBy: 'system',
    addedDaysAgo: 22
  },
  {
    address: ERC20_ADDRESSES[2],
    chain: 'ERC20',
    asset: 'USDT',
    source: 'SANCTIONS',
    sourceLabel: 'Chainalysis Sanctions Oracle',
    riskLevel: 'CRITICAL',
    score: 97,
    flags: makeFlags({ sanctions: true }),
    labels: ['OFAC SDN'],
    entity: 'Tornado Cash',
    relatedUserIds: [],
    reason: 'Chainalysis Oracle isSanctioned=true（Tornado Cash 关联）',
    addedBy: 'system',
    addedDaysAgo: 150
  },
  {
    address: ERC20_ADDRESSES[3],
    chain: 'ERC20',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'MEDIUM',
    score: 58,
    flags: makeFlags({ phishing: true, fraud: true }),
    labels: ['Phishing'],
    relatedUserIds: [17], // 沈奇砚
    reason: 'GoPlus：钓鱼集群；关联顾客 17 沈奇砚的可疑入金来源',
    addedBy: 'risk',
    addedDaysAgo: 5
  },

  // ===== BSC: 3 =====
  {
    address: BSC_ADDRESSES[0],
    chain: 'BSC',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'HIGH',
    score: 76,
    flags: makeFlags({ isMalicious: true, fraud: true }),
    labels: ['Malicious', 'Fraud'],
    relatedUserIds: [],
    reason: 'GoPlus：BSC 链欺诈地址集群',
    addedBy: 'risk',
    addedDaysAgo: 14
  },
  {
    address: BSC_ADDRESSES[1],
    chain: 'BSC',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'GoPlus Address Security',
    riskLevel: 'LOW',
    score: 22,
    flags: makeFlags({ mixerRelated: true }),
    labels: ['Mixer Adjacent'],
    relatedUserIds: [],
    reason: 'GoPlus：BSC 混币器外围地址（2 跳）',
    addedBy: 'risk',
    addedDaysAgo: 28
  },
  {
    address: BSC_ADDRESSES[2],
    chain: 'BSC',
    asset: 'USDT',
    source: 'AML_API',
    sourceLabel: 'MistTrack',
    riskLevel: 'NONE',
    score: 8,
    flags: makeFlags({}),
    labels: ['Low Risk Sample'],
    relatedUserIds: [],
    reason: 'MistTrack：极低风险（仅作为对照样本保留）',
    addedBy: 'risk',
    addedDaysAgo: 70
  }
];

/** 主真实源 */
export const CHAIN_BLACKLIST: ChainBlacklistEntry[] = [];

function buildEntry(s: AddrSeed): ChainBlacklistEntry {
  const id = nextId();
  const addedAt = daysAgo(s.addedDaysAgo);
  const targetLabel = shortAddr(s.address);
  const history: BlacklistEvent[] = [
    {
      id: nextEventId(),
      targetType: 'address',
      targetId: id,
      targetLabel,
      action: 'add',
      actor: s.addedBy,
      time: addedAt,
      note: s.reason
    }
  ];
  const entry: ChainBlacklistEntry = {
    id,
    address: s.address,
    chain: s.chain,
    asset: s.asset,
    source: s.source,
    sourceLabel: s.sourceLabel,
    riskLevel: s.riskLevel,
    score: s.score,
    flags: s.flags,
    labels: s.labels,
    entity: s.entity,
    relatedUserIds: s.relatedUserIds,
    reason: s.reason,
    status: s.removedBy ? 'removed' : 'active',
    addedBy: s.addedBy,
    addedAt,
    history
  };
  if (s.removedBy && s.removedReason && s.removedDaysAgo !== undefined) {
    entry.removedBy = s.removedBy;
    entry.removedReason = s.removedReason;
    entry.removedAt = daysAgo(s.removedDaysAgo);
    history.push({
      id: nextEventId(),
      targetType: 'address',
      targetId: id,
      targetLabel,
      action: 'remove',
      actor: s.removedBy,
      time: entry.removedAt,
      note: s.removedReason
    });
  }
  return entry;
}

function seed() {
  CHAIN_BLACKLIST.length = 0;
  SEEDS.forEach(s => CHAIN_BLACKLIST.push(buildEntry(s)));
}
seed();

/** "演示用"干净地址（在 AML check Modal 中快捷填入；评分会落 ALLOW） */
export const DEMO_CLEAN_ADDRESS: Record<Api.Blacklist.Chain, string> = {
  TRC20: 'TKnP9wfM2Jr5HqVk3Lp7Yn4Cs8Mt2Pq6Bf1', // 不在 seed 池里 / hash mod 11 != 0 / mod 17 != 0
  ERC20: '0x1234567890abcdef1234567890abcdef12345678',
  BSC: '0xabcdef1234567890abcdef1234567890abcdef12'
};

export function findChainEntry(id: number): ChainBlacklistEntry | undefined {
  return CHAIN_BLACKLIST.find(e => e.id === id);
}

export function findActiveChainEntryByAddress(
  address: string,
  chain?: Api.Blacklist.Chain
): ChainBlacklistEntry | undefined {
  return CHAIN_BLACKLIST.find(
    e => e.status === 'active' && e.address.toLowerCase() === address.toLowerCase() && (!chain || e.chain === chain)
  );
}

export function appendChainEntry(entry: Omit<ChainBlacklistEntry, 'id'>): ChainBlacklistEntry {
  const next: ChainBlacklistEntry = { id: nextId(), ...entry };
  CHAIN_BLACKLIST.unshift(next);
  return next;
}
