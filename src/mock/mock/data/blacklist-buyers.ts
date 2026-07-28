/**
 * 买手黑名单内存池（≥ 8 条 seed = 5 active + 3 removed）。
 *
 * 买手黑名单 不联动钱包冻结 / 仅限制上架（doc 1-6 明文："买手黑名单中用户仍可使用顾客端购买商品"）。
 * mock handler add/remove 不修改 USERS（保留 isBuyer=true），仅维护本池 + history。
 *
 * Seed 选自 USERS 中 IDs 21-35 段（买手池）：
 *   - Active 5：22 杨建军 / 24 费佳怡 / 27 崔雨婷 / 30 钱思雅 / 31 吴小萌
 *   - Removed 3：25 廖以辰 / 26 唐楚雨 / 35 郭丹宇
 */
import { findUserById } from './users';
import { nextEventId } from './blacklist-events';

type BuyerBlacklistEntry = Api.Blacklist.BuyerBlacklistEntry;
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

interface BuyerSeed {
  userId: number;
  reason: string;
  addedBy: string;
  addedDaysAgo: number;
  removedBy?: string;
  removedReason?: string;
  removedDaysAgo?: number;
  extraNote?: { actor: string; note: string; daysAgo: number };
}

const SEEDS: BuyerSeed[] = [
  // ===== Active 5 =====
  {
    userId: 22,
    reason: '上架商品涉嫌假货：多个 SKU 经鉴定为高仿，已下架并触发风控',
    addedBy: 'risk',
    addedDaysAgo: 8,
    extraNote: { actor: 'risk', note: '已通知补充进货凭证', daysAgo: 5 }
  },
  {
    userId: 24,
    reason: '严重违规客服话术：辱骂顾客、引导线下交易，三方群截图已留存',
    addedBy: 'risk',
    addedDaysAgo: 12
  },
  {
    userId: 27,
    reason: '售后纠纷投诉过多：30 天内 8 单售后维权，5 单平台介入仲裁不利',
    addedBy: 'risk',
    addedDaysAgo: 20,
    extraNote: { actor: 'cs', note: '客服补充：群内有威胁顾客记录', daysAgo: 15 }
  },
  {
    userId: 30,
    reason: '重复刷单嫌疑：风控模型检测到与多个买家账号 IP 同源，订单短期集中',
    addedBy: 'risk',
    addedDaysAgo: 5
  },
  {
    userId: 31,
    reason: '客诉率超 30%：连续两个自然周客诉率超阈值，触发自动告警 + 人工封停',
    addedBy: 'risk',
    addedDaysAgo: 3
  },

  // ===== Removed 3 =====
  {
    userId: 25,
    reason: '未发货率偶发偏高：7 天内 4 单超时发货，触发预警',
    addedBy: 'risk',
    addedDaysAgo: 40,
    removedBy: 'risk',
    removedReason: '已整改：买手补充供应链证据，恢复正常发货',
    removedDaysAgo: 28
  },
  {
    userId: 26,
    reason: '被恶意举报：举报方账号集群刷举报',
    addedBy: 'risk',
    addedDaysAgo: 35,
    removedBy: 'super',
    removedReason: '调查无证据：举报方账号集群已封禁，本买手澄清',
    removedDaysAgo: 30
  },
  {
    userId: 35,
    reason: '刷单嫌疑：销量短期暴增，与好评率不匹配',
    addedBy: 'risk',
    addedDaysAgo: 55,
    removedBy: 'risk',
    removedReason: '误判已纠正：经核查为正常促销爆款，订单真实',
    removedDaysAgo: 48
  }
];

/** 主真实源 */
export const BUYER_BLACKLIST: BuyerBlacklistEntry[] = [];

function buildEntry(s: BuyerSeed): BuyerBlacklistEntry {
  const u = findUserById(s.userId);
  if (!u) throw new Error(`User ${s.userId} not found for buyer blacklist`);
  const id = nextId();
  const addedAt = daysAgo(s.addedDaysAgo);
  const history: BlacklistEvent[] = [
    {
      id: nextEventId(),
      targetType: 'buyer',
      targetId: id,
      targetLabel: u.nickname,
      action: 'add',
      actor: s.addedBy,
      time: addedAt,
      note: s.reason
    }
  ];
  if (s.extraNote) {
    history.push({
      id: nextEventId(),
      targetType: 'buyer',
      targetId: id,
      targetLabel: u.nickname,
      action: 'note',
      actor: s.extraNote.actor,
      time: daysAgo(s.extraNote.daysAgo),
      note: s.extraNote.note
    });
  }
  const entry: BuyerBlacklistEntry = {
    id,
    userId: u.id,
    userName: u.nickname,
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
      targetType: 'buyer',
      targetId: id,
      targetLabel: u.nickname,
      action: 'remove',
      actor: s.removedBy,
      time: entry.removedAt,
      note: s.removedReason
    });
  }
  return entry;
}

function seed() {
  BUYER_BLACKLIST.length = 0;
  SEEDS.forEach(s => BUYER_BLACKLIST.push(buildEntry(s)));
}
seed();

// USERS 引用已在 buildEntry 中通过 findUserById 间接使用，无需额外触发

export function findBuyerEntry(id: number): BuyerBlacklistEntry | undefined {
  return BUYER_BLACKLIST.find(e => e.id === id);
}

export function findActiveBuyerEntryByUserId(userId: number): BuyerBlacklistEntry | undefined {
  return BUYER_BLACKLIST.find(e => e.userId === userId && e.status === 'active');
}

export function appendBuyerEntry(entry: Omit<BuyerBlacklistEntry, 'id'>): BuyerBlacklistEntry {
  const next: BuyerBlacklistEntry = { id: nextId(), ...entry };
  BUYER_BLACKLIST.unshift(next);
  return next;
}
