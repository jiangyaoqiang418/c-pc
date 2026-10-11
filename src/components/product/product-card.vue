<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useUserStore } from '@/stores';
import { Message } from '@/lib/feedback';
import { toggleProductFavorite } from '@/service/api/product';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getAftersaleMeta } from '@/service/api/product';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';

interface Props {
  product: Api.RealProduct.DisplayRecord;
  demo?: boolean;
  variant?: 'default' | 'home';
}
const props = defineProps<Props>();

const router = useRouter();
const userStore = useUserStore();
const favoriting = ref(false);
let active = true;
onBeforeUnmount(() => { active = false; });
async function favorite() {
  if (favoriting.value || props.demo) return;
  const userId = userStore.currentUser?.id;
  if (userId === undefined) { Message.warning('请先登录后再收藏'); return; }
  const productId = props.product.id;
  favoriting.value = true;
  try {
    await toggleProductFavorite(productId, { showError: false });
    if (active && String(userStore.currentUser?.id) === String(userId) && String(props.product.id) === String(productId)) Message.success('收藏状态已更新，可在我的收藏查看');
  } catch {
    if (active && String(userStore.currentUser?.id) === String(userId)) Message.error('收藏失败，请稍后重试');
  } finally { if (active) favoriting.value = false; }
}
const cover = computed(() => props.product.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER);
const aftersale = computed(() => getAftersaleMeta(props.product.aftersaleType));
const categoryCaption = computed(() => {
  const path = props.product.categoryPath;
  if (path === String(props.product.categoryId)) return '';
  return path?.split('/').pop() || '';
});

function goDetail() {
  if (props.demo) {
    router.push({ name: 'product-list', query: { keyword: props.product.title } });
    return;
  }
  router.push({ name: 'product-detail', params: { id: String(props.product.id) } });
}

</script>

