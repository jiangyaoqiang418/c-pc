import { parseJsonPreservingLong } from './json';

/** PRODUCT_CARD 是服务端商品快照，不具备订单身份或支付/售后操作。 */
export function parseProductMessageCard(content?: string | null) {
  if (!content) return;
  try {
    const value = parseJsonPreservingLong<Record<string, unknown>>(content, true);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.productId !== 'string' || !/^\d+$/.test(value.productId)
      || typeof value.title !== 'string' || !value.title.trim()
      || typeof value.price !== 'string' || !/^\d+(?:\.\d{1,8})?$/.test(value.price)) return;
    const images = Array.isArray(value.images) ? value.images.filter((url): url is string => typeof url === 'string' && /^(?:https?:\/\/|\/(?!\/))/.test(url)) : [];
    return { productId: value.productId, source: typeof value.source === 'string' ? value.source.trim() : undefined, title: value.title, price: value.price, image: images[0] };
  } catch { return; }
}
