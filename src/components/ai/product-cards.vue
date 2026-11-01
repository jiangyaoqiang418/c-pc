<script setup lang="ts">
import { productCover } from '@/utils/ai-product';
import { setImageFallback } from '@/utils/image-placeholder';
defineProps<{ card: Api.Ai.ProductListCard; products: Record<string, Api.Ai.CurrentProduct>; loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="ai-products" aria-label="推荐商品" :aria-busy="loading">
    <header><strong>推荐商品</strong><button type="button" class="text-link" :disabled="loading" @click="$emit('retry')">刷新商品信息</button></header>
    <p v-if="loading" role="status">正在查询当前商品信息…</p>
    <p v-else-if="error" role="alert">商品信息暂时无法加载 <button type="button" class="text-link" @click="$emit('retry')">重试</button></p>
    <article v-for="(item, index) in card.items" :key="`${item.action.target_id}:${index}`">
      <template v-if="products[item.action.target_id]?.available">
        <template v-for="product in [products[item.action.target_id]]" :key="product.id">
          <template v-if="product.available">
            <img v-if="productCover(product.coverImage)" :src="productCover(product.coverImage)" :alt="product.title" loading="lazy" @error="setImageFallback" />
            <div v-else class="product-placeholder" role="img" aria-label="暂无商品图片">暂无图片</div>
            <div class="product-info">
              <h3><RouterLink :to="{ name: 'product-detail', params: { id: product.id } }">{{ product.title }}</RouterLink></h3>
              <p v-if="product.brief">{{ product.brief }}</p>
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
  </section>
</template>

<style scoped>
.ai-products { min-width:0; padding:14px; border:1px solid var(--line); border-radius:8px; background:var(--paper); font-size:12px; }
header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
article { display:flex; gap:12px; padding:14px 0; }
article + article { border-top:1px solid var(--line); }
img,.product-placeholder { width:88px; height:88px; flex-shrink:0; border-radius:6px; object-fit:contain; background:var(--soft); }
.product-placeholder { display:grid; place-items:center; color:var(--muted); }
.product-info { min-width:0; flex:1; overflow-wrap:anywhere; }
h3 { margin:0 0 6px; font-size:14px; white-space:pre-wrap; }
p { margin:5px 0; color:var(--muted); white-space:pre-wrap; }
.product-price { color:var(--green); font-size:16px; }
button:disabled { opacity:.6; cursor:not-allowed; }
@media(max-width:640px) { img,.product-placeholder { width:64px; height:64px; } }
</style>
