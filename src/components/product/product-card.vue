<script setup lang="ts">
import { computed } from 'vue';
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
const cover = computed(() => props.product.images?.[0]?.url || PRODUCT_IMAGE_PLACEHOLDER);
const aftersale = computed(() => getAftersaleMeta(props.product.aftersaleType));
const categoryCaption = computed(() => {
  const path = props.product.categoryPath;
  if (props.variant === 'home' && path === String(props.product.categoryId)) return '';
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
      <div v-if="product.stock === 0" class="sold-out">
        <span>已售罄</span>
      </div>
    </div>
    <div class="info">
      <div v-if="categoryCaption" class="brand">{{ categoryCaption }}</div>
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
  background: rgba(var(--yb-gold-rgb), 0.92);
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

/* 首页保留此前的完整图片陈列方式，统一为 Umaomao 的轻量商品卡。 */
.pc-product-card.is-home {
  min-width: 0;
  border-radius: 8px;
  border-color: transparent;
  box-shadow: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pc-product-card.is-home:hover {
  transform: none;
  border-color: var(--yb-hairline-2);
  box-shadow: var(--yb-shadow-1);
}
.is-home .cover-wrap {
  background: var(--yb-surface);
  aspect-ratio: 1 / 1;
  padding: 14px;
}
.is-home .cover {
  object-fit: contain;
}
.is-home .info {
  padding: 4px 14px 14px;
  gap: 5px;
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
  align-items: flex-start;
  flex-wrap: wrap;
  row-gap: 6px;
}
.is-home .tag-pill {
  max-width: 100%;
  padding: 2px 5px;
  font-size: 11px;
  border-radius: 4px;
  white-space: normal;
}
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
