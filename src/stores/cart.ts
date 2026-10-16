import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { Message } from '@/lib/feedback';
import { STORAGE_KEY } from '@shared';
import * as productApi from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { multiplyPaymentAmount, sumPaymentAmounts } from '@/utils/checkout';
import { exactTransactionAmount } from '@/components/wallet/decimal-amount';
import { resolveProductPurchase, sameSkuId } from '@/utils/product-sku';

export interface CartItem {
  productId: string | number;
  skuId?: string | number;
  confirmedUnitPrice?: string;
  qty: number;
  addedAt: string;
  selected: boolean;
}

export interface EnrichedCartItem extends CartItem {
  product?: Api.RealProduct.DisplayRecord;
  sku?: Api.RealProduct.ProductSku;
  unitPrice: string;
  stock: number;
  specText: string;
  image?: string;
  skuSelectionRequired: boolean;
  available: boolean;
  loadState: 'loading' | 'error' | 'ready';
  confirmedInvalid: boolean;
  subtotal: string;
  shippingFee: string;
  tax: string;
  lineTotal: string;
}

type CartOwnerId = string | number | undefined;

function validCartId(value: unknown): value is string | number {
  return typeof value === 'string' && value.trim().length > 0
    || typeof value === 'number' && Number.isSafeInteger(value);
}

function sameBusinessId(left: string | number | undefined, right: string | number | undefined) {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

function sameCartLine(item: CartItem, productId: string | number, skuId?: string | number) {
  return sameBusinessId(item.productId, productId) && sameSkuId(item.skuId, skuId);
}

function finiteNonNegative(value: string | number | undefined) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return undefined;
  return exactTransactionAmount(value, true).value;
}

