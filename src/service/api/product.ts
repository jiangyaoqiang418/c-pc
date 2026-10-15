import { realOrderRequest } from '@/service/request';
import { requireArray, toPageTotal } from './page';
import { toIsoDate } from './date';
import { toFiniteNumber } from './number';
import { enums } from '@shared';
import { sumPaymentAmounts } from '@/utils/checkout';
import { exactTransactionAmount } from '@/components/wallet/decimal-amount';

export function toAfterSaleType(value?: string): Api.RealProduct.DisplayAfterSaleType {
  if (value === 'SEVEN_DAY_NO_REASON') return '7day-no-reason';
  if (value === 'NONE') return 'none';
  if (value === 'SHOP_WARRANTY') return 'shop-warranty';
  if (value === 'NATIONAL_WARRANTY') return 'national-warranty';
  return 'unknown';
}

export function getAftersaleMeta(value: Api.RealProduct.DisplayAfterSaleType) {
  return value !== 'unknown' && Object.prototype.hasOwnProperty.call(enums.AFTERSALE_TYPE_META, value)
    ? enums.AFTERSALE_TYPE_META[value] : { label: '售后信息待确认', color: 'gray' };
}

function fromAfterSaleType(value: Api.Product.AftersaleType): Api.RealProduct.AfterSaleType {
  if (value === 'none') return 'NONE';
  if (value === 'shop-warranty') return 'SHOP_WARRANTY';
  if (value === 'national-warranty') return 'NATIONAL_WARRANTY';
  return 'SEVEN_DAY_NO_REASON';
}

function toProductStatus(status?: string, auditStage?: Api.RealProduct.ProductDTO['auditStage']): Api.Product.ProductStatus {
  if (status === 'REVIEWING') return auditStage === 'PENDING_AUDIT' ? 'PENDING_AUDIT' : 'IN_AUDIT';
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'FROZEN') return 'FROZEN';
  return 'NORMAL';
}

function toShelfStatus(status?: string): Api.Product.ShelfStatus {
  return status === 'ON_SALE' ? 'on-shelf' : 'off-shelf';
}

/** 缺失或无效统计保持未知，不让未提供的数据显示为零。 */
function toProductCount(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** 售价是商品读取的必需值；缺值不代表免费，真实零价仍保留。 */
function requireProductPrice(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
    throw new Error('商品价格缺失或格式无效，请重新读取后核对');
  }
  try {
    return sumPaymentAmounts([typeof value === 'string' ? value.trim() : value]);
  } catch {
    throw new Error('商品价格缺失或格式无效，请重新读取后核对');
  }
}

function readProductFee(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  return exactTransactionAmount(value, true).value;
}

function readProductSkus(dto: Api.RealProduct.ProductDTO): Api.RealProduct.ProductSkuFields {
  const specGroups = dto.specGroups ?? [];
  const skus = dto.skus ?? [];
  if (!Array.isArray(specGroups) || !Array.isArray(skus)) throw new Error('商品规格信息不完整，请重新读取后核对');
  if (!dto.hasSku && !specGroups.length && !skus.length) return { hasSku: false, specGroups: [], skus: [] };
  const invalid = () => { throw new Error('商品规格信息不完整，请重新读取后核对'); };
  if (dto.hasSku !== true || !Array.isArray(specGroups) || !specGroups.length || specGroups.length > 3 || !Array.isArray(skus) || skus.length > 200) return invalid();
  const names = new Set<string>();
  for (const group of specGroups) {
    if (!group || typeof group.name !== 'string' || !group.name.trim() || names.has(group.name)
      || !Array.isArray(group.options) || !group.options.length || group.options.length > 50
      || group.options.some(option => typeof option !== 'string' || !option.trim())
      || new Set(group.options).size !== group.options.length) return invalid();
    names.add(group.name);
  }
  const ids = new Set<string>();
  const combinations = new Set<string>();
  return {
    hasSku: true,
    specGroups: specGroups.map(group => ({ name: group.name, options: [...group.options] })),
    skus: skus.map(sku => {
      if (!sku || !['string', 'number'].includes(typeof sku.id) || !String(sku.id).trim()
        || (typeof sku.id === 'number' && !Number.isSafeInteger(sku.id)) || ids.has(String(sku.id))
        || !Number.isSafeInteger(sku.stock) || sku.stock < 0 || typeof sku.enabled !== 'boolean'
        || !Array.isArray(sku.specs) || sku.specs.length !== specGroups.length) return invalid();
      const specs = specGroups.map(group => {
        const options = sku.specs.filter(spec => spec?.name === group.name);
        if (options.length !== 1 || !group.options.includes(options[0].value)) return invalid();
        return { name: group.name, value: options[0].value };
      });
      const combination = JSON.stringify(specs);
      if (combinations.has(combination)) return invalid();
      ids.add(String(sku.id));
      combinations.add(combination);
      const price = exactTransactionAmount(sku.price).value;
      if (price === undefined) return invalid();
      return { id: sku.id, specs, price, stock: sku.stock, enabled: sku.enabled, image: sku.image };
    })
  };
}

