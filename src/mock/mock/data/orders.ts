/**
 * 1-7 订单池（R-MOD-16 单一真实源）。
 *
 * 60 条覆盖 9 态 + CANCELLED 异常分支。code = `ORD-2026-070XX`（前 30 条接管 im-groups 已伪造的 ID）。
 *
 * 模块加载时联动写入：
 *   - COMPLETED/ARCHIVED 订单：ORDER_FREEZE + ORDER_SETTLE 钱包流水对（appendTxn）
 *   - WARRANTY 订单：DEPOSIT_PLEDGE 押金担保流水
 *   - PROCURING 中 48h+ 超时的：BUYER_NO_FULFILL 积分扣减（appendLog）
 *   - IN_AFTERSALE 已仲裁的：DEPOSIT_FORFEIT 押金扣罚 + INTERNAL_REFUND 顾客退款
 */
import { findProductById } from './products';
import { findUserById } from './users';
import { findAccount, moveBucket } from './wallet-accounts';
import { appendTxn } from './wallet-txns';
import { appendLog } from './point-logs';

type OrderRecord = Api.Order.OrderRecord;
type PriceChangeLog = Api.Order.PriceChangeLog;
type OrderStatus = Api.Order.OrderStatus;

let idCursor = 0;
function nextOrderId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `ORD-2026-${String(7000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

function totalOf(price: string, shipping: string, tax: string): string {
  return (Number(price) + Number(shipping) + Number(tax)).toFixed(2);
}

interface OrderSeed {
  /** 序号 1-60；用于生成 code */
  seq: number;
  status: OrderStatus;
  productId: number;
  customerId: number;
  shopperId: number;
  /** 创建到现在的天数 */
  daysAgo: number;
  /** 自定义金额（不填则用商品价 + 商品自带运费/税） */
  customPrice?: string;
  customShipping?: string;
  customTax?: string;
  /** 海外过关商品 */
  overseasCustoms?: boolean;
  /** 售后类型（不填则继承商品） */
  aftersaleType?: 'none' | '7day-no-reason' | 'shop-warranty' | 'national-warranty';
  /** 物流单号承运商（IN_TRANSIT 及以后状态用） */
  shippingCarrier?: Api.Order.ShippingCarrier;
  /** 是否含改价（演示用） */
  hasPriceChange?: boolean;
  /** 取消原因（CANCELLED 状态用） */
  cancelledReason?: string;
  cancelledBy?: Api.Order.CancelledBy;
  /** 是否含收货视频（COMPLETED 用） */
  hasReceiptVideo?: boolean;
  /** PROCURING 中 48h+ 触发扣分 */
  overdueShipment?: boolean;
}

/** 60 条 seed，前 30 条与 im-groups 现有 30 个三方群一一对应 */
const SEEDS: OrderSeed[] = [
  // ===== 8 PENDING_PAYMENT =====
  { seq: 1, status: 'PENDING_PAYMENT', productId: 1, customerId: 1, shopperId: 21, daysAgo: 0, hasPriceChange: true },
  { seq: 2, status: 'PENDING_PAYMENT', productId: 2, customerId: 2, shopperId: 22, daysAgo: 0 },
  { seq: 3, status: 'PENDING_PAYMENT', productId: 3, customerId: 3, shopperId: 23, daysAgo: 1, overseasCustoms: true },
  { seq: 4, status: 'PENDING_PAYMENT', productId: 4, customerId: 4, shopperId: 24, daysAgo: 0, customPrice: '5800.00' },
  { seq: 5, status: 'PENDING_PAYMENT', productId: 5, customerId: 7, shopperId: 25, daysAgo: 2 },
  { seq: 6, status: 'PENDING_PAYMENT', productId: 6, customerId: 8, shopperId: 26, daysAgo: 0, hasPriceChange: true },
  { seq: 7, status: 'PENDING_PAYMENT', productId: 7, customerId: 10, shopperId: 27, daysAgo: 1 },
  { seq: 8, status: 'PENDING_PAYMENT', productId: 8, customerId: 11, shopperId: 28, daysAgo: 0 },

  // ===== 5 PROCURING =====
  { seq: 9, status: 'PROCURING', productId: 9, customerId: 12, shopperId: 29, daysAgo: 2 },
  { seq: 10, status: 'PROCURING', productId: 10, customerId: 15, shopperId: 30, daysAgo: 3, overdueShipment: true },
  { seq: 11, status: 'PROCURING', productId: 11, customerId: 16, shopperId: 31, daysAgo: 1 },
  { seq: 12, status: 'PROCURING', productId: 12, customerId: 18, shopperId: 32, daysAgo: 2 },
  { seq: 13, status: 'PROCURING', productId: 13, customerId: 19, shopperId: 33, daysAgo: 1 },

  // ===== 5 PROCURED =====
  { seq: 14, status: 'PROCURED', productId: 14, customerId: 20, shopperId: 21, daysAgo: 3 },
  {
    seq: 15,
    status: 'PROCURED',
    productId: 15,
    customerId: 1,
    shopperId: 22,
    daysAgo: 4,
    shippingCarrier: 'SF_INTL',
    overseasCustoms: true
  },
  { seq: 16, status: 'PROCURED', productId: 16, customerId: 2, shopperId: 23, daysAgo: 2 },
  { seq: 17, status: 'PROCURED', productId: 17, customerId: 3, shopperId: 24, daysAgo: 3 },
  { seq: 18, status: 'PROCURED', productId: 18, customerId: 4, shopperId: 25, daysAgo: 2 },

  // ===== 10 IN_TRANSIT =====
  {
    seq: 19,
    status: 'IN_TRANSIT',
    productId: 19,
    customerId: 7,
    shopperId: 26,
    daysAgo: 4,
    shippingCarrier: 'SF_INTL'
  },
  { seq: 20, status: 'IN_TRANSIT', productId: 20, customerId: 8, shopperId: 27, daysAgo: 5, shippingCarrier: 'FEDEX' },
  { seq: 21, status: 'IN_TRANSIT', productId: 21, customerId: 10, shopperId: 28, daysAgo: 6, shippingCarrier: 'DHL' },
  { seq: 22, status: 'IN_TRANSIT', productId: 22, customerId: 11, shopperId: 29, daysAgo: 7, shippingCarrier: '4PX' },
  { seq: 23, status: 'IN_TRANSIT', productId: 23, customerId: 12, shopperId: 30, daysAgo: 5, shippingCarrier: 'EMS' },
  {
    seq: 24,
    status: 'IN_TRANSIT',
    productId: 24,
    customerId: 15,
    shopperId: 31,
    daysAgo: 8,
    shippingCarrier: 'SF_INTL'
  },
  { seq: 25, status: 'IN_TRANSIT', productId: 25, customerId: 16, shopperId: 32, daysAgo: 6, shippingCarrier: 'FEDEX' },
  { seq: 26, status: 'IN_TRANSIT', productId: 26, customerId: 18, shopperId: 33, daysAgo: 7, shippingCarrier: 'DHL' },
  {
    seq: 27,
    status: 'IN_TRANSIT',
    productId: 27,
    customerId: 19,
    shopperId: 21,
    daysAgo: 9,
    shippingCarrier: '4PX',
    overseasCustoms: true
  },
  { seq: 28, status: 'IN_TRANSIT', productId: 28, customerId: 20, shopperId: 22, daysAgo: 6, shippingCarrier: 'EMS' },

  // ===== 4 AFTERSALE_CONFIRM =====
  {
    seq: 29,
    status: 'AFTERSALE_CONFIRM',
    productId: 29,
    customerId: 1,
    shopperId: 23,
    daysAgo: 10,
    aftersaleType: 'national-warranty'
  },
  {
    seq: 30,
    status: 'AFTERSALE_CONFIRM',
    productId: 30,
    customerId: 2,
    shopperId: 24,
    daysAgo: 11,
    aftersaleType: 'national-warranty'
  },
  {
    seq: 31,
    status: 'AFTERSALE_CONFIRM',
    productId: 1,
    customerId: 3,
    shopperId: 25,
    daysAgo: 9,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 32,
    status: 'AFTERSALE_CONFIRM',
    productId: 2,
    customerId: 4,
    shopperId: 26,
    daysAgo: 10,
    aftersaleType: 'none'
  },

  // ===== 12 COMPLETED =====
  { seq: 33, status: 'COMPLETED', productId: 5, customerId: 7, shopperId: 27, daysAgo: 15, hasReceiptVideo: true },
  { seq: 34, status: 'COMPLETED', productId: 6, customerId: 8, shopperId: 28, daysAgo: 16 },
  { seq: 35, status: 'COMPLETED', productId: 7, customerId: 10, shopperId: 29, daysAgo: 18, hasReceiptVideo: true },
  { seq: 36, status: 'COMPLETED', productId: 8, customerId: 11, shopperId: 30, daysAgo: 17 },
  { seq: 37, status: 'COMPLETED', productId: 9, customerId: 12, shopperId: 31, daysAgo: 20 },
  { seq: 38, status: 'COMPLETED', productId: 10, customerId: 15, shopperId: 32, daysAgo: 19 },
  { seq: 39, status: 'COMPLETED', productId: 11, customerId: 16, shopperId: 33, daysAgo: 22 },
  { seq: 40, status: 'COMPLETED', productId: 12, customerId: 18, shopperId: 21, daysAgo: 21 },
  { seq: 41, status: 'COMPLETED', productId: 13, customerId: 19, shopperId: 22, daysAgo: 24 },
  { seq: 42, status: 'COMPLETED', productId: 14, customerId: 20, shopperId: 23, daysAgo: 23 },
  { seq: 43, status: 'COMPLETED', productId: 15, customerId: 1, shopperId: 24, daysAgo: 25 },
  { seq: 44, status: 'COMPLETED', productId: 16, customerId: 2, shopperId: 25, daysAgo: 26 },

  // ===== 6 WARRANTY =====
  {
    seq: 45,
    status: 'WARRANTY',
    productId: 1,
    customerId: 3,
    shopperId: 26,
    daysAgo: 30,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 46,
    status: 'WARRANTY',
    productId: 2,
    customerId: 4,
    shopperId: 27,
    daysAgo: 35,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 47,
    status: 'WARRANTY',
    productId: 3,
    customerId: 7,
    shopperId: 28,
    daysAgo: 40,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 48,
    status: 'WARRANTY',
    productId: 4,
    customerId: 8,
    shopperId: 29,
    daysAgo: 45,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 49,
    status: 'WARRANTY',
    productId: 5,
    customerId: 10,
    shopperId: 30,
    daysAgo: 50,
    aftersaleType: 'shop-warranty'
  },
  {
    seq: 50,
    status: 'WARRANTY',
    productId: 6,
    customerId: 11,
    shopperId: 31,
    daysAgo: 55,
    aftersaleType: 'shop-warranty'
  },

  // ===== 5 IN_AFTERSALE =====
  { seq: 51, status: 'IN_AFTERSALE', productId: 7, customerId: 12, shopperId: 32, daysAgo: 12 },
  { seq: 52, status: 'IN_AFTERSALE', productId: 8, customerId: 15, shopperId: 33, daysAgo: 14 },
  { seq: 53, status: 'IN_AFTERSALE', productId: 9, customerId: 16, shopperId: 21, daysAgo: 15 },
  { seq: 54, status: 'IN_AFTERSALE', productId: 10, customerId: 18, shopperId: 22, daysAgo: 16 },
  { seq: 55, status: 'IN_AFTERSALE', productId: 11, customerId: 19, shopperId: 23, daysAgo: 13 },

  // ===== 3 ARCHIVED =====
  { seq: 56, status: 'ARCHIVED', productId: 12, customerId: 20, shopperId: 24, daysAgo: 60 },
  { seq: 57, status: 'ARCHIVED', productId: 13, customerId: 1, shopperId: 25, daysAgo: 70 },
  { seq: 58, status: 'ARCHIVED', productId: 14, customerId: 2, shopperId: 26, daysAgo: 80 },

  // ===== 2 CANCELLED =====
  {
    seq: 59,
    status: 'CANCELLED',
    productId: 15,
    customerId: 3,
    shopperId: 27,
    daysAgo: 5,
    cancelledReason: '超时未付款，系统自动取消',
    cancelledBy: 'system'
  },
  {
    seq: 60,
    status: 'CANCELLED',
    productId: 16,
    customerId: 4,
    shopperId: 28,
    daysAgo: 8,
    cancelledReason: '买手长时间不响应，平台强制取消并退款',
    cancelledBy: 'platform'
  }
];

/** 主真实源 */
export const ORDERS: OrderRecord[] = [];

/** 改价记录全局自增 id */
let priceChangeCursor = 0;
function nextPriceLogId(): number {
  priceChangeCursor += 1;
  return priceChangeCursor;
}

function pickCarrier(seq: number): Api.Order.ShippingCarrier {
  const list: Api.Order.ShippingCarrier[] = ['SF_INTL', 'FEDEX', 'DHL', '4PX', 'EMS'];
  return list[seq % list.length];
}

// eslint-disable-next-line complexity
function buildOrder(s: OrderSeed): OrderRecord {
  const product = findProductById(s.productId);
  if (!product) throw new Error(`Product ${s.productId} not found for order ${s.seq}`);
  const customer = findUserById(s.customerId);
  if (!customer) throw new Error(`Customer ${s.customerId} not found`);
  const shopper = findUserById(s.shopperId);
  if (!shopper) throw new Error(`Shopper ${s.shopperId} not found`);

  const price = s.customPrice || product.price;
  const shippingFee = s.customShipping || product.shippingFee;
  const tax = s.customTax || product.tax;
  const totalAmount = totalOf(price, shippingFee, tax);
  const createdAt = nowMinus(s.daysAgo, 10, 0);
  const id = nextOrderId();
  const code = makeCode(s.seq);

  const order: OrderRecord = {
    id,
    code,
    productId: product.id,
    productTitle: product.title,
    productCover: product.images?.[0]?.url,
    customerId: customer.id,
    customerName: customer.nickname,
    shopperId: shopper.id,
    shopperName: shopper.nickname,
    price,
    shippingFee,
    tax,
    totalAmount,
    status: s.status,
    shippingAddress: '北京市朝阳区望京 SOHO T3 写字楼',
    receiverName: customer.nickname,
    receiverPhone: customer.phone || '138****0000',
    overseasCustoms: s.overseasCustoms || false,
    aftersaleType: s.aftersaleType || product.aftersaleType,
    aftersaleDays: product.aftersaleDays,
    priceHistory: [],
    createdAt
  };

  // ===== 状态特有字段 =====
  if (s.status !== 'PENDING_PAYMENT' && s.status !== 'CANCELLED') {
    order.paidAmount = totalAmount;
    order.paidAt = nowMinus(s.daysAgo - 1, 14, 0);
  }
  if (
    s.status === 'PROCURED' ||
    s.status === 'IN_TRANSIT' ||
    s.status === 'AFTERSALE_CONFIRM' ||
    s.status === 'COMPLETED' ||
    s.status === 'WARRANTY' ||
    s.status === 'IN_AFTERSALE' ||
    s.status === 'ARCHIVED'
  ) {
    order.purchaseScreenshotUrl = `https://picsum.photos/seed/purchase${id}/400/300`;
    order.procuredAt = nowMinus(s.daysAgo - 2, 12, 0);
  }
  if (
    s.status === 'IN_TRANSIT' ||
    s.status === 'AFTERSALE_CONFIRM' ||
    s.status === 'COMPLETED' ||
    s.status === 'WARRANTY' ||
    s.status === 'IN_AFTERSALE' ||
    s.status === 'ARCHIVED'
  ) {
    order.shippingScreenshotUrl = `https://picsum.photos/seed/shipping${id}/400/300`;
    order.shippingCarrier = s.shippingCarrier || pickCarrier(s.seq);
    order.trackingNumber = `${order.shippingCarrier}${String(1000000 + id * 13).padStart(12, '0')}`;
    order.shippedAt = nowMinus(s.daysAgo - 3, 16, 0);
    order.estimatedArrival = nowMinus(s.daysAgo - 8, 18, 0);
  }
  if (
    s.status === 'AFTERSALE_CONFIRM' ||
    s.status === 'COMPLETED' ||
    s.status === 'WARRANTY' ||
    s.status === 'IN_AFTERSALE' ||
    s.status === 'ARCHIVED'
  ) {
    order.deliveredAt = nowMinus(s.daysAgo - 7, 10, 0);
    order.autoConfirmAt = nowMinus(s.daysAgo - 14, 10, 0);
  }
  if (s.status === 'COMPLETED' || s.status === 'WARRANTY' || s.status === 'ARCHIVED') {
    if (s.hasReceiptVideo) {
      order.receiptVideoUrl = `https://picsum.photos/seed/receipt${id}/400/300`;
    }
  }
  if (s.status === 'WARRANTY') {
    order.warrantyEndAt = nowMinus(s.daysAgo - 90, 23, 59);
    order.depositFrozenAmount = (Number(totalAmount) * 0.1).toFixed(2);
  }
  if (s.status === 'ARCHIVED') {
    order.archivedAt = nowMinus(s.daysAgo - 20, 12, 0);
  }
  if (s.status === 'CANCELLED') {
    order.cancelledReason = s.cancelledReason;
    order.cancelledBy = s.cancelledBy;
    order.archivedAt = nowMinus(Math.max(0, s.daysAgo - 1), 14, 0);
  }

  // ===== 改价历史（演示用，仅 PENDING_PAYMENT 有改价的） =====
  if (s.hasPriceChange) {
    const before = (Number(price) + 200).toFixed(2);
    order.priceHistory.push({
      id: nextPriceLogId(),
      orderId: id,
      field: 'price',
      before,
      after: price,
      reason: '议价：买手同意降价 200 U',
      operator: 'cs',
      changedAt: nowMinus(s.daysAgo, 11, 0)
    });
  }

  // ===== 联动写钱包流水 =====
  if (s.status !== 'PENDING_PAYMENT' && s.status !== 'CANCELLED') {
    // 顾客付款 → ORDER_FREEZE（available → frozenOrder）
    const customerAccount = findAccount(customer.id);
    if (customerAccount) {
      try {
        moveBucket({
          account: customerAccount,
          fromBucket: 'available',
          toBucket: 'frozenOrder',
          amount: totalAmount
        });
      } catch {
        // 余额不足时容错跳过
      }
      const freezeTxn = appendTxn({
        userId: customer.id,
        userName: customer.nickname,
        type: 'ORDER_FREEZE',
        direction: 'out',
        amount: totalAmount,
        balanceAfter: customerAccount.available,
        bucketFrom: 'available',
        bucketTo: 'frozenOrder',
        refType: 'order',
        refId: code,
        operator: 'system',
        remark: `订单付款冻结：${code}`,
        createdAt: order.paidAt || createdAt
      });
      order.paymentTxnId = freezeTxn.id;
    }
  }
  if (s.status === 'COMPLETED' || s.status === 'ARCHIVED') {
    // 完成 → ORDER_SETTLE（frozenOrder → 买手 available 70% + depositAvailable 30%）
    const shopperAccount = findAccount(shopper.id);
    if (shopperAccount) {
      const settleTotal = Number(totalAmount);
      const splitAvail = (settleTotal * 0.7).toFixed(2);
      const splitDep = (settleTotal * 0.3).toFixed(2);
      const settleTxn = appendTxn({
        userId: shopper.id,
        userName: shopper.nickname,
        type: 'ORDER_SETTLE',
        direction: 'in',
        amount: splitAvail,
        balanceAfter: shopperAccount.available,
        bucketFrom: 'frozenOrder',
        bucketTo: 'available',
        refType: 'order',
        refId: code,
        operator: 'finance',
        remark: `订单结算 70% 划入余额：${code}`,
        createdAt: nowMinus(s.daysAgo - 16, 11, 0)
      });
      appendTxn({
        userId: shopper.id,
        userName: shopper.nickname,
        type: 'DEPOSIT_PLEDGE',
        direction: 'in',
        amount: splitDep,
        balanceAfter: shopperAccount.depositAvailable,
        bucketFrom: 'frozenOrder',
        bucketTo: 'depositAvailable',
        refType: 'order',
        refId: code,
        operator: 'finance',
        remark: `订单结算 30% 划入押金：${code}`,
        createdAt: nowMinus(s.daysAgo - 16, 11, 0)
      });
      order.settleTxnId = settleTxn.id;

      // 积分奖励：ORDER_DONE
      appendLog({
        userId: shopper.id,
        userName: shopper.nickname,
        behavior: 'ORDER_DONE',
        change: Math.floor(Number(totalAmount)),
        balanceAfter: shopper.points,
        refType: 'order',
        refId: code,
        isAppealable: false,
        createdAt: nowMinus(s.daysAgo - 16, 11, 5)
      });
    }
  }
  if (s.status === 'WARRANTY') {
    // 店铺保修 → DEPOSIT_PLEDGE 押金担保（保修期内冻结）
    const shopperAccount = findAccount(shopper.id);
    if (shopperAccount && order.depositFrozenAmount) {
      const pledgeTxn = appendTxn({
        userId: shopper.id,
        userName: shopper.nickname,
        type: 'DEPOSIT_PLEDGE',
        direction: 'out',
        amount: order.depositFrozenAmount,
        balanceAfter: shopperAccount.depositAvailable,
        bucketFrom: 'depositAvailable',
        bucketTo: 'depositGuaranteed',
        refType: 'order',
        refId: code,
        operator: 'system',
        remark: `店铺保修冻结押金：${code}`,
        createdAt: order.deliveredAt || createdAt
      });
      order.pledgeTxnId = pledgeTxn.id;
    }
  }
  if (s.overdueShipment) {
    // 48h 未发货 → BUYER_NO_FULFILL 积分扣减
    appendLog({
      userId: shopper.id,
      userName: shopper.nickname,
      behavior: 'BUYER_NO_FULFILL',
      change: -50,
      balanceAfter: Math.max(0, shopper.points - 50),
      refType: 'order',
      refId: code,
      isAppealable: true,
      createdAt: nowMinus(s.daysAgo - 2, 10, 0)
    });
  }

  return order;
}

