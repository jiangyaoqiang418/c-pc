import type { ProductSkuEditorState } from '@/utils/product-sku';
import { withSubmissionLock } from '@/utils/financial-submission';

export interface BuyerProductDraftForm {
  title: string;
  categoryId?: string | number;
  categoryIds?: Api.RealProduct.Id[];
  parameters?: Api.RealProduct.ProductParameter[];
  brandId?: Api.RealProduct.Id | null;
  price: number | null;
  shippingFee: number | null;
  tax: number | null;
  stock: number | null;
  aftersaleType?: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  summary: string;
  description: string;
  images: string[];
  amountTexts?: { price: string; shippingFee: string; tax: string };
  skuEditor?: ProductSkuEditorState;
}

export interface BuyerProductDraft {
  version: 1;
  ownerId: string | number;
  productId?: string | number;
  savedAt: number;
  productSnapshot?: string;
  form: BuyerProductDraftForm;
  imageFiles: Api.RealProduct.ProductImageDTO[];
}

export function buyerProductDraftKey(ownerId: string | number, productId?: string | number) {
  return `cpc:v47:buyer-product-draft:${encodeURIComponent(String(ownerId))}:${productId === undefined ? 'create' : 'edit:' + encodeURIComponent(String(productId))}`;
}

function validId(value: unknown): value is string | number {
  return typeof value === 'string' && value.trim() !== '' || typeof value === 'number' && Number.isSafeInteger(value);
}

function validDraftAmount(value: unknown) {
  return value === null || typeof value === 'number' && Number.isFinite(value);
}

