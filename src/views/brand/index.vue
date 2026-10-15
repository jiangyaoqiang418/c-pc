<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { Message } from '@/lib/feedback';
import coatImage from '@/assets/images/v47-brand/coat.jpg';

const router = useRouter();
const brand = ref('全部');
// These labels are frozen reference copy, not a fabricated API brand catalog.
const brands = ['全部', 'BURBERRY', 'COACH', 'Apple', 'NIKE', 'OMEGA', 'CHANEL'];
function exploreBrand() { Message.info('品牌专区正在准备中，暂时可以浏览全部商品'); }
</script>

<template>
  <div class="brand-page">
    <div class="brand-tabs"><span>探索品牌</span><button v-for="item in brands" :key="item" type="button"
      :class="{ active: brand === item }" :aria-pressed="brand === item" @click="brand = item">{{ item }}</button></div>
    <section class="brand-hero">
      <div><span class="eyebrow">THE BRAND EDIT</span><h1>{{ brand === '全部' ? '永不过时的，好品味。' : brand }}</h1>
        <p>以经典格调，书写你的日常。</p><button type="button" class="gold" @click="exploreBrand">探索品牌精选 <UmIcon name="arrow" /></button>
      </div><img :src="coatImage" alt="秋日服饰精选" />
    </section>
    <div class="empty brand-unavailable" role="status"><UmIcon name="bag" /><h2>品牌专区正在准备中</h2>
      <p>品牌精选尚未开放，先去发现其他好物。</p><button type="button" class="primary" @click="router.push('/product/list')">探索全部商品 <UmIcon name="arrow" /></button>
    </div>
  </div>
</template>

<style scoped>
/* B01 missing-state addition uses the reference empty state and no invented brand filtering. */
.brand-unavailable { margin-top: 24px; }
.brand-tabs { overflow-x: auto; scrollbar-width: none; }
.brand-tabs > button { flex-shrink: 0; }
@media (max-width:700px) {
  .brand-tabs { margin-right:-14px; padding-right:14px; }
  :root[data-ui-theme="web3-meme"] .brand-tabs { margin-right:-12px; padding-right:12px; }
}
</style>
