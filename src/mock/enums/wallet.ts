/**
 * 钱包 7 桶 + 17 交易类型展示元数据。
 * 抽取自 backstage/src/views/wallet/enums.ts。
 */

export interface BucketMeta {
  label: string;
  color: string;
  hint: string;
  icon: string;
}

export type BucketKey =
  | 'available'
  | 'nonWithdrawable'
  | 'lockedFinance'
  | 'frozenOrder'
  | 'frozenRisk'
  | 'depositAvailable'
  | 'depositGuaranteed';

export const BUCKET_META: Record<BucketKey, BucketMeta> = {
  available: { label: '可用余额', color: 'green', hint: '可出金可消费', icon: 'mdi:wallet-outline' },
  nonWithdrawable: { label: '不可提现余额', color: 'blue', hint: '奖励/利息；可消费', icon: 'mdi:gift-outline' },
  lockedFinance: { label: '小金库锁仓', color: 'purple', hint: '小金库锁定本金', icon: 'mdi:lock-outline' },
  frozenOrder: { label: '订单冻结', color: 'orange', hint: '下单/待结算占用', icon: 'mdi:cart-outline' },
  frozenRisk: { label: '风控冻结', color: 'red', hint: '风控审查中', icon: 'mdi:shield-alert-outline' },
  depositAvailable: { label: '可担保押金', color: 'cyan', hint: '尚未占用', icon: 'mdi:safe' },
  depositGuaranteed: { label: '已担保押金', color: 'gray', hint: '被进行中交易占用', icon: 'mdi:safe-square-outline' }
};

export interface TxnTypeMeta {
  label: string;
  color: string;
  group: 'chain' | 'internal' | 'finance' | 'deposit' | 'order' | 'risk' | 'adjust';
  icon: string;
}

export const TXN_TYPE_META: Record<Api.Wallet.TxnType, TxnTypeMeta> = {
  DEPOSIT_IN: { label: '链上入金', color: 'green', group: 'chain', icon: 'mdi:arrow-down-bold-circle' },
  WITHDRAW_OUT: { label: '链上出金', color: 'red', group: 'chain', icon: 'mdi:arrow-up-bold-circle' },
  INTERNAL_PAY: { label: '内部支付', color: 'blue', group: 'internal', icon: 'mdi:arrow-right-circle' },
  INTERNAL_RECEIVE: { label: '内部收款', color: 'cyan', group: 'internal', icon: 'mdi:arrow-left-circle' },
  INTERNAL_REFUND: { label: '内部退款', color: 'geekblue', group: 'internal', icon: 'mdi:undo-variant' },
  FINANCE_LOCK: { label: '小金库存入', color: 'purple', group: 'finance', icon: 'mdi:lock' },
  FINANCE_UNLOCK: { label: '小金库取出', color: 'magenta', group: 'finance', icon: 'mdi:lock-open-variant' },
  INTEREST_ACCRUE: { label: '利息发放', color: 'gold', group: 'finance', icon: 'mdi:cash-plus' },
  DEPOSIT_PLEDGE: { label: '押金担保', color: 'cyan', group: 'deposit', icon: 'mdi:safe' },
  DEPOSIT_RELEASE: { label: '押金释放', color: 'green', group: 'deposit', icon: 'mdi:lock-open' },
  DEPOSIT_FORFEIT: { label: '押金扣罚', color: 'red', group: 'deposit', icon: 'mdi:cash-remove' },
  ORDER_FREEZE: { label: '订单冻结', color: 'orange', group: 'order', icon: 'mdi:cart-arrow-down' },
  ORDER_SETTLE: { label: '订单结算', color: 'green', group: 'order', icon: 'mdi:cart-check' },
  RISK_FREEZE: { label: '风控冻结', color: 'red', group: 'risk', icon: 'mdi:shield-lock-outline' },
  RISK_UNFREEZE: { label: '风控解冻', color: 'green', group: 'risk', icon: 'mdi:shield-check-outline' },
  ADJUST_PLUS: { label: '人工调增', color: 'gold', group: 'adjust', icon: 'mdi:plus-circle' },
  ADJUST_MINUS: { label: '人工调减', color: 'orange', group: 'adjust', icon: 'mdi:minus-circle' },
  FEE_DEDUCT: { label: '手续费', color: 'gray', group: 'adjust', icon: 'mdi:cash-minus' }
};

export function txnDirectionSign(direction: 'in' | 'out'): '+' | '-' {
  return direction === 'in' ? '+' : '-';
}