export function toProductRecord(dto: Api.RealProduct.ProductDTO): Api.RealProduct.Record {
  const id = dto.id;
  const sellerId = dto.sellerId;
  const categoryId = dto.categoryId;
  const status = toProductStatus(dto.status, dto.auditStage);
  const createdAt = toIsoDate(dto.createdAt);
  const updatedAt = toIsoDate(dto.updatedAt) || createdAt;

  return {
    ...readProductSkus(dto),
    id,
    code: String(dto.id || ''),
    title: dto.title,
    sellerId,
    sellerName: dto.sellerName || '商品买手',
    categoryId,
    categoryPath: dto.categoryName || '',
    price: requireProductPrice(dto.price),
    stock: toFiniteNumber(dto.stock || 0),
    shippingFee: readProductFee(dto.shippingFee),
    tax: readProductFee(dto.taxFee),
    images: (dto.images || []).map((url, sort) => ({ url, name: `图${sort + 1}`, type: 'image', sort })),
    summary: dto.brief || '',
    description: dto.description || '',
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    rawAfterSaleType: dto.afterSaleType,
    rawStatus: dto.status,
    imageFiles: dto.imageFiles,
    overseasCustoms: !!dto.overseasClearance,
    status,
    shelfStatus: toShelfStatus(dto.status),
    salesCount: toProductCount(dto.salesCount),
    viewCount: toProductCount(dto.viewCount),
    favoriteCount: toProductCount(dto.favoriteCount),
    draftAuditOpinion: dto.reviewComment,
    createdAt,
    submittedAt: createdAt,
    publishedAt: dto.status === 'ON_SALE' ? createdAt : undefined,
    updatedAt
  };
}

function toStorefrontProductRecord(dto: Api.RealProduct.StorefrontProductVO): Api.RealProduct.Record {
  return {
    id: dto.id,
    code: String(dto.id || ''),
    title: dto.title,
    sellerId: dto.sellerId || '',
    sellerName: dto.sellerName || '商品买手',
    categoryId: dto.categoryId || '',
    categoryPath: dto.categoryName || '',
    price: requireProductPrice(dto.price),
    stock: toFiniteNumber(dto.stock ?? 0),
    shippingFee: undefined,
    tax: undefined,
    images: dto.coverImage ? [{ url: dto.coverImage, name: '商品图', type: 'image', sort: 0 }] : [],
    summary: '',
    description: '',
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    rawAfterSaleType: dto.afterSaleType,
    overseasCustoms: !!dto.overseasClearance,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: toProductCount(dto.salesCount),
    viewCount: undefined,
    favoriteCount: undefined,
    createdAt: '',
    submittedAt: '',
    updatedAt: ''
  };
}

export async function fetchProductDetail(id: string | number, options: { showError?: boolean; signal?: AbortSignal } = {}) {
  const dto = await realOrderRequest.get<Api.RealProduct.ProductDTO>('/storefront/product/detail', {
    params: { id },
    showError: options.showError,
    signal: options.signal,
    preserveDecimals: true
  });
  return toProductRecord(dto);
}

export type StorefrontSort = NonNullable<Api.RealProduct.StorefrontProductPageQuery['sortBy']>;

type LegacyStorefrontSort = 'sales' | 'price-asc' | 'price-desc' | 'newest' | 'reviews';

const legacyStorefrontSortMap: Record<LegacyStorefrontSort, StorefrontSort> = {
  sales: 'DEFAULT',
  newest: 'NEW',
  'price-asc': 'PRICE_ASC',
  'price-desc': 'PRICE_DESC',
  reviews: 'SALES'
};

