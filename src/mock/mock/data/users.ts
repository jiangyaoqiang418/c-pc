/**
 * C 端用户池（R-DATA-11）：顾客 + 买手统一表，isBuyer 标识买手身份。
 * 与 mock/data/accounts.ts（后台员工）完全独立。
 *
 * 35 条 seed：~20 纯顾客 + ~15 买手；VIP / KYC / status 分布合理。
 */
import { recomputeTagUserCount } from './tags';

type UserRecord = Api.User.UserRecord;

let idCursor = 0;
function nextId() {
  idCursor += 1;
  return idCursor;
}

function daysAgo(d: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

interface Seed {
  email: string;
  nickname: string;
  phone?: string;
  isBuyer: boolean;
  kycStatus: Api.User.KycStatus;
  status?: Api.User.Status;
  points: number;
  tagIds?: number[];
  regDaysAgo: number;
  activeDaysAgo?: number;
  remark?: string;
  /** 顾客黑名单标志位（R-MOD-11 V2.0）— seed 阶段同步设置 */
  withdrawRequiresAudit?: boolean;
}

// 等级阈值（默认 0 / 1000 / 10000；由 vip-config.ts 控制）
function levelOf(points: number): Api.User.VipLevel {
  if (points >= 10000) return 'VIP2';
  if (points >= 1000) return 'VIP1';
  return 'VIP0';
}

const SEEDS: Seed[] = [
  // ===== 顾客 20+ 条 =====
  {
    email: 'wangxiaomei@example.com',
    nickname: '王小美',
    phone: '18900000001',
    isBuyer: false,
    kycStatus: 'approved',
    points: 4250,
    tagIds: [1, 3],
    regDaysAgo: 180,
    activeDaysAgo: 1
  },
  {
    email: 'lijianhua@example.com',
    nickname: '李建华',
    phone: '18900000002',
    isBuyer: false,
    kycStatus: 'none',
    points: 320,
    tagIds: [6],
    regDaysAgo: 5,
    activeDaysAgo: 0
  },
  {
    email: 'zhaominjie@example.com',
    nickname: '赵敏婕',
    isBuyer: false,
    kycStatus: 'pending',
    points: 580,
    tagIds: [],
    regDaysAgo: 30,
    activeDaysAgo: 3
  },
  {
    email: 'sunyiyi@example.com',
    nickname: '孙怡怡',
    phone: '18900000003',
    isBuyer: false,
    kycStatus: 'approved',
    points: 12300,
    tagIds: [1, 3, 5],
    regDaysAgo: 250,
    activeDaysAgo: 0,
    remark: '高净值客户'
  },
  {
    email: 'liuyifei@example.com',
    nickname: '刘亦菲',
    isBuyer: false,
    kycStatus: 'approved',
    status: '2',
    points: 9500,
    tagIds: [1, 3, 5, 8],
    regDaysAgo: 200,
    activeDaysAgo: 5,
    remark: '顾客黑名单·黑钱包入金记录',
    withdrawRequiresAudit: true
  },
  {
    email: 'chenqiaoqiao@example.com',
    nickname: '陈乔乔',
    phone: '18900000004',
    isBuyer: false,
    kycStatus: 'rejected',
    status: '2',
    points: 50,
    tagIds: [8],
    regDaysAgo: 45,
    activeDaysAgo: 20,
    remark: '顾客黑名单·身份盗用嫌疑',
    withdrawRequiresAudit: true
  },
  {
    email: 'xuhaohan@example.com',
    nickname: '徐浩瀚',
    isBuyer: false,
    kycStatus: 'expired',
    points: 1850,
    tagIds: [3],
    regDaysAgo: 400,
    activeDaysAgo: 7,
    remark: 'KYC 已过期需重新认证'
  },
  {
    email: 'maxiaolong@example.com',
    nickname: '马小龙',
    phone: '18900000005',
    isBuyer: false,
    kycStatus: 'approved',
    points: 760,
    tagIds: [],
    regDaysAgo: 60,
    activeDaysAgo: 2
  },
  {
    email: 'huyibin@example.com',
    nickname: '胡逸彬',
    isBuyer: false,
    kycStatus: 'approved',
    points: 6700,
    tagIds: [1, 5],
    regDaysAgo: 150,
    activeDaysAgo: 0
  },
  {
    email: 'gaoyizhi@example.com',
    nickname: '高逸之',
    phone: '18900000006',
    isBuyer: false,
    kycStatus: 'none',
    points: 110,
    tagIds: [6],
    regDaysAgo: 3,
    activeDaysAgo: 0
  },
  {
    email: 'wuxinran@example.com',
    nickname: '吴心然',
    isBuyer: false,
    kycStatus: 'approved',
    status: '2',
    points: 2200,
    tagIds: [8],
    regDaysAgo: 90,
    activeDaysAgo: 4,
    remark: '顾客黑名单·恶意 chargeback 多次',
    withdrawRequiresAudit: true
  },
  {
    email: 'zhouweiyi@example.com',
    nickname: '周维一',
    phone: '18900000007',
    isBuyer: false,
    kycStatus: 'approved',
    points: 14800,
    tagIds: [1, 3, 5],
    regDaysAgo: 300,
    activeDaysAgo: 0,
    remark: 'VIP2 演示账号'
  },
  {
    email: 'caoxiaoshu@example.com',
    nickname: '曹小书',
    isBuyer: false,
    kycStatus: 'pending',
    points: 200,
    tagIds: [4],
    regDaysAgo: 15,
    activeDaysAgo: 1
  },
  {
    email: 'dengfangyu@example.com',
    nickname: '邓方雨',
    isBuyer: false,
    kycStatus: 'approved',
    points: 0,
    status: '2',
    tagIds: [8],
    regDaysAgo: 100,
    activeDaysAgo: 95,
    remark: '顾客黑名单·关联涉黑账户',
    withdrawRequiresAudit: true
  },
  {
    email: 'yanyuze@example.com',
    nickname: '严昱泽',
    phone: '18900000008',
    isBuyer: false,
    kycStatus: 'approved',
    points: 3800,
    tagIds: [1, 3],
    regDaysAgo: 120,
    activeDaysAgo: 1
  },
  {
    email: 'haoxinwen@example.com',
    nickname: '郝心雯',
    isBuyer: false,
    kycStatus: 'approved',
    status: '2',
    points: 450,
    tagIds: [8],
    regDaysAgo: 35,
    activeDaysAgo: 10,
    remark: '顾客黑名单·频繁退款滥用',
    withdrawRequiresAudit: true
  },
  {
    email: 'shenqiyan@example.com',
    nickname: '沈奇砚',
    phone: '18900000009',
    isBuyer: false,
    kycStatus: 'approved',
    status: '2',
    points: 8200,
    tagIds: [8],
    regDaysAgo: 220,
    activeDaysAgo: 2,
    remark: '顾客黑名单·KYC 信息造假尝试',
    withdrawRequiresAudit: true
  },
  {
    email: 'pengyaoming@example.com',
    nickname: '彭曜明',
    isBuyer: false,
    kycStatus: 'none',
    points: 0,
    tagIds: [6, 7],
    regDaysAgo: 1,
    activeDaysAgo: 1
  },
  {
    email: 'luoyuhang@example.com',
    nickname: '罗宇航',
    phone: '18900000010',
    isBuyer: false,
    kycStatus: 'approved',
    points: 5100,
    tagIds: [1, 3],
    regDaysAgo: 160,
    activeDaysAgo: 0
  },
  {
    email: 'baixiao@example.com',
    nickname: '白小',
    isBuyer: false,
    kycStatus: 'approved',
    points: 920,
    tagIds: [],
    regDaysAgo: 70,
    activeDaysAgo: 100,
    remark: '长期沉默'
  },
  // ===== 买手 15+ 条 =====
  {
    email: 'zhanglilin@example.com',
    nickname: '张丽琳',
    phone: '18800000001',
    isBuyer: true,
    kycStatus: 'approved',
    points: 5600,
    tagIds: [3],
    regDaysAgo: 200,
    activeDaysAgo: 0,
    remark: '商品组主力买手'
  },
  {
    email: 'yangjianjun@example.com',
    nickname: '杨建军',
    phone: '18800000002',
    isBuyer: true,
    kycStatus: 'approved',
    points: 12400,
    tagIds: [1, 3, 5],
    regDaysAgo: 300,
    activeDaysAgo: 0,
    remark: 'VIP2 买手'
  },
  {
    email: 'songruohan@example.com',
    nickname: '宋若涵',
    isBuyer: true,
    kycStatus: 'approved',
    points: 3200,
    tagIds: [3],
    regDaysAgo: 150,
    activeDaysAgo: 1
  },
  {
    email: 'feijiayi@example.com',
    nickname: '费佳怡',
    phone: '18800000003',
    isBuyer: true,
    kycStatus: 'approved',
    points: 1800,
    tagIds: [3],
    regDaysAgo: 120,
    activeDaysAgo: 2
  },
  {
    email: 'liaoyichen@example.com',
    nickname: '廖以辰',
    isBuyer: true,
    kycStatus: 'approved',
    points: 950,
    tagIds: [],
    regDaysAgo: 80,
    activeDaysAgo: 0
  },
  {
    email: 'tangchuyu@example.com',
    nickname: '唐楚雨',
    phone: '18800000004',
    isBuyer: true,
    kycStatus: 'approved',
    points: 6800,
    tagIds: [3, 5],
    regDaysAgo: 180,
    activeDaysAgo: 3,
    remark: '高好评率买手'
  },
  {
    email: 'cuiyuting@example.com',
    nickname: '崔雨婷',
    isBuyer: true,
    kycStatus: 'approved',
    points: 4500,
    tagIds: [3],
    regDaysAgo: 140,
    activeDaysAgo: 0
  },
  {
    email: 'fengwenbo@example.com',
    nickname: '冯文博',
    phone: '18800000005',
    isBuyer: true,
    kycStatus: 'approved',
    points: 11500,
    tagIds: [3, 5],
    regDaysAgo: 260,
    activeDaysAgo: 1,
    remark: 'VIP2 老买手'
  },
  {
    email: 'jianglinyu@example.com',
    nickname: '江临渔',
    isBuyer: true,
    kycStatus: 'approved',
    points: 2200,
    tagIds: [],
    regDaysAgo: 100,
    activeDaysAgo: 4
  },
  {
    email: 'qiansiya@example.com',
    nickname: '钱思雅',
    phone: '18800000006',
    isBuyer: true,
    kycStatus: 'approved',
    points: 580,
    tagIds: [],
    regDaysAgo: 40,
    activeDaysAgo: 1
  },
  {
    email: 'wuxiaomeng@example.com',
    nickname: '吴小萌',
    isBuyer: true,
    kycStatus: 'approved',
    points: 3300,
    tagIds: [3, 8],
    regDaysAgo: 110,
    activeDaysAgo: 2,
    remark: '客诉偏高需关注'
  },
  {
    email: 'duomujie@example.com',
    nickname: '朵木洁',
    phone: '18800000007',
    isBuyer: true,
    kycStatus: 'approved',
    points: 8400,
    tagIds: [3, 5],
    regDaysAgo: 230,
    activeDaysAgo: 0
  },
  {
    email: 'baoyi@example.com',
    nickname: '鲍弋',
    isBuyer: true,
    kycStatus: 'expired',
    status: '2',
    points: 720,
    tagIds: [8],
    regDaysAgo: 360,
    activeDaysAgo: 60,
    remark: 'KYC 过期且已停用'
  },
  {
    email: 'mengsi@example.com',
    nickname: '孟思',
    phone: '18800000008',
    isBuyer: true,
    kycStatus: 'approved',
    points: 4900,
    tagIds: [3],
    regDaysAgo: 170,
    activeDaysAgo: 0
  },
  {
    email: 'guodanyu@example.com',
    nickname: '郭丹宇',
    isBuyer: true,
    kycStatus: 'approved',
    points: 1100,
    tagIds: [],
    regDaysAgo: 60,
    activeDaysAgo: 5
  }
];

export const USERS: UserRecord[] = SEEDS.map(s => {
  const id = nextId();
  return {
    id,
    email: s.email,
    nickname: s.nickname,
    avatar: '',
    phone: s.phone,
    isBuyer: s.isBuyer,
    kycStatus: s.kycStatus,
    status: s.status || '1',
    points: s.points,
    vipLevel: levelOf(s.points),
    tagIds: s.tagIds || [],
    registeredAt: daysAgo(s.regDaysAgo),
    lastActiveAt: s.activeDaysAgo === undefined ? undefined : daysAgo(s.activeDaysAgo),
    remark: s.remark,
    withdrawRequiresAudit: s.withdrawRequiresAudit
  };
});

// 初始化标签 userCount
recomputeTagUserCount(USERS.map(u => u.tagIds));

export function findUserById(id: number) {
  return USERS.find(u => u.id === id);
}

export function findUserByEmail(email: string) {
  return USERS.find(u => u.email === email);
}

let userIdCursor = 1000;
export function takeNextUserId() {
  userIdCursor += 1;
  return userIdCursor;
}

/** R-DATA-10：根据当前 VIP 配置计算 user.vipLevel（外部调用，避免循环依赖） */
export function recomputeVipLevels(thresholds: {
  customer: { VIP0: number; VIP1: number; VIP2: number };
  buyer: { VIP0: number; VIP1: number; VIP2: number };
}) {
  USERS.forEach(u => {
    const t = u.isBuyer ? thresholds.buyer : thresholds.customer;
    if (u.points >= t.VIP2) u.vipLevel = 'VIP2';
    else if (u.points >= t.VIP1) u.vipLevel = 'VIP1';
    else u.vipLevel = 'VIP0';
  });
}