function validSkuEditor(value: ProductSkuEditorState) {
  return !!value && typeof value.enabled === 'boolean' && Array.isArray(value.groups) && value.groups.length <= 3
    && value.groups.every(group => !!group && typeof group.name === 'string' && group.name.length <= 32
      && Array.isArray(group.options) && group.options.length <= 50 && group.options.every(option => typeof option === 'string' && option.length <= 64))
    && Array.isArray(value.skus) && value.skus.length <= 200 && value.skus.every(sku => !!sku
      && (sku.id === undefined || sku.id === null || validId(sku.id)) && (sku.key === undefined || typeof sku.key === 'string' && sku.key.length <= 128)
      && typeof sku.price === 'string' && sku.price.length <= 128
      && typeof sku.stock === 'string' && sku.stock.length <= 32 && typeof sku.enabled === 'boolean'
      && typeof sku.image === 'string' && sku.image.length <= 1024 && (!sku.image || /^https:\/\//i.test(sku.image))
      && Array.isArray(sku.specs) && sku.specs.length <= 3 && sku.specs.every(spec => !!spec && typeof spec.name === 'string'
        && spec.name.length <= 32 && typeof spec.value === 'string' && spec.value.length <= 64));
}

/** Whitelist the form fields; credentials and write-operation snapshots never enter a draft. */
export function readBuyerProductDraft(raw: string, ownerId: string | number, productId?: string | number): BuyerProductDraft {
  const draft = JSON.parse(raw) as BuyerProductDraft;
  const form = draft?.form;
  if (!draft || draft.version !== 1 || !validId(draft.ownerId) || String(draft.ownerId) !== String(ownerId)
    || (productId === undefined ? draft.productId !== undefined : !validId(draft.productId) || String(draft.productId) !== String(productId))
    || !Number.isFinite(draft.savedAt) || !form || typeof form !== 'object'
    || !['title', 'summary', 'description'].every(key => typeof form[key as 'title'] === 'string')
    || (form.categoryId !== undefined && !validId(form.categoryId))
    || (form.categoryIds !== undefined && (!Array.isArray(form.categoryIds) || form.categoryIds.length > 20 || !form.categoryIds.every(validId)))
    || (form.parameters !== undefined && (!Array.isArray(form.parameters) || form.parameters.length > 200 || form.parameters.some(row => !row
      || typeof row.name !== 'string' || row.name.length > 64 || typeof row.value !== 'string' || row.value.length > 1000
      || (row.groupName !== undefined && (typeof row.groupName !== 'string' || row.groupName.length > 64))
      || (row.explanation !== undefined && (typeof row.explanation !== 'string' || row.explanation.length > 500))
      || (row.highlighted !== undefined && typeof row.highlighted !== 'boolean'))))
    || (form.brandId !== undefined && form.brandId !== null && !validId(form.brandId))
    || (draft.productSnapshot !== undefined && typeof draft.productSnapshot !== 'string')
    || (form.skuEditor !== undefined && !validSkuEditor(form.skuEditor))
    || ![form.price, form.shippingFee, form.tax, form.stock].every(validDraftAmount)
    || (!form.amountTexts && [form.price, form.shippingFee, form.tax].some(value => value !== null && !Number.isSafeInteger(value)))
    || (form.amountTexts !== undefined && (!form.amountTexts || !['price', 'shippingFee', 'tax'].every(key =>
      typeof form.amountTexts![key as 'price'] === 'string' && /^\d*(?:\.\d*)?(?:[eE][+-]?\d*)?$/.test(form.amountTexts![key as 'price']))))
    || (form.aftersaleType !== undefined && !['none', '7day-no-reason', 'shop-warranty', 'national-warranty'].includes(form.aftersaleType))
    || typeof form.overseasCustoms !== 'boolean' || !Array.isArray(form.images) || form.images.length > 6
    || form.images.some(url => typeof url !== 'string' || !url.trim()) || !Array.isArray(draft.imageFiles)
    || draft.imageFiles.some(image => !image || !['url', 'bucket', 'filePath'].every(key => typeof image[key as 'url'] === 'string' && image[key as 'url'].trim()))
    || new Set(draft.imageFiles.map(image => image.url)).size !== draft.imageFiles.length) {
    throw new Error('本地草稿资料不完整或归属不符，未恢复任何内容');
  }
  if (form.images.some(url => !draft.imageFiles.some(image => image.url === url))) {
    throw new Error('本地草稿缺少商品图片上传信息，请重新上传后再保存');
  }
  return {
    version: 1, ownerId: draft.ownerId, productId: draft.productId, savedAt: draft.savedAt, productSnapshot: draft.productSnapshot,
    form: {
      title: form.title, categoryId: form.categoryId, categoryIds:form.categoryIds && [...form.categoryIds], parameters:form.parameters?.map(row => ({ groupName:row.groupName, name:row.name, value:row.value, explanation:row.explanation, highlighted:row.highlighted })), brandId: form.brandId, price: form.price, shippingFee: form.shippingFee,
      tax: form.tax, stock: form.stock, aftersaleType: form.aftersaleType, overseasCustoms: form.overseasCustoms,
      summary: form.summary, description: form.description, images: [...form.images],
      amountTexts: form.amountTexts && { price:form.amountTexts.price, shippingFee:form.amountTexts.shippingFee, tax:form.amountTexts.tax },
      skuEditor: form.skuEditor && { enabled: form.skuEditor.enabled,
        groups: form.skuEditor.groups.map(group => ({ name: group.name, options: [...group.options] })),
        skus: form.skuEditor.skus.map((sku, index) => ({ key:sku.key || (sku.id == null ? 'draft:' + index : 'saved:' + String(sku.id)), id: sku.id, specs: sku.specs.map(spec => ({ name: spec.name, value: spec.value })),
          price: sku.price, stock: sku.stock, enabled: sku.enabled, image: sku.image })) }
    },
    imageFiles: draft.imageFiles.map(image => ({ url: image.url, bucket: image.bucket, filePath: image.filePath }))
  };
}

export async function saveBuyerProductDraft(draft: BuyerProductDraft, expectedRaw: string | undefined, isCurrent: () => boolean) {
  const key = buyerProductDraftKey(draft.ownerId, draft.productId);
  return withSubmissionLock(key, async () => {
    if (!isCurrent()) throw new Error('账号或商品已切换，草稿未保存');
    if ((localStorage.getItem(key) || undefined) !== expectedRaw) throw new Error('草稿已在其他页面更新；本页表单保留，请恢复并核对最新草稿后再保存');
    const validated = readBuyerProductDraft(JSON.stringify(draft), draft.ownerId, draft.productId);
    const raw = JSON.stringify(validated);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('草稿未能保存，请检查浏览器存储');
    return { draft:validated, raw };
  });
}
