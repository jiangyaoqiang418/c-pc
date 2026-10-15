<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import { Message } from '@/lib/feedback';
import { getAftersaleMeta } from '@/service/api/product';
import { useProductFavoritesStore } from '@/stores/product-favorites';
import UmIcon from '@/components/common/um-icon.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

interface Props {
  product: Api.RealProduct.DisplayRecord & { brandName?: string };
  demo?: boolean;
  saved?: boolean;
  favoriteDisabled?: boolean;
  favoriteHandler?: (product: Api.RealProduct.DisplayRecord) => void | Promise<void>;
  variant?: 'default' | 'home' | 'catalog';
}
const props = defineProps<Props>();
const router = useRouter();
const userStore = useUserStore();
const favorites = useProductFavoritesStore();
const favoriteState = computed(() => favorites.entries[String(props.product.id)]);
const savedState = computed(() => props.favoriteHandler ? props.saved : favoriteState.value?.value);
const busy = computed(() => favoriteState.value?.loading || favoriteState.value?.writing);
watch(() => [props.product.id, userStore.currentUser?.id, userStore.sessionVersion, props.demo, props.favoriteHandler], () => {
  if (!props.demo && !props.favoriteHandler) favorites.ensure(props.product.id);
}, { immediate: true });
let active = true;
onBeforeUnmount(() => { active = false; });

async function favorite() {
  if (busy.value || props.demo || props.favoriteDisabled) return;
  if (props.favoriteHandler) { await props.favoriteHandler(props.product); return; }
  const userId = userStore.currentUser?.id;
  if (userId === undefined) { Message.warning('请先登录后再收藏'); return; }
  const productId = props.product.id;
  const session = userStore.sessionVersion;
  const isCurrent = () => active && userStore.sessionVersion === session && String(userStore.currentUser?.id) === String(userId) && String(props.product.id) === String(productId);
  try {
    const result = await favorites.toggle(productId);
    if (isCurrent()) {
      if (result !== undefined) Message.success(result ? '已收藏' : '已取消收藏');
    }
  } catch (error) {
    if (isCurrent()) Message.error(error instanceof Error ? error.message : '收藏状态待确认，请点击重试');
  }
}

const cover = computed(() => props.product.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER);
const aftersale = computed(() => getAftersaleMeta(props.product.aftersaleType));
const categoryCaption = computed(() => {
  const path = props.product.categoryPath;
  return path === String(props.product.categoryId) ? '' : path?.split('/').pop() || '';
});
// Group precise API decimal strings without converting them through a floating-point number.
const price = computed(() => {
  const match = String(props.product.price ?? '').trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  const fraction = match[3]?.replace(/0+$/, '');
  return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
});

function goDetail() {
  if (props.demo) {
    void router.push({ name: 'product-list', query: { keyword: props.product.title } });
  } else {
    void router.push({ name: 'product-detail', params: { id: String(props.product.id) } });
  }
}
</script>

<template>
  <article class="product-card" :class="{ 'is-home': variant === 'home', 'is-catalog': variant === 'catalog' }">
    <div class="meme-card-top">
      <span>{{ product.brandName }}</span><small :title="String(product.id)">ITEM #{{ String(product.id).padStart(3, '0') }}</small>
    </div>
    <div class="product-image">
      <button type="button" class="image-button" :aria-label="'查看 ' + product.title" @click="goDetail">
        <img :src="cover" :alt="product.title" loading="lazy" @error="setImageFallback" />
      </button>
      <span v-if="!product.stock" class="tag">已售罄</span>
      <span v-else-if="product.overseasCustoms" class="tag">海外直邮</span>
      <button type="button" class="favorite icon-btn" :class="{ saved:savedState }" :disabled="busy || demo || favoriteDisabled"
        :title="favoriteState?.error" :aria-label="(favoriteState?.error ? '重试读取收藏状态 ' : savedState ? '取消收藏 ' : '收藏 ') + product.title" :aria-pressed="savedState" @click="favorite">
        <UmIcon name="heart" />
      </button>
      <button type="button" class="quick-view" @click="goDetail">探索商品 <UmIcon name="arrow" /></button>
    </div>
    <div class="product-meta">
      <span>{{ product.brandName }} <small>{{ categoryCaption }}</small></span>
      <button type="button" class="product-name" :title="product.title" @click="goDetail">{{ product.title }}</button>
      <p>{{ product.summary }}</p>
      <div class="product-price">{{ price }} <small>USDT</small><span aria-hidden="true">↗</span>
        <button type="button" class="meme-card-open" :aria-label="'选购 ' + product.title" @click="goDetail"><UmIcon name="arrow" /></button>
      </div>
      <div class="product-service">{{ aftersale.label }} <span>已售 {{ product.salesCount ?? '—' }}</span></div>
    </div>
  </article>
</template>

<style scoped>
/* Production Long IDs retain their full value without changing the reference card width. */
.meme-card-top > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meme-card-top > span { min-width: 0; }
.product-name:focus-visible, .image-button:focus-visible, .meme-card-open:focus-visible { outline: 3px solid var(--gold); outline-offset: -3px; }
@media (prefers-reduced-motion: reduce) {
  .product-card, .product-image img, .quick-view, .favorite { transition: none !important; }
  .product-card:hover, .product-card:hover .product-image img { transform: none !important; }
}
</style>
