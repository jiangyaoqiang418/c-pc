/**
 * 评价 mock API：商品评价 / 我的评价 / 写评价。
 */
import { REVIEWS, aggregateUserScores, appendReview } from '../mock/data/reviews';
import { findOrderById } from '../mock/data/orders';
import { findUserById } from '../mock/data/users';
import { POINT_LOGS, appendLog } from '../mock/data/point-logs';
import { delay, delayPaginated } from '../utils/mock-delay';

void POINT_LOGS;

export interface MyReviewsQuery {
  current?: number;
  size?: number;
  fromUserId?: number;
  toUserId?: number;
  direction?: Api.Review.Direction;
}

export async function fetchMyReviews(q: MyReviewsQuery) {
  let list = [...REVIEWS];
  if (q.fromUserId != null) list = list.filter(r => r.fromUserId === q.fromUserId);
  if (q.toUserId != null) list = list.filter(r => r.toUserId === q.toUserId);
  if (q.direction) list = list.filter(r => r.direction === q.direction);
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return delayPaginated(list, q.current || 1, q.size || 20);
}

export async function fetchUserScoreSummary(userId: number) {
  return delay(aggregateUserScores(userId));
}

export interface SubmitReviewParams {
  orderId: number;
  fromUserId: number;
  score: Api.Review.Score;
  content: string;
  tags?: string[];
  photoUrls?: string[];
}

function nextReviewCode(): string {
  return `REV-2026-${String(REVIEWS.length + 1).padStart(5, '0')}`;
}

export async function submitReviewMock(p: SubmitReviewParams): Promise<{ ok: boolean; message?: string }> {
  const order = findOrderById(p.orderId);
  if (!order) return delay({ ok: false, message: '订单不存在' }, 200);
  const fromUser = findUserById(p.fromUserId);
  if (!fromUser) return delay({ ok: false, message: '用户不存在' }, 200);

  const isCustomerToShopper = p.fromUserId === order.customerId;
  const toUserId = isCustomerToShopper ? order.shopperId : order.customerId;
  const toUser = findUserById(toUserId);

  const review = appendReview({
    code: nextReviewCode(),
    orderId: order.id,
    orderCode: order.code,
    direction: isCustomerToShopper ? 'customer_to_shopper' : 'shopper_to_customer',
    fromUserId: p.fromUserId,
    fromUserName: fromUser.nickname,
    toUserId,
    toUserName: toUser?.nickname || '',
    toIsBuyer: !!toUser?.isBuyer,
    score: p.score,
    content: p.content,
    tags: p.tags,
    photoUrls: p.photoUrls,
    moderationStatus: 'normal',
    createdAt: new Date().toISOString()
  });

  if (p.score >= 4) {
    const log = appendLog({
      userId: toUserId,
      userName: toUser?.nickname || '',
      behavior: 'REVIEW_GOOD',
      change: 1,
      balanceAfter: (toUser?.points || 0) + 1,
      refType: 'review',
      refId: String(review.id),
      isAppealable: false,
      createdAt: new Date().toISOString()
    });
    review.pointTxnId = log.id;
    if (toUser) toUser.points = (toUser.points || 0) + 1;
  } else if (p.score <= 2) {
    const log = appendLog({
      userId: toUserId,
      userName: toUser?.nickname || '',
      behavior: 'REVIEW_BAD',
      change: -1,
      balanceAfter: Math.max(0, (toUser?.points || 0) - 1),
      refType: 'review',
      refId: String(review.id),
      isAppealable: true,
      createdAt: new Date().toISOString()
    });
    review.pointTxnId = log.id;
    if (toUser) toUser.points = Math.max(0, (toUser.points || 0) - 1);
  }
  return delay({ ok: true }, 600);
}
