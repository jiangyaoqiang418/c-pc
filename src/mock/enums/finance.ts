/**
 * 理财产品 + 锁仓订单状态展示元数据。
 * 抽取自 backstage/src/views/finance-product/enums.ts。
 */

interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const FINANCE_PRODUCT_STATUS_META: Record<Api.FinanceProduct.ProductStatus, Meta> = {
  draft: { label: '草稿', color: 'gray', icon: 'mdi:file-document-edit-outline' },
  active: { label: '在售', color: 'green', icon: 'mdi:check-decagram' },
  paused: { label: '暂停新订阅', color: 'orange', icon: 'mdi:pause-circle-outline' },
  archived: { label: '已归档', color: 'gray', icon: 'mdi:archive-outline' }
};

export const LOCKUP_ORDER_STATUS_META: Record<Api.FinanceProduct.LockupStatus, Meta> = {
  active: { label: '持仓中', color: 'green', icon: 'mdi:trending-up' },
  matured: { label: '已到期', color: 'blue', icon: 'mdi:check-circle' },
  early_unlocked: { label: '提前解锁', color: 'orange', icon: 'mdi:lock-open-alert' },
  cancelled: { label: '已取消', color: 'gray', icon: 'mdi:close-circle-outline' }
};

export const FINANCE_AUDIENCE_META: Record<Api.FinanceProduct.Audience, Meta> = {
  all: { label: '全部用户', color: 'blue', icon: 'mdi:account-group' },
  customer: { label: '仅顾客', color: 'green', icon: 'mdi:shopping' },
  buyer: { label: '仅买手', color: 'orange', icon: 'mdi:store' }
};
