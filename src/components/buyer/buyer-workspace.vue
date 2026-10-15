<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';

const props = defineProps<{ enabled: boolean }>();
const route = useRoute();
const enabled = computed(() => props.enabled);
const menu = ref<HTMLElement>();
const rail = useUmScrollRail(menu);
const links = [
  { to: '/buyer/dashboard', label: '工作台', icon: 'grid' },
  { to: '/buyer/products', label: '商品管理', icon: 'bag' },
  { to: '/buyer/orders', label: '买手订单', icon: 'box' },
  { to: '/buyer/claimable', label: '求购接单', icon: 'search' },
  { to: '/buyer/aftersales', label: '售后查看', icon: 'shield' },
  { to: '/buyer/wallet', label: '买手钱包', icon: 'wallet' },
  { to: '/buyer/deposit', label: '押金管理', icon: 'shield' },
  { to: '/buyer/categories/apply', label: '分类申请', icon: 'grid' },
  { to: '/buyer/flash-sales', label: '秒杀报名', icon: 'clock' }
];
const isActive = (path: string) => route.path === path || (path === '/buyer/products' && route.path.startsWith('/buyer/products/'));
</script>

<template>
  <div class="buyer-workspace" :class="{ 'buyer-layout': enabled }">
    <aside v-if="enabled" class="buyer-sidebar">
      <div class="buyer-brand"><span class="buyer-mark"><UmIcon name="bag" /></span><div><b>买手工作室</b><small>BUYER STUDIO</small></div></div>
      <nav ref="menu" aria-label="买手导航" data-um-rail :tabindex="rail.overflow.value ? 0 : undefined" :class="{ 'drag-scroll-overflow':rail.overflow.value, 'is-dragging':rail.isDragging.value }" @scroll.passive="rail.update" @pointerdown="rail.onPointerdown" @pointermove="rail.onPointermove" @pointerup="rail.onPointerend" @pointercancel="rail.onPointerend" @lostpointercapture="rail.onPointerend" @click.capture="rail.onClickCapture" @dragstart="rail.onDragStart" @keydown="rail.onKeydown"><RouterLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }" :aria-current="isActive(link.to) ? 'page' : undefined"><UmIcon :name="link.icon" /><span>{{ link.label }}</span><UmIcon name="chevron" /></RouterLink></nav>
      <div class="buyer-sidebar-note"><UmIcon name="shield" /><b>认真选品，安心履约。</b><p>每一个细节，<br>都成就一份信任。</p><RouterLink :to="{ path:'/help', query:{ topic:'buyer' } }">买手帮助 →</RouterLink></div>
    </aside>
    <section class="buyer-content"><slot /></section>
  </div>
</template>

<style scoped>
.buyer-workspace:not(.buyer-layout), .buyer-workspace:not(.buyer-layout)>.buyer-content { display:contents; }
.buyer-layout>.buyer-content :deep(.shop-container) { width:100%; max-width:none; margin:0; padding:0; }
.buyer-sidebar-note a { font-size:12px; text-decoration:underline; text-underline-offset:4px; }
@media (max-width:700px) { .buyer-layout>.buyer-content :deep(.buyer-tabs) { margin-right:-14px; padding-right:14px; } }
@media (max-width:700px) { :root[data-ui-theme="web3-meme"] .buyer-layout>.buyer-content :deep(.buyer-tabs) { margin-right:-12px; padding-right:12px; } }
</style>