export function normalizeStorefrontSort(sort?: string): StorefrontSort {
  if (sort === 'DEFAULT' || sort === 'SALES' || sort === 'NEW' || sort === 'PRICE_ASC' || sort === 'PRICE_DESC') {
    return sort;
  }
  return legacyStorefrontSortMap[sort as LegacyStorefrontSort] || 'DEFAULT';
}

export async function fetchStorefrontProducts(q: {
  current?: number;
  size?: number;
  keyword?: string;
  categoryId?: string | number;
  aftersaleType?: Api.Product.AftersaleType;
  overseasCustoms?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: StorefrontSort | LegacyStorefrontSort;
  signal?: AbortSignal;
}) {
  const page = await realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealProduct.StorefrontProductVO> & { pageNo?: number; pageSize?: number },
    Api.RealProduct.StorefrontProductPageQuery
  >('/storefront/products/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20,
    keyword: q.keyword,
    categoryId: q.categoryId,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    afterSaleType: q.aftersaleType ? fromAfterSaleType(q.aftersaleType) : undefined,
    overseasClearance: q.overseasCustoms,
    sortBy: normalizeStorefrontSort(q.sort)
  }, { signal: q.signal, preserveDecimals: true });
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 20,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealProduct.StorefrontProductVO>(page.records, '商品分页记录').map(toStorefrontProductRecord)
  };
}

async function fetchStorefrontPage(url: string, pageSize = 20, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO>, { pageNo: number; pageSize: number }>(
    url,
    { pageNo: 1, pageSize },
    { ...options, preserveDecimals: true }
  );
  return requireArray<Api.RealProduct.ProductDTO>(page.records, '商品分页记录').map(toProductRecord);
}

function toFlashSaleProduct(dto: Api.RealProduct.FlashSaleItemVO): Api.RealProduct.Record {
  const createdAt = toIsoDate(dto.sessionEndTime);
  return {
    id: dto.productId,
    code: String(dto.productId || ''),
    title: dto.title,
    sellerId: '',
    sellerName: '',
    categoryId: '',
    categoryPath: '限时秒杀',
    // Published flashPrice semantics: an unset promotion price uses the original price.
    price: requireProductPrice(dto.flashPrice ?? dto.price),
    stock: toFiniteNumber(dto.stock ?? dto.flashStock ?? 0),
    shippingFee: undefined,
    tax: undefined,
    images: dto.image ? [{ url: dto.image, name: '商品图', type: 'image', sort: 0 }] : [],
    summary: '',
    description: '',
    aftersaleType: 'unknown',
    overseasCustoms: false,
    status: 'NORMAL',
    shelfStatus: 'on-shelf',
    salesCount: toProductCount(dto.salesCount),
    viewCount: undefined,
    favoriteCount: undefined,
    createdAt,
    submittedAt: createdAt,
    publishedAt: createdAt || undefined,
    updatedAt: createdAt
  };
}

export function fetchHomeRecommendations(limit = 20, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest
    .get<Api.RealProduct.ProductDTO[]>('/storefront/recommend', { params: { limit }, ...options, preserveDecimals: true })
    .then(records => requireArray<Api.RealProduct.ProductDTO>(records, '推荐商品').map(toProductRecord));
}

export function fetchBestSellers(pageSize = 20, options: { signal?: AbortSignal } = {}) {
  return fetchStorefrontPage('/storefront/best-sellers/page', pageSize, options);
}

export function fetchNewArrivals(pageSize = 20, options: { signal?: AbortSignal } = {}) {
  return fetchStorefrontPage('/storefront/new-arrivals/page', pageSize, options);
}

export async function fetchFlashSale(limit = 20, options: { signal?: AbortSignal } = {}) {
  const records = await realOrderRequest.get<Api.RealProduct.FlashSaleItemVO[]>('/storefront/flash-sale', { params: { limit }, ...options, preserveDecimals: true });
  return requireArray<Api.RealProduct.FlashSaleItemVO>(records, '秒杀商品').map(item => ({ product: toFlashSaleProduct(item), sessionEndTime: item.sessionEndTime }));
}

export async function fetchHomeBanners(options: { signal?: AbortSignal } = {}) {
  const list = await realOrderRequest.get<Api.RealProduct.BannerDTO[]>('/banners/list', options);
  return requireArray<Api.RealProduct.BannerDTO>(list, '首页 Banner');
}

export async function trackProductBrowse(id: string | number) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/storefront/browse', { id }, { showError: false });
  return { ok: true };
}

export async function trackProductView(id: string | number) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/products/view', { id }, { showError: false });
  return { ok: true };
}

