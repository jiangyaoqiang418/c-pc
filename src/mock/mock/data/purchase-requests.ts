/**
 * 求购任务池（R-DATA-34 / R-MOD-25）。
 *
 * 20 条求购任务覆盖 5 态：
 *   - pending_audit × 6（含 4 AI 高分 + 2 AI 低分）
 *   - pushing × 8（VIP2 批次 3 / VIP1 批次 3 / VIP0 批次 2）
 *   - claimed × 4（自动关联前 4 条 ORDERS — 复用现有 PENDING_PAYMENT 订单）
 *   - rejected × 1
 *   - cancelled × 1
 *
 * 接单后联动：claim handler 调 appendOrder + 创建 IM 三方群
 */
import { USERS, findUserById } from './users';
import { ORDERS } from './orders';
import { CATEGORIES } from './categories';

type PurchaseRequest = Api.PurchaseRequest.PurchaseRequest;
type PushLog = Api.PurchaseRequest.PushLog;
type RequestStatus = Api.PurchaseRequest.RequestStatus;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

let pushLogIdCursor = 0;
function nextPushLogId(): number {
  pushLogIdCursor += 1;
  return pushLogIdCursor;
}

function makeCode(seq: number): string {
  return `PUR-2026-${String(50000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, hours = 0, mins = 0): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(t.getHours() - hours);
  t.setMinutes(t.getMinutes() - mins);
  return t.toISOString();
}

/** 从 categories 中取 level=3 的品牌节点 */
function pickBrandCategory(seq: number): { id: number; path: string } {
  const brands = CATEGORIES.filter(c => c.level === 3);
  if (!brands.length) {
    return { id: 0, path: '其他' };
  }
  const c = brands[seq % brands.length];
  return { id: c.id, path: c.parentPath ? `${c.parentPath} / ${c.name}` : c.name };
}

/** 从 USERS 中取顾客 id（isBuyer=false） */
const CUSTOMER_USERS = USERS.filter(u => !u.isBuyer);
const BUYER_USERS = USERS.filter(u => u.isBuyer);

function pickCustomerId(seq: number): number {
  return CUSTOMER_USERS[seq % CUSTOMER_USERS.length]?.id || 1;
}

function pickBuyersByVip(vipLevel: Api.User.VipLevel, count: number): number[] {
  const matched = BUYER_USERS.filter(u => u.vipLevel === vipLevel);
  return matched.slice(0, count).map(u => u.id);
}

interface RequestSeed {
  status: RequestStatus;
  productTitle: string;
  productDescription: string;
  budgetAmount: string;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: 'none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty';
  appeal: string;
  daysAgo: number;
  aiAuditScore?: number;
  currentPushLevel?: Api.PurchaseRequest.PushBatchLevel;
  claimedOrderIndex?: number; // 关联 ORDERS[i]
}

const SEEDS: RequestSeed[] = [
  // pending_audit × 6
  {
    status: 'pending_audit',
    productTitle: '日本代购 iPhone 15 Pro Max 256G 黑色',
    productDescription: '希望买手协助从日本免税店购买，附小票',
    budgetAmount: '8500.00',
    expectedDays: 15,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    appeal: '希望购买原封未开机，附海关税清单',
    daysAgo: 0,
    aiAuditScore: 92
  },
  {
    status: 'pending_audit',
    productTitle: '日本药妆套装（含 FANCL/资生堂）',
    productDescription: '资生堂红腰子 75ml × 2、FANCL 卸妆油 120ml × 1',
    budgetAmount: '1800.00',
    expectedDays: 12,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '正品有标签，过敏退换',
    daysAgo: 0,
    aiAuditScore: 88
  },
  {
    status: 'pending_audit',
    productTitle: '欧洲代购 Burberry 风衣',
    productDescription: '英国官网代购，需要M码',
    budgetAmount: '12000.00',
    expectedDays: 25,
    overseasCustoms: true,
    aftersaleType: 'shop-warranty',
    appeal: '原版无修改，包邮回国',
    daysAgo: 1,
    aiAuditScore: 75
  },
  {
    status: 'pending_audit',
    productTitle: '美区 PS5 Pro 主机',
    productDescription: '美版主机一台，含一张原版盘',
    budgetAmount: '5000.00',
    expectedDays: 20,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    appeal: '希望全新未拆封',
    daysAgo: 1,
    aiAuditScore: 65
  },
  {
    status: 'pending_audit',
    productTitle: '紧急求购：电饭煲',
    productDescription: '低端基础款即可',
    budgetAmount: '300.00',
    expectedDays: 7,
    overseasCustoms: false,
    aftersaleType: 'none',
    appeal: '需要立即买到',
    daysAgo: 0,
    aiAuditScore: 42
  },
  {
    status: 'pending_audit',
    productTitle: '不明确商品 X',
    productDescription: 'X商品速购',
    budgetAmount: '99999.00',
    expectedDays: 1,
    overseasCustoms: false,
    aftersaleType: 'none',
    appeal: '随便',
    daysAgo: 0,
    aiAuditScore: 18
  },

  // pushing × 8（VIP2 批次 3 / VIP1 批次 3 / VIP0 批次 2）
  {
    status: 'pushing',
    productTitle: '韩国代购 Olive Young 套装',
    productDescription: '面膜 × 30 + 护肤品',
    budgetAmount: '1200.00',
    expectedDays: 14,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '希望从首尔门店采购，正品保证',
    daysAgo: 1,
    aiAuditScore: 90,
    currentPushLevel: 'VIP2'
  },
  {
    status: 'pushing',
    productTitle: 'Dyson 吸尘器 V15',
    productDescription: '英国版 V15 旗舰款',
    budgetAmount: '4500.00',
    expectedDays: 21,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    appeal: '需要保修卡',
    daysAgo: 2,
    aiAuditScore: 95,
    currentPushLevel: 'VIP2'
  },
  {
    status: 'pushing',
    productTitle: '澳洲代购 UGG 雪地靴',
    productDescription: '经典款 5825 浅咖 38 码',
    budgetAmount: '800.00',
    expectedDays: 18,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '澳洲专柜采购',
    daysAgo: 2,
    aiAuditScore: 85,
    currentPushLevel: 'VIP2'
  },
  {
    status: 'pushing',
    productTitle: '日本玩具：高达 RG 系列',
    productDescription: '强袭高达 + 自由高达',
    budgetAmount: '600.00',
    expectedDays: 12,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '原盒正品',
    daysAgo: 3,
    aiAuditScore: 80,
    currentPushLevel: 'VIP1'
  },
  {
    status: 'pushing',
    productTitle: 'Costco 美国坚果套装',
    productDescription: '杏仁/腰果/夏威夷果 三件套',
    budgetAmount: '450.00',
    expectedDays: 16,
    overseasCustoms: true,
    aftersaleType: 'none',
    appeal: '美区 Costco 采购',
    daysAgo: 3,
    aiAuditScore: 78,
    currentPushLevel: 'VIP1'
  },
  {
    status: 'pushing',
    productTitle: '韩国 5manghi 雨衣',
    productDescription: '韩国设计师品牌雨衣 L 码',
    budgetAmount: '350.00',
    expectedDays: 10,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '官网正品',
    daysAgo: 4,
    aiAuditScore: 72,
    currentPushLevel: 'VIP1'
  },
  {
    status: 'pushing',
    productTitle: '日本零食大礼包',
    productDescription: 'Pocky/合掌村/KitKat 等',
    budgetAmount: '280.00',
    expectedDays: 14,
    overseasCustoms: false,
    aftersaleType: 'none',
    appeal: '日期新鲜',
    daysAgo: 5,
    aiAuditScore: 68,
    currentPushLevel: 'VIP0'
  },
  {
    status: 'pushing',
    productTitle: '泰国代购 Boots 香水',
    productDescription: 'Boots 50ml 香水任意 2 瓶',
    budgetAmount: '380.00',
    expectedDays: 12,
    overseasCustoms: true,
    aftersaleType: 'none',
    appeal: '香水种类不限',
    daysAgo: 6,
    aiAuditScore: 65,
    currentPushLevel: 'VIP0'
  },

  // claimed × 4（关联前 4 条 ORDERS）
  {
    status: 'claimed',
    productTitle: '日本代购 任天堂 Switch OLED',
    productDescription: '白色版 Switch OLED',
    budgetAmount: '2400.00',
    expectedDays: 15,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    appeal: '希望全新未拆封',
    daysAgo: 12,
    aiAuditScore: 93,
    claimedOrderIndex: 0
  },
  {
    status: 'claimed',
    productTitle: '澳洲奶粉 a2 白金 3 段',
    productDescription: '6 罐装',
    budgetAmount: '1500.00',
    expectedDays: 18,
    overseasCustoms: true,
    aftersaleType: 'none',
    appeal: '生产日期 6 月内',
    daysAgo: 14,
    aiAuditScore: 88,
    claimedOrderIndex: 1
  },
  {
    status: 'claimed',
    productTitle: 'iPad Pro 11 寸 2024 款 128G',
    productDescription: '美区 iPad Pro 2024 银色',
    budgetAmount: '6800.00',
    expectedDays: 20,
    overseasCustoms: true,
    aftersaleType: 'national-warranty',
    appeal: '原封',
    daysAgo: 18,
    aiAuditScore: 91,
    claimedOrderIndex: 2
  },
  {
    status: 'claimed',
    productTitle: '法国代购 Lancôme 小黑瓶',
    productDescription: '小黑瓶 100ml + 化妆水',
    budgetAmount: '950.00',
    expectedDays: 16,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '法国机场免税店',
    daysAgo: 22,
    aiAuditScore: 89,
    claimedOrderIndex: 3
  },

  // rejected × 1
  {
    status: 'rejected',
    productTitle: '紧急求购：成人玩具',
    productDescription: '...',
    budgetAmount: '500.00',
    expectedDays: 7,
    overseasCustoms: false,
    aftersaleType: 'none',
    appeal: '...',
    daysAgo: 5,
    aiAuditScore: 8
  },

  // cancelled × 1
  {
    status: 'cancelled',
    productTitle: '日本代购 SK-II 神仙水',
    productDescription: '230ml × 1',
    budgetAmount: '1200.00',
    expectedDays: 14,
    overseasCustoms: true,
    aftersaleType: '7day-no-reason',
    appeal: '希望购买',
    daysAgo: 8,
    aiAuditScore: 82
  }
];

export const PURCHASE_REQUESTS: PurchaseRequest[] = [];
export const PUSH_LOGS: PushLog[] = [];

function buildRequest(seed: RequestSeed, seq: number): PurchaseRequest {
  const cust = CUSTOMER_USERS[seq % CUSTOMER_USERS.length];
  const customerId = cust?.id || pickCustomerId(seq);
  const customerName = cust?.nickname || `Customer ${customerId}`;
  const brand = pickBrandCategory(seq);
  const createdAt = nowMinus(seed.daysAgo, 10, 0);

  const req: PurchaseRequest = {
    id: nextId(),
    code: makeCode(seq),
    customerId,
    customerName,
    productTitle: seed.productTitle,
    productDescription: seed.productDescription,
    categoryId: brand.id,
    categoryPath: brand.path,
    budgetAmount: seed.budgetAmount,
    expectedDays: seed.expectedDays,
    overseasCustoms: seed.overseasCustoms,
    aftersaleType: seed.aftersaleType,
    appeal: seed.appeal,
    status: seed.status,
    aiAuditScore: seed.aiAuditScore,
    pushedToBuyerIds: [],
    createdAt
  };

  // 审核相关
  if (seed.status !== 'pending_audit') {
    req.auditedBy = 'super';
    req.auditedAt = nowMinus(seed.daysAgo - 1, 10, 0);
    req.auditNote = seed.status === 'rejected' ? '内容不合规，拒绝发布' : '审核通过，进入推送';
  }

  // 推送相关
  if (seed.status === 'pushing' || seed.status === 'claimed') {
    req.currentPushLevel = seed.currentPushLevel || 'VIP2';
    req.pushedAt = nowMinus(seed.daysAgo - 1, 8, 0);
    const vip2Ids = pickBuyersByVip('VIP2', 5);
    const vip1Ids = req.currentPushLevel !== 'VIP2' ? pickBuyersByVip('VIP1', 5) : [];
    const vip0Ids = req.currentPushLevel === 'VIP0' ? pickBuyersByVip('VIP0', 5) : [];
    req.pushedToBuyerIds = [...vip2Ids, ...vip1Ids, ...vip0Ids];
    if (seed.status === 'pushing') {
      req.nextPushAt = nowMinus(seed.daysAgo, 0, -10); // 10 分钟后下一批
    }
    // 写推送日志
    if (vip2Ids.length)
      PUSH_LOGS.push({
        id: nextPushLogId(),
        requestId: req.id,
        requestCode: req.code,
        pushLevel: 'VIP2',
        buyerIds: vip2Ids,
        pushedAt: nowMinus(seed.daysAgo - 1, 8, 0),
        actor: 'system'
      });
    if (vip1Ids.length)
      PUSH_LOGS.push({
        id: nextPushLogId(),
        requestId: req.id,
        requestCode: req.code,
        pushLevel: 'VIP1',
        buyerIds: vip1Ids,
        pushedAt: nowMinus(seed.daysAgo - 1, 7, 50),
        actor: 'system'
      });
    if (vip0Ids.length)
      PUSH_LOGS.push({
        id: nextPushLogId(),
        requestId: req.id,
        requestCode: req.code,
        pushLevel: 'VIP0',
        buyerIds: vip0Ids,
        pushedAt: nowMinus(seed.daysAgo - 1, 7, 40),
        actor: 'system'
      });
  }

  // 接单
  if (seed.status === 'claimed' && typeof seed.claimedOrderIndex === 'number') {
    const order = ORDERS[seed.claimedOrderIndex];
    if (order) {
      req.claimedBy = order.shopperId;
      req.claimedByName = order.shopperName;
      req.claimedAt = nowMinus(Math.max(0, seed.daysAgo - 2), 14, 0);
      req.relatedOrderId = order.id;
      req.relatedOrderCode = order.code;
    }
  }

  // 取消
  if (seed.status === 'cancelled') {
    req.cancelledBy = 'admin';
    req.cancelledReason = '顾客撤回求购申请，经管理员确认后取消';
  }

  return req;
}

function runSeed(): void {
  PURCHASE_REQUESTS.length = 0;
  PUSH_LOGS.length = 0;
  idCursor = 0;
  pushLogIdCursor = 0;
  SEEDS.forEach((s, idx) => {
    PURCHASE_REQUESTS.push(buildRequest(s, idx + 1));
  });
}
runSeed();

export function findRequestById(id: number): PurchaseRequest | undefined {
  return PURCHASE_REQUESTS.find(r => r.id === id);
}

export function findRequestByCode(code: string): PurchaseRequest | undefined {
  return PURCHASE_REQUESTS.find(r => r.code === code);
}

export function appendRequest(o: Omit<PurchaseRequest, 'id'>): PurchaseRequest {
  const next: PurchaseRequest = { id: nextId(), ...o };
  PURCHASE_REQUESTS.unshift(next);
  return next;
}

export function appendPushLog(o: Omit<PushLog, 'id'>): PushLog {
  const next: PushLog = { id: nextPushLogId(), ...o };
  PUSH_LOGS.unshift(next);
  return next;
}

export function findPushLogsByRequest(requestId: number): PushLog[] {
  return PUSH_LOGS.filter(l => l.requestId === requestId).sort(
    (a, b) => Date.parse(a.pushedAt) - Date.parse(b.pushedAt)
  );
}

/** 工具：推送下一批 VIP 等级 */
export function pushToNextLevel(
  requestId: number,
  actor: 'system' | 'admin'
): { pushed: boolean; level?: Api.PurchaseRequest.PushBatchLevel; buyerIds?: number[] } {
  const req = findRequestById(requestId);
  if (!req || req.status !== 'pushing') return { pushed: false };
  let nextLevel: Api.PurchaseRequest.PushBatchLevel;
  if (!req.currentPushLevel || req.currentPushLevel === 'VIP2') nextLevel = 'VIP1';
  else if (req.currentPushLevel === 'VIP1') nextLevel = 'VIP0';
  else return { pushed: false }; // 已是 VIP0，无下一批
  const buyerIds = pickBuyersByVip(nextLevel, 5);
  req.currentPushLevel = nextLevel;
  req.pushedAt = new Date().toISOString();
  req.nextPushAt = nextLevel === 'VIP0' ? undefined : new Date(Date.now() + 10 * 60000).toISOString();
  req.pushedToBuyerIds = Array.from(new Set([...req.pushedToBuyerIds, ...buyerIds]));
  appendPushLog({
    requestId: req.id,
    requestCode: req.code,
    pushLevel: nextLevel,
    buyerIds,
    pushedAt: req.pushedAt,
    actor
  });
  return { pushed: true, level: nextLevel, buyerIds };
}

/** 工具：顾客 / 买手 数据辅助 */
export function getBuyerInfo(buyerId: number) {
  const u = findUserById(buyerId);
  if (!u || !u.isBuyer) return undefined;
  return { id: u.id, name: u.nickname, vipLevel: u.vipLevel, isBuyer: true as const };
}

export function listAvailableBuyers(): { id: number; name: string; vipLevel: Api.User.VipLevel; isBuyer: true }[] {
  return BUYER_USERS.map(u => ({ id: u.id, name: u.nickname, vipLevel: u.vipLevel, isBuyer: true as const }));
}
