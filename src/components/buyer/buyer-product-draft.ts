export interface BuyerProductDraftForm {
  title: string;
  categoryId?: string | number;
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
}

export interface BuyerProductDraft {
  version: 1;
  ownerId: string | number;
  productId?: string | number;
  savedAt: number;
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

/** Whitelist the form fields; credentials and write-operation snapshots never enter a draft. */
export function readBuyerProductDraft(raw: string, ownerId: string | number, productId?: string | number): BuyerProductDraft {
  const draft = JSON.parse(raw) as BuyerProductDraft;
  const form = draft?.form;
  if (!draft || draft.version !== 1 || !validId(draft.ownerId) || String(draft.ownerId) !== String(ownerId)
    || (productId === undefined ? draft.productId !== undefined : !validId(draft.productId) || String(draft.productId) !== String(productId))
    || !Number.isFinite(draft.savedAt) || !form || typeof form !== 'object'
    || !['title', 'summary', 'description'].every(key => typeof form[key as 'title'] === 'string')
    || (form.categoryId !== undefined && !validId(form.categoryId))
    || ![form.price, form.shippingFee, form.tax, form.stock].every(validDraftAmount)
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
    version: 1, ownerId: draft.ownerId, productId: draft.productId, savedAt: draft.savedAt,
    form: {
      title: form.title, categoryId: form.categoryId, price: form.price, shippingFee: form.shippingFee,
      tax: form.tax, stock: form.stock, aftersaleType: form.aftersaleType, overseasCustoms: form.overseasCustoms,
      summary: form.summary, description: form.description, images: [...form.images],
      amountTexts: form.amountTexts && { price:form.amountTexts.price, shippingFee:form.amountTexts.shippingFee, tax:form.amountTexts.tax }
    },
    imageFiles: draft.imageFiles.map(image => ({ url: image.url, bucket: image.bucket, filePath: image.filePath }))
  };
}
