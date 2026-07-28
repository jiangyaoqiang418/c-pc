/**
 * 积分申诉池：≥10 条覆盖三种状态。
 *
 * 与 point-logs.ts 中标记 isAppealable + appealStatus≠'none' 的流水保持一致。
 */
import { POINT_LOGS } from './point-logs';

type Appeal = Api.Point.Appeal;

let idCursor = 0;
function nextId() {
  idCursor += 1;
  return idCursor;
}

function nowMinus(daysAgo: number): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  return t.toISOString();
}

interface Seed {
  logId: number;
  reason: string;
  status: Appeal['status'];
  auditOpinion?: string;
  submitDaysAgo: number;
  auditDaysAgo?: number;
  auditor?: string;
}

// 不能在 SEEDS 中硬编码 logId（依赖动态 nextId），故按需查找
function findLogIdByRefId(refId: string): number {
  const log = POINT_LOGS.find(l => l.refId === refId);
  return log?.id || 0;
}

const SEEDS: Seed[] = [
  // huyibin REVIEW_BAD RV003
  {
    logId: findLogIdByRefId('RV003'),
    reason: '商品本身没问题，对方因物流延迟给了差评，请审核撤销',
    status: 'pending',
    submitDaysAgo: 5
  },
  // zhanglilin REVIEW_BAD RV011
  {
    logId: findLogIdByRefId('RV011'),
    reason: '我们已联系顾客解释清楚，顾客同意撤回差评但系统未处理',
    status: 'pending',
    submitDaysAgo: 8
  },
  // zhanglilin BUYER_NO_FULFILL OD20260510021
  {
    logId: findLogIdByRefId('OD20260510021'),
    reason: '订单未履约是由于上游供应商断货，已提供采购证明',
    status: 'rejected',
    auditOpinion: '上游断货证明不充分，已驳回；建议加强供应链管理',
    submitDaysAgo: 12,
    auditDaysAgo: 10,
    auditor: 'super'
  },
  // songruohan REVIEW_BAD RV013
  {
    logId: findLogIdByRefId('RV013'),
    reason: '顾客对赠品不满意打的差评，与主商品无关',
    status: 'approved',
    auditOpinion: '查看聊天记录确认顾客投诉与主商品无关，扣分已撤销',
    submitDaysAgo: 6,
    auditDaysAgo: 4,
    auditor: 'super'
  },
  // songruohan BUYER_NO_FULFILL OD20260512024
  {
    logId: findLogIdByRefId('OD20260512024'),
    reason: '该订单顾客单方面取消，请求撤销扣分',
    status: 'pending',
    submitDaysAgo: 14
  },
  // jianglinyu REVIEW_BAD RV016
  { logId: findLogIdByRefId('RV016'), reason: '差评与事实不符，已提供物流凭证', status: 'pending', submitDaysAgo: 7 },
  // wuxiaomeng BUYER_NO_FULFILL OD20260508032
  {
    logId: findLogIdByRefId('OD20260508032'),
    reason: '客户突然变更收货地址导致超时',
    status: 'pending',
    submitDaysAgo: 18
  },
  // 补几条已审核记录
  {
    logId: 0,
    reason: '差评内容含侮辱性语言已被平台删除，请撤销扣分',
    status: 'approved',
    auditOpinion: '核实差评已删除，扣分撤销',
    submitDaysAgo: 20,
    auditDaysAgo: 18,
    auditor: 'super'
  },
  {
    logId: 0,
    reason: '请求撤销未履约扣分，已与顾客协商一致',
    status: 'rejected',
    auditOpinion: '协商记录不完整，维持原扣分',
    submitDaysAgo: 25,
    auditDaysAgo: 22,
    auditor: 'super'
  },
  {
    logId: 0,
    reason: '差评是误操作，顾客联系平台撤回',
    status: 'approved',
    auditOpinion: '已核实，撤销扣分并补偿',
    submitDaysAgo: 15,
    auditDaysAgo: 13,
    auditor: 'super'
  }
];

export const POINT_APPEALS: Appeal[] = SEEDS.map(s => {
  // 若 logId=0（未找到对应流水），用第一条 REVIEW_BAD 作为占位
  const log =
    POINT_LOGS.find(l => l.id === s.logId) || POINT_LOGS.find(l => l.behavior === 'REVIEW_BAD') || POINT_LOGS[0];
  return {
    id: nextId(),
    logId: log.id,
    userId: log.userId,
    userName: log.userName,
    behavior: log.behavior,
    originChange: log.change,
    reason: s.reason,
    status: s.status,
    auditOpinion: s.auditOpinion,
    submitAt: nowMinus(s.submitDaysAgo),
    auditAt: s.auditDaysAgo === undefined ? undefined : nowMinus(s.auditDaysAgo),
    auditor: s.auditor
  };
});

export function findAppealById(id: number) {
  return POINT_APPEALS.find(a => a.id === id);
}

export function appendAppeal(a: Omit<Appeal, 'id'>): Appeal {
  const next: Appeal = { id: nextId(), ...a };
  POINT_APPEALS.unshift(next);
  return next;
}
