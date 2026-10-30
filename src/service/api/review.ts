import { realOrderRequest } from '@/service/request';
import { RequestError } from '@/service/request/type';
import { requireArray } from './page';

function normalizePage<T>(page: Api.RealReview.PageResult<T>) {
  const total = Number(page.total);
  if (!['string', 'number'].includes(typeof page.total) || String(page.total).trim() === ''
    || !Number.isSafeInteger(total) || total < 0) throw new Error('评价分页总数异常，请重新核对');
  return { ...page, records: requireArray<T>(page.records, '评价分页记录'), total };
}

/** 文本过滤返回明确业务拒绝；网络/5xx及无响应体仍按未知结果处理。 */
export function isReviewWriteRejected(error: unknown) {
  return error instanceof RequestError && !!error.response && /^-?\d+$/.test(String(error.response.code)) && String(error.response.code) !== '1'
    && (error.status === undefined || error.status < 500);
}

export async function fetchReviewComments(reviewId: string | number, pageNo: number, signal?: AbortSignal) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.Comment>>(
    '/storefront/reviews/comments/page', { reviewId, pageNo, pageSize: 20 }, { signal, showError: false });
  const result = normalizePage(page);
  if (result.records.some(row => !row || typeof row.id !== 'string' || !row.id
    || String(row.reviewId) !== String(reviewId) || row.hidden !== false || typeof row.content !== 'string'
    || typeof row.authorName !== 'string' || typeof row.createdAt !== 'string'
    || (row.parentId != null && typeof row.parentId !== 'string'))) throw new Error('公开评论数据异常，请重新读取');
  return result;
}

export function createReviewComment(params: Api.RealReview.CommentCreateParams) {
  return realOrderRequest.post<string>('/reviews/comments/create', params, { showError: false });
}

export function createReviewReport(params: Api.RealReview.ReportCreateParams) {
  return realOrderRequest.post<string>('/reviews/reports/create', params, { showError: false });
}

export async function fetchReviewableOrders(params: Api.RealReview.PageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewableOrderVO>, Api.RealReview.PageQuery>('/reviews/reviewable/page', params, options);
  return normalizePage(page);
}

/** 按 ID 映射权威资格；漏项/损坏不是“不可评价”。 */
export async function fetchReviewEligibility(orderIds: Array<string | number>, options: { signal?: AbortSignal } = {}) {
  const ids = [...new Map(orderIds.map(id => [String(id), id])).values()];
  const result = new Map<string, Api.RealOrder.ReviewEligibility>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    options.signal?.throwIfAborted();
    const batch = ids.slice(offset, offset + 200);
    const records = requireArray<Api.RealOrder.ReviewEligibility>(await realOrderRequest.postQuery<Api.RealOrder.ReviewEligibility[]>(
      '/reviews/eligibility', { orderIds: batch }, { ...options, showError: false }), '订单评价资格');
    for (const record of records) {
      const id = String(record.orderId);
      if (!batch.some(target => String(target) === id) || result.has(id) || typeof record.reviewable !== 'boolean') throw new Error('评价资格响应不完整，请重新核对');
      result.set(id, record);
    }
    if (batch.some(id => !result.has(String(id)))) throw new Error('评价资格响应漏项，请重新核对');
  }
  return result;
}

export async function findReviewableOrderIds(orderIds: Array<string | number>, options: { signal?: AbortSignal } = {}) {
  const result = await fetchReviewEligibility(orderIds, options);
  return new Set([...result].filter(([, value]) => value.reviewable).map(([id]) => id));
}

export async function submitReview(params: Api.RealReview.ReviewSubmitParams) {
  const id = await realOrderRequest.post<string | number, Api.RealReview.ReviewSubmitParams>('/reviews/create', params);
  if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) {
    throw new RequestError('未取得可核对的评价编号，请按原订单核实', { code: 'UNKNOWN_OPERATION_RESULT' });
  }
  return id;
}

export async function fetchMyReviews(params: Api.RealReview.ReviewPageQuery = {}, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/mine/page', params, options);
  return normalizePage(page);
}

export async function fetchReceivedReviews(params: Api.RealReview.ReviewPageQuery = {}, options: { signal?: AbortSignal } = {}) {
  const page = await realOrderRequest.postQuery<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/received/page', params, options);
  return normalizePage(page);
}

export function fetchReviewDetail(id: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realOrderRequest.get<Api.RealReview.ReviewDTO>('/reviews/detail', { ...options, params: { id } });
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

export function validateHelpfulState(record: Api.RealReview.ReviewHelpfulVO, reviewId: string | number) {
  const count = record?.helpfulCount;
  if (!record || String(record.reviewId) !== String(reviewId) || typeof record.helpful !== 'boolean'
    || !((typeof count === 'string' && /^\d+$/.test(count)) || (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0))) {
    throw new Error('评价帮助状态响应异常，请重新读取');
  }
  return record;
}

export async function setReviewHelpful(reviewId: string | number, helpful: boolean) {
  const result = await realOrderRequest.put<Api.RealReview.ReviewHelpfulVO>('/reviews/helpful', { reviewId, helpful }, { showError: false });
  const state = validateHelpfulState(result, reviewId);
  if (state.helpful !== helpful) throw new Error('评价帮助状态未更新，请重新核对');
  return state;
}
