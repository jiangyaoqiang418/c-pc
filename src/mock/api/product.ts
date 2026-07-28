/**
 * 商品 mock API：列表 / 详情 / 推荐 / 评价 / 浏览记录。
 */
import {
  PRODUCTS,
  findProductById,
  findProductsByCategory,
  findProductsBySeller,
  topCategories,
  topSellers
} from '../mock/data/products';
import { CATEGORIES, descendantIds } from '../mock/data/categories';
import { ORDERS } from '../mock/data/orders';
import { REVIEWS } from '../mock/data/reviews';
import { delay, delayPaginated } from '../utils/mock-delay';

export interface ProductListQuery {
  current?: number;
  size?: number;
  keyword?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  aftersaleType?: Api.Product.AftersaleType;
  overseasCustoms?: boolean;
  sellerId?: number;
  sort?: 'sales' | 'price-asc' | 'price-desc' | 'newest' | 'reviews';
}

function listOnShelf(): Api.Product.ProductRecord[] {
  return PRODUCTS.filter(p => p.status === 'NORMAL' && p.shelfStatus === 'on-shelf');
}

export async function fetchProductList(q: ProductListQuery = {}) {
  let list = listOnShelf();

  if (q.categoryId) {
    const descIds = descendantIds(q.categoryId);
    list = list.filter(p => descIds.includes(p.categoryId));
  }
  if (q.keyword) {
    const kw = q.keyword.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(kw) || p.summary?.toLowerCase().includes(kw));
  }
  if (q.minPrice != null) list = list.filter(p => Number(p.price) >= q.minPrice!);
  if (q.maxPrice != null) list = list.filter(p => Number(p.price) <= q.maxPrice!);
  if (q.aftersaleType) list = list.filter(p => p.aftersaleType === q.aftersaleType);
  if (q.overseasCustoms != null) list = list.filter(p => p.overseasCustoms === q.overseasCustoms);
  if (q.sellerId) list = list.filter(p => p.sellerId === q.sellerId);

  const sort = q.sort || 'sales';
  const sorted = [...list].sort((a, b) => {
    if (sort === 'price-asc') return Number(a.price) - Number(b.price);
    if (sort === 'price-desc') return Number(b.price) - Number(a.price);
    if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === 'reviews') return (b.favoriteCount || 0) - (a.favoriteCount || 0);
    return (b.salesCount || 0) - (a.salesCount || 0);
  });

  return delayPaginated(sorted, q.current || 1, q.size || 20);
}

export async function fetchProductDetail(id: number) {
  return delay(findProductById(id));
}

export async function fetchHomeRecommends() {
  const list = listOnShelf();
  return delay(
    {
      hot: [...list].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 8),
      newest: [...list]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
      flash: [...list].sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 4),
      topCategories: topCategories(8),
      topSellers: topSellers(6)
    },
    200
  );
}

export async function fetchProductReviews(productId: number, current = 1, size = 10) {
  const productOrderIds = new Set(ORDERS.filter(o => o.productId === productId).map(o => o.id));
  const list = REVIEWS.filter(
    r =>
      r.direction === 'customer_to_shopper' &&
      r.moderationStatus === 'normal' &&
      productOrderIds.has(r.orderId)
  );
  return delayPaginated(list, current, size);
}

export async function fetchShopProducts(sellerId: number) {
  return delay(findProductsBySeller(sellerId).filter(p => p.status === 'NORMAL' && p.shelfStatus === 'on-shelf'));
}

export async function fetchProductsByCategory(categoryId: number) {
  return delay(findProductsByCategory(categoryId, id => descendantIds(id)));
}

export async function fetchCategoryTree() {
  return delay(CATEGORIES);
}
