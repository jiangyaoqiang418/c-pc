declare namespace Api.RealReview {
  interface Comment {
    id: string;
    reviewId: string;
    parentId?: string | null;
    authorName: string;
    content: string;
    createdAt: string;
    hidden: boolean;
  }
  interface CommentCreateParams { reviewId: string | number; parentId?: string; content: string }
  interface ReportCreateParams { reviewId: string | number; commentId?: string; reason: string }
}
