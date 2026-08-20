import { realOrderRequest } from '@/service/request';

export function fetchReviewableOrders(params: Api.RealReview.PageQuery = {}) {
  return realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewableOrderVO>, Api.RealReview.PageQuery>('/reviews/reviewable/page', params);
}

export function submitReview(params: Api.RealReview.ReviewSubmitParams) {
  return realOrderRequest.post<string | number, Api.RealReview.ReviewSubmitParams>('/reviews/create', params);
}

export function fetchMyReviews(params: Api.RealReview.ReviewPageQuery = {}) {
  return realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/mine/page', params);
}

export function fetchReceivedReviews(params: Api.RealReview.ReviewPageQuery = {}) {
  return realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewPageQuery>('/reviews/received/page', params);
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

export function fetchMyReviewAppeals(params: Api.RealReview.PageQuery = {}) {
  return realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewAppealDTO>, Api.RealReview.PageQuery>(
    '/reviews/appeals/mine/page',
    params
  );
}

export function fetchStorefrontReviews(params: Api.RealReview.ProductReviewPageQuery) {
  return realOrderRequest.post<Api.RealReview.PageResult<Api.RealReview.ReviewDTO>, Api.RealReview.ProductReviewPageQuery>('/storefront/reviews/page', params);
}

export function fetchReviewSummary(productId: string | number) {
  return realOrderRequest.get<Api.RealReview.ReviewSummaryDTO>('/storefront/reviews/summary', { params: { productId } });
}

export function fetchSellerRating(sellerId: string | number) {
  return realOrderRequest.get<Api.RealReview.SellerRatingDTO>('/storefront/reviews/seller-rating', { params: { sellerId } });
}
