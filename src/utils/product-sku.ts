import { exactTransactionAmount } from '@/components/wallet/decimal-amount';

export function sameSkuId(left?: Api.RealProduct.Id, right?: Api.RealProduct.Id) {
  return left === undefined || right === undefined ? left === right : String(left) === String(right);
}

export function productRequiresSku(product: Api.RealProduct.DisplayRecord) {
  return product.hasSku === true || !!product.specGroups?.length || !!product.skus?.length;
}

export function skuMatchesSelection(sku: Api.RealProduct.ProductSku, selection: Record<string, string>) {
  return Object.entries(selection).every(([name, value]) => sku.specs.some(spec => spec.name === name && spec.value === value));
}

export function skuCanPurchase(sku: Api.RealProduct.ProductSku) {
  if (!sku.enabled || !Number.isSafeInteger(sku.stock) || sku.stock < 1) return false;
  return exactTransactionAmount(sku.price).value !== undefined;
}

/** 商品汇总价仅供展示；多规格订单必须用已选的稳定 SKU 回查。 */
export function resolveProductPurchase(product: Api.RealProduct.DisplayRecord, skuId?: Api.RealProduct.Id) {
  const requiresSku = productRequiresSku(product);
  const sku = requiresSku && skuId !== undefined ? product.skus?.find(item => sameSkuId(item.id, skuId)) : undefined;
  const selectionRequired = requiresSku && !sku;
  const unexpectedSku = !requiresSku && skuId !== undefined;
  const stock = requiresSku ? sku?.stock ?? 0 : product.stock;
  const unitPrice = requiresSku ? sku?.price : product.price;
  return {
    sku,
    requiresSku,
    selectionRequired,
    unitPrice,
    stock,
    specText: sku?.specs.map(spec => `${spec.name}：${spec.value}`).join(' / ') || '',
    image: sku?.image || product.images?.[0]?.url,
    available: !selectionRequired && !unexpectedSku && (!requiresSku || !!sku && skuCanPurchase(sku))
      && unitPrice !== undefined && exactTransactionAmount(unitPrice).value !== undefined
      && Number.isSafeInteger(stock) && stock > 0
  };
}
