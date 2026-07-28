/**
 * 评价池（R-DATA-35 / R-MOD-27）。
 *
 * 从已 COMPLETED / ARCHIVED 的 ORDERS 派生 30+ 评价：
 *   - 50% customer→shopper / 50% shopper→customer
 *   - 好评 (4-5) 60% / 中评 (3) 20% / 差评 (1-2) 20%
 *   - 5 条 hidden / 3 条 appealed
 *
 * Seed 阶段联动：每条 4-5 星 → appendLog('REVIEW_GOOD', +1, capDaily 50)；
 *               每条 1-2 星 → appendLog('REVIEW_BAD', -1)；回写 pointTxnId。
 */
import { ORDERS } from './orders';
import { findUserById } from './users';
import { appendLog } from './point-logs';

type ReviewRecord = Api.Review.ReviewRecord;

let idCursor = 0;
function nextId(): number {
  idCursor += 1;
  return idCursor;
}

function makeCode(seq: number): string {
  return `REV-2026-${String(60000 + seq).padStart(5, '0')}`;
}

function nowMinus(daysAgo: number, hours = 0): string {
  const t = new Date('2026-06-03T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(t.getHours() - hours);
  return t.toISOString();
}

const GOOD_CONTENT = [
  '商品和描述一致，发货很快，包装严密。',
  '正品，买手沟通顺畅，会再次合作！',
  '日本代购原汁原味，附带原始小票，五星好评。',
  '物流时效不错，整体满意。',
  '颜色款式都对，朋友也很喜欢，下次还会找。',
  '认真负责，及时回复，体验非常好。'
];
const MID_CONTENT = [
  '商品本身可以，但物流有点慢。',
  '基本符合预期，希望下次包装能更好。',
  '正品但发货时间略长，沟通后没问题。'
];
const BAD_CONTENT = [
  '收到的商品和图片有色差，沟通后买手态度不好。',
  '物流延误超过 10 天，且未及时通知。',
  '商品有瑕疵，要求换货被拒，已申请售后。',
  '描述与实际不符，体验很差。'
];

const GOOD_TAGS = ['发货快', '商品好', '沟通顺畅', '认真负责', '正品'];
const BAD_TAGS = ['态度差', '描述不符', '物流慢', '瑕疵'];

interface ReviewSeed {
  orderIndex: number; // 关联 ORDERS[i]
  direction: Api.Review.Direction;
  score: Api.Review.Score;
  moderationStatus?: Api.Review.ModerationStatus;
  appealStatus?: Api.Review.AppealStatus;
  daysAgo: number;
}

const SEEDS: ReviewSeed[] = [];

function pickScore(idx: number): Api.Review.Score {
  // 60% good (4-5), 20% mid (3), 20% bad (1-2)
  const r = idx % 10;
  if (r <= 5) return (4 + (idx % 2)) as Api.Review.Score; // 4 / 5
  if (r <= 7) return 3;
  return (1 + (idx % 2)) as Api.Review.Score; // 1 / 2
}

function generateSeeds(): void {
  SEEDS.length = 0;
  // 从已完成订单生成评价（限 COMPLETED / ARCHIVED）
  const completedOrders = ORDERS.filter(
    o => o.status === 'COMPLETED' || o.status === 'ARCHIVED' || o.status === 'WARRANTY'
  );
  let totalSeeded = 0;
  completedOrders.forEach((o, idx) => {
    if (totalSeeded >= 32) return;
    // 每订单两条评价（双方互评）
    SEEDS.push({
      orderIndex: ORDERS.indexOf(o),
      direction: 'customer_to_shopper',
      score: pickScore(idx),
      daysAgo: idx + 2
    });
    SEEDS.push({
      orderIndex: ORDERS.indexOf(o),
      direction: 'shopper_to_customer',
      score: pickScore(idx + 1),
      daysAgo: idx + 2
    });
    totalSeeded += 2;
  });

  // 标记 5 条 hidden / 3 条 appealed
  const violationsIdx = [0, 1, 6, 9, 14, 16, 21, 25];
  violationsIdx.forEach((i, k) => {
    if (SEEDS[i]) {
      if (k < 5) SEEDS[i].moderationStatus = 'hidden';
      else {
        SEEDS[i].moderationStatus = 'appealed';
        SEEDS[i].appealStatus = 'pending';
      }
    }
  });
}

export const REVIEWS: ReviewRecord[] = [];

function buildReview(seed: ReviewSeed, seq: number): ReviewRecord | undefined {
  const order = ORDERS[seed.orderIndex];
  if (!order) return undefined;
  const isCustomerToShopper = seed.direction === 'customer_to_shopper';
  const fromUserId = isCustomerToShopper ? order.customerId : order.shopperId;
  const toUserId = isCustomerToShopper ? order.shopperId : order.customerId;
  const fromUser = findUserById(fromUserId);
  const toUser = findUserById(toUserId);
  if (!fromUser || !toUser) return undefined;

  const isGood = seed.score >= 4;
  const isMid = seed.score === 3;
  const contentArr = ((): string[] => {
    if (isGood) return GOOD_CONTENT;
    if (isMid) return MID_CONTENT;
    return BAD_CONTENT;
  })();
  const tagsArr = isGood ? GOOD_TAGS : BAD_TAGS;
  const content = contentArr[seq % contentArr.length];
  const tags = isMid ? undefined : [tagsArr[seq % tagsArr.length], tagsArr[(seq + 1) % tagsArr.length]];

  const review: ReviewRecord = {
    id: nextId(),
    code: makeCode(seq),
    orderId: order.id,
    orderCode: order.code,
    direction: seed.direction,
    fromUserId,
    fromUserName: fromUser.nickname,
    toUserId,
    toUserName: toUser.nickname,
    toIsBuyer: toUser.isBuyer,
    score: seed.score,
    content,
    tags,
    moderationStatus: seed.moderationStatus || 'normal',
    moderationNote: seed.moderationStatus === 'hidden' ? '内容涉嫌人身攻击，已隐藏' : undefined,
    moderatedBy: seed.moderationStatus ? 'cs' : undefined,
    moderatedAt: seed.moderationStatus ? nowMinus(seed.daysAgo - 1, 4) : undefined,
    appealNote: seed.appealStatus ? '评价方申诉：客观描述真实体验，请恢复' : undefined,
    appealStatus: seed.appealStatus,
    createdAt: nowMinus(seed.daysAgo, 10)
  };

  // R-MOD-27 联动：积分发放
  if (isGood || seed.score <= 2) {
    const behavior: Api.Point.BehaviorCode = isGood ? 'REVIEW_GOOD' : 'REVIEW_BAD';
    const change = isGood ? 1 : -1;
    const log = appendLog({
      userId: toUser.id,
      userName: toUser.nickname,
      behavior,
      change,
      balanceAfter: toUser.points + change,
      refType: 'review',
      refId: review.code,
      isAppealable: change < 0,
      createdAt: review.createdAt
    });
    review.pointTxnId = log.id;
  }
  return review;
}

function runSeed(): void {
  REVIEWS.length = 0;
  idCursor = 0;
  generateSeeds();
  SEEDS.forEach((s, idx) => {
    const r = buildReview(s, idx + 1);
    if (r) REVIEWS.push(r);
  });
}
runSeed();

export function findReviewById(id: number): ReviewRecord | undefined {
  return REVIEWS.find(r => r.id === id);
}

export function appendReview(o: Omit<ReviewRecord, 'id'>): ReviewRecord {
  const next: ReviewRecord = { id: nextId(), ...o };
  REVIEWS.unshift(next);
  return next;
}

/** 用户得分聚合（用于买手/顾客统计） */
export function aggregateUserScores(userId: number): Api.Review.UserScoreSummary | undefined {
  const u = findUserById(userId);
  if (!u) return undefined;
  const received = REVIEWS.filter(r => r.toUserId === userId && r.moderationStatus === 'normal');
  if (!received.length) {
    return {
      userId,
      userName: u.nickname,
      isBuyer: u.isBuyer,
      receivedTotal: 0,
      receivedGood: 0,
      receivedBad: 0,
      goodRate: '0.0',
      avgScore: '0.0'
    };
  }
  const good = received.filter(r => r.score >= 4).length;
  const bad = received.filter(r => r.score <= 2).length;
  const avg = received.reduce((s, r) => s + r.score, 0) / received.length;
  return {
    userId,
    userName: u.nickname,
    isBuyer: u.isBuyer,
    receivedTotal: received.length,
    receivedGood: good,
    receivedBad: bad,
    goodRate: ((good / received.length) * 100).toFixed(1),
    avgScore: avg.toFixed(2)
  };
}
