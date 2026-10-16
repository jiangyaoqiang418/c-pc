<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import QuantityStepper from '@/components/common/quantity-stepper.vue';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { getAftersaleMeta } from '@/service/api/product';
import { useCartStore, useUserStore } from '@/stores';
import { createCheckoutIntent, formatPaymentAmount as formatAmount } from '@/utils/checkout';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import { sameSkuId } from '@/utils/product-sku';

const router = useRouter();
const cart = useCartStore();
const userStore = useUserStore();
let removalVersion = 0;
let removalModal: ReturnType<typeof Modal.confirm> | undefined;

function closeRemoval() {
  removalVersion += 1;
  removalModal?.close();
  removalModal = undefined;
}
onBeforeUnmount(closeRemoval);
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], closeRemoval);

const items = computed(() => cart.enrichedItems);
const selection = computed(() => cart.allSelected ? true : items.value.some(item => item.selected) ? 'indeterminate' as const : false);
const hasUnconfirmedSelection = computed(() => items.value.some(item => item.selected && !item.available));
const checkoutDisabledReason = computed(() => {
  if (cart.mutating) return '购物车正在同步，请稍候再结算';
  if (items.value.some(item => item.selected && !item.available)) return '已选商品尚未全部确认可购，请重试读取或调整数量和勾选';
  if (cart.selectedQty === 0) return '请先勾选至少一件可购商品';
  return '';
});

function setAll(checked: boolean) {
  cart.setAllSelected(checked);
}

function remove(productId: string | number, skuId?: string | number) {
  if (removalModal) return;
  const userId = userStore.currentUser?.id;
  const addedAt = cart.items.find(item => String(item.productId) === String(productId) && sameSkuId(item.skuId, skuId))?.addedAt;
  const operation = ++removalVersion;
  removalModal = Modal.confirm({
    title: '从购物袋移除？',
    content: '该商品将从购物袋删除',
    onCancel() {
      if (operation === removalVersion) removalModal = undefined;
    },
    async onOk() {
      if (operation !== removalVersion || String(userStore.currentUser?.id) !== String(userId)) return;
      removalModal = undefined;
      if (!cart.items.some(item => String(item.productId) === String(productId) && sameSkuId(item.skuId, skuId) && item.addedAt === addedAt)) return;
      const removed = await cart.remove(productId, skuId);
      if (removed && operation === removalVersion && String(userStore.currentUser?.id) === String(userId)) Message.success('已移除');
    }
  });
}

async function clearInvalid() {
  const operation = removalVersion;
  const userId = userStore.currentUser?.id;
  const results = await Promise.all(items.value.filter(i => i.confirmedInvalid).map(i => cart.remove(i.productId, i.skuId)));
  if (operation === removalVersion && String(userStore.currentUser?.id) === String(userId) && results.length && results.every(Boolean)) Message.success('已清理失效商品');
}

function goCheckout() {
  if (cart.cacheError) {
    Message.warning(cart.cacheError);
    return;
  }
  if (cart.mutating) {
    Message.warning('购物车正在同步，请稍候再结算');
    return;
  }
  if (items.value.some(item => item.selected && !item.available)) {
    Message.warning('已选商品尚未全部确认可购，请重试读取或调整数量和勾选');
    return;
  }
  if (cart.selectedQty === 0) {
    Message.warning('请先勾选至少一件可购商品');
    return;
  }
  if (!userStore.currentUser) {
    const contextId = createCheckoutIntent(cart.selectedItems.map(item => ({ productId: item.productId, skuId:item.skuId, confirmedUnitPrice:item.unitPrice, quantity: item.qty })));
    router.push({ path: '/checkout', query: { contextId } });
  } else {
    router.push('/checkout');
  }
}

onMounted(() => {
  cart.refresh();
});
</script>

