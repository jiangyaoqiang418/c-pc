<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { enums } from '@shared';
import { productImageUrl } from '@shared/utils/image';
import { formatCny, formatUsdt } from '@shared/utils/currency';

interface Props {
  product: Api.Product.ProductRecord;
}
const props = defineProps<Props>();

const router = useRouter();
const cover = computed(() => props.product.images?.[0]?.url || productImageUrl(props.product.id, 480, props.product.categoryPath));
const aftersale = computed(() => enums.AFTERSALE_TYPE_META[props.product.aftersaleType]);

function goDetail() {
  router.push({ name: 'product-detail', params: { id: String(props.product.id) } });
}

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23EDECE6%22/></svg>';
function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  img.src = FALLBACK_IMG;
}
</script>

<template>
  <div class="pc-product-card" @click="goDetail">
    <div class="cover-wrap">
      <img :src="cover" :alt="product.title" class="cover" loading="lazy" @error="onImgError" />
      <div v-if="product.overseasCustoms" class="badge overseas">
        <Icon icon="lucide:globe" width="12" /> 海外直邮
      </div>
      <div v-if="product.stock === 0" class="sold-out">
        <span>已售罄</span>
      </div>
    </div>
    <div class="info">
      <div class="brand">{{ product.categoryPath?.split('/').pop() || '油宝甄选' }}</div>
      <div class="title" :title="product.title">{{ product.title }}</div>
      <div class="price-row">
        <span class="cny">{{ formatUsdt(product.price) }}</span>
        <span class="usdt">≈ {{ formatCny(product.price) }}</span>
      </div>
      <div class="tags-row">
        <span class="tag-pill">
          <Icon :icon="aftersale.label.includes('7天') ? 'lucide:refresh-ccw' : aftersale.label.includes('店保') ? 'lucide:shield-check' : aftersale.label.includes('国保') ? 'lucide:badge-check' : 'lucide:x-circle'" width="11" />
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
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s;
  box-shadow: var(--yb-shadow-1);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--yb-hairline);
}
.pc-product-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--yb-shadow-glow);
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
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.pc-product-card:hover .cover {
  transform: scale(1.06);
}
.badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 17, 26, 0.72);
  color: #fff;
  padding: 4px 10px;
  border-radius: var(--yb-radius-pill);
  font-size: 11px;
  font-weight: 500;
}
.badge.overseas {
  background: rgba(184, 147, 90, 0.92);
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
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.brand {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--yb-muted);
  font-weight: 500;
}
.title {
  font-size: 13px;
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
  font-size: 18px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.usdt {
  font-family: var(--yb-font-mono);
  font-size: 10px;
  color: var(--yb-muted);
  font-weight: 500;
}
.tags-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  gap: 6px;
}
.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border-radius: var(--yb-radius-pill);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
.sales {
  font-size: 11px;
  color: var(--yb-faint);
  font-family: var(--yb-font-mono);
}
</style>
