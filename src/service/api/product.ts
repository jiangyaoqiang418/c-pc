import { realOrderRequest } from '@/service/request';

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

function toProductStatus(status?: string): Api.Product.ProductStatus {
  if (status === 'REVIEWING') return 'IN_AUDIT';
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'FROZEN') return 'FROZEN';
  return 'NORMAL';
}

function toShelfStatus(status?: string): Api.Product.ShelfStatus {
  return status === 'OFF_SHELF' ? 'off-shelf' : 'on-shelf';
}

function toIso(value?: string | number) {
  if (!value) return '';
  if (typeof value === 'number') return new Date(value).toISOString();
  if (/^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

export function toProductRecord(dto: Api.RealProduct.ProductDTO): Api.Product.ProductRecord {
  const id = dto.id as unknown as number;
  const sellerId = dto.sellerId as unknown as number;
  const categoryId = dto.categoryId as unknown as number;
  const status = toProductStatus(dto.status);
  const createdAt = toIso(dto.createdAt);
  const updatedAt = toIso(dto.updatedAt) || createdAt;

  return {
    id,
    code: String(dto.id || ''),
    title: dto.title,
    sellerId,
    sellerName: `买手 ${dto.sellerId || ''}`,
    categoryId,
    categoryPath: String(dto.categoryId || ''),
    price: String(dto.price ?? 0),
    stock: dto.stock || 0,
    shippingFee: String(dto.shippingFee ?? 0),
    tax: String(dto.taxFee ?? 0),
    images: (dto.images || []).map((url, sort) => ({ url, name: `图${sort + 1}`, type: 'image', sort })),
    summary: dto.brief || '',
    description: dto.description || '',
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    overseasCustoms: !!dto.overseasClearance,
    status,
    shelfStatus: toShelfStatus(dto.status),
    salesCount: Number(dto.salesCount || 0),
    viewCount: Number(dto.viewCount || 0),
    favoriteCount: Number(dto.favoriteCount || 0),
    draftAuditOpinion: dto.reviewComment,
    createdAt,
    submittedAt: createdAt,
    publishedAt: dto.status === 'ON_SALE' ? createdAt : undefined,
    updatedAt
  };
}

export async function fetchProductDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealProduct.ProductDTO>('/storefront/product/detail', { params: { id } });
  return toProductRecord(dto);
}

async function fetchStorefrontPage(url: string, pageSize = 20) {
  const page = await realOrderRequest.post<Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO>, { pageNo: number; pageSize: number }>(
    url,
    { pageNo: 1, pageSize }
  );
  return page.records.map(toProductRecord);
}

function toFlashSaleProduct(dto: Api.RealProduct.FlashSaleItemVO): Api.Product.ProductRecord {
  const createdAt = toIso(dto.sessionEndTime);
  return {
    id: dto.productId as unknown as number,
    code: String(dto.productId || ''),
    title: dto.title,
    sellerId: 0,
    sellerName: '',
    categoryId: 0,
    categoryPath: '限时秒杀',
    price: String(dto.flashPrice ?? dto.price ?? 0),
    stock: dto.stock ?? dto.flashStock ?? 0,
    shippingFee: '0',
    tax: '0',
    images: dto.image ? [{ url: dto.image, name: '商品图', type: 'image', sort: 0 }] : [],
    summary: '',
    description: '',
    aftersaleType: '7day-no-reason',
    overseasCustoms: false,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: Number(dto.salesCount || 0),
    viewCount: 0,
    favoriteCount: 0,
    createdAt,
    submittedAt: createdAt,
    publishedAt: createdAt || undefined,
    updatedAt: createdAt
  };
}

export function fetchHomeRecommendations(limit = 20) {
  return realOrderRequest
    .get<Api.RealProduct.ProductDTO[]>('/storefront/recommend', { params: { limit } })
    .then(records => records.map(toProductRecord));
}

export function fetchBestSellers(pageSize = 20) {
  return fetchStorefrontPage('/storefront/best-sellers/page', pageSize);
}

export function fetchNewArrivals(pageSize = 20) {
  return fetchStorefrontPage('/storefront/new-arrivals/page', pageSize);
}

export async function fetchFlashSale(limit = 20) {
  const records = await realOrderRequest.get<Api.RealProduct.FlashSaleItemVO[]>('/storefront/flash-sale', { params: { limit } });
  return records.map(item => ({ product: toFlashSaleProduct(item), sessionEndTime: item.sessionEndTime }));
}

export function fetchHomeBanners() {
  return realOrderRequest.get<Api.RealProduct.BannerDTO[]>('/banners/list');
}

export async function trackProductBrowse(id: string | number) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/storefront/browse', { id }, { showError: false });
  return { ok: true };
}

