import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_KEY } from '@shared';
import { PRODUCTS } from '@shared/mock/data/products';

export interface CartItem {
  productId: number;
  qty: number;
  addedAt: string;
  selected: boolean;
}

export interface EnrichedCartItem extends CartItem {
  product?: Api.Product.ProductRecord;
  available: boolean;
  subtotal: string;
  shippingFee: string;
  tax: string;
  lineTotal: string;
}

function enrich(item: CartItem): EnrichedCartItem {
  const product = PRODUCTS.find(p => p.id === item.productId);
  const available = !!product && product.status === 'NORMAL' && product.shelfStatus === 'on-shelf' && product.stock > 0;
  const price = product ? Number(product.price) : 0;
  const shipping = product ? Number(product.shippingFee) : 0;
  const tax = product ? Number(product.tax) : 0;
  const subtotal = (price * item.qty).toFixed(2);
  const lineTotal = (price * item.qty + shipping + tax).toFixed(2);
  return {
    ...item,
    product,
    available,
    subtotal,
    shippingFee: shipping.toFixed(2),
    tax: tax.toFixed(2),
    lineTotal
  };
}

export const useCartStore = defineStore('bw-cart', () => {
  const items = ref<CartItem[]>([]);
  const initialized = ref(false);

  function persist() {
    localStorage.setItem(STORAGE_KEY.cart, JSON.stringify(items.value));
  }

  function init() {
    if (initialized.value) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY.cart);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        items.value = parsed.map(i => ({ ...i, selected: i.selected !== false }));
      }
    } catch {
      items.value = [];
    }
    initialized.value = true;
  }

  function add(productId: number, qty = 1) {
    const exist = items.value.find(i => i.productId === productId);
    if (exist) {
      exist.qty += qty;
      exist.selected = true;
    } else {
      items.value.unshift({ productId, qty, addedAt: new Date().toISOString(), selected: true });
    }
    persist();
  }

  function update(productId: number, qty: number) {
    const exist = items.value.find(i => i.productId === productId);
    if (exist) {
      exist.qty = Math.max(1, qty);
      persist();
    }
  }

  function remove(productId: number) {
    items.value = items.value.filter(i => i.productId !== productId);
    persist();
  }

  function setSelected(productId: number, selected: boolean) {
    const exist = items.value.find(i => i.productId === productId);
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
    items.value = [];
    persist();
  }

  function clearSelected() {
    items.value = items.value.filter(i => !i.selected);
    persist();
  }

  const enrichedItems = computed<EnrichedCartItem[]>(() => items.value.map(enrich));
  const validItems = computed(() => enrichedItems.value.filter(i => i.available));
  const selectedItems = computed(() => enrichedItems.value.filter(i => i.selected && i.available));

  const count = computed(() => items.value.length);
  const totalQty = computed(() => items.value.reduce((s, i) => s + i.qty, 0));
  const selectedQty = computed(() => selectedItems.value.reduce((s, i) => s + i.qty, 0));
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
    init,
    add,
    update,
    remove,
    setSelected,
    setAllSelected,
    clear,
    clearSelected
  };
});
