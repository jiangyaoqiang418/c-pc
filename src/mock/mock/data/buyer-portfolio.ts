/**
 * 买手画像数据池（4.5）：钱包 + 交易统计 + 商品 mini。
 * 通过 userId 关联 USERS（isBuyer=true 的用户）。
 */
import { USERS } from './users';

type BuyerProfile = Api.Buyer.BuyerProfile;

function w(opts: Partial<Api.Buyer.Wallet> = {}): Api.Buyer.Wallet {
  return {
    available: '0',
    depositAvailable: '0',
    depositGuaranteed: '0',
    frozenOrder: '0',
    interest: '0',
    ...opts
  };
}

function stats(o: Partial<Api.Buyer.TransactionStats> = {}): Api.Buyer.TransactionStats {
  return {
    orderTotal: 0,
    orderCompleted: 0,
    completionRate: 1,
    goodReviewRate: 1,
    complaintRate: 0,
    avgShipHours: 24,
    unfulfilledCount: 0,
    ...o
  };
}

/** 按 userName / email 简化映射；返回 (userId → profile) */
function profileByUserName(): Record<string, BuyerProfile> {
  const map: Record<string, BuyerProfile> = {};
  function add(email: string, profile: Omit<BuyerProfile, 'userId'>) {
    const u = USERS.find(x => x.email === email);
    if (!u) return;
    map[u.email] = { ...profile, userId: u.id };
  }

  add('zhanglilin@example.com', {
    wallet: w({
      available: '12450.36',
      depositAvailable: '5000.00',
      depositGuaranteed: '3200.00',
      frozenOrder: '1850.00',
      interest: '125.50'
    }),
    stats: stats({
      orderTotal: 142,
      orderCompleted: 138,
      completionRate: 0.97,
      goodReviewRate: 0.95,
      complaintRate: 0.04,
      avgShipHours: 36,
      unfulfilledCount: 1
    }),
    productCount: 8
  });
  add('yangjianjun@example.com', {
    wallet: w({
      available: '38900.00',
      depositAvailable: '15000.00',
      depositGuaranteed: '10800.00',
      frozenOrder: '4500.00',
      interest: '820.00'
    }),
    stats: stats({
      orderTotal: 580,
      orderCompleted: 576,
      completionRate: 0.993,
      goodReviewRate: 0.98,
      complaintRate: 0.012,
      avgShipHours: 28,
      unfulfilledCount: 0
    }),
    productCount: 20
  });
  add('songruohan@example.com', {
    wallet: w({
      available: '5680.20',
      depositAvailable: '2000.00',
      depositGuaranteed: '800.00',
      frozenOrder: '320.00',
      interest: '15.20'
    }),
    stats: stats({
      orderTotal: 38,
      orderCompleted: 35,
      completionRate: 0.92,
      goodReviewRate: 0.91,
      complaintRate: 0.08,
      avgShipHours: 48,
      unfulfilledCount: 2
    }),
    productCount: 6
  });
  add('feijiayi@example.com', {
    wallet: w({
      available: '3200.00',
      depositAvailable: '1500.00',
      depositGuaranteed: '600.00',
      frozenOrder: '250.00'
    }),
    stats: stats({
      orderTotal: 22,
      orderCompleted: 20,
      completionRate: 0.91,
      goodReviewRate: 0.9,
      complaintRate: 0.05,
      avgShipHours: 42,
      unfulfilledCount: 1
    }),
    productCount: 5
  });
  add('liaoyichen@example.com', {
    wallet: w({ available: '1800.00', depositAvailable: '1000.00' }),
    stats: stats({
      orderTotal: 10,
      orderCompleted: 10,
      completionRate: 1.0,
      goodReviewRate: 1.0,
      complaintRate: 0,
      avgShipHours: 24,
      unfulfilledCount: 0
    }),
    productCount: 3
  });
  add('tangchuyu@example.com', {
    wallet: w({
      available: '15600.00',
      depositAvailable: '6000.00',
      depositGuaranteed: '4200.00',
      frozenOrder: '1200.00',
      interest: '180.00'
    }),
    stats: stats({
      orderTotal: 180,
      orderCompleted: 178,
      completionRate: 0.989,
      goodReviewRate: 1.0,
      complaintRate: 0.011,
      avgShipHours: 22,
      unfulfilledCount: 0
    }),
    productCount: 12,
    lastDepositChange: { delta: '+1000.00', reason: '主动增缴押金', time: '2026-05-20T08:30:00+08:00' }
  });
  add('cuiyuting@example.com', {
    wallet: w({
      available: '8800.00',
      depositAvailable: '3500.00',
      depositGuaranteed: '2400.00',
      frozenOrder: '780.00',
      interest: '52.00'
    }),
    stats: stats({
      orderTotal: 95,
      orderCompleted: 91,
      completionRate: 0.958,
      goodReviewRate: 0.96,
      complaintRate: 0.032,
      avgShipHours: 30,
      unfulfilledCount: 2
    }),
    productCount: 10
  });
  add('fengwenbo@example.com', {
    wallet: w({
      available: '32100.00',
      depositAvailable: '12000.00',
      depositGuaranteed: '8800.00',
      frozenOrder: '3200.00',
      interest: '560.00'
    }),
    stats: stats({
      orderTotal: 420,
      orderCompleted: 418,
      completionRate: 0.995,
      goodReviewRate: 0.98,
      complaintRate: 0.014,
      avgShipHours: 26,
      unfulfilledCount: 1
    }),
    productCount: 18
  });
  add('jianglinyu@example.com', {
    wallet: w({
      available: '4500.00',
      depositAvailable: '2000.00',
      depositGuaranteed: '600.00',
      frozenOrder: '180.00'
    }),
    stats: stats({
      orderTotal: 28,
      orderCompleted: 25,
      completionRate: 0.89,
      goodReviewRate: 0.88,
      complaintRate: 0.07,
      avgShipHours: 52,
      unfulfilledCount: 3
    }),
    productCount: 7
  });
  add('qiansiya@example.com', {
    wallet: w({ available: '1200.00', depositAvailable: '800.00' }),
    stats: stats({
      orderTotal: 5,
      orderCompleted: 5,
      completionRate: 1.0,
      goodReviewRate: 1.0,
      complaintRate: 0,
      avgShipHours: 18,
      unfulfilledCount: 0
    }),
    productCount: 2
  });
  add('wuxiaomeng@example.com', {
    wallet: w({
      available: '6700.00',
      depositAvailable: '2500.00',
      depositGuaranteed: '1500.00',
      frozenOrder: '600.00'
    }),
    stats: stats({
      orderTotal: 88,
      orderCompleted: 80,
      completionRate: 0.909,
      goodReviewRate: 0.85,
      complaintRate: 0.13,
      avgShipHours: 56,
      unfulfilledCount: 5
    }),
    productCount: 9,
    lastDepositChange: { delta: '-500.00', reason: '售后赔付扣除', time: '2026-05-22T14:20:00+08:00' }
  });
  add('duomujie@example.com', {
    wallet: w({
      available: '18500.00',
      depositAvailable: '7000.00',
      depositGuaranteed: '5200.00',
      frozenOrder: '1850.00',
      interest: '320.00'
    }),
    stats: stats({
      orderTotal: 240,
      orderCompleted: 238,
      completionRate: 0.992,
      goodReviewRate: 0.97,
      complaintRate: 0.017,
      avgShipHours: 24,
      unfulfilledCount: 1
    }),
    productCount: 14
  });
  add('baoyi@example.com', {
    wallet: w({ available: '800.00' }),
    stats: stats({
      orderTotal: 12,
      orderCompleted: 8,
      completionRate: 0.667,
      goodReviewRate: 0.7,
      complaintRate: 0.25,
      avgShipHours: 72,
      unfulfilledCount: 4
    }),
    productCount: 0
  });
  add('mengsi@example.com', {
    wallet: w({
      available: '9800.00',
      depositAvailable: '4000.00',
      depositGuaranteed: '2800.00',
      frozenOrder: '950.00',
      interest: '70.00'
    }),
    stats: stats({
      orderTotal: 120,
      orderCompleted: 117,
      completionRate: 0.975,
      goodReviewRate: 0.96,
      complaintRate: 0.025,
      avgShipHours: 32,
      unfulfilledCount: 1
    }),
    productCount: 11
  });
  add('guodanyu@example.com', {
    wallet: w({ available: '2400.00', depositAvailable: '1200.00', depositGuaranteed: '400.00' }),
    stats: stats({
      orderTotal: 18,
      orderCompleted: 17,
      completionRate: 0.944,
      goodReviewRate: 0.93,
      complaintRate: 0.06,
      avgShipHours: 40,
      unfulfilledCount: 1
    }),
    productCount: 4
  });

  return map;
}

