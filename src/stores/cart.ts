import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { Message } from '@arco-design/web-vue';
import { STORAGE_KEY } from '@shared';
import * as productApi from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';

export interface CartItem {
  productId: string | number;
  qty: number;
  addedAt: string;
  selected: boolean;
}

export interface EnrichedCartItem extends CartItem {
  product?: Api.RealProduct.DisplayRecord;
  available: boolean;
  loadState: 'loading' | 'error' | 'ready';
  confirmedInvalid: boolean;
  subtotal: string;
  shippingFee: string;
  tax: string;
  lineTotal: string;
}

type CartOwnerId = string | number | undefined;

function sameBusinessId(left: string | number | undefined, right: string | number | undefined) {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

function finiteNonNegative(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
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
      if (!Array.isArray(parsed) || parsed.some(item => !item || !['string', 'number'].includes(typeof item.productId)
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
    const confirmedInvalid = loadState === 'ready' && !!product
      && (product.status !== 'NORMAL' || product.shelfStatus !== 'on-shelf' || product.stock === 0);
    const qty = finiteQuantity(item.qty);
    const price = product ? finiteNonNegative(product.price) : undefined;
    const shipping = product ? finiteNonNegative(product.shippingFee) : undefined;
    const tax = product ? finiteNonNegative(product.tax) : undefined;
    const available = loadState === 'ready' && !!product
      && product.status === 'NORMAL'
      && product.shelfStatus === 'on-shelf'
      && product.stock > 0
      && qty > 0
      && qty <= product.stock
      && price !== undefined
      && shipping !== undefined
      && tax !== undefined
      && Number.isFinite(price * qty)
      && Number.isFinite(price * qty + shipping + tax);
    const subtotal = available ? (price! * qty).toFixed(2) : '';
    const lineTotal = available ? (price! * qty + shipping! + tax!).toFixed(2) : '';
    return {
      ...item,
      qty,
      product,
      available,
      loadState,
      confirmedInvalid,
      subtotal,
      shippingFee: shipping === undefined ? '' : shipping.toFixed(2),
      tax: tax === undefined ? '' : tax.toFixed(2),
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
    await Promise.all(items.value.map(async item => {
      productStates.value[String(item.productId)] = 'loading';
      try {
        const product = await productApi.fetchProductDetail(item.productId, { showError: false, signal });
        if (isCurrent() && !options.signal?.aborted) upsertProduct(product);
      } catch {
        if (isCurrent() && !options.signal?.aborted) productStates.value[String(item.productId)] = 'error';
      }
    }));
  }

  function add(productId: string | number, qty = 1, product?: Api.RealProduct.DisplayRecord) {
    if (product) upsertProduct(product);
    const safeQty = finiteQuantity(qty, 1);
    const exist = items.value.find(i => sameBusinessId(i.productId, productId));
    const nextQty = (exist ? finiteQuantity(exist.qty) : 0) + safeQty;
    const currentProduct = products.value[String(productId)];
    if (!safeQty || !currentProduct || nextQty > currentProduct.stock) return false;
    if (exist) {
      exist.qty = nextQty;
      exist.selected = true;
    } else {
      items.value.unshift({ productId, qty: safeQty, addedAt: new Date().toISOString(), selected: true });
    }
    persist();
    return true;
  }

  function update(productId: string | number, qty: number) {
    const exist = items.value.find(i => sameBusinessId(i.productId, productId));
    if (exist) {
      const stock = products.value[String(productId)]?.stock;
      if (!stock || stock < 1) return;
      exist.qty = Math.min(stock, Math.max(1, finiteQuantity(qty, 1)));
      persist();
    }
  }

  function remove(productId: string | number) {
    items.value = items.value.filter(i => !sameBusinessId(i.productId, productId));
    persist();
  }

  function consumePurchasedItems(snapshot: CartItem[]) {
    for (const purchased of snapshot) {
      const current = items.value.find(item => sameBusinessId(item.productId, purchased.productId));
      if (!current || current.addedAt !== purchased.addedAt || current.qty < purchased.qty) continue;
      current.qty -= purchased.qty;
      if (current.qty === 0) items.value = items.value.filter(item => item !== current);
    }
    persist();
  }

  function setSelected(productId: string | number, selected: boolean) {
    const exist = items.value.find(i => sameBusinessId(i.productId, productId));
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

  const subTotal = computed(() => selectedItems.value.reduce((s, i) => s + Number(i.subtotal), 0).toFixed(2));
  const shippingFeeTotal = computed(() =>
    selectedItems.value.reduce((s, i) => s + Number(i.shippingFee), 0).toFixed(2)
  );
  const taxTotal = computed(() => selectedItems.value.reduce((s, i) => s + Number(i.tax), 0).toFixed(2));
  const grandTotal = computed(() =>
    (Number(subTotal.value) + Number(shippingFeeTotal.value) + Number(taxTotal.value)).toFixed(2)
  );

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
    remove: (productId: string | number) => {
      const addedAt = items.value.find(item => sameBusinessId(item.productId, productId))?.addedAt;
      return mutate(() => {
        if (!items.value.some(item => sameBusinessId(item.productId, productId) && item.addedAt === addedAt)) return false;
        remove(productId);
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
