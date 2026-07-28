/**
 * 买手专属 mock API：商品 / 可接求购 / 押金 / 接单 / 上传截图。
 */
import { appendProduct, findProductsBySeller } from '../mock/data/products';
import { ORDERS, transitionOrder } from '../mock/data/orders';
import { PURCHASE_REQUESTS, findRequestById } from '../mock/data/purchase-requests';
import { asBuyerWallet } from '../mock/data/wallet-accounts';
import { findBuyerProfile } from '../mock/data/buyer-portfolio';
import { findUserById } from '../mock/data/users';
import { categoryPath } from '../mock/data/categories';
import { delay, delayPaginated } from '../utils/mock-delay';

export async function fetchMyProducts(sellerId: number, status?: Api.Product.ProductStatus) {
  let list = findProductsBySeller(sellerId);
  if (status) list = list.filter(p => p.status === status);
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, 1, 50);
}

export interface CreateProductParams {
  sellerId: number;
  title: string;
  summary: string;
  description: string;
  categoryId: number;
  price: string;
  shippingFee: string;
  tax: string;
  stock: number;
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  images: string[];
}

export async function createProductMock(p: CreateProductParams): Promise<Api.Product.ProductRecord> {
  const seller = findUserById(p.sellerId);
  const product = appendProduct({
    sellerId: p.sellerId,
    sellerName: seller?.nickname || '买手',
    title: p.title,
    summary: p.summary,
    description: p.description,
    categoryId: p.categoryId,
    categoryPath: categoryPath(p.categoryId) || '其他',
    price: p.price,
    shippingFee: p.shippingFee,
    tax: p.tax,
    stock: p.stock,
    aftersaleType: p.aftersaleType,
    overseasCustoms: p.overseasCustoms,
    images: p.images.map((url, sort) => ({ url, name: `图${sort + 1}`, type: 'image', sort })),
    status: 'PENDING_AUDIT',
    shelfStatus: 'off-shelf',
    salesCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    createdAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return delay(product, 700);
}

export async function fetchClaimableRequests(buyerId: number) {
  const list = PURCHASE_REQUESTS.filter(r => r.status === 'pushing' && r.pushedToBuyerIds.includes(buyerId));
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, 1, 30);
}

export async function fetchBuyerDepositSummary(buyerId: number) {
  const wallet = asBuyerWallet(buyerId);
  const profile = findBuyerProfile(buyerId);
  return delay({ wallet, profile });
}

export async function fetchBuyerOrders(buyerId: number, statuses?: Api.Order.OrderStatus[]) {
  let list = ORDERS.filter(o => o.shopperId === buyerId);
  if (statuses?.length) list = list.filter(o => statuses!.includes(o.status));
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, 1, 30);
}

export async function uploadPurchaseProofMock(orderId: number, imageUrl: string): Promise<{ ok: boolean }> {
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return delay({ ok: false }, 200);
  order.purchaseScreenshotUrl = imageUrl;
  order.procuredAt = new Date().toISOString();
  transitionOrder(orderId, 'PROCURED', 'shopper');
  return delay({ ok: true }, 500);
}

export async function uploadShippingMock(
  orderId: number,
  trackingNumber: string,
  carrier: Api.Order.ShippingCarrier
): Promise<{ ok: boolean }> {
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return delay({ ok: false }, 200);
  order.trackingNumber = trackingNumber;
  order.shippingCarrier = carrier;
  order.shippedAt = new Date().toISOString();
  transitionOrder(orderId, 'IN_TRANSIT', 'shopper');
  return delay({ ok: true }, 500);
}

export async function claimRequestAsBuyerMock(requestId: number, buyerId: number): Promise<{ ok: boolean; message?: string }> {
  const req = findRequestById(requestId);
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
