/**
 * 评价评分 + 治理状态展示元数据。
 * 抽取自 backstage/src/views/review/enums.ts。
 */

interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const SCORE_META: Record<Api.Review.Score, Meta> = {
  1: { label: '1 星 · 差评', color: 'red', icon: 'mdi:emoticon-sad-outline' },
  2: { label: '2 星 · 差评', color: 'red', icon: 'mdi:emoticon-sad-outline' },
  3: { label: '3 星 · 中评', color: 'gold', icon: 'mdi:emoticon-neutral-outline' },
  4: { label: '4 星 · 好评', color: 'green', icon: 'mdi:emoticon-happy-outline' },
  5: { label: '5 星 · 好评', color: 'green', icon: 'mdi:emoticon-excited-outline' }
};

export const MODERATION_STATUS_META: Record<Api.Review.ModerationStatus, Meta> = {
  normal: { label: '正常', color: 'green', icon: 'mdi:check-circle-outline' },
  hidden: { label: '已隐藏', color: 'orange', icon: 'mdi:eye-off-outline' },
  appealed: { label: '申诉中', color: 'blue', icon: 'mdi:gavel' },
  rejected: { label: '驳回', color: 'red', icon: 'mdi:close-circle-outline' }
};

export const DIRECTION_META: Record<Api.Review.Direction, { label: string; color: string }> = {
  customer_to_shopper: { label: '顾客评买手', color: 'green' },
  shopper_to_customer: { label: '买手评顾客', color: 'orange' }
};

export function scoreBucket(score: Api.Review.Score): 'good' | 'mid' | 'bad' {
  if (score >= 4) return 'good';
  if (score === 3) return 'mid';
  return 'bad';
}