function finiteQuantity(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** 购物车是账号私有数据，绝不能让本地缓存跨登录用户复用。 */
export function cartStorageKey(ownerId?: CartOwnerId) {
  return `${STORAGE_KEY.cart}:${ownerId === undefined ? 'anonymous' : String(ownerId)}`;
}

export const useCartStore = defineStore('bw-cart', () => {
  const items = ref<CartItem[]>([]);
  const products = ref<Record<string, Api.RealProduct.DisplayRecord>>({});
  const productStates = ref<Record<string, EnrichedCartItem['loadState']>>({});
  const initialized = ref(false);
  const cacheError = ref('');
  const pendingMutations = ref(0);
  const ownerId = ref<CartOwnerId>();
  const refreshGuard = createLatestRequestGuard();

  function persist() {
    localStorage.setItem(cartStorageKey(ownerId.value), JSON.stringify(items.value));
  }

  function readLatestItems() {
    try {
      const raw = localStorage.getItem(cartStorageKey(ownerId.value));
      const parsed = JSON.parse(raw === null ? '[]' : raw) as CartItem[];
      if (!Array.isArray(parsed) || parsed.some(item => !item || !validCartId(item.productId)
        || (item.skuId !== undefined && !validCartId(item.skuId))
        || (item.confirmedUnitPrice !== undefined && finiteNonNegative(item.confirmedUnitPrice) === undefined)
        || !Number.isSafeInteger(item.qty) || item.qty < 0 || typeof item.addedAt !== 'string')) {
        throw new Error('invalid cart');
      }
      cacheError.value = '';
      return parsed.map(item => ({ ...item, selected: item.selected !== false }));
    } catch {
      cacheError.value = '购物车记录无法读取，原记录未清空，请重新读取后再操作';
      throw new Error(cacheError.value);
    }
  }

  /** 同源标签页按账号串行修改；每次操作基于锁内读取的新快照，不覆盖其他标签页的更新。 */
  async function mutate(action: () => boolean, throwFailure = false) {
    const owner = ownerId.value;
    pendingMutations.value += 1;
    try {
      if (!navigator.locks) throw new Error('当前浏览器不支持安全同步购物车，请使用新版浏览器');
      return await navigator.locks.request(cartStorageKey(owner), () => {
        if (ownerId.value !== owner) throw new Error('账号已切换，本次购物车操作已取消');
        items.value = readLatestItems();
        return action();
      });
    } catch (error) {
      if (ownerId.value === owner) {
        try { items.value = readLatestItems(); } catch { /* 读取同样失败时保留当前展示，不覆盖存储。 */ }
      }
      if (throwFailure) throw error;
      Message.warning(error instanceof Error ? error.message : '购物车保存失败，请重试');
      return undefined;
    } finally {
      pendingMutations.value -= 1;
    }
  }

  function syncExternalCart() {
    if (!initialized.value) return;
    try {
      const latest = readLatestItems();
      if (JSON.stringify(latest) === JSON.stringify(items.value)) return;
      items.value = latest;
      void refresh();
    } catch {
      Message.warning('购物车同步失败，已保留当前页面，请核对后重试');
    }
  }

  function onCartStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === cartStorageKey(ownerId.value) || event.key === null)) syncExternalCart();
  }

  function load(owner?: CartOwnerId) {
    refreshGuard.invalidate();
    ownerId.value = owner;
    items.value = [];
    products.value = {};
    productStates.value = {};
    cacheError.value = '';
    try {
      items.value = readLatestItems();
    } catch {
      items.value = [];
    }
    initialized.value = true;
  }

  function init(owner?: CartOwnerId) {
    if (initialized.value) return;
    load(owner);
  }

  function switchOwner(owner?: CartOwnerId) {
    if (initialized.value && String(ownerId.value) === String(owner)) return;
    load(owner);
  }

  function enrich(item: CartItem): EnrichedCartItem {
    const product = products.value[String(item.productId)];
    const loadState = productStates.value[String(item.productId)] || 'loading';
    const purchase = product ? resolveProductPurchase(product, item.skuId) : undefined;
    const confirmedInvalid = loadState === 'ready' && !!product
      && (product.status !== 'NORMAL' || product.shelfStatus !== 'on-shelf' || product.stock === 0
        || (item.skuId !== undefined && (!purchase?.sku || !purchase.sku.enabled || purchase.stock === 0)));
    const qty = finiteQuantity(item.qty);
    const price = purchase ? finiteNonNegative(purchase.unitPrice) : undefined;
    const shipping = product ? finiteNonNegative(product.shippingFee) : undefined;
    const tax = product ? finiteNonNegative(product.tax) : undefined;
    const available = loadState === 'ready' && !!product
      && product.status === 'NORMAL'
      && product.shelfStatus === 'on-shelf'
      && purchase?.available === true
      && qty > 0
      && qty <= purchase.stock
      && price !== undefined
      && shipping !== undefined
      && tax !== undefined;
    const subtotal = available ? multiplyPaymentAmount(price!, qty) : '';
    const lineTotal = available ? sumPaymentAmounts([subtotal, shipping!, tax!]) : '';
    return {
      ...item,
      qty,
      product,
      sku: purchase?.sku,
      unitPrice: price ?? '',
      stock: purchase?.stock ?? 0,
      specText: purchase?.specText ?? '',
      image: purchase?.image,
      skuSelectionRequired: purchase?.selectionRequired ?? false,
      available,
      loadState,
      confirmedInvalid,
      subtotal,
      shippingFee: shipping ?? '',
      tax: tax ?? '',
      lineTotal
    };
  }

  function upsertProduct(product: Api.RealProduct.DisplayRecord) {
    products.value[String(product.id)] = product;
    productStates.value[String(product.id)] = 'ready';
  }

  async function refresh(options: { signal?: AbortSignal } = {}) {
    const isCurrent = refreshGuard.begin();
    const signal = options.signal ? AbortSignal.any([isCurrent.signal, options.signal]) : isCurrent.signal;
    await Promise.all([...new Map(items.value.map(item => [String(item.productId), item.productId])).values()].map(async productId => {
      productStates.value[String(productId)] = 'loading';
      try {
        const product = await productApi.fetchProductDetail(productId, { showError: false, signal });
        if (isCurrent() && !options.signal?.aborted) upsertProduct(product);
      } catch {
        if (isCurrent() && !options.signal?.aborted) productStates.value[String(productId)] = 'error';
      }
    }));
  }

  function add(productId: string | number, qty = 1, product?: Api.RealProduct.DisplayRecord, skuId?: string | number) {
    if (!validCartId(productId) || (skuId !== undefined && !validCartId(skuId))) return false;
    if (product) upsertProduct(product);
    const safeQty = finiteQuantity(qty);
    const exist = items.value.find(i => sameCartLine(i, productId, skuId));
    const nextQty = (exist ? finiteQuantity(exist.qty) : 0) + safeQty;
    const currentProduct = products.value[String(productId)];
    const purchase = currentProduct ? resolveProductPurchase(currentProduct, skuId) : undefined;
    if (!safeQty || !Number.isSafeInteger(nextQty) || !purchase?.available || nextQty > purchase.stock) return false;
    const confirmedUnitPrice = finiteNonNegative(purchase.unitPrice);
    if (confirmedUnitPrice === undefined) return false;
    if (exist) {
      exist.qty = nextQty;
      exist.selected = true;
      exist.confirmedUnitPrice = confirmedUnitPrice;
    } else {
      items.value.unshift({ productId, skuId, confirmedUnitPrice, qty: safeQty, addedAt: new Date().toISOString(), selected: true });
    }
    persist();
    return true;
  }

  function update(productId: string | number, qty: number, skuId?: string | number) {
    const exist = items.value.find(i => sameCartLine(i, productId, skuId));
    if (exist) {
      const product = products.value[String(productId)];
      const stock = product ? resolveProductPurchase(product, skuId).stock : undefined;
      if (!stock || !Number.isSafeInteger(stock) || stock < 1 || !Number.isSafeInteger(qty)) return;
      exist.qty = Math.min(stock, Math.max(1, finiteQuantity(qty, 1)));
      persist();
    }
  }

  function remove(productId: string | number, skuId?: string | number) {
    items.value = items.value.filter(i => !sameCartLine(i, productId, skuId));
    persist();
  }

  function consumePurchasedItems(snapshot: CartItem[]) {
    for (const purchased of snapshot) {
      const current = items.value.find(item => sameCartLine(item, purchased.productId, purchased.skuId));
      if (!current || current.addedAt !== purchased.addedAt || current.qty < purchased.qty) continue;
      current.qty -= purchased.qty;
      if (current.qty === 0) items.value = items.value.filter(item => item !== current);
    }
    persist();
  }

  function setSelected(productId: string | number, selected: boolean, skuId?: string | number) {
    const exist = items.value.find(i => sameCartLine(i, productId, skuId));
    if (exist) {
      exist.selected = selected;
      persist();
    }
  }

  function setAllSelected(selected: boolean) {
    items.value.forEach(i => {
      i.selected = selected;
    });
    persist();
  }

  function clear() {
    refreshGuard.invalidate();
    items.value = [];
    persist();
  }

  function clearSelected() {
    items.value = items.value.filter(i => !i.selected);
    persist();
  }

  const enrichedItems = computed<EnrichedCartItem[]>(() => items.value.map(enrich));
  const validItems = computed(() => enrichedItems.value.filter(i => i.available));
  const selectedItems = computed(() => cacheError.value ? [] : enrichedItems.value.filter(i => i.selected && i.available));

  const count = computed(() => items.value.length);
  const totalQty = computed(() => items.value.reduce((s, i) => s + finiteQuantity(i.qty), 0));
  const selectedQty = computed(() => selectedItems.value.reduce((s, i) => s + finiteQuantity(i.qty), 0));
  const allSelected = computed(() => validItems.value.length > 0 && validItems.value.every(i => i.selected));

  const subTotal = computed(() => sumPaymentAmounts(selectedItems.value.map(i => i.subtotal)));
  const shippingFeeTotal = computed(() => sumPaymentAmounts(selectedItems.value.map(i => i.shippingFee)));
  const taxTotal = computed(() => sumPaymentAmounts(selectedItems.value.map(i => i.tax)));
  const grandTotal = computed(() => sumPaymentAmounts(selectedItems.value.map(i => i.lineTotal)));

  return {
    items,
    cacheError,
    products,
    enrichedItems,
    validItems,
    selectedItems,
    count,
    totalQty,
    selectedQty,
    allSelected,
    subTotal,
    shippingFeeTotal,
    taxTotal,
    grandTotal,
    mutating: computed(() => pendingMutations.value > 0),
    init,
    retryLoad: () => { load(ownerId.value); return refresh(); },
    switchOwner,
    refresh,
    upsertProduct,
    enrich,
    add: (...args: Parameters<typeof add>) => mutate(() => add(...args)),
    update: (...args: Parameters<typeof update>) => mutate(() => { update(...args); return true; }),
    remove: (productId: string | number, skuId?: string | number) => {
      const addedAt = items.value.find(item => sameCartLine(item, productId, skuId))?.addedAt;
      return mutate(() => {
        if (!items.value.some(item => sameCartLine(item, productId, skuId) && item.addedAt === addedAt)) return false;
        remove(productId, skuId);
        return true;
      });
    },
    consumePurchasedItems: (snapshot: CartItem[]) => mutate(() => { consumePurchasedItems(snapshot); return true; }, true),
    setSelected: (...args: Parameters<typeof setSelected>) => mutate(() => { setSelected(...args); return true; }),
    setAllSelected: (...args: Parameters<typeof setAllSelected>) => mutate(() => { setAllSelected(...args); return true; }),
    clear: () => mutate(() => { clear(); return true; }),
    clearSelected: () => mutate(() => { clearSelected(); return true; }),
    syncExternalCart,
    onCartStorage
  };
});
