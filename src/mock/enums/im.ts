/**
 * IM 消息类型 18 类 + 风险类别 6 维展示元数据。
 * 抽取自 backstage/src/views/im/enums.ts。
 */

interface Meta {
  label: string;
  color: string;
  icon: string;
}

export const MSG_TYPE_META: Record<Api.Im.MessageType, Meta> = {
  text: { label: '文本', color: 'gray', icon: 'mdi:message-text-outline' },
  image: { label: '图片', color: 'blue', icon: 'mdi:image-outline' },
  video: { label: '视频', color: 'purple', icon: 'mdi:video-outline' },
  audio: { label: '语音', color: 'cyan', icon: 'mdi:microphone-outline' },
  file: { label: '文件', color: 'orange', icon: 'mdi:file-document-outline' },
  'card-order': { label: '订单卡片', color: 'green', icon: 'mdi:package-variant' },
  'card-product': { label: '商品卡片', color: 'blue', icon: 'mdi:shopping-outline' },
  'card-payment': { label: '支付卡片', color: 'gold', icon: 'mdi:credit-card-outline' },
  system: { label: '系统消息', color: 'gray', icon: 'mdi:cog-outline' },
  'system-banner': { label: '系统横幅', color: 'gray', icon: 'mdi:bullhorn-variant' },
  'order-paid': { label: '订单已付款', color: 'green', icon: 'mdi:check-circle' },
  'order-shipped': { label: '订单已发货', color: 'blue', icon: 'mdi:truck-delivery' },
  'order-delivered': { label: '订单已签收', color: 'green', icon: 'mdi:package-variant-closed-check' },
  'price-change': { label: '改价通知', color: 'orange', icon: 'mdi:tag-edit-outline' },
  'refund-request': { label: '退款申请', color: 'red', icon: 'mdi:cash-refund' },
  'risk-warning': { label: '风险提示', color: 'orange', icon: 'mdi:alert-outline' },
  'risk-intercept': { label: '风险拦截', color: 'red', icon: 'mdi:cancel' },
  'presale-merged': { label: '售前并入', color: 'cyan', icon: 'mdi:merge' }
};

export const RISK_CATEGORY_META: Record<Api.Im.RiskCategory, Meta> = {
  OFF_PLATFORM_PAYMENT: { label: '私下交易', color: 'red', icon: 'mdi:cash-off' },
  EXTERNAL_LINK: { label: '外部链接', color: 'orange', icon: 'mdi:link-variant' },
  BLACKLIST_WALLET: { label: '黑名单钱包', color: 'red', icon: 'mdi:wallet-outline' },
  FRAUD_INDICATION: { label: '诈骗迹象', color: 'red', icon: 'mdi:alert-octagon' },
  SENSITIVE_CONTENT: { label: '敏感内容', color: 'orange', icon: 'mdi:eye-off-outline' },
  LOGISTICS_FAKE: { label: '虚假物流', color: 'red', icon: 'mdi:truck-alert' }
};

export const CONVERSATION_TYPE_META: Record<Api.Im.ConversationType, Meta> = {
  PLATFORM_CS: { label: '平台客服', color: 'blue', icon: 'mdi:headset' },
  PRESALE: { label: '售前咨询', color: 'cyan', icon: 'mdi:store-search' },
  ORDER_GROUP: { label: '三方群', color: 'purple', icon: 'mdi:account-group' }
};
