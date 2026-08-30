import { realOrderRequest } from '@/service/request';
import { RequestError } from '@/service/request/type';
import { requireArray, toPageTotal } from './page';

function normalizePage<T>(page: Api.RealReview.PageResult<T>) {
  return { ...page, records: requireArray<T>(page.records, '评价分页记录'), total: toPageTotal(page.total) };
}

export async function fetchReviewableOrders(params: Api.RealReview.PageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewableOrderVO>, Api.RealReview.PageQuery>('/reviews/reviewable/page', params, options);
  return normalizePage(page);
}

/** 仅核对当前页面的目标订单；按服务端实际页大小读取，找到全部目标后立即停止。 */
export async function findReviewableOrderIds(orderIds: Array<string | number>, options: { signal?: AbortSignal } = {}) {
  const targets = new Set(orderIds.map(String));
  const found = new Set<string>();
  if (!targets.size) return found;
  const seen = new Set<string>();
  let pageCount = 1;
  let expectedTotal = 0;
  let pageSize = 50;
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    options.signal?.throwIfAborted();
    const page = await fetchReviewableOrders({ pageNo, pageSize }, options);
    options.signal?.throwIfAborted();
    if (pageNo === 1) {
      expectedTotal = page.total;
      if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0) throw new Error('评价资格总数无效');
      pageSize = Number(page.size ?? page.pageSize ?? (page.records.length || 50));
      if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('评价资格分页大小无效');
      pageCount = Math.max(1, Math.ceil(expectedTotal / pageSize));
    } else if (page.total !== expectedTotal) {
      throw new Error('评价资格列表已变化，请重新核对');
    }
    for (const record of page.records) {
      const id = String(record.orderId);
      seen.add(id);
      if (targets.has(id)) found.add(id);
    }
    if (found.size === targets.size) return found;
    if (pageNo < pageCount && page.records.length !== pageSize) throw new Error('评价资格分页不完整，请重试');
  }
  if (seen.size !== expectedTotal) throw new Error('评价资格分页不完整，请重试');
  return found;
}

export async function submitReview(params: Api.RealReview.ReviewSubmitParams) {
  const id = await realOrderRequest.post<string | number, Api.RealReview.ReviewSubmitParams>('/reviews/create', params);
  if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) {
    throw new RequestError('未取得可核对的评价编号，请按原订单核实', { code: 'UNKNOWN_OPERATION_RESULT' });
  }
  return id;
}

export async function fetchMyReviews(params: Api.RealReview.ReviewPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/mine/page', params, options);
  return normalizePage(page);
}

export async function fetchReceivedReviews(params: Api.RealReview.ReviewPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/received/page', params, options);
  return normalizePage(page);
}

export function fetchReviewDetail(id: string | number, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealReview.ReviewDTO>('/reviews/detail', { params: { id }, signal: options.signal });
}

export function deleteReview(id: string | number) {
  return realOrderRequest.delete<string | number>('/reviews/delete', { params: { id } });
}

export function replyReview(params: Api.RealReview.ReviewReplyParams, options: { showError?: boolean } = {}) {
  return realOrderRequest.put<string | number, Api.RealReview.ReviewReplyParams>('/reviews/reply', params, options);
}

export function createReviewAppeal(params: Api.RealReview.ReviewAppealParams, options: { showError?: boolean } = {}) {
  return realOrderRequest.post<string | number, Api.RealReview.ReviewAppealParams>('/reviews/appeals/create', params, options);
}

export async function fetchMyReviewAppeals(params: Api.RealReview.PageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewAppealDTO>, Api.RealReview.PageQuery>(
    '/reviews/appeals/mine/page',
    params,
    options
  );
  return normalizePage(page);
}

export async function fetchStorefrontReviews(params: Api.RealReview.ProductReviewPageQuery, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ProductReviewPageQuery>('/storefront/reviews/page', params, options);
  return normalizePage(page);
}

export function fetchReviewSummary(productId: string | number, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealReview.ReviewSummaryDTO>('/storefront/reviews/summary', { params: { productId }, signal: options.signal });
}

export function fetchSellerRating(sellerId: string | number, options: { signal?: AbortSignal } = {}) {
  return realOrderRequest.get<Api.RealReview.SellerRatingDTO>('/storefront/reviews/seller-rating', { params: { sellerId }, signal: options.signal });
}
