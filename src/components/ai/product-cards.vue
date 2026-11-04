<script setup lang="ts">
import ProductSourceBadge from '@/components/common/product-source-badge.vue';
import { ref } from 'vue';
import { productCover } from '@/utils/ai-product';
import { setImageFallback } from '@/utils/image-placeholder';
defineProps<{ card: Api.Ai.ProductListCard; products: Record<string, Api.Ai.CurrentProduct>; loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
const track = ref<HTMLElement>();
function move(direction: number) { track.value?.scrollBy({left: direction * (track.value.clientWidth || 280), behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); }
</script>

<template>
  <section class="ai-products" aria-label="推荐商品" :aria-busy="loading">
    <header><strong>推荐商品</strong><button type="button" class="text-link" :disabled="loading" @click="$emit('retry')">刷新商品信息</button></header>
    <p v-if="loading" role="status">正在查询当前商品信息…</p>
    <p v-else-if="error" role="alert">商品信息暂时无法加载 <button type="button" class="text-link" @click="$emit('retry')">重试</button></p>
    <nav v-if="card.items.length > 1" aria-label="浏览推荐商品"><button type="button" class="text-link" @click="move(-1)">← 上一组</button><button type="button" class="text-link" @click="move(1)">下一组 →</button></nav>
    <div ref="track" class="product-track" tabindex="0" aria-label="推荐商品，可横向滚动" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)">
    <article v-for="(item, index) in card.items" :key="`${item.action.target_id}:${index}`">
      <template v-if="products[item.action.target_id]?.available">
        <template v-for="product in [products[item.action.target_id]]" :key="product.id">
          <template v-if="product.available">
            <img v-if="productCover(product.coverImage)" :src="productCover(product.coverImage)" :alt="product.title" loading="lazy" @error="setImageFallback" />
            <div v-else class="product-placeholder" role="img" aria-label="暂无商品图片">暂无图片</div>
            <div class="product-info">
              <h3><RouterLink :to="{ name: 'product-detail', params: { id: product.id } }"><ProductSourceBadge :source="product.source" />{{ product.title }}</RouterLink></h3>
              <strong class="product-price">{{ product.priceLabel }}</strong>
              <p>库存 {{ product.stock }}<template v-if="product.salesCount"> · 已售 {{ product.salesCount }}</template></p>
              <p v-if="product.sellerName">{{ product.sellerName }}</p>
              <p>{{ product.afterSale || '以商品页说明为准' }}</p>
              <RouterLink class="text-link" :to="{ name: 'product-detail', params: { id: product.id } }">{{ product.hasSku ? '查看商品与规格' : '查看商品详情' }} →</RouterLink>
            </div>
          </template>
        </template>
      </template>
      <div v-else class="product-info"><h3>{{ item.title }}</h3><p>{{ products[item.action.target_id]?.available === false ? '商品暂不可购买' : loading ? '正在加载商品信息…' : '商品信息暂时无法加载' }}</p><button type="button" class="outline" disabled>查看商品详情</button></div>
    </article>
    </div>
  </section>
</template>

<style scoped>
.ai-products { min-width:0; padding:14px; border:1px solid var(--line); border-radius:8px; background:var(--paper); font-size:12px; }
header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
nav { display:flex; justify-content:flex-end; gap:16px; margin:8px 0; }
.product-track { display:flex; gap:12px; max-width:100%; overflow-x:auto; scroll-snap-type:x proximity; overscroll-behavior-x:contain; padding:8px 2px; }
.product-track:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
article { display:flex; flex-direction:column; flex:0 0 min(260px,85%); min-width:0; gap:12px; padding:12px; border:1px solid var(--line); border-radius:8px; scroll-snap-align:start; }

img,.product-placeholder { width:100%; height:140px; flex-shrink:0; border-radius:6px; object-fit:contain; background:var(--soft); }
.product-placeholder { display:grid; place-items:center; color:var(--muted); }
.product-info { min-width:0; flex:1; overflow-wrap:anywhere; }
h3 { margin:0 0 6px; font-size:14px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; white-space:normal; overflow:hidden; }
p { margin:5px 0; color:var(--muted); white-space:pre-wrap; }
.product-price { color:var(--yb-brand-primary,var(--green)); font-size:16px; }
button:disabled { opacity:.6; cursor:not-allowed; }
@media(max-width:640px) { img,.product-placeholder { width:100%; height:120px; } }
</style>