export async function toggleProductFavorite(id: string | number, options: { showError?: boolean } = {}) {
  await realOrderRequest.post<boolean, Api.RealProduct.ProductIdParams>('/products/favorite', { id }, options);
  return { ok: true };
}

export async function cancelProductFavorite(id: string | number) {
  await realOrderRequest.delete<boolean>('/products/favorite', { params: { id } });
  return { ok: true };
}

export async function fetchMyFavorites(q: { current?: number; size?: number; signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO> & { pageNo?: number; pageSize?: number },
    Api.RealProduct.FavoritePageQuery
  >('/products/favorites/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 20
  }, { signal: q.signal, preserveDecimals: true });
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 20,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealProduct.ProductDTO>(page.records, '收藏商品分页记录').map(toProductRecord)
  };
}

export async function fetchSellerProductDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  const dto = await realOrderRequest.get<Api.RealProduct.ProductDTO>('/products/detail', { params: { id }, signal: options.signal, preserveDecimals: true });
  return toProductRecord(dto);
}

export function updateProduct(params: Api.RealProduct.ProductUpdateParams) {
  if (params.specGroups?.length || params.skus?.length) throw new Error('多规格商品需要使用规格编辑表单，当前编辑入口暂不支持提交');
  return realOrderRequest.put<string, Api.RealProduct.ProductUpdateParams>('/products/update', params);
}

export function changeProductPrice(id: Api.RealProduct.Id, price: string) {
  return realOrderRequest.put<string, { id: Api.RealProduct.Id; price: string }>('/products/price', { id, price });
}

export async function fetchMyProducts(q: {
  current?: number;
  size?: number;
  keyword?: string;
  categoryId?: string | number;
  status?: Api.Product.ProductStatus;
  auditStage?: Api.RealProduct.ProductPageQuery['auditStage'];
  shelf?: Api.Product.ShelfStatus;
  signal?: AbortSignal;
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
  const page = await realOrderRequest.postQuery<
    Api.Common.PaginatingQueryRecord<Api.RealProduct.ProductDTO> & { pageNo?: number; pageSize?: number },
    Api.RealProduct.ProductPageQuery
  >('/products/my/page', {
    pageNo: q.current || 1,
    pageSize: q.size || 50,
    keyword: q.keyword,
    categoryId: q.categoryId,
    status,
    auditStage: q.auditStage ?? (q.status === 'PENDING_AUDIT' || q.status === 'IN_AUDIT' ? q.status : undefined)
  }, { signal: q.signal, preserveDecimals: true });
  return {
    current: page.current || page.pageNo || q.current || 1,
    size: page.size || page.pageSize || q.size || 50,
    total: toPageTotal(page.total),
    records: requireArray<Api.RealProduct.ProductDTO>(page.records, '我的商品分页记录').map(toProductRecord)
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
  const price = exactTransactionAmount(p.price);
  const shippingFee = exactTransactionAmount(p.shippingFee, true);
  const taxFee = exactTransactionAmount(p.tax, true);
  if (price.value === undefined || shippingFee.value === undefined || taxFee.value === undefined) {
    throw new Error(price.error || shippingFee.error || taxFee.error || '商品金额无法准确提交');
  }
  const id = await realOrderRequest.post<string, Api.RealProduct.ProductCreateParams>('/products/create', {
    title: p.title,
    categoryId: p.categoryId,
    price: price.value,
    shippingFee: shippingFee.value,
    taxFee: taxFee.value,
    stock: p.stock,
    afterSaleType: fromAfterSaleType(p.aftersaleType),
    overseasClearance: p.overseasCustoms,
    brief: p.summary,
    description: p.description,
    images: p.images
  });
  return id;
}

export async function toggleProductShelf(id: string | number, onShelf: boolean) {
  await realOrderRequest.put<string, Api.RealProduct.ProductShelfParams>('/products/shelf', { id, onShelf });
  return { ok: true };
}

export type OrderUploadScene = 'PRODUCT' | 'DEMAND' | 'REVIEW' | 'ORDER_VOUCHER';

export async function uploadFile(file: File, scene: OrderUploadScene) {
  const form = new FormData();
  form.append('file', file);
  return realOrderRequest.post<Api.RealProduct.FileUploadResult, FormData>('/files/upload', form, {
    params: { scene }
  });
}

export function deleteProduct(id: string | number) {
  return realOrderRequest.delete<string | number>('/products/delete', { params: { id } });
}
