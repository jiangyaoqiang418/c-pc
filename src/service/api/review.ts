import { realOrderRequest } from '@/service/request';
import { toPageTotal } from './page';

function normalizePage<T>(page: Api.RealReview.PageResult<T>) {
  return { ...page, total: toPageTotal(page.total) };
}

export async function fetchReviewableOrders(params: Api.RealReview.PageQuery = {}) {
  const page = await realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewableOrderVO>, Api.RealReview.PageQuery>('/reviews/reviewable/page', params);
  return normalizePage(page);
}

export function submitReview(params: Api.RealReview.ReviewSubmitParams) {
  return realOrderRequest.post<string | number, Api.RealReview.ReviewSubmitParams>('/reviews/create', params);
}

export async function fetchMyReviews(params: Api.RealReview.ReviewPageQuery = {}) {
  const page = await realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/mine/page', params);
  return normalizePage(page);
}

export async function fetchReceivedReviews(params: Api.RealReview.ReviewPageQuery = {}) {
  const page = await realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/received/page', params);
  return normalizePage(page);
}

export function fetchReviewDetail(id: string | number) {
  return realOrderRequest.get<Api.RealReview.ReviewDTO>('/reviews/detail', { params: { id } });
}

export function deleteReview(id: string | number) {
  return realOrderRequest.delete<string | number>('/reviews/delete', { params: { id } });
}

export function replyReview(params: Api.RealReview.ReviewReplyParams) {
  return realOrderRequest.put<string | number, Api.RealReview.ReviewReplyParams>('/reviews/reply', params);
}

export function createReviewAppeal(params: Api.RealReview.ReviewAppealParams) {
  return realOrderRequest.post<string | number, Api.RealReview.ReviewAppealParams>('/reviews/appeals/create', params);
}

export async function fetchMyReviewAppeals(params: Api.RealReview.PageQuery = {}) {
  const page = await realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewAppealDTO>, Api.RealReview.PageQuery>(
    '/reviews/appeals/mine/page',
    params
  );
  return normalizePage(page);
}

export async function fetchStorefrontReviews(params: Api.RealReview.ProductReviewPageQuery) {
  const page = await realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ProductReviewPageQuery>('/storefront/reviews/page', params);
  return normalizePage(page);
}

export function fetchReviewSummary(productId: string | number) {
  return realOrderRequest.get<Api.RealReview.ReviewSummaryDTO>('/storefront/reviews/summary', { params: { productId } });
}

export function fetchSellerRating(sellerId: string | number) {
  return realOrderRequest.get<Api.RealReview.SellerRatingDTO>('/storefront/reviews/seller-rating', { params: { sellerId } });
}
