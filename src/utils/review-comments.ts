/** 文档为字符串，Swagger 为 int64；仅无损规范化显示计数。 */
export function reviewCommentCount(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error('评论数量格式异常，请重新读取');
}
export function hasMoreReviewComments(count: string | undefined, previews: number) {
  return count !== undefined && BigInt(count) > BigInt(previews);
}
export function normalizeReviewComments<T extends { reviewId: string | number; status: string; commentCount?: unknown; commentPreviews?: unknown }>(review: T) {
  if (review.status !== 'PUBLISHED') return { ...review, commentCount: '0', commentPreviews: [] as Api.RealReview.Comment[] };
  const count = reviewCommentCount(review.commentCount);
  const previews = review.commentPreviews ?? [];
  if (!Array.isArray(previews) || previews.length > 3) throw new Error('评论预览格式异常，请重新读取');
  const seen = new Set<string>();
  const rows = previews.map((item: Api.RealReview.Comment) => {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)
      || String(item.reviewId) !== String(review.reviewId) || item.hidden !== false
      || typeof item.authorName !== 'string' || typeof item.content !== 'string'
      || typeof item.createdAt !== 'string' || (item.parentId != null && typeof item.parentId !== 'string')) {
      throw new Error('评论预览格式异常，请重新读取');
    }
    seen.add(item.id);
    return { ...item, canDelete: item.canDelete === true };
  });
  return { ...review, commentCount: count, commentPreviews: rows };
}
