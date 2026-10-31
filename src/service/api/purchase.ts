import { realOrderRequest } from '@/service/request';
import { requireArray, resolvePageSize, toPageTotal } from './page';
import { fetchCategoryTree } from './category';
import { toIsoDate } from './date';
import { toAfterSaleType } from './product';
import { readLedgerAmount } from './wallet';

let categoryPathCache: Map<string, string> | undefined;
let categoryPathCachePromise: Promise<Map<string, string>> | undefined;

function fromAfterSaleType(value: Api.Product.AftersaleType): Api.RealProduct.AfterSaleType {
  if (value === 'none') return 'NONE';
  if (value === 'shop-warranty') return 'SHOP_WARRANTY';
  if (value === 'national-warranty') return 'NATIONAL_WARRANTY';
  return 'SEVEN_DAY_NO_REASON';
}

function toStatus(value?: string): Api.PurchaseRequest.RequestStatus {
  const key = value?.toUpperCase();
  if (key === 'OPEN') return 'pushing';
  if (key === 'PENDING_REVIEW' || key === 'PENDING_AUDIT' || key === 'PENDING' || key === 'REVIEWING') return 'pending_audit';
  if (key === 'REJECTED') return 'rejected';
  if (key === 'CLAIMED' || key === 'TAKEN') return 'claimed';
  if (key === 'VOID' || key === 'CANCELLED' || key === 'CANCELED') return 'cancelled';
  throw new Error('求购状态缺失或暂不支持，无法确认可执行操作');
}

async function getCategoryPath(id?: string) {
  if (!id) return '';
  if (categoryPathCache) return categoryPathCache.get(id) || id;
  if (!categoryPathCachePromise) {
    categoryPathCachePromise = (async () => {
      const nextCache = new Map<string, string>();
      const walk = (nodes: Api.RealCategory.DisplayCategoryNode[], path: string[] = []) => {
        nodes.forEach(node => {
          const next = [...path, node.name];
          nextCache.set(String(node.id), next.join(' / '));
          if (node.children?.length) walk(node.children, next);
        });
      };
      try {
        walk(await fetchCategoryTree());
      } catch {
        // 本次只展示分类 ID；失败不写成功缓存，下次用户查询可重新获取。
        return nextCache;
      }
      categoryPathCache = nextCache;
      return nextCache;
    })();
  }
  const pending = categoryPathCachePromise;
  try {
    const cache = await pending;
    return cache.get(id) || id;
  } finally {
    if (categoryPathCachePromise === pending) categoryPathCachePromise = undefined;
  }
}

async function toPurchaseRequest(dto: Api.RealPurchase.PurchaseDemandVO): Promise<Api.RealPurchase.Record> {
  const status = toStatus(dto.status);
  const id = dto.id;
  const categoryId = dto.categoryId;
  const claimedBuyerId = dto.takenBy;
  const budget = readLedgerAmount(dto.budget, '求购预算');
  // 天数是展示/筛选统计，不是业务 ID；禁止将缺字段当作零天。
  const expectedDays = (typeof dto.expectDeliveryDays !== 'string' && typeof dto.expectDeliveryDays !== 'number') || String(dto.expectDeliveryDays).trim() === ''
    ? NaN : Number(dto.expectDeliveryDays);
  if (!Number.isSafeInteger(expectedDays) || expectedDays < 0) throw new Error('求购期望发货天数尚未确认，请重新读取');

  return {
    id,
    code: `PUR-${dto.id}`,
    customerId: dto.buyerId || '',
    customerName: dto.buyerName || '暂无姓名',
    productTitle: dto.title,
    productDescription: dto.description || '',
    categoryId,
    categoryPath: dto.categoryName || await getCategoryPath(dto.categoryId),
    budgetAmount: budget,
    expectedDays,
    overseasCustoms: !!dto.overseasClearance,
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    rawAfterSaleType: dto.afterSaleType,
    evidenceUrls: dto.images || [],
    appeal: dto.demandNote || '',
    status,
    reviewComment: dto.reviewComment,
    reviewedAt: toIsoDate(dto.reviewedAt),
    assignedBy: dto.assignedBy,
    addressId: dto.addressId,
    claimExpiresAt: toIsoDate(dto.expireAt),
    pushedToBuyerIds: claimedBuyerId ? [claimedBuyerId] : [],
    claimedBy: claimedBuyerId,
    claimedByName: claimedBuyerId ? dto.takenByName || '暂无姓名' : undefined,
    claimedAt: toIsoDate(dto.takenAt),
    relatedOrderId: dto.orderId,
    relatedOrderCode: dto.orderId ? String(dto.orderId) : undefined,
    createdAt: toIsoDate(dto.createdAt)
  };
}

