import { realOrderRequest } from '@/service/request';
import { toPageTotal } from './page';
import { fetchCategoryTree } from './category';

let categoryPathCache: Map<string, string> | undefined;

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
  if (key === 'PENDING_AUDIT' || key === 'PENDING' || key === 'REVIEWING') return 'pending_audit';
  if (key === 'REJECTED') return 'rejected';
  if (key === 'CLAIMED' || key === 'TAKEN') return 'claimed';
  if (key === 'VOID' || key === 'CANCELLED' || key === 'CANCELED') return 'cancelled';
  return 'pushing';
}

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

async function getCategoryPath(id?: string) {
  if (!id) return '';
  if (!categoryPathCache) {
    categoryPathCache = new Map();
    const walk = (nodes: Api.Category.CategoryNode[], path: string[] = []) => {
      nodes.forEach(node => {
        const next = [...path, node.name];
        categoryPathCache!.set(String(node.id), next.join(' / '));
        if (node.children?.length) walk(node.children, next);
      });
    };
    try {
      walk(await fetchCategoryTree());
    } catch {
      categoryPathCache.set(id, id);
    }
  }
  return categoryPathCache.get(id) || id;
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
    claimExpiresAt: toIso(dto.expireAt),
    pushedToBuyerIds: claimedBuyerId ? [claimedBuyerId] : [],
    claimedBy: claimedBuyerId,
    claimedByName: claimedBuyerId ? `买手 ${claimedBuyerId}` : undefined,
    claimedAt: toIso(dto.takenAt),
    relatedOrderId: dto.orderId,
    relatedOrderCode: dto.orderId ? String(dto.orderId) : undefined,
    createdAt: toIso(dto.createdAt)
  };
}

async function mapPage(page: Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number }) {
  return {
    current: page.current || page.pageNo || 1,
    size: page.size || page.pageSize || 20,
    total: toPageTotal(page.total),
    records: await Promise.all(page.records.map(toPurchaseRequest))
  };
}

export async function fetchHall(q: { current?: number; size?: number; categoryId?: string | number; keyword?: string } = {}) {
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/hall/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20,
    categoryId: q.categoryId,
    keyword: q.keyword
  });
  return mapPage(page);
}

export async function fetchMyPurchases(
  customerId: string | number,
  statuses?: Api.PurchaseRequest.RequestStatus[],
  q: { current?: number; size?: number } = {}
) {
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealPurchase.PurchaseDemandVO> & { pageNo?: number; pageSize?: number },
    Api.RealPurchase.PurchaseDemandPageQuery
  >('/demands/my/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 30
  });
  const mapped = await mapPage(page);
  mapped.records = mapped.records.map(item => ({ ...item, customerId }));
  if (statuses?.length) mapped.records = mapped.records.filter(item => statuses.includes(item.status));
  return mapped;
}

export async function fetchPurchaseDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealPurchase.PurchaseDemandVO>('/demands/detail', { params: { id } });
  return { request: await toPurchaseRequest(dto), pushLogs: [] as Api.PurchaseRequest.PushLog[] };
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
  return (await fetchPurchaseDetail(id)).request;
}

export async function cancelPurchase(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/cancel', { id });
  return { ok: true, message: '' };
}

export async function claimRequest(id: string | number) {
  await realOrderRequest.post<string, { id: string | number }>('/demands/grab', { id });
  return { ok: true, message: '' };
}
