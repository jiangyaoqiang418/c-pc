/**
 * 售后工单池 ≥ 8 条（5 种 type 全覆盖）。
 *
 * 关联：IN_AFTERSALE 状态订单（ORDERS seq 51-55）+ 部分 COMPLETED 订单。
 * 模块加载时回写 order.activeAftersaleId。
 */
import { ORDERS, linkAftersale } from './orders';

type AftersaleCase = Api.Order.AftersaleCase;
type AftersaleEvent = Api.Order.AftersaleEvent;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}
let eventCursor = 0;
function nextEventId(): number {
  eventCursor += 1;
  return eventCursor;
}

function dt(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

interface CaseSeed {
  /** ORDERS 中订单 seq（1-60） */
  orderSeq: number;
  caseType: Api.Order.AftersaleCaseType;
  appeal: string;
  status: Api.Order.AftersaleStatus;
  daysAgo: number;
  shopperResponse?: 'agreed' | 'rejected';
  shopperResponseNote?: string;
  arbitrator?: string;
  verdict?: Api.Order.AftersaleVerdict;
  verdictNote?: string;
  refundAmount?: string;
  depositDeductAmount?: string;
  evidenceCount?: number;
}

const SEEDS: CaseSeed[] = [
  // 2 pending（顾客刚发起，买手未响应）
  {
    orderSeq: 51,
    caseType: 'REFUND',
    appeal: '收到商品有破损，包装也被压扁了，希望退货退款',
    status: 'pending',
    daysAgo: 1,
    evidenceCount: 3
  },
  {
    orderSeq: 52,
    caseType: 'REPLACE',
    appeal: '颜色与商品详情页不符（页面是钛原色，收到是黑色），希望换货',
    status: 'pending',
    daysAgo: 2,
    evidenceCount: 2
  },

  // 2 shopper_agreed
  {
    orderSeq: 33, // COMPLETED 订单，售后期内发起
    caseType: 'PARTIAL_REFUND',
    appeal: '商品有轻微划痕但可使用，希望部分退款 20%',
    status: 'shopper_agreed',
    daysAgo: 5,
    shopperResponse: 'agreed',
    shopperResponseNote: '同意退还 20%，已实际确认',
    evidenceCount: 4
  },
  {
    orderSeq: 34,
    caseType: 'REPAIR',
    appeal: '商品按钮失灵，希望修理',
    status: 'shopper_agreed',
    daysAgo: 3,
    shopperResponse: 'agreed',
    shopperResponseNote: '同意送官方维修',
    evidenceCount: 2
  },

  // 2 shopper_rejected → arbitrating
  {
    orderSeq: 53,
    caseType: 'REFUND',
    appeal: '商品功能与描述不符，要求全额退款',
    status: 'arbitrating',
    daysAgo: 6,
    shopperResponse: 'rejected',
    shopperResponseNote: '商品规格与描述一致，拒绝退款',
    arbitrator: 'risk',
    evidenceCount: 5
  },
  {
    orderSeq: 54,
    caseType: 'REFUND_ONLY',
    appeal: '商品质量问题严重，无法使用，仅退款不退货（破损无法寄回）',
    status: 'arbitrating',
    daysAgo: 7,
    shopperResponse: 'rejected',
    shopperResponseNote: '需顾客退回商品验货，无法直接退款',
    arbitrator: 'risk',
    evidenceCount: 6
  },

  // 1 arbitrating → executing
  {
    orderSeq: 55,
    caseType: 'REPLACE',
    appeal: '收到商品与下单不符，要求换货',
    status: 'executing',
    daysAgo: 8,
    shopperResponse: 'rejected',
    shopperResponseNote: '订单备注与实际购买不一致',
    arbitrator: 'fanlu',
    verdict: 'both_fault',
    verdictNote: '双方在沟通中均有疏忽，按比例处理：买手扣 200U + 顾客承担运费',
    refundAmount: '500.00',
    depositDeductAmount: '200.00',
    evidenceCount: 3
  },

  // 1 force_execute → completed
  {
    orderSeq: 35,
    caseType: 'REFUND',
    appeal: '商品已过保但保修期内出现问题，要求保修',
    status: 'completed',
    daysAgo: 30,
    shopperResponse: 'rejected',
    shopperResponseNote: '已过保修期，拒绝维修',
    arbitrator: 'super',
    verdict: 'shopper_fault',
    verdictNote: '商品确实在保修期内，买手拒不执行，平台代为执行：扣买手押金赔付顾客',
    refundAmount: '1500.00',
    depositDeductAmount: '1500.00',
    evidenceCount: 4
  }
];

export const AFTERSALE_CASES: AftersaleCase[] = [];

function buildCase(s: CaseSeed): AftersaleCase {
  const order = ORDERS[s.orderSeq - 1];
  if (!order) throw new Error(`Order seq ${s.orderSeq} not found for aftersale case`);
  const id = nextId();
  const createdAt = dt(s.daysAgo);
  const code = `AS-2026-${String(20000 + id).padStart(5, '0')}`;

  const evidenceUrls: string[] = [];
  const count = s.evidenceCount || 1;
  for (let i = 0; i < count; i += 1) {
    evidenceUrls.push(`https://picsum.photos/seed/as${id}-${i}/400/300`);
  }

  const history: AftersaleEvent[] = [];
  history.push({
    id: nextEventId(),
    action: 'create',
    actor: order.customerName,
    actorId: order.customerId,
    time: createdAt,
    note: s.appeal
  });
  if (s.shopperResponse) {
    history.push({
      id: nextEventId(),
      action: 'shopper_respond',
      actor: order.shopperName,
      actorId: order.shopperId,
      time: dt(Math.max(0, s.daysAgo - 1)),
      note: s.shopperResponseNote
    });
    if (s.shopperResponse === 'rejected') {
      history.push({
        id: nextEventId(),
        action: 'platform_intervene',
        actor: '系统',
        time: dt(Math.max(0, s.daysAgo - 2)),
        note: '买手拒绝，平台介入仲裁'
      });
    }
  }
  if (s.verdict) {
    history.push({
      id: nextEventId(),
      action: 'arbitrate',
      actor: s.arbitrator || 'risk',
      time: dt(Math.max(0, s.daysAgo - 3)),
      note: s.verdictNote
    });
  }
  if (s.status === 'executing') {
    history.push({
      id: nextEventId(),
      action: 'execute',
      actor: order.shopperName,
      time: dt(Math.max(0, s.daysAgo - 4)),
      note: '买手执行中'
    });
  }
  if (s.status === 'completed') {
    history.push({
      id: nextEventId(),
      action: 'force_execute',
      actor: 'super',
      time: dt(Math.max(0, s.daysAgo - 5)),
      note: '买手拒不执行，平台代扣押金赔付'
    });
    history.push({
      id: nextEventId(),
      action: 'close',
      actor: 'super',
      time: dt(Math.max(0, s.daysAgo - 6)),
      note: '售后已关闭'
    });
  }

  const acase: AftersaleCase = {
    id,
    code,
    orderId: order.id,
    orderCode: order.code,
    customerId: order.customerId,
    customerName: order.customerName,
    shopperId: order.shopperId,
    shopperName: order.shopperName,
    caseType: s.caseType,
    appeal: s.appeal,
    evidenceUrls,
    status: s.status,
    shopperResponse: s.shopperResponse,
    shopperResponseNote: s.shopperResponseNote,
    arbitrator: s.arbitrator,
    verdict: s.verdict,
    verdictNote: s.verdictNote,
    refundAmount: s.refundAmount,
    depositDeductAmount: s.depositDeductAmount,
    createdAt,
    closedAt: s.status === 'completed' ? dt(Math.max(0, s.daysAgo - 6)) : undefined,
    history
  };

  // 回写 order.activeAftersaleId（pending / arbitrating / executing 视为活跃中）
  if (s.status !== 'completed' && s.status !== 'cancelled') {
    linkAftersale(order.id, id);
  }
  return acase;
}

function runSeed() {
  AFTERSALE_CASES.length = 0;
  SEEDS.forEach(s => AFTERSALE_CASES.push(buildCase(s)));
}
runSeed();

export function findAftersaleById(id: number): AftersaleCase | undefined {
  return AFTERSALE_CASES.find(c => c.id === id);
}

export function findAftersaleByOrderId(orderId: number): AftersaleCase[] {
  return AFTERSALE_CASES.filter(c => c.orderId === orderId);
}

export function appendAftersale(c: Omit<AftersaleCase, 'id'>): AftersaleCase {
  const next: AftersaleCase = { id: nextId(), ...c };
  AFTERSALE_CASES.unshift(next);
  return next;
}

export function appendAftersaleEvent(c: AftersaleCase, evt: Omit<AftersaleEvent, 'id'>): AftersaleEvent {
  const next: AftersaleEvent = { id: nextEventId(), ...evt };
  c.history.push(next);
  return next;
}
