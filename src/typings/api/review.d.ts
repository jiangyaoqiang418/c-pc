declare namespace Api.RealReview {
  type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';
  type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

  interface ReviewDTO {
    reviewId: string | number;
    orderId: string | number;
    orderNo?: string;
    productId?: string | number;
    productTitle?: string;
    productImage?: string;
    sellerId?: string | number;
    sellerName?: string;
    userId?: string | number;
    userName?: string;
    anonymous?: boolean;
    productScore: number;
    sellerScore: number;
    content?: string;
    images?: string[];
    hasImage?: boolean;
    status: ReviewStatus;
    statusText?: string;
    rejectReason?: string;
    reviewerId?: string | number;
    reviewedAt?: string | number;
    replyContent?: string;
    repliedAt?: string | number;
    appealId?: string | number;
    appealStatus?: AppealStatus;
    createdAt?: string | number;
  }

  interface ReviewableOrderVO {
    orderId: string | number;
    orderNo?: string;
    productId?: string | number;
    productTitle?: string;
    productImage?: string;
    sellerId?: string | number;
    sellerName?: string;
    quantity?: number;
    totalAmount?: string | number;
    completedAt?: string | number;
    reviewDeadline?: string | number;
  }

  interface ReviewSummaryDTO {
    productId: string | number;
    totalCount: number;
    averageScore: string | number;
    star1Count: number;
    star2Count: number;
    star3Count: number;
    star4Count: number;
    star5Count: number;
    goodRate: string | number;
    withImageCount: number;
  }

  interface SellerRatingDTO { sellerId: string | number; totalCount: number; averageScore: string | number; }
  interface PageQuery { pageNo?: number; pageSize?: number; }
  interface ReviewPageQuery extends PageQuery { status?: ReviewStatus; hasImage?: boolean; }
  interface ProductReviewPageQuery extends ReviewPageQuery { productId: string | number; productScore?: number; }
  interface ReviewSubmitParams { orderId: string | number; productScore: number; sellerScore: number; content?: string; images?: string[]; anonymous?: boolean; }
  interface ReviewReplyParams { reviewId: string | number; content: string; }
  interface ReviewAppealParams { reviewId: string | number; reason: string; evidenceImages?: string[]; }
  interface ReviewAppealDTO {
    appealId: string | number;
    reviewId: string | number;
    productId?: string | number;
    productTitle?: string;
    sellerId?: string | number;
    sellerName?: string;
    reason: string;
    evidenceImages?: string[];
    status: AppealStatus;
    statusText?: string;
    handleRemark?: string;
    handlerId?: string | number;
    appliedAt?: string | number;
    handledAt?: string | number;
    reviewProductScore?: number;
    reviewContent?: string;
    reviewStatus?: ReviewStatus;
    createdAt?: string | number;
  }
  interface PageResult<T> { records: T[]; total: number; current?: number; size?: number; pageNo?: number; pageSize?: number; }
}