function runSeed() {
  ORDERS.length = 0;
  SEEDS.forEach(s => ORDERS.push(buildOrder(s)));
}
runSeed();

// ============================================================================
// 查询 / 写入工具
// ============================================================================

export function findOrderById(id: number): OrderRecord | undefined {
  return ORDERS.find(o => o.id === id);
}

export function findOrderByCode(code: string): OrderRecord | undefined {
  return ORDERS.find(o => o.code === code);
}

/** 按 seq（1-60）查找：用于 im-groups makeOrderId 接管 */
export function findOrderBySeq(seq: number): OrderRecord | undefined {
  // ORDERS 按 SEEDS 顺序构建，所以 ORDERS[seq-1] 就是 seq 对应的订单
  return ORDERS[seq - 1];
}

export function appendOrder(o: Omit<OrderRecord, 'id'>): OrderRecord {
  const next: OrderRecord = { id: nextOrderId(), ...o };
  ORDERS.unshift(next);
  return next;
}

export function appendPriceChangeLog(log: Omit<PriceChangeLog, 'id'>): PriceChangeLog {
  const next: PriceChangeLog = { id: nextPriceLogId(), ...log };
  return next;
}

/** 状态机转换（mock handler 内调用） */
export function transitionOrder(orderId: number, newStatus: OrderStatus, _actor: string): OrderRecord | undefined {
  const order = findOrderById(orderId);
  if (!order) return undefined;
  order.status = newStatus;
  if (newStatus === 'PROCURING') order.paidAt ||= new Date().toISOString();
  if (newStatus === 'PROCURED') order.procuredAt = new Date().toISOString();
  if (newStatus === 'IN_TRANSIT') order.shippedAt = new Date().toISOString();
  if (newStatus === 'AFTERSALE_CONFIRM') order.deliveredAt = new Date().toISOString();
  if (newStatus === 'ARCHIVED') order.archivedAt = new Date().toISOString();
  return order;
}

/** 设置 activeAftersaleId 关联 */
export function linkAftersale(orderId: number, aftersaleId: number): void {
  const order = findOrderById(orderId);
  if (order) order.activeAftersaleId = aftersaleId;
}
