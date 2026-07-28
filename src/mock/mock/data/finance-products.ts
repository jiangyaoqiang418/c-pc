/**
 * 理财产品池（R-DATA-32 / R-MOD-23）— finance-product 模块两个真实源之一。
 *
 * 6 条产品：7d / 30d / 90d / 180d / 365d 5 个普通 + 1 个买手专享归档样本。
 * 产品仅持有 baseRate；effectiveRate 在订阅时刻按 VIP 加成快照（R-MOD-22）。
 */
type ProductRecord = Api.FinanceProduct.ProductRecord;

function iso(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

let idCursor = 0;
function nextProductId(): number {
  idCursor += 1;
  return idCursor;
}

const codeSeqByDays: Record<number, number> = {};
function makeCode(lockupDays: number): string {
  codeSeqByDays[lockupDays] = (codeSeqByDays[lockupDays] || 0) + 1;
  return `FIN-${lockupDays}D-${String(codeSeqByDays[lockupDays]).padStart(3, '0')}`;
}

interface ProductSeed {
  name: string;
  lockupDays: number;
  baseRate: string;
  minAmount: string;
  maxAmount?: string;
  perUserMaxOrders?: number;
  audience: Api.FinanceProduct.Audience;
  description?: string;
  status: Api.FinanceProduct.ProductStatus;
  createdDaysAgo: number;
}

const SEEDS: ProductSeed[] = [
  {
    name: '7 天体验',
    lockupDays: 7,
    baseRate: '3.00',
    minAmount: '100.00',
    maxAmount: '10000.00',
    perUserMaxOrders: 5,
    audience: 'all',
    description: '短期体验款，最低 100 U 即可参与，适合新用户感受锁仓收益。',
    status: 'active',
    createdDaysAgo: 90
  },
  {
    name: '30 天稳健',
    lockupDays: 30,
    baseRate: '4.50',
    minAmount: '500.00',
    maxAmount: '50000.00',
    perUserMaxOrders: 3,
    audience: 'all',
    description: '主力产品，30 天滚动锁仓，年化 4.5% 起，VIP 加成最高 4.7%。',
    status: 'active',
    createdDaysAgo: 120
  },
  {
    name: '90 天进阶',
    lockupDays: 90,
    baseRate: '6.00',
    minAmount: '1000.00',
    maxAmount: '100000.00',
    perUserMaxOrders: 3,
    audience: 'all',
    description: '中期锁仓，年化 6%，适合中等本金 + 中长期持有。',
    status: 'active',
    createdDaysAgo: 100
  },
  {
    name: '180 天高息（顾客专享）',
    lockupDays: 180,
    baseRate: '7.50',
    minAmount: '2000.00',
    maxAmount: '200000.00',
    perUserMaxOrders: 2,
    audience: 'customer',
    description: '半年期高息产品，仅限顾客订阅。VIP2 实际年化可达 7.7%。',
    status: 'active',
    createdDaysAgo: 80
  },
  {
    name: '365 天巅峰',
    lockupDays: 365,
    baseRate: '9.00',
    minAmount: '5000.00',
    maxAmount: '500000.00',
    perUserMaxOrders: 1,
    audience: 'customer',
    description: '一年期顶级利率产品，已有订单到期前继续计息，新订阅暂停中。',
    status: 'paused',
    createdDaysAgo: 60
  },
  {
    name: '30 天买手专享（已归档）',
    lockupDays: 30,
    baseRate: '5.00',
    minAmount: '500.00',
    maxAmount: '30000.00',
    perUserMaxOrders: 2,
    audience: 'buyer',
    description: '买手限时活动款，已归档。',
    status: 'archived',
    createdDaysAgo: 200
  }
];

export const FINANCE_PRODUCTS: ProductRecord[] = SEEDS.map(s => ({
  id: nextProductId(),
  code: makeCode(s.lockupDays),
  name: s.name,
  status: s.status,
  lockupDays: s.lockupDays,
  baseRate: s.baseRate,
  minAmount: s.minAmount,
  maxAmount: s.maxAmount,
  perUserMaxOrders: s.perUserMaxOrders,
  audience: s.audience,
  description: s.description,
  createdAt: iso(s.createdDaysAgo, 9, 0),
  updatedAt: iso(Math.max(0, s.createdDaysAgo - 14), 14, 0)
}));

export function findProductById(id: number): ProductRecord | undefined {
  return FINANCE_PRODUCTS.find(p => p.id === id);
}

export function findProductByCode(code: string): ProductRecord | undefined {
  return FINANCE_PRODUCTS.find(p => p.code === code);
}

export function upsertProduct(patch: Api.FinanceProduct.ProductSaveParams): ProductRecord {
  const now = new Date().toISOString();
  if (patch.id) {
    const existing = findProductById(patch.id);
    if (!existing) throw new Error('product not found');
    existing.name = patch.name;
    existing.lockupDays = patch.lockupDays;
    existing.baseRate = patch.baseRate;
    existing.minAmount = patch.minAmount;
    existing.maxAmount = patch.maxAmount;
    existing.perUserMaxOrders = patch.perUserMaxOrders;
    existing.audience = patch.audience;
    existing.description = patch.description;
    existing.status = patch.status;
    existing.updatedAt = now;
    return existing;
  }
  const created: ProductRecord = {
    id: nextProductId(),
    code: makeCode(patch.lockupDays),
    name: patch.name,
    status: patch.status,
    lockupDays: patch.lockupDays,
    baseRate: patch.baseRate,
    minAmount: patch.minAmount,
    maxAmount: patch.maxAmount,
    perUserMaxOrders: patch.perUserMaxOrders,
    audience: patch.audience,
    description: patch.description,
    createdAt: now,
    updatedAt: now
  };
  FINANCE_PRODUCTS.push(created);
  return created;
}

export function setProductStatus(
  productId: number,
  status: Api.FinanceProduct.ProductStatus
): ProductRecord | undefined {
  const p = findProductById(productId);
  if (!p) return undefined;
  p.status = status;
  p.updatedAt = new Date().toISOString();
  return p;
}
