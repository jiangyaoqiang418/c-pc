/**
 * 求购大厅 mock API：大厅列表 / 我的求购 / 发起 / 撤销 / 接单。
 */
import {
  PURCHASE_REQUESTS,
  PUSH_LOGS,
  appendRequest,
  findRequestById,
  pushToNextLevel
} from '../mock/data/purchase-requests';
import { findUserById } from '../mock/data/users';
import { CATEGORIES, categoryPath } from '../mock/data/categories';
import { delay, delayPaginated } from '../utils/mock-delay';

void CATEGORIES;

export interface HallQuery {
  current?: number;
  size?: number;
  categoryId?: number;
  keyword?: string;
  audience?: 'customer' | 'buyer';
  buyerId?: number;
}

export async function fetchHall(q: HallQuery = {}) {
  let list = PURCHASE_REQUESTS.filter(r => r.status === 'pushing');
  if (q.categoryId) list = list.filter(r => r.categoryId === q.categoryId);
  if (q.keyword) {
    const kw = q.keyword.toLowerCase();
    list = list.filter(r => r.productTitle.toLowerCase().includes(kw));
  }
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchMyPurchases(customerId: number, statuses?: Api.PurchaseRequest.RequestStatus[]) {
  let list = PURCHASE_REQUESTS.filter(r => r.customerId === customerId);
  if (statuses?.length) list = list.filter(r => statuses.includes(r.status));
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, 1, 30);
}

export async function fetchPurchaseDetail(id: number) {
  const req = findRequestById(id);
  const logs = PUSH_LOGS.filter(l => l.requestId === id);
  return delay({ request: req, pushLogs: logs }, 200);
}

export interface CreatePurchaseParams {
  customerId: number;
  productTitle: string;
  productDescription: string;
  categoryId: number;
  budgetAmount: string;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  evidenceUrls?: string[];
}

function nextRequestCode(): string {
  return `PUR-2026-${String(PURCHASE_REQUESTS.length + 1).padStart(5, '0')}`;
}

export async function createPurchaseMock(p: CreatePurchaseParams): Promise<Api.PurchaseRequest.PurchaseRequest> {
  const user = findUserById(p.customerId);
  const req = appendRequest({
    code: nextRequestCode(),
    customerId: p.customerId,
    customerName: user?.nickname || '匿名顾客',
    productTitle: p.productTitle,
    productDescription: p.productDescription,
    categoryId: p.categoryId,
    categoryPath: categoryPath(p.categoryId) || '其他',
    budgetAmount: p.budgetAmount,
    expectedDays: p.expectedDays,
    overseasCustoms: p.overseasCustoms,
    aftersaleType: p.aftersaleType,
    evidenceUrls: p.evidenceUrls || [],
    appeal: p.appeal,
    status: 'pending_audit',
    pushedToBuyerIds: [],
    createdAt: new Date().toISOString()
  });
  return delay(req, 600);
}

export async function cancelPurchaseMock(id: number, reason: string): Promise<{ ok: boolean }> {
  const req = findRequestById(id);
  if (!req) return delay({ ok: false }, 200);
  req.status = 'cancelled';
  req.cancelledBy = 'customer';
  req.cancelledReason = reason;
  return delay({ ok: true }, 400);
}

export async function pushNextBatchMock(id: number): Promise<{ ok: boolean; pushed: number }> {
  const req = findRequestById(id);
  if (!req) return delay({ ok: false, pushed: 0 }, 200);
  const result = pushToNextLevel(id, 'system');
  return delay({ ok: result.pushed, pushed: result.buyerIds?.length || 0 }, 400);
}

export async function claimRequestMock(id: number, buyerId: number): Promise<{ ok: boolean; message?: string }> {
  const req = findRequestById(id);
  if (!req) return delay({ ok: false, message: '求购不存在' }, 200);
  if (req.status !== 'pushing') return delay({ ok: false, message: '当前状态不可接单' }, 200);
  const buyer = findUserById(buyerId);
  if (!buyer?.isBuyer) return delay({ ok: false, message: '只有买手可以接单' }, 200);
  req.status = 'claimed';
  req.claimedBy = buyerId;
  req.claimedByName = buyer.nickname;
  req.claimedAt = new Date().toISOString();
  return delay({ ok: true }, 600);
}
