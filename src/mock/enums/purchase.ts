/**
 * 求购大厅 5 态 + VIP 推送批次展示元数据。
 * 抽取自 backstage/src/views/purchase-request/enums.ts。
 */

interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const PURCHASE_STATUS_META: Record<Api.PurchaseRequest.RequestStatus, Meta> = {
  pending_audit: { label: '待审核', color: 'orange', icon: 'mdi:clock-outline' },
  rejected: { label: '已驳回', color: 'red', icon: 'mdi:close-circle-outline' },
  pushing: { label: '推送中', color: 'blue', icon: 'mdi:bullhorn-outline' },
  claimed: { label: '已接单', color: 'green', icon: 'mdi:hand-coin-outline' },
  cancelled: { label: '已取消', color: 'gray', icon: 'mdi:close-octagon-outline' }
};

export const PUSH_LEVEL_META: Record<Api.PurchaseRequest.PushBatchLevel, Meta> = {
  VIP2: { label: 'VIP2 批次', color: 'purple', icon: 'mdi:crown' },
  VIP1: { label: 'VIP1 批次', color: 'magenta', icon: 'mdi:medal' },
  VIP0: { label: 'VIP0 批次', color: 'blue', icon: 'mdi:account' }
};
