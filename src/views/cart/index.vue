<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import QuantityStepper from '@/components/common/quantity-stepper.vue';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { getAftersaleMeta } from '@/service/api/product';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import EmptyState from '@/components/common/empty-state.vue';
import PriceTag from '@/components/product/price-tag.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import { useCartStore, useUserStore } from '@/stores';
import { createCheckoutIntent } from '@/utils/checkout';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

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
watch(() => userStore.currentUser?.id, closeRemoval);

const items = computed(() => cart.enrichedItems);
const selection = computed(() => cart.allSelected ? true : items.value.some(item => item.selected) ? 'indeterminate' as const : false);
const checkoutDisabledReason = computed(() => {
  if (cart.mutating) return '购物车正在同步，请稍候再结算';
  if (items.value.some(item => item.selected && !item.available)) return '已选商品尚未全部确认可购，请重试读取或调整数量和勾选';
  if (cart.selectedQty === 0) return '请先勾选至少一件可购商品';
  return '';
});

function setAll(checked: boolean) {
  cart.setAllSelected(checked);
}

function remove(productId: string | number) {
  if (removalModal) return;
  const userId = userStore.currentUser?.id;
  const addedAt = cart.items.find(item => String(item.productId) === String(productId))?.addedAt;
  const operation = ++removalVersion;
  removalModal = Modal.confirm({
    title: '从购物车移除？',
    content: '该商品将从购物车删除',
    onCancel() {
      if (operation === removalVersion) removalModal = undefined;
    },
    async onOk() {
      if (operation !== removalVersion || String(userStore.currentUser?.id) !== String(userId)) return;
      removalModal = undefined;
      if (!cart.items.some(item => String(item.productId) === String(productId) && item.addedAt === addedAt)) return;
      if (await cart.remove(productId)) Message.success('已移除');
    }
  });
}