<template>
  <div
    class="pc-product-card"
    :class="{ 'is-home': variant === 'home' }"
    role="link"
    :aria-label="demo ? `搜索真实商品：${product.title}` : `查看商品：${product.title}`"
    tabindex="0"
    @click="goDetail"
    @keydown.enter="goDetail"
    @keydown.space.prevent="goDetail"
  >
    <div class="cover-wrap">
      <img :src="cover" :alt="product.title" class="cover" loading="lazy" @error="setImageFallback" />
      <div v-if="product.overseasCustoms" class="badge overseas">
        <Icon icon="lucide:globe" width="12" /> 海外直邮
      </div>
      <button v-if="!demo" type="button" class="favorite-button" :aria-label="`收藏 ${product.title}`" :disabled="favoriting" @click.stop="favorite" @keydown.stop><Icon :icon="favoriting ? 'lucide:loader-circle' : 'lucide:heart'" width="18" :class="{ 'animate-spin': favoriting }" /></button>
      <div v-if="product.stock === 0" class="sold-out">
        <span>已售罄</span>
      </div>
    </div>
    <div class="info">
      <div v-if="categoryCaption || variant !== 'home'" class="brand" :aria-hidden="!categoryCaption">{{ categoryCaption }}</div>
      <div class="title" :title="product.title">{{ product.title }}</div>
      <div class="price-row">
        <span class="cny">{{ formatUsdt(product.price) }}</span>
        <span class="usdt">≈ {{ formatCny(product.price) }}</span>
      </div>
      <div class="tags-row">
        <span class="tag-pill">
          <Icon :icon="product.aftersaleType === 'unknown' ? 'lucide:circle-help' : aftersale.label.includes('7天') ? 'lucide:refresh-ccw' : aftersale.label.includes('店保') ? 'lucide:shield-check' : aftersale.label.includes('国保') ? 'lucide:badge-check' : 'lucide:x-circle'" width="11" />
          {{ aftersale.label }}
        </span>
        <span class="sales">销量 {{ product.salesCount || 0 }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.favorite-button { position:absolute; top:10px; right:10px; z-index:2; display:grid; place-items:center; width:34px; height:34px; background:var(--yb-paper); color:var(--yb-primary); border:1px solid var(--yb-hairline); border-radius:50%; opacity:0; transform:translateY(-3px); transition:opacity 160ms, transform 160ms; cursor:pointer; }
.pc-product-card:hover .favorite-button, .pc-product-card:focus-within .favorite-button { opacity:1; transform:none; }
.favorite-button:focus-visible { outline:2px solid var(--yb-primary); outline-offset:2px; }
.favorite-button:disabled { cursor:wait; }
@media (hover:none), (prefers-reduced-motion:reduce) { .favorite-button { opacity:1; transform:none; transition:none; } }
.pc-product-card:not(.is-home) { background: transparent; border: 0; box-shadow: none; border-radius: 0; overflow: visible; }
.pc-product-card:not(.is-home):hover { transform: none; box-shadow: none; }
.pc-product-card:not(.is-home) .cover-wrap { border-radius: 6px; }
.pc-product-card:not(.is-home) .info { padding: 16px 0 0; }
.pc-product-card:not(.is-home) .price-row { margin-top: 0; }
.pc-product-card:not(.is-home) .tags-row { border-top: 1px solid var(--yb-hairline); padding-top: 10px; }
.pc-product-card .cny { font-family: var(--yb-font-body); font-weight: 700; letter-spacing: 0; line-height: 1.35; }
.pc-product-card .usdt, .pc-product-card .sales { font-family: var(--yb-font-body); font-weight: 400; }
.pc-product-card:not(.is-home) .tag-pill { padding: 0; background: transparent; color: var(--yb-muted); border-radius: 0; font-weight: 400; }
.pc-product-card {
  background: var(--yb-surface);
  border-radius: var(--yb-radius-card);
  overflow: hidden;
  cursor: pointer;
  transition: transform 200ms var(--um-ease), box-shadow 200ms var(--um-ease), border-color 150ms;
  box-shadow: var(--yb-shadow-1);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--yb-hairline);
}
.pc-product-card:hover {
  transform: translateY(-2px);
  border-color: var(--yb-hairline-2);
  box-shadow: var(--yb-shadow-glow);
}
.pc-product-card:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: -2px;
}
.cover-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--yb-hairline);
  overflow: hidden;
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 200ms var(--um-ease);
}
.pc-product-card:hover .cover {
  transform: scale(1.03);
}
.badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(32, 56, 46, 0.72);
  color: #fff;
  padding: 4px 10px;
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 500;
}
.badge.overseas {
  background: var(--yb-paper);
  color: var(--yb-primary);
  border-radius: 4px;
  padding: 3px 7px;
}
.sold-out {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(250, 250, 247, 0.88);
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-muted);
  letter-spacing: 2px;
}
.info {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.brand {
  min-height:18px;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--yb-muted);
  font-weight: 500;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: var(--yb-ink);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  min-height: 2.9em;
  letter-spacing: -0.005em;
}
.price-row {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  gap: 2px;
}
.cny {
  font-family: var(--yb-font-mono);
  font-size: 23px;
  font-weight: 650;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.usdt {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  color: var(--yb-muted);
  font-weight: 500;
}
.tags-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: 8px;
  gap: 8px;
}
.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border-radius: var(--yb-radius-pill);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.sales {
  font-size: 12px;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
}

/* 首页使用新版图片主导的轻量商品陈列。 */
.pc-product-card.is-home {
  min-width: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: visible;
  box-shadow: none;
}
.pc-product-card.is-home:hover {
  transform: none;
  box-shadow: none;
}
.is-home .cover-wrap {
  background: var(--yb-surface);
  border-radius: 6px;
  aspect-ratio: 1 / 1;
  padding: 0;
}
.is-home .cover {
  object-fit: cover;
}
.is-home .info {
  padding: 14px 0 0;
  gap: 6px;
}
.is-home .brand {
  font-size: 11px;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-home .title {
  font-size: 16px;
  font-weight: 600;
  display: block;
  min-height: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.is-home .cny {
  font-family: var(--yb-font-body);
  font-size: 23px;
  line-height: 1.4;
}
.is-home .usdt {
  font-size: 11px;
}
.is-home .tags-row {
  border-top: 1px solid var(--yb-hairline);
  padding-top: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
  row-gap: 6px;
}
.is-home .tag-pill {
  max-width: 100%;
  padding: 0;
  background: transparent;
  color: var(--yb-muted);
  font-size: 11px;
  border-radius: 4px;
  white-space: normal;
}
.is-home .favorite-button { opacity: 1; transform: none; }
.is-home .badge.overseas {
  background: var(--yb-accent);
  color: var(--yb-accent-ink);
  border-radius: 4px;
  padding: 3px 6px;
}
@media (prefers-reduced-motion: reduce) {
  .pc-product-card, .cover { transition: none; }
  .pc-product-card:hover, .pc-product-card:hover .cover { transform: none; }
}
</style>
