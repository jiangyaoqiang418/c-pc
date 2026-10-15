import { compareDecimalAmount, exactTransactionAmount } from '@/components/wallet/decimal-amount';

export interface ProductSkuEditorState {
  enabled: boolean;
  groups: Array<{ name: string; options: string[] }>;
  skus: Array<{ key?: string; id?: Api.RealProduct.Id | null; specs: Api.RealProduct.ProductSkuOption[]; price: string; stock: string; enabled: boolean; image: string }>;
}

export function productSkuEditorState(product?: Api.RealProduct.Record): ProductSkuEditorState {
  return {
    enabled: product?.hasSku === true,
    groups: (product?.specGroups || []).map(group => ({ name: group.name, options: [...group.options] })),
    skus: (product?.skus || []).map(sku => ({ key:'saved:' + String(sku.id), id: sku.id, specs: sku.specs.map(spec => ({ ...spec })),
      price: sku.price, stock: String(sku.stock), enabled: sku.enabled, image: sku.image || '' }))
  };
}

export function productSkuEditorGroups(state: ProductSkuEditorState) {
  return state.groups.map(group => ({ name: group.name.trim(), options: group.options.map(option => option.trim()) }));
}

function skuCombination(specs: Api.RealProduct.ProductSkuOption[]) {
  return JSON.stringify([...specs].sort((a, b) => a.name.localeCompare(b.name)).map(spec => [spec.name, spec.value]));
}

/** 校验全量写入，已有 SKU ID 只能保留原组合，金额全程使用十进制字符串。 */
export function validateProductSkuWrite(groups: Api.RealProduct.ProductSpecGroup[] = [], skus: Api.RealProduct.ProductSkuSaveParams[] = [], originalSkus?: Api.RealProduct.ProductSku[]) {
  if (!Array.isArray(groups) || !Array.isArray(skus)) throw new Error('商品规格资料不完整');
  if (!groups.length) {
    if (skus.length) throw new Error('无规格商品不能提交 SKU');
    return { specGroups: [], skus: [], price: undefined, stock: undefined };
  }
  if (groups.length > 3 || !skus.length || skus.length > 200) throw new Error('最多 3 个规格组、200 个 SKU，规格商品至少保留一个 SKU');
  const names = new Set<string>();
  const specGroups = groups.map(group => {
    const name = group?.name?.trim();
    if (!name || name.length > 32 || names.has(name) || !Array.isArray(group.options) || !group.options.length || group.options.length > 50) throw new Error('规格组名称须唯一且不超过 32 字，每组填写 1–50 个选项');
    const options = group.options.map(option => typeof option === 'string' ? option.trim() : '');
    if (options.some(option => !option || option.length > 64) || new Set(options).size !== options.length) throw new Error('规格选项须唯一且不超过 64 字');
    names.add(name);
    return { name, options };
  });
  const ids = new Set<string>();
  const combinations = new Set<string>();
  let price: string | undefined;
  let stock = 0;
  const normalizedSkus = skus.map(sku => {
    if (!sku || !Array.isArray(sku.specs) || sku.specs.length !== specGroups.length || typeof sku.enabled !== 'boolean') throw new Error('每个 SKU 必须完整选择所有规格，并明确启停状态');
    const specs = specGroups.map(group => {
      const matches = sku.specs.filter(spec => spec?.name === group.name);
      if (matches.length !== 1 || !group.options.includes(matches[0].value)) throw new Error('SKU 组合不在当前规格选项中，请核对后再提交');
      return { name: group.name, value: matches[0].value };
    });
    const combination = skuCombination(specs);
    if (combinations.has(combination)) throw new Error('SKU 组合不能重复');
    combinations.add(combination);
    if (sku.id !== undefined && sku.id !== null) {
      if (!(typeof sku.id === 'string' && sku.id.trim() || typeof sku.id === 'number' && Number.isSafeInteger(sku.id)) || ids.has(String(sku.id))) throw new Error('SKU ID 无效或重复');
      ids.add(String(sku.id));
      if (originalSkus) {
        const original = originalSkus.find(item => sameSkuId(item.id, sku.id!));
        if (!original || skuCombination(original.specs) !== combination) throw new Error('已有 SKU ID 不可改成其他规格组合，请新增组合并明确移除旧组合');
      }
    }
    const amount = exactTransactionAmount(sku.price);
    if (amount.value === undefined) throw new Error(amount.error);
    if (!Number.isInteger(sku.stock) || sku.stock < 0 || sku.stock > 2147483647) throw new Error('SKU 库存须为 0–2147483647 的整数');
    if (sku.image !== undefined && sku.image !== null && typeof sku.image !== 'string') throw new Error('SKU 图片资料无效');
    const image = sku.image?.trim() || undefined;
    if (image) {
      try { const url = new URL(image); if (image.length > 1024 || url.protocol !== 'https:' || !url.hostname) throw new Error(); }
      catch { throw new Error('SKU 图片须使用上传后返回的 HTTPS 地址'); }
    }
    if (sku.enabled) {
      stock += sku.stock;
      if (stock > 2147483647) throw new Error('启用 SKU 的总库存不能超过 2147483647');
      if (price === undefined || compareDecimalAmount(amount.value, price) === -1) price = amount.value;
    }
    return { id: sku.id, specs, price: amount.value, stock: sku.stock, enabled: sku.enabled, image };
  });
  if (price === undefined) throw new Error('至少启用一个 SKU');
  return { specGroups, skus: normalizedSkus, price, stock };
}

export function productSkuEditorWrite(state: ProductSkuEditorState, originalSkus?: Api.RealProduct.ProductSku[]) {
  if (!state.enabled) return validateProductSkuWrite([], []);
  if (!state.groups.length) throw new Error('请先填写规格组并添加 SKU 组合');
  return validateProductSkuWrite(productSkuEditorGroups(state), state.skus.map(sku => {
    if (!/^\d+$/.test(sku.stock)) throw new Error('请输入正确的 SKU 库存');
    return { ...sku, stock: Number(sku.stock) };
  }), originalSkus);
}

/** 编辑提交前回读；任一商品资料、规格或库存变化都要求用户重新核对。 */
export function productEditSnapshot(product: Api.RealProduct.Record) {
  return JSON.stringify({ id: product.id, sellerId: product.sellerId, rawStatus: product.rawStatus, updatedAt: product.updatedAt,
    title: product.title, categoryId: product.categoryId, brandId: product.brandId, price: product.price, stock: product.stock,
    shippingFee: product.shippingFee, tax: product.tax, aftersaleType: product.aftersaleType, overseasCustoms: product.overseasCustoms,
    summary: product.summary, description: product.description, imageFiles: product.imageFiles,
    hasSku: product.hasSku, specGroups: product.specGroups, skus: product.skus });
}

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