async function mapPage(page: Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number }) {
  const current = Number(page.current ?? page.pageNo ?? 1);
  if (!Number.isSafeInteger(current) || current < 1) throw new Error('求购页码异常，请重新读取');
  return {
    current,
    size: resolvePageSize(page, 20),
    total: toPageTotal(page.total),
    records: await Promise.all(requireArray<Api.RealPurchase.PurchaseDemandVO>(page.records, '求购分页记录').map(toPurchaseRequest))
  };
}

export async function fetchHall(q: Omit<Api.RealPurchase.PurchaseDemandPageQuery, 'statuses'> & { current?: number; size?: number; signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/hall/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20,
    categoryId: q.categoryId,
    keyword: q.keyword,
    minBudget: q.minBudget,
    maxBudget: q.maxBudget,
    minDeliveryDays: q.minDeliveryDays,
    maxDeliveryDays: q.maxDeliveryDays
  }, { signal: q.signal, preserveDecimals: true });
  return mapPage(page);
}

export async function fetchMyPurchases(
  customerId: string | number,
  statuses?: Api.PurchaseRequest.RequestStatus[],
  q: { current?: number; size?: number; signal?: AbortSignal } = {}
) {
  const page = await realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/my/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 30,
    statuses: statuses?.flatMap(status => ({ pending_audit: ['PENDING_REVIEW'], rejected: ['REJECTED'], pushing: ['OPEN'], claimed: ['TAKEN'], cancelled: ['VOID', 'CANCELED'] })[status])
  }, { signal: q.signal, preserveDecimals: true });
  const mapped = await mapPage(page);
  mapped.records = mapped.records.map(item => ({ ...item, customerId }));
  return mapped;
}

export async function fetchPurchaseProgress(id: string | number, options: { signal?: AbortSignal } = {}) {
  const progress = await realOrderRequest.get<Api.RealPurchase.Progress>('/demands/my/progress', { params: { id }, ...options, showError: false });
  if (!progress || String(progress.demandId) !== String(id)) throw new Error('求购进度归属不符');
  return { ...progress, timeline: [...requireArray<Api.RealPurchase.Progress['timeline'][number]>(progress.timeline, '求购进度节点')].sort((a, b) => a.occurredAt - b.occurredAt) };
}

export async function fetchPurchaseDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  const dto = await realOrderRequest.get<Api.RealPurchase.PurchaseDemandVO>('/demands/detail', { params: { id }, signal: options.signal, preserveDecimals: true });
  return toPurchaseRequest(dto);
}

export async function createPurchase(p: {
  id?: string | number;
  productTitle: string;
  productDescription: string;
  categoryId: string | number;
  addressId: string | number;
  budgetAmount: string | number;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  evidenceUrls?: string[];
}) {
  const id = await realOrderRequest[p.id === undefined ? 'post' : 'put']<string, Api.RealPurchase.PurchaseDemandCreateParams>(p.id === undefined ? '/demands/create' : '/demands/update', {
    id: p.id,
    title: p.productTitle,
    categoryId: p.categoryId,
    addressId: p.addressId,
    description: p.productDescription,
    budget: String(p.budgetAmount),
    expectDeliveryDays: p.expectedDays,
    overseasClearance: p.overseasCustoms,
    afterSaleType: fromAfterSaleType(p.aftersaleType),
    demandNote: p.appeal,
    images: p.evidenceUrls || []
  });
  return id;
}

export async function cancelPurchase(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/cancel', { id });
  return { ok: true, message: '' };
}

export async function claimRequest(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/grab', { id });
  return { ok: true, message: '' };
}