const PROFILE_MAP = profileByUserName();

/** 全部买手画像（按 USERS 中 isBuyer=true 顺序） */
export const BUYER_PROFILES: BuyerProfile[] = USERS.filter(u => u.isBuyer).map(u => {
  const p = PROFILE_MAP[u.email];
  if (p) return p;
  // 兜底：未配置画像的买手用默认值
  return { userId: u.id, wallet: w(), stats: stats(), productCount: 0 };
});

export function findBuyerProfile(userId: number) {
  return BUYER_PROFILES.find(p => p.userId === userId);
}

function pickStatus(i: number, userId: number): Api.Buyer.ProductMini['status'] {
  if (i === 1) return 'off-shelf';
  if (i === 2 && userId % 3 === 0) return 'frozen';
  return 'on-shelf';
}

/** 上架商品 mini mock（按 userId 生成 5 条） */
export function generateProductMinis(userId: number, count = 5): Api.Buyer.ProductMini[] {
  const titles = [
    '日本药妆套装',
    '欧洲品牌包',
    '美国保健品',
    '韩国化妆品',
    '香港奶粉',
    '澳洲营养品',
    '法国奢侈品',
    '意大利皮鞋'
  ];
  const out: Api.Buyer.ProductMini[] = [];
  for (let i = 0; i < count; i += 1) {
    const seedId = userId * 100 + i;
    out.push({
      id: seedId,
      title: `${titles[(userId + i) % titles.length]} #${i + 1}`,
      price: (100 + ((seedId * 37) % 9900)).toFixed(2),
      stock: (seedId % 50) + 1,
      status: pickStatus(i, userId),
      createdAt: new Date(Date.parse('2026-04-01T00:00:00+08:00') + seedId * 86400000).toISOString()
    });
  }
  return out;
}
