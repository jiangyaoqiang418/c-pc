<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import { Message } from '@/lib/feedback';
import { getAftersaleMeta, toggleProductFavorite } from '@/service/api/product';
import UmIcon from '@/components/common/um-icon.vue';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

// Brand metadata is optional until B01 is supplied by the real API. Never infer it from a category.
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
const favoriting = ref(false);
let active = true;
onBeforeUnmount(() => { active = false; });

async function favorite() {
  if (favoriting.value || props.demo || props.favoriteDisabled) return;
  if (props.favoriteHandler) { await props.favoriteHandler(props.product); return; }
  const userId = userStore.currentUser?.id;
  if (userId === undefined) { Message.warning('请先登录后再收藏'); return; }
  const productId = props.product.id;
  favoriting.value = true;
  try {
    await toggleProductFavorite(productId, { showError: false });
    // This endpoint does not return the selected state. Do not invent an optimistic saved flag.
    if (active && String(userStore.currentUser?.id) === String(userId) && String(props.product.id) === String(productId)) {
      Message.success('收藏状态已更新，可在我的收藏查看');
    }
  } catch {
    if (active && String(userStore.currentUser?.id) === String(userId)) Message.error('收藏失败，请稍后重试');
  } finally { if (active) favoriting.value = false; }
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
      <button type="button" class="favorite icon-btn" :class="{ saved }" :disabled="favoriting || demo || favoriteDisabled"
        :aria-label="(saved ? '取消收藏 ' : '收藏 ') + product.title" :aria-pressed="saved" @click="favorite">
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
      <div class="product-service">{{ aftersale.label }} <span>已售 {{ product.salesCount || 0 }}</span></div>
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
