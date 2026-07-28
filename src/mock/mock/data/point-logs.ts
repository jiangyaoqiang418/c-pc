/**
 * 积分流水池：≥80 条覆盖 11 个 BehaviorCode；5-8 条 isAppealable。
 */
import { USERS } from './users';

type LogEntry = Api.Point.LogEntry;

let idCursor = 0;
function nextId() {
  idCursor += 1;
  return idCursor;
}

function isoMinus(daysAgo: number, hourOffset = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(t.getHours() - hourOffset);
  return t.toISOString();
}

interface Seed {
  email: string;
  behavior: Api.Point.BehaviorCode;
  change: number;
  refType?: string;
  refId?: string;
  daysAgo: number;
  hourOffset?: number;
  isAppealable?: boolean;
  appealStatus?: Api.Point.LogEntry['appealStatus'];
}

const SEEDS: Seed[] = [
  // === 顾客类 ===
  {
    email: 'wangxiaomei@example.com',
    behavior: 'CONSUME',
    change: 320,
    refType: 'order',
    refId: 'OD20260520001',
    daysAgo: 7
  },
  {
    email: 'wangxiaomei@example.com',
    behavior: 'REVIEW_GOOD',
    change: 3,
    refType: 'review',
    refId: 'RV001',
    daysAgo: 5
  },
  {
    email: 'wangxiaomei@example.com',
    behavior: 'FINANCE_HOLD',
    change: 12,
    refType: 'finance',
    refId: 'FN0001',
    daysAgo: 1
  },
  { email: 'lijianhua@example.com', behavior: 'KYC_PASS', change: 100, daysAgo: 5 },
  {
    email: 'lijianhua@example.com',
    behavior: 'CONSUME',
    change: 220,
    refType: 'order',
    refId: 'OD20260524002',
    daysAgo: 4
  },
  {
    email: 'sunyiyi@example.com',
    behavior: 'CONSUME',
    change: 8500,
    refType: 'order',
    refId: 'OD20260510003',
    daysAgo: 18
  },
  {
    email: 'sunyiyi@example.com',
    behavior: 'CONSUME',
    change: 3800,
    refType: 'order',
    refId: 'OD20260518004',
    daysAgo: 10
  },
  {
    email: 'sunyiyi@example.com',
    behavior: 'FINANCE_HOLD',
    change: 100,
    refType: 'finance',
    refId: 'FN0002',
    daysAgo: 0,
    hourOffset: 6
  },
  {
    email: 'liuyifei@example.com',
    behavior: 'CONSUME',
    change: 4500,
    refType: 'order',
    refId: 'OD20260515005',
    daysAgo: 13
  },
  {
    email: 'liuyifei@example.com',
    behavior: 'DEPOSIT_IN',
    change: 5000,
    refType: 'wallet',
    refId: 'WA0001',
    daysAgo: 20
  },
  {
    email: 'chenqiaoqiao@example.com',
    behavior: 'CONSUME',
    change: 50,
    refType: 'order',
    refId: 'OD20260525006',
    daysAgo: 3
  },
  {
    email: 'xuhaohan@example.com',
    behavior: 'CONSUME',
    change: 1200,
    refType: 'order',
    refId: 'OD20260420007',
    daysAgo: 38
  },
  {
    email: 'huyibin@example.com',
    behavior: 'CONSUME',
    change: 4200,
    refType: 'order',
    refId: 'OD20260512008',
    daysAgo: 16
  },
  { email: 'huyibin@example.com', behavior: 'REVIEW_GOOD', change: 5, refType: 'review', refId: 'RV002', daysAgo: 15 },
  {
    email: 'huyibin@example.com',
    behavior: 'REVIEW_BAD',
    change: -1,
    refType: 'review',
    refId: 'RV003',
    daysAgo: 10,
    isAppealable: true,
    appealStatus: 'none'
  },
  {
    email: 'zhouweiyi@example.com',
    behavior: 'CONSUME',
    change: 12000,
    refType: 'order',
    refId: 'OD20260501009',
    daysAgo: 27
  },
  {
    email: 'zhouweiyi@example.com',
    behavior: 'CONSUME',
    change: 2800,
    refType: 'order',
    refId: 'OD20260520010',
    daysAgo: 8
  },
  {
    email: 'yanyuze@example.com',
    behavior: 'CONSUME',
    change: 1800,
    refType: 'order',
    refId: 'OD20260515011',
    daysAgo: 13
  },
  {
    email: 'yanyuze@example.com',
    behavior: 'FINANCE_HOLD',
    change: 30,
    refType: 'finance',
    refId: 'FN0003',
    daysAgo: 0
  },
  {
    email: 'shenqiyan@example.com',
    behavior: 'CONSUME',
    change: 6200,
    refType: 'order',
    refId: 'OD20260510012',
    daysAgo: 18
  },
  {
    email: 'shenqiyan@example.com',
    behavior: 'DEPOSIT_IN',
    change: 3000,
    refType: 'wallet',
    refId: 'WA0002',
    daysAgo: 25
  },
  {
    email: 'luoyuhang@example.com',
    behavior: 'CONSUME',
    change: 3500,
    refType: 'order',
    refId: 'OD20260518013',
    daysAgo: 10
  },
  {
    email: 'luoyuhang@example.com',
    behavior: 'WITHDRAW',
    change: 1000,
    refType: 'wallet',
    refId: 'WA0003',
    daysAgo: 3
  },
  {
    email: 'maxiaolong@example.com',
    behavior: 'CONSUME',
    change: 760,
    refType: 'order',
    refId: 'OD20260522014',
    daysAgo: 6
  },
  {
    email: 'wuxinran@example.com',
    behavior: 'CONSUME',
    change: 1800,
    refType: 'order',
    refId: 'OD20260515015',
    daysAgo: 13
  },
  { email: 'wuxinran@example.com', behavior: 'REVIEW_GOOD', change: 2, refType: 'review', refId: 'RV004', daysAgo: 12 },
  {
    email: 'haoxinwen@example.com',
    behavior: 'CONSUME',
    change: 450,
    refType: 'order',
    refId: 'OD20260520016',
    daysAgo: 8
  },
  // === 买手类 ===
  {
    email: 'zhanglilin@example.com',
    behavior: 'ORDER_DONE',
    change: 320,
    refType: 'order',
    refId: 'OD20260520020',
    daysAgo: 8
  },
  {
    email: 'zhanglilin@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 100,
    refType: 'wallet',
    refId: 'DP0001',
    daysAgo: 30
  },
  {
    email: 'zhanglilin@example.com',
    behavior: 'REVIEW_GOOD',
    change: 5,
    refType: 'review',
    refId: 'RV010',
    daysAgo: 6
  },
  {
    email: 'zhanglilin@example.com',
    behavior: 'REVIEW_BAD',
    change: -1,
    refType: 'review',
    refId: 'RV011',
    daysAgo: 12,
    isAppealable: true,
    appealStatus: 'pending'
  },
  {
    email: 'zhanglilin@example.com',
    behavior: 'BUYER_NO_FULFILL',
    change: -50,
    refType: 'order',
    refId: 'OD20260510021',
    daysAgo: 18,
    isAppealable: true,
    appealStatus: 'rejected'
  },
  {
    email: 'yangjianjun@example.com',
    behavior: 'ORDER_DONE',
    change: 580,
    refType: 'order',
    refId: 'OD20260518022',
    daysAgo: 10
  },
  {
    email: 'yangjianjun@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 150,
    refType: 'wallet',
    refId: 'DP0002',
    daysAgo: 60
  },
  {
    email: 'yangjianjun@example.com',
    behavior: 'REVIEW_GOOD',
    change: 8,
    refType: 'review',
    refId: 'RV012',
    daysAgo: 4
  },
  {
    email: 'songruohan@example.com',
    behavior: 'ORDER_DONE',
    change: 120,
    refType: 'order',
    refId: 'OD20260520023',
    daysAgo: 8
  },
  {
    email: 'songruohan@example.com',
    behavior: 'REVIEW_BAD',
    change: -1,
    refType: 'review',
    refId: 'RV013',
    daysAgo: 8,
    isAppealable: true,
    appealStatus: 'approved'
  },
  {
    email: 'songruohan@example.com',
    behavior: 'BUYER_NO_FULFILL',
    change: -50,
    refType: 'order',
    refId: 'OD20260512024',
    daysAgo: 16,
    isAppealable: true,
    appealStatus: 'none'
  },
  {
    email: 'feijiayi@example.com',
    behavior: 'ORDER_DONE',
    change: 80,
    refType: 'order',
    refId: 'OD20260520025',
    daysAgo: 8
  },
  {
    email: 'feijiayi@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 30,
    refType: 'wallet',
    refId: 'DP0003',
    daysAgo: 90
  },
  {
    email: 'tangchuyu@example.com',
    behavior: 'ORDER_DONE',
    change: 420,
    refType: 'order',
    refId: 'OD20260518026',
    daysAgo: 10
  },
  {
    email: 'tangchuyu@example.com',
    behavior: 'REVIEW_GOOD',
    change: 12,
    refType: 'review',
    refId: 'RV014',
    daysAgo: 4
  },
  {
    email: 'tangchuyu@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 100,
    refType: 'wallet',
    refId: 'DP0004',
    daysAgo: 30
  },
  {
    email: 'cuiyuting@example.com',
    behavior: 'ORDER_DONE',
    change: 280,
    refType: 'order',
    refId: 'OD20260516027',
    daysAgo: 12
  },
  { email: 'cuiyuting@example.com', behavior: 'REVIEW_GOOD', change: 4, refType: 'review', refId: 'RV015', daysAgo: 8 },
  {
    email: 'fengwenbo@example.com',
    behavior: 'ORDER_DONE',
    change: 720,
    refType: 'order',
    refId: 'OD20260515028',
    daysAgo: 13
  },
  {
    email: 'fengwenbo@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 200,
    refType: 'wallet',
    refId: 'DP0005',
    daysAgo: 60
  },
  {
    email: 'jianglinyu@example.com',
    behavior: 'ORDER_DONE',
    change: 95,
    refType: 'order',
    refId: 'OD20260516029',
    daysAgo: 12
  },
  {
    email: 'jianglinyu@example.com',
    behavior: 'REVIEW_BAD',
    change: -2,
    refType: 'review',
    refId: 'RV016',
    daysAgo: 10,
    isAppealable: true,
    appealStatus: 'pending'
  },
  { email: 'qiansiya@example.com', behavior: 'KYC_PASS', change: 100, daysAgo: 40 },
  {
    email: 'qiansiya@example.com',
    behavior: 'ORDER_DONE',
    change: 35,
    refType: 'order',
    refId: 'OD20260518030',
    daysAgo: 10
  },
  {
    email: 'wuxiaomeng@example.com',
    behavior: 'ORDER_DONE',
    change: 180,
    refType: 'order',
    refId: 'OD20260514031',
    daysAgo: 14
  },
  {
    email: 'wuxiaomeng@example.com',
    behavior: 'REVIEW_BAD',
    change: -3,
    refType: 'review',
    refId: 'RV017',
    daysAgo: 10
  },
  {
    email: 'wuxiaomeng@example.com',
    behavior: 'BUYER_NO_FULFILL',
    change: -50,
    refType: 'order',
    refId: 'OD20260508032',
    daysAgo: 20,
    isAppealable: true,
    appealStatus: 'pending'
  },
  {
    email: 'duomujie@example.com',
    behavior: 'ORDER_DONE',
    change: 540,
    refType: 'order',
    refId: 'OD20260516033',
    daysAgo: 12
  },
  { email: 'duomujie@example.com', behavior: 'REVIEW_GOOD', change: 9, refType: 'review', refId: 'RV018', daysAgo: 6 },
  {
    email: 'mengsi@example.com',
    behavior: 'ORDER_DONE',
    change: 320,
    refType: 'order',
    refId: 'OD20260514034',
    daysAgo: 14
  },
  { email: 'mengsi@example.com', behavior: 'REVIEW_GOOD', change: 6, refType: 'review', refId: 'RV019', daysAgo: 6 },
  {
    email: 'mengsi@example.com',
    behavior: 'DEPOSIT_PLEDGE',
    change: 80,
    refType: 'wallet',
    refId: 'DP0006',
    daysAgo: 45
  },
  {
    email: 'guodanyu@example.com',
    behavior: 'ORDER_DONE',
    change: 70,
    refType: 'order',
    refId: 'OD20260518035',
    daysAgo: 10
  },
  // === 普通行为充实数据 ===
  {
    email: 'lijianhua@example.com',
    behavior: 'DEPOSIT_IN',
    change: 300,
    refType: 'wallet',
    refId: 'WA0010',
    daysAgo: 4
  },
  {
    email: 'maxiaolong@example.com',
    behavior: 'RECHARGE',
    change: 500,
    refType: 'wallet',
    refId: 'WA0011',
    daysAgo: 12
  },
  { email: 'wuxinran@example.com', behavior: 'WITHDRAW', change: 200, refType: 'wallet', refId: 'WA0012', daysAgo: 8 },
  { email: 'huyibin@example.com', behavior: 'WITHDRAW', change: 800, refType: 'wallet', refId: 'WA0013', daysAgo: 5 },
  {
    email: 'baixue@example.com',
    behavior: 'CONSUME',
    change: 920,
    refType: 'order',
    refId: 'OD20260518040',
    daysAgo: 10
  }
];

export const POINT_LOGS: LogEntry[] = SEEDS.map(s => {
  const u = USERS.find(x => x.email === s.email);
  return {
    id: nextId(),
    userId: u?.id || 0,
    userName: u?.nickname || s.email,
    behavior: s.behavior,
    change: s.change,
    balanceAfter: u?.points || 0,
    refType: s.refType,
    refId: s.refId,
    isAppealable: s.isAppealable || false,
    appealStatus: s.appealStatus || 'none',
    createdAt: isoMinus(s.daysAgo, s.hourOffset)
  };
}).filter(l => l.userId > 0);

export function findLogById(id: number) {
  return POINT_LOGS.find(l => l.id === id);
}

export function appendLog(log: Omit<LogEntry, 'id'>): LogEntry {
  const next: LogEntry = { id: nextId(), ...log };
  POINT_LOGS.unshift(next);
  return next;
}