export async function trackProductView(id: string | number) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/products/view', { id }, { showError: false });
  return { ok: true };
}

export async function toggleProductFavorite(id: string | number) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/products/favorite', { id });
  return { ok: true };
}

export async function cancelProductFavorite(id: string | number) {
  await realOrderRequest.delete<boolean>('/products/favorite', { params: { id } });
  return { ok: true };
}

export async function fetchMyFavorites(q: { current?: number; size?: number } = {}) {
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO> & { pageNo?: number; pageSize?: number },
    Api.RealProduct.FavoritePageQuery
  >('/products/favorites/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20
  });
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 20,
    total: page.total,
    records: page.records.map(toProductRecord)
  };
}

export async function fetchSellerProductDetail(id: string | number) {
  const dto = await realOrderRequest.get<Api.RealProduct.ProductDTO>('/products/detail', { params: { id } });
  return toProductRecord(dto);
}

export async function fetchMyProducts(q: {
  current?: number;
  size?: number;
  keyword?: string;
  categoryId?: string | number;
  status?: Api.Product.ProductStatus;
  shelf?: Api.Product.ShelfStatus;
}) {
  const statusMap: Partial<Record<Api.Product.ProductStatus, Api.RealProduct.ProductStatus>> = {
    PENDING_AUDIT: 'REVIEWING',
    IN_AUDIT: 'REVIEWING',
    REJECTED: 'REJECTED',
    NORMAL: 'ON_SALE',
    FROZEN: 'FROZEN'
  };
  const status = q.shelf
    ? q.shelf === 'on-shelf' ? 'ON_SALE' : 'OFF_SHELF'
    : q.status ? statusMap[q.status] : undefined;
  const page = await realOrderRequest.post<
    Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO> & { pageNo?: number; pageSize?: number },
    Api.RealProduct.ProductPageQuery
  >('/products/my/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 50,
    keyword: q.keyword,
    categoryId: q.categoryId,
    status
  });
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 50,
    total: page.total,
    records: page.records.map(toProductRecord)
  };
}

export async function createProduct(p: {
  title: string;
  categoryId: string | number;
  price: string | number;
  shippingFee: string | number;
  tax: string | number;
  stock: number;
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  summary: string;
  description: string;
  images: Api.RealProduct.ProductImageParam[];
}) {
  const id = await realOrderRequest.post<string, Api.RealProduct.ProductCreateParams>('/products/create', {
    title: p.title,
    categoryId: p.categoryId,
    price: Number(p.price),
    shippingFee: Number(p.shippingFee || 0),
    taxFee: Number(p.tax || 0),
    stock: p.stock,
    afterSaleType: fromAfterSaleType(p.aftersaleType),
    overseasClearance: p.overseasCustoms,
    brief: p.summary,
    description: p.description,
    images: p.images
  });
  return fetchSellerProductDetail(id);
}

export async function toggleProductShelf(id: string | number, onShelf: boolean) {
  await realOrderRequest.put<string, Api.RealProduct.ProductShelfParams>('/products/shelf', { id, onShelf });
  return { ok: true };
}

export async function uploadFile(file: File, dir = 'product') {
  const form = new FormData();
  form.append('file', file);
  return realOrderRequest.post<Api.RealProduct.FileUploadResult, FormData>('/files/upload', form, {
    params: { dir }
  });
}