async function clearInvalid() {
  const results = await Promise.all(items.value.filter(i => i.confirmedInvalid).map(i => cart.remove(i.productId)));
  if (results.every(Boolean)) Message.success('已清理失效商品');
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
    const contextId = createCheckoutIntent(cart.selectedItems.map(item => ({ productId: item.productId, quantity: item.qty })));
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
  <div class="cart-page shop-container">
    <header class="page-heading"><div><p class="eyebrow">YOUR SELECTION</p><h1>购物车 <span v-if="items.length">{{ cart.totalQty }} 件商品</span></h1></div><RouterLink to="/product/list" class="continue-link">继续逛逛 <Icon icon="lucide:arrow-right" width="16" /></RouterLink></header>
    <Alert v-if="cart.cacheError" variant="destructive" class="error-panel">
      <AlertTitle>购物车读取失败</AlertTitle><AlertDescription>{{ cart.cacheError }}</AlertDescription>
      <Button variant="outline" class="retry-button" @click="cart.retryLoad">重新读取</Button>
    </Alert>
    <div v-else-if="items.length" class="cart-layout">
      <section class="cart-card" aria-label="购物车商品">
        <div class="cart-toolbar">
          <label class="check-label"><Checkbox :model-value="selection" aria-label="全选购物车商品" @update:model-value="value => setAll(value === true)"><Icon :icon="selection === 'indeterminate' ? 'lucide:minus' : 'lucide:check'" width="14" /></Checkbox>全选商品</label>
          <Button variant="ghost" size="sm" :disabled="cart.mutating || !items.some(item => item.confirmedInvalid)" @click="clearInvalid">清理失效商品</Button>
        </div>
        <article v-for="item in items" :key="item.productId" class="cart-item" :class="{ invalid: !item.available }">
          <Checkbox class="item-check" :model-value="item.selected" :disabled="!item.available && !item.selected" :aria-label="`选择 ${item.product?.title || '商品'}`" @update:model-value="value => cart.setSelected(item.productId, value === true)" />
          <img :src="item.product?.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="item.product?.title || '商品图片'" class="cover" @error="setImageFallback" />
          <div class="product-info">
            <RouterLink v-if="item.product" :to="`/product/${item.productId}`" class="product-title">{{ item.product.title }}</RouterLink>
            <div v-else class="product-title">{{ item.loadState === 'error' ? '商品读取失败' : '商品加载中' }}</div>
            <div class="product-tags">
              <span v-if="item.product" class="product-tag">{{ getAftersaleMeta(item.product.aftersaleType).label }}</span>
              <span v-if="item.product?.overseasCustoms" class="product-tag overseas">海外直邮</span>
              <span class="seller">买手 · {{ item.product?.sellerName || '—' }}</span>
            </div>
            <p v-if="item.confirmedInvalid" class="item-notice danger">商品已失效，请移除后重新选择</p>
            <p v-else-if="item.loadState === 'loading'" class="item-notice"><Icon icon="lucide:loader-circle" width="14" class="animate-spin" />正在读取商品信息</p>
            <Button v-else-if="item.loadState === 'error'" variant="link" size="sm" class="retry-link" @click="cart.refresh()">读取失败，重新读取</Button>
            <p v-else-if="!item.available" class="item-notice">请检查数量或商品信息</p>
            <PriceTag v-if="item.product" :price="item.product.price" size="sm" :show-rate="false" />
            <span v-else class="price-pending">单价待读取</span>
          </div>
          <div class="item-actions">
            <QuantityStepper :model-value="item.qty" :max="item.product?.stock || 1" :disabled="cart.mutating || item.loadState !== 'ready' || item.confirmedInvalid" :label="`${item.product?.title || '商品'}数量`" @update:model-value="value => cart.update(item.productId, value)" />
            <div v-if="item.product" class="line-total">{{ formatUsdt(item.subtotal) }}<small>≈ {{ formatCny(item.subtotal) }}</small></div>
            <Button variant="ghost" size="sm" class="remove-button" :disabled="cart.mutating" @click="remove(item.productId)"><Icon icon="lucide:trash-2" width="14" />移除</Button>
          </div>
        </article>
      </section>
      <aside class="summary-card" aria-label="结算明细">
        <h2>订单小计</h2><p class="selection-meta">已选 {{ cart.selectedQty }} 件 / 共 {{ cart.totalQty }} 件</p>
        <dl class="summary-list">
          <div><dt>商品合计</dt><dd>{{ formatUsdt(cart.subTotal) }}<small>≈ {{ formatCny(cart.subTotal) }}</small></dd></div>
          <div><dt>运费</dt><dd>{{ formatUsdt(cart.shippingFeeTotal) }}</dd></div>
          <div><dt>税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="13" /></dt><dd>{{ formatUsdt(cart.taxTotal) }}</dd></div>
        </dl>
        <div class="total-block"><span>应付总额</span><strong>{{ formatUsdt(cart.grandTotal) }}</strong><small>≈ {{ formatCny(cart.grandTotal) }}</small></div>
        <TooltipProvider><Tooltip><TooltipTrigger as-child><span class="checkout-trigger" :tabindex="checkoutDisabledReason ? 0 : undefined"><Button class="checkout-button" size="lg" :disabled="!!checkoutDisabledReason" @click="goCheckout">去结算（{{ cart.selectedQty }}）<Icon icon="lucide:arrow-right" width="16" /></Button></span></TooltipTrigger><TooltipContent v-if="checkoutDisabledReason">{{ checkoutDisabledReason }}</TooltipContent></Tooltip></TooltipProvider>
        <p class="rate-note">{{ priceSet(cart.grandTotal).rateLabel }}<br />本地参考折算，以 USDT 结算</p>
      </aside>
    </div>
    <EmptyState v-else title="购物车空空如也" description="去首页发现喜欢的商品吧" action-text="去逛逛" @action="router.push('/')" />
  </div>
</template>

<style scoped>
.cart-page { padding-top: 24px; }
.page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.eyebrow { color: var(--yb-gold); font-size: 12px; font-weight: 600; letter-spacing: .12em; margin: 0 0 5px; }
h1 { margin: 0; font-size: 28px; font-weight: 650; color: var(--yb-ink); }
h1 span { margin-left: 12px; font-size: 14px; font-weight: 400; color: var(--yb-muted); }
.continue-link { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--yb-primary); }
.cart-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
.cart-card, .summary-card { border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); }
.cart-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-bottom: 1px solid var(--yb-hairline); }
.check-label { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
.cart-item { display: grid; grid-template-columns: 16px 112px minmax(0, 1fr) 142px; gap: 20px; align-items: start; padding: 24px; border-bottom: 1px solid var(--yb-hairline); }
.cart-item:last-child { border-bottom: 0; }
.cart-item.invalid .cover { opacity: .55; }
.item-check { margin-top: 4px; }
.cover { width: 112px; height: 112px; border: 1px solid var(--yb-hairline); border-radius: 8px; object-fit: contain; background: var(--yb-fill); }
.product-info { min-width: 0; }
.product-title { display: block; font-size: 16px; font-weight: 600; color: var(--yb-ink); overflow-wrap: anywhere; }
a.product-title:hover { color: var(--yb-primary); }
.product-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.product-tag { font-size: 12px; padding: 2px 6px; border-radius: 4px; background: var(--yb-fill); color: var(--yb-primary); }
.product-tag.overseas { color: var(--yb-gold); background: var(--yb-champagne); }
.seller, .price-pending, .selection-meta { color: var(--yb-muted); font-size: 13px; }
.item-notice { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--yb-muted); margin: 0 0 10px; }
.danger, .remove-button { color: var(--yb-danger); }
.retry-link { padding: 0; height: auto; margin-bottom: 10px; }
.item-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 14px; }
.line-total { font-size: 16px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.line-total small, .summary-list small { display: block; color: var(--yb-muted); font-size: 12px; font-weight: 400; }
.summary-card { padding: 24px; position: sticky; top: 24px; }
.summary-card h2 { font-size: 20px; font-weight: 650; margin: 0 0 6px; }
.selection-meta { margin: 0 0 20px; }
.summary-list { display: grid; gap: 16px; margin: 0; }
.summary-list > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.summary-list dt { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: var(--yb-muted); }
.summary-list dd { text-align: right; margin: 0; font-size: 14px; font-weight: 600; }
.total-block { margin: 20px 0; padding-top: 20px; border-top: 1px solid var(--yb-hairline); display: grid; gap: 5px; }
.total-block > span { font-size: 14px; }
.total-block strong { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
.total-block small, .rate-note { color: var(--yb-muted); font-size: 12px; }
.checkout-trigger, .checkout-button { width: 100%; }
.rate-note { margin: 14px 0 0; }
.error-panel { padding: 24px; }
.retry-button { margin-top: 16px; }
@media (max-width: 1100px) { .cart-layout { grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; } .cart-item { grid-template-columns: 16px 80px minmax(0, 1fr) 120px; padding: 20px; gap: 12px; } .cover { width: 80px; height: 80px; } .summary-card { padding: 20px; } }
@media (max-width: 800px) { .cart-layout { grid-template-columns: 1fr; } .summary-card { position: static; } }
</style>
