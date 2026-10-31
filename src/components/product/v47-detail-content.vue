<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ initialReview?: boolean }>();
const contentTab = ref('商品详情');
const activeTab = ref('商品详情');
const tabs = ['商品详情', '规格参数', '用户评价', '配送与售后', '支付说明'];
const anchor = ref<HTMLElement>();
const nav = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const reviewsBlock = ref<HTMLElement>();
const pinned = ref(false);
const navStyle = ref<Record<string, string>>({});
const navHeight = ref(50);
let frame = 0;
let resizeObserver: ResizeObserver | undefined;
let alive = true;

function headerBottom() {
  const header = document.querySelector<HTMLElement>('.header');
  return header?.getClientRects().length ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}
function sync() {
  frame = 0;
  if (!anchor.value || !nav.value) return;
  const rect = anchor.value.getBoundingClientRect();
  const top = headerBottom();
  navHeight.value = nav.value.offsetHeight;
  const contentBottom = anchor.value.parentElement?.getBoundingClientRect().bottom ?? Infinity;
  pinned.value = rect.top <= top + 1 && contentBottom > top + navHeight.value;
  navStyle.value = pinned.value ? { top:top + 'px', left:rect.left + 'px', width:rect.width + 'px' } : {};
  activeTab.value = reviewsBlock.value && reviewsBlock.value.getBoundingClientRect().top <= top + navHeight.value + 32 ? '用户评价' : contentTab.value;
}
function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
async function selectTab(tab: string) {
  if (tab !== '用户评价') contentTab.value = tab;
  activeTab.value = tab;
  await nextTick();
  if (!alive) return;
  sync();
  const target = tab === '用户评价' ? reviewsBlock.value : panel.value;
  if (!target) return;
  const header = document.querySelector<HTMLElement>('.header');
  const headerHeight = header?.getClientRects().length ? header.offsetHeight - 1 : 0;
  const y = window.scrollY + target.getBoundingClientRect().top - headerHeight - navHeight.value - 16;
  window.scrollTo({ top:Math.max(0, y), behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function showReviews() { return selectTab('用户评价'); }
onMounted(async () => {
  await nextTick();
  if (!alive) return;
  sync();
  window.addEventListener('scroll', schedule, { passive:true });
  window.addEventListener('resize', schedule);
  resizeObserver = new ResizeObserver(schedule);
  for (const element of [document.querySelector('.header'), anchor.value?.parentElement, anchor.value, nav.value, panel.value]) if (element) resizeObserver.observe(element);
  if (props.initialReview) void showReviews();
});
watch(() => props.initialReview, value => { if (value) void showReviews(); });
onBeforeUnmount(() => { alive = false; cancelAnimationFrame(frame); resizeObserver?.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); });
defineExpose({ showReviews });
</script>

<template>
  <section class="detail-bottom product-content">
    <div ref="anchor" class="product-nav-anchor" :style="{ height:navHeight + 'px' }">
      <nav ref="nav" class="tabs product-content-nav" :class="{ 'is-pinned':pinned }" :style="navStyle" aria-label="商品详情导航">
        <button v-for="tab in tabs" :key="tab" type="button" :class="{ active:activeTab === tab }" :aria-current="activeTab === tab ? 'location' : undefined" :aria-controls="tab === '用户评价' ? 'product-reviews' : 'product-info-panel'" @click="selectTab(tab)">{{ tab }}</button>
      </nav>
    </div>
    <div ref="panel" id="product-info-panel" class="detail-panel" :key="contentTab"><slot :tab="contentTab" /></div>
    <div ref="reviewsBlock" id="product-reviews" class="product-reviews-block"><slot name="reviews" /></div>
  </section>
</template>
