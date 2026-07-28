/**
 * KYC 状态展示元数据。
 * 抽取自 backstage/src/views/kyc/enums.ts。
 */

interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const KYC_STATUS_META: Record<Api.User.KycStatus, Meta> = {
  none: { label: '未提交', color: 'gray', icon: 'mdi:account-question-outline' },
  pending: { label: '审核中', color: 'orange', icon: 'mdi:clock-outline' },
  approved: { label: '已通过', color: 'green', icon: 'mdi:check-decagram' },
  rejected: { label: '已驳回', color: 'red', icon: 'mdi:close-circle-outline' },
  expired: { label: '已过期', color: 'gray', icon: 'mdi:calendar-remove' }
};

export const KYC_STEPS = [
  { key: 'id-card-front', label: '身份证正面', icon: 'mdi:card-account-details-outline' },
  { key: 'id-card-back', label: '身份证反面', icon: 'mdi:card-account-details-outline' },
  { key: 'face', label: '人脸认证', icon: 'mdi:face-recognition' },
  { key: 'phone', label: '手机号验证', icon: 'mdi:cellphone-check' }
] as const;
