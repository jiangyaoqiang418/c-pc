import { realOrderRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';
import { fetchCategoryTree } from './category';
import { toIsoDate } from './date';

let categoryPathCache: Map<string, string> | undefined;
let categoryPathCachePromise: Promise<Map<string, string>> | undefined;

function toAfterSaleType(value?: string): Api.Product.AftersaleType {
  if (value === 'NONE') return 'none';
  if (value === 'SHOP_WARRANTY') return 'shop-warranty';
  if (value === 'NATIONAL_WARRANTY') return 'national-warranty';
  return '7day-no-reason';
}

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
  return 'pushing';
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
        // 分类树失败时保留空缓存，调用方仍可展示原始分类 ID，不重复并发请求。
        nextCache.set(id, id);
      }
      categoryPathCache = nextCache;
      return nextCache;
    })();
  }
  const cache = await categoryPathCachePromise;
  return cache.get(id) || id;
}

async function toPurchaseRequest(dto: Api.RealPurchase.PurchaseDemandVO): Promise<Api.RealPurchase.Record> {
  const id = dto.id;
  const categoryId = dto.categoryId;
  const claimedBuyerId = dto.takenBy;

  return {
    id,
    code: `PUR-${dto.id}`,
    customerId: dto.buyerId || '',
    customerName: '',
    productTitle: dto.title,
    productDescription: dto.description || '',
    categoryId,
    categoryPath: await getCategoryPath(dto.categoryId),
    budgetAmount: String(dto.budget ?? 0),
    expectedDays: dto.expectDeliveryDays || 0,
    overseasCustoms: !!dto.overseasClearance,
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    evidenceUrls: dto.images || [],
    appeal: dto.demandNote || dto.description || '',
    status: toStatus(dto.status),
    reviewComment: dto.reviewComment,
    reviewedAt: toIsoDate(dto.reviewedAt),
    assignedBy: dto.assignedBy,
    claimExpiresAt: toIsoDate(dto.expireAt),
    pushedToBuyerIds: claimedBuyerId ? [claimedBuyerId] : [],
    claimedBy: claimedBuyerId,
    claimedByName: claimedBuyerId ? `买手 ${claimedBuyerId}` : undefined,
    claimedAt: toIsoDate(dto.takenAt),
    relatedOrderId: dto.orderId,
    relatedOrderCode: dto.orderId ? String(dto.orderId) : undefined,
    createdAt: toIsoDate(dto.createdAt)
  };
}

async function mapPage(page: Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number }) {
  return {
    current: page.current || page.pageNo || 1,
    size: page.size || page.pageSize || 20,
    total: toPageTotal(page.total),
    records: await Promise.all(requireArray<Api.RealPurchase.PurchaseDemandVO>(page.records, '求购分页记录').map(toPurchaseRequest))
  };
}

export async function fetchHall(q: { current?: number; size?: number; categoryId?: string | number; keyword?: string; signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/hall/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20,
    categoryId: q.categoryId,
    keyword: q.keyword
  }, { signal: q.signal });
  return mapPage(page);
}

export async function fetchMyPurchases(
  customerId: string | number,
  statuses?: Api.PurchaseRequest.RequestStatus[],
  q: { current?: number; size?: number; signal?: AbortSignal } = {}
) {
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/my/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 30
  }, { signal: q.signal });
  const mapped = await mapPage(page);
  mapped.records = mapped.records.map(item => ({ ...item, customerId }));
  if (statuses?.length) mapped.records = mapped.records.filter(item => statuses.includes(item.status));
  return mapped;
}

export async function fetchPurchaseDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  const dto = await realOrderRequest.get<Api.RealPurchase.PurchaseDemandVO>('/demands/detail', { params: { id }, signal: options.signal });
  return toPurchaseRequest(dto);
}

export async function createPurchase(p: {
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
  const id = await realOrderRequest.post<string, Api.RealPurchase.PurchaseDemandCreateParams>('/demands/create', {
    title: p.productTitle,
    categoryId: p.categoryId,
    addressId: p.addressId,
    description: p.productDescription,
    budget: Number(p.budgetAmount),
    expectDeliveryDays: p.expectedDays,
    overseasClearance: p.overseasCustoms,
    afterSaleType: fromAfterSaleType(p.aftersaleType),
    demandNote: p.appeal,
    images: p.evidenceUrls || []
  });
  return fetchPurchaseDetail(id);
}

export async function cancelPurchase(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/cancel', { id });
  return { ok: true, message: '' };
}

export async function claimRequest(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/grab', { id });
  return { ok: true, message: '' };
}
