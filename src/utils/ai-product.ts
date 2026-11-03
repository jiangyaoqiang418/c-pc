const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function isProductListCard(value: unknown): value is Api.Ai.ProductListCard {
  if (!object(value) || value.type !== 'product_list' || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 3) return false;
  return value.items.every(item => {
    if (!object(item) || !object(item.action)) return false;
    const action = item.action;
    return ['title', 'price_label', 'price_from', 'after_sale'].every(key => typeof item[key] === 'string')
      && ['brief', 'sales_text', 'seller_name'].every(key => item[key] === null || typeof item[key] === 'string')
      && (item.image_ref === null || (object(item.image_ref) && typeof item.image_ref.bucket === 'string' && typeof item.image_ref.file_path === 'string'))
      && action.type === 'NAVIGATE' && action.target_type === 'commodity' && action.view === 'detail'
      && typeof action.target_id === 'string' && /^[1-9]\d*$/.test(action.target_id)
      && object(action.params) && Object.keys(action.params).length === 0;
  });
}

/** 当前值缺失是查询失败，不能冒充下架；金额和计数原样保留。 */
export function requireCurrentProduct(value: unknown): Api.Ai.CurrentProduct {
  const invalid = () => { throw new Error('商品信息暂时无法加载'); };
  if (!object(value) || typeof value.id !== 'string' || !/^[1-9]\d*$/.test(value.id)) return invalid();
  if (value.available === false) return { id: value.id, available: false };
  if (value.available !== true || typeof value.title !== 'string' || !value.title.trim() || typeof value.hasSku !== 'boolean'
    || typeof value.priceLabel !== 'string' || !value.priceLabel.trim()
    || !['priceFrom', 'priceTo'].every(key => typeof value[key] === 'string' && /^\d+(?:\.\d+)?$/.test(value[key] as string))
    || typeof value.stock !== 'string' || !/^\d+$/.test(value.stock) || BigInt(value.stock) <= 0n
    || (value.salesCount != null && (typeof value.salesCount !== 'string' || !/^\d+$/.test(value.salesCount)))) return invalid();
  for (const key of ['brief', 'coverImage', 'sellerName', 'afterSale', 'source']) {
    if (value[key] != null && typeof value[key] !== 'string') return invalid();
  }
  return value as unknown as Api.Ai.CurrentProduct;
}
export function productCover(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
