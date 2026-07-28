/**
 * 评价管理类型（R-DATA-35 / R-MOD-27）。
 *
 * 评价数据 = REVIEWS 自有池；积分发放仍以 point 模块为单一真实源。
 */
declare namespace Api.Review {
  type Direction = 'customer_to_shopper' | 'shopper_to_customer';
  type Score = 1 | 2 | 3 | 4 | 5;

  /** 治理状态硬枚举（R-DATA-35） */
  type ModerationStatus = 'normal' | 'hidden' | 'appealed' | 'rejected';

  type AppealStatus = 'pending' | 'approved' | 'rejected';

  interface ReviewRecord {
    id: number;
    code: string; // 'REV-2026-XXXXX'
    orderId: number;
    orderCode: string;
    direction: Direction;
    fromUserId: number;
    fromUserName: string;
    toUserId: number;
    toUserName: string;
    toIsBuyer: boolean;
    score: Score;
    content: string;
    tags?: string[];
    photoUrls?: string[];
    moderationStatus: ModerationStatus;
    moderationNote?: string;
    moderatedBy?: string;
    moderatedAt?: string;
    appealNote?: string;
    appealStatus?: AppealStatus;
    pointTxnId?: number;
    createdAt: string;
  }

  interface Stats {
    totalReviews: number;
    goodCount: number;
    midCount: number;
    badCount: number;
    goodRate: string;
    pendingModeration: number;
    pendingAppeals: number;
    avgScore: string;
  }

  interface UserScoreSummary {
    userId: number;
    userName: string;
    isBuyer: boolean;
    receivedTotal: number;
    receivedGood: number;
    receivedBad: number;
    goodRate: string;
    avgScore: string;
  }

  interface ListQuery {
    current?: number;
    size?: number;
    scores?: Score[];
    moderationStatuses?: ModerationStatus[];
    direction?: Direction;
    fromUserId?: number;
    toUserId?: number;
    orderId?: number;
    keyword?: string;
    fromAt?: string;
    toAt?: string;
  }

  interface ModerateParams {
    reviewId: number;
    action: 'hide' | 'restore';
    note: string; // ≥ 5 字
  }

  interface ResolveAppealParams {
    reviewId: number;
    decision: 'approve' | 'reject';
    note: string;
  }

  interface SubmitAppealParams {
    reviewId: number;
    note: string; // 评价方申诉理由（mock 用）
  }
}