<template>
  <div class="cart-page">
    <div class="page-heading compact"><h1>购物袋</h1><span class="heading-meta">{{ cart.totalQty }} 件商品</span></div>
    <div v-if="cart.cacheError" class="empty paper" role="alert">
      <UmIcon name="bag" /><h2>购物袋读取失败</h2><p>{{ cart.cacheError }}</p>
      <button type="button" class="primary" @click="cart.retryLoad">重新读取</button>
    </div>
    <div v-else-if="items.length" class="cart-layout">
      <section class="paper cart-list" aria-label="购物袋商品" :aria-busy="cart.mutating">
        <div class="section-heading">
          <label><input type="checkbox" :checked="selection === true" :indeterminate="selection === 'indeterminate'" :disabled="cart.mutating" aria-label="全选购物袋商品" @change="setAll(($event.target as HTMLInputElement).checked)" />全选商品</label>
          <span>{{ cart.selectedQty }} 件已选</span>
        </div>
        <article v-for="item in items" :key="JSON.stringify([String(item.productId),item.skuId === undefined ? null : String(item.skuId)])" class="cart-item" :class="{ invalid: item.confirmedInvalid }">
          <input type="checkbox" :checked="item.selected" :disabled="cart.mutating || (!item.available && !item.selected)" :aria-label="`选择 ${item.product?.title || '商品'} ${item.specText}`" @change="cart.setSelected(item.productId, ($event.target as HTMLInputElement).checked, item.skuId)" />
          <img :src="item.image || PRODUCT_IMAGE_PLACEHOLDER" :alt="item.product?.title || '商品图片'" :tabindex="item.product ? 0 : undefined" :role="item.product ? 'link' : undefined" @error="setImageFallback" @click="item.product && router.push(`/product/${item.productId}`)" @keydown.enter="item.product && router.push(`/product/${item.productId}`)" />
          <div class="cart-product">
            <RouterLink v-if="item.product" :to="`/product/${item.productId}`" class="item-name">{{ item.product.title }}</RouterLink>
            <span v-else class="item-name">{{ item.loadState === 'error' ? '商品读取失败' : '商品加载中' }}</span>
            <p v-if="item.product">{{ getAftersaleMeta(item.product.aftersaleType).label }}<template v-if="item.product.sellerName"> · 买手 {{ item.product.sellerName }}</template></p>
            <p v-if="item.specText">{{ item.specText }}</p>
            <span v-if="item.product?.overseasCustoms" class="tag inline">海外直邮</span>
            <p v-if="item.confirmedInvalid" class="cart-item-notice danger">商品已失效，请移除后重新选择</p>
            <p v-else-if="item.loadState === 'loading'" class="cart-item-notice" role="status">正在读取商品信息</p>
            <button v-else-if="item.loadState === 'error'" type="button" class="text-link cart-retry" @click="cart.refresh()">读取失败，重新读取</button>
            <p v-else-if="item.skuSelectionRequired" class="cart-item-notice">商品已更新规格，请返回商品页重新选购</p>
            <p v-else-if="!item.available" class="cart-item-notice">请检查数量或商品信息</p>
            <QuantityStepper class="cart-quantity" :model-value="item.qty" :max="item.stock || 1" :disabled="cart.mutating || item.loadState !== 'ready' || item.confirmedInvalid || item.skuSelectionRequired" :label="`${item.product?.title || '商品'}数量`" @update:model-value="value => cart.update(item.productId, value, item.skuId)" />
          </div>
          <div class="cart-item-end">
            <b v-if="item.available">{{ formatAmount(item.subtotal) }} <small>USDT</small></b>
            <small v-else>金额待确认</small>
            <button type="button" :disabled="cart.mutating" :aria-label="`移除 ${item.product?.title || '商品'} ${item.specText}`" @click="remove(item.productId, item.skuId)"><UmIcon name="trash" /></button>
          </div>
        </article>
        <button v-if="items.some(item => item.confirmedInvalid)" type="button" class="text-link clear-invalid" :disabled="cart.mutating" @click="clearInvalid">清理失效商品</button>
      </section>
      <aside class="paper summary-card" aria-label="购物袋小计">
        <h2>购物袋小计</h2>
        <div class="money-row"><span>商品金额</span><b>{{ hasUnconfirmedSelection ? '待确认' : `${formatAmount(cart.subTotal)} USDT` }}</b></div>
        <p>运费与税费将在结算页清晰列出。</p>
        <div class="summary-total"><span>合计</span><b>{{ hasUnconfirmedSelection ? '待确认' : formatAmount(cart.subTotal) }}<small v-if="!hasUnconfirmedSelection"> USDT</small></b></div>
        <button type="button" class="gold full" :disabled="!!checkoutDisabledReason" :aria-describedby="checkoutDisabledReason ? 'cart-checkout-reason' : undefined" @click="goCheckout">去结算 · {{ cart.selectedQty }} 件 <UmIcon name="arrow" /></button>
        <p v-if="checkoutDisabledReason" id="cart-checkout-reason" class="cart-checkout-reason" role="status">{{ checkoutDisabledReason }}</p>
        <button type="button" class="text-link full" @click="router.push('/product/list')">继续发现好物 →</button>
      </aside>
    </div>
    <div v-else class="empty paper"><UmIcon name="bag" /><h2>购物袋还是空的</h2><p>先去发现一些值得喜欢的好物吧。</p><button type="button" class="primary" @click="router.push('/product/list')">开始探索 <UmIcon name="arrow" /></button></div>
  </div>
</template>

<style scoped>
.cart-product { min-width:0; }
.item-name { overflow-wrap:anywhere; }
.cart-item.invalid > img { opacity:.55; }
.cart-item > img:focus-visible { outline:3px solid var(--gold); outline-offset:4px; }
.cart-item-notice { color:var(--muted); }
.cart-item-notice.danger { color:var(--yb-danger); }
.cart-retry { margin:5px 0 10px; }
.clear-invalid { margin-top:16px; }
.cart-checkout-reason { margin-top:12px; color:var(--muted); }
.cart-quantity :deep(.quantity-stepper) { height:34px; border-color:var(--ui-dce1d3,#dce1d3); border-radius:4px; background:var(--paper); }
.cart-quantity :deep(.quantity-stepper button) { width:32px; height:32px; color:var(--ui-718267,#718267); }
.cart-quantity :deep(.quantity-input) { width:34px; height:32px; font-size:11px; padding:0; background:transparent; box-shadow:none; }
@media (max-width:700px) {
  .cart-item { display:grid; grid-template-columns:16px auto minmax(0,1fr); row-gap:10px; }
  .cart-item > img { grid-column:2; grid-row:1 / 3; }
  .cart-product { grid-column:3; grid-row:1; }
  .cart-item .item-name { display:block; padding-right:32px; }
  .cart-item-end { position:static; grid-column:3; grid-row:2; min-width:0; align-items:flex-end; }
  .cart-item-end b { max-width:100%; white-space:normal; overflow-wrap:anywhere; text-align:right; }
  .cart-item-end button { top:14px; right:0; width:32px; height:32px; display:grid; place-items:center; }
  .cart-quantity :deep(.quantity-stepper) { height:46px; }
  .cart-quantity :deep(.quantity-stepper button),.cart-quantity :deep(.quantity-input) { width:44px; height:44px; }
  .cart-quantity :deep(.quantity-input) { font-size:16px; }
  .summary-card :is(.money-row,.summary-total) { flex-wrap:wrap; gap:8px 15px; }
  .summary-card :is(.money-row,.summary-total) > b { min-width:0; max-width:100%; margin-left:auto; overflow-wrap:anywhere; text-align:right; }
}
</style>
