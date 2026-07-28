/**
 * 售后工单 mock API：我的工单 / 详情 / 发起 / 撤销。
 */
import {
  AFTERSALE_CASES,
  appendAftersale,
  appendAftersaleEvent,
  findAftersaleById,
  findAftersaleByOrderId
} from '../mock/data/aftersale-cases';
import { findOrderById, linkAftersale } from '../mock/data/orders';
import { findUserById } from '../mock/data/users';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface AftersaleListQuery {
  current?: number;
  size?: number;
  customerId?: number;
  shopperId?: number;
  statuses?: Api.Order.AftersaleStatus[];
}

export async function fetchMyAftersales(q: AftersaleListQuery) {
  let list = [...AFTERSALE_CASES];
  if (q.customerId != null) list = list.filter(c => c.customerId === q.customerId);
  if (q.shopperId != null) list = list.filter(c => c.shopperId === q.shopperId);
  if (q.statuses?.length) list = list.filter(c => q.statuses!.includes(c.status));
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchAftersaleDetail(id: number) {
  return delay(findAftersaleById(id));
}

export async function fetchOrderAftersales(orderId: number) {
  return delay(findAftersaleByOrderId(orderId));
}

export interface CreateAftersaleParams {
  orderId: number;
  customerId: number;
  caseType: Api.Order.AftersaleCaseType;
  appeal: string;
  evidenceUrls?: string[];
}

function nextCaseCode(): string {
  return `AS-2026-${String(AFTERSALE_CASES.length + 1).padStart(5, '0')}`;
}

export async function createAftersaleMock(
  p: CreateAftersaleParams
): Promise<{ ok: boolean; case?: Api.Order.AftersaleCase; message?: string }> {
  const order = findOrderById(p.orderId);
  if (!order) return delay({ ok: false, message: '订单不存在' }, 200);
  const customer = findUserById(p.customerId);
  const shopper = findUserById(order.shopperId);
  const caseRecord = appendAftersale({
    code: nextCaseCode(),
    orderId: p.orderId,
    orderCode: order.code,
    customerId: p.customerId,
    customerName: customer?.nickname || '匿名顾客',
    shopperId: order.shopperId,
    shopperName: shopper?.nickname || '买手',
    caseType: p.caseType,
    appeal: p.appeal,
    evidenceUrls: p.evidenceUrls || [],
    status: 'pending',
    history: [],
    createdAt: new Date().toISOString()
  });
  appendAftersaleEvent(caseRecord, {
    action: 'create',
    actor: customer?.nickname || '顾客',
    actorId: p.customerId,
    time: new Date().toISOString(),
    note: p.appeal
  });
  linkAftersale(order.id, caseRecord.id);
  return delay({ ok: true, case: caseRecord }, 600);
}

export async function cancelAftersaleMock(caseId: number): Promise<{ ok: boolean }> {
  const c = findAftersaleById(caseId);
  if (!c) return delay({ ok: false }, 200);
  c.status = 'cancelled';
  appendAftersaleEvent(c, {
    action: 'close',
    actor: c.customerName,
    actorId: c.customerId,
    time: new Date().toISOString(),
    note: '顾客主动撤销'
  });
  return delay({ ok: true }, 400);
}
