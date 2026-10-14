<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BRAND } from '@shared';
import { useCartStore, useUserStore } from '@/stores';
import { useUiTheme } from '@/composables/use-ui-theme';
import { useCategoryNavigation } from '@/composables/use-category-navigation';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';
import UmIcon from '@/components/common/um-icon.vue';
import SearchBar from '@/components/layout/search-bar.vue';
import UtilityBar from '@/components/layout/utility-bar.vue';
import UserAvatarButton from '@/components/layout/user-avatar-button.vue';
import BrandLogo from '@/components/layout/brand-logo.vue';
import ThemePicker from '@/components/layout/theme-picker.vue';
import SideNav from '@/components/layout/side-nav.vue';
import BuyerWorkspace from '@/components/buyer/buyer-workspace.vue';

const route = useRoute();
const router = useRouter();
const cart = useCartStore();
const user = useUserStore();
const { currentTheme } = useUiTheme();
const { categories } = useCategoryNavigation();
const isMeme = computed(() => currentTheme.value === 'web3-meme');
const isMessaging = computed(() => ['im', 'im-order-group'].includes(String(route.name)));
const isCatalog = computed(() => route.name === 'product-list');
const topCategories = computed(() => {
  const names = ['手机数码', '电脑办公', '家用电器', '运动生活'];
  const reserved = new Set(categories.value.filter(category => names.includes(category.name)).map(category => category.id));
  const selected: typeof categories.value[number][] = [];
  for (const name of names) {
    const matched = categories.value.find(category => category.name === name)
      || categories.value.find(category => !reserved.has(category.id) && !selected.some(item => item.id === category.id));
    if (matched && !selected.some(item => item.id === matched.id)) selected.push(matched);
  }
  return selected;
});
function categoryActive(id: string) {
  if (!isCatalog.value) return false;
  const target = String(route.query.categoryId ?? '');
  const includes = (nodes: typeof categories.value): boolean => nodes.some(node => node.id === target || includes(node.children || []));
  const root = categories.value.find(node => node.id === id);
  return !!root && (root.id === target || includes(root.children || []));
}
const categoryLink = (id: string) => ({ name: 'product-list', query: { categoryId: id } });
const showBreadcrumb = computed(() => !route.meta.requiresBuyer && !['home', 'brand', 'product-list', 'product-detail', 'category', 'order-detail', 'purchase-detail', 'aftersale-detail', 'aftersale-create', 'review-write', 'pay-password', 'login-password', 'finance-detail', 'finance-lockup-detail'].includes(String(route.name)));
const main = ref<HTMLElement>();
const navRail = ref<HTMLElement>();
const rail = useUmScrollRail(navRail);
watch([() => route.fullPath, () => categories.value], () => { void nextTick(() => {
  if (!isCatalog.value) return;
  const row = navRail.value;
  const selected = row?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!row || !selected) return;
  const box = row.getBoundingClientRect();
  const child = selected.getBoundingClientRect();
  if (child.left < box.left || child.right > box.right) row.scrollTo({ left:row.scrollLeft + child.left - box.left - (box.width - child.width) / 2, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}); });
const footerGroups = [
  { title: '购物指南', links: [{ label: '注册与登录', to: '/auth/login' }, { label: '全部商品', to: '/product/list' }, { label: '发起求购', to: '/purchase/create' }] },
  { title: '支付与配送', links: [{ label: '支付说明', to: '/help' }, { label: '我的钱包', to: '/wallet' }, { label: '订单追踪', to: '/order' }] },
  { title: '售后服务', links: [{ label: '退换政策', to: '/help' }, { label: '我的售后', to: '/aftersale' }, { label: '联系买手', to: '/im' }] },
  { title: '关于 Umaomao', links: [{ label: '帮助中心', to: '/help' }, { label: '平台公告', to: '/announcement' }, { label: '买手入驻', to: '/buyer/apply' }] }
];
function scrollTop() { window.scrollTo({ top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
watch(() => route.fullPath, () => { void nextTick(() => main.value?.focus({ preventScroll:true })); });
</script>

<template>
  <div class="layout-default" :class="{ 'is-messaging': isMessaging, 'is-meme': isMeme, 'category-focus-mode': route.name === 'category' }">
    <UtilityBar />
    <header class="header">
      <div class="header-main wrap um-wrap"><BrandLogo /><SearchBar class="header-search" /><div class="header-actions"><UserAvatarButton /><ThemePicker /></div></div>
      <nav class="desktop-nav wrap um-wrap" aria-label="主导航">
        <SideNav mode="nav" />
        <div class="nav-rail-host">
          <div ref="navRail" :class="[isCatalog ? 'catalog-primary-nav' : 'store-nav-links', { 'drag-scroll-overflow': rail.overflow.value, 'is-dragging': rail.isDragging.value }]" data-um-rail :tabindex="rail.overflow.value ? 0 : undefined" @scroll.passive="rail.update" @pointerdown="rail.onPointerdown" @pointermove="rail.onPointermove" @pointerup="rail.onPointerend" @pointercancel="rail.onPointerend" @lostpointercapture="rail.onPointerend" @click.capture="rail.onClickCapture" @dragstart="rail.onDragStart" @keydown="rail.onKeydown">
            <template v-if="isCatalog"><RouterLink to="/">首页</RouterLink><RouterLink to="/brand">品牌专区</RouterLink><RouterLink to="/product/list" :class="{ active: !route.query.categoryId }" :aria-current="!route.query.categoryId ? 'page' : undefined">全部商品</RouterLink><RouterLink v-for="category in categories" :key="category.id" :to="categoryLink(category.id)" :class="{ active: categoryActive(category.id) }" :aria-current="categoryActive(category.id) ? 'page' : undefined">{{ category.name }}</RouterLink><RouterLink to="/purchase/hall">求购大厅</RouterLink></template>
            <template v-else><RouterLink to="/" :class="{ active: route.name === 'home' }">首页</RouterLink><RouterLink to="/brand" :class="{ active: route.path === '/brand' }">品牌专区</RouterLink><RouterLink v-for="category in topCategories" :key="category.id" :to="categoryLink(category.id)">{{ category.name }}</RouterLink><RouterLink to="/purchase/hall" :class="{ active: route.path.startsWith('/purchase') }">求购大厅</RouterLink></template>
          </div>
          <div v-if="rail.overflow.value" class="edge-scroll-layer edge-scroll-compact"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="!rail.canPrev.value" aria-label="向左滑动" @click="rail.step(-1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="!rail.canNext.value" aria-label="向右滑动" @click="rail.step(1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
        </div>
        <div class="desktop-nav-tools" aria-label="账户快捷入口"><button type="button" aria-label="我的收藏" @click="router.push('/favorites')"><UmIcon name="heart" /><span>收藏</span></button><button type="button" class="nav-cart-button" aria-label="打开购物袋" @click="router.push('/cart')"><UmIcon name="bag" /><span>购物袋</span><b>{{ cart.count }}</b></button><button type="button" aria-label="我的钱包" @click="router.push(user.isBuyerActive ? '/buyer/wallet' : '/wallet')"><UmIcon name="wallet" /><span>钱包</span></button></div>
      </nav>
    </header>
    <main id="main-content" ref="main" class="main main-container wrap um-wrap" :class="{ 'home-main': route.name === 'home' }" :data-page="route.path" tabindex="-1">
      <nav v-if="showBreadcrumb && !isMessaging" class="breadcrumb global-breadcrumb" aria-label="当前位置"><RouterLink to="/">首页</RouterLink><UmIcon name="chevron" /><span aria-current="page">{{ route.meta.title }}</span></nav>
      <slot><BuyerWorkspace :enabled="!!route.meta.requiresBuyer"><RouterView v-slot="{ Component }"><Transition :name="isMeme ? 'um-page' : undefined"><component :is="Component" :key="route.path" /></Transition></RouterView></BuyerWorkspace></slot>
    </main>
    <footer v-if="!isMessaging" class="footer"><div class="wrap um-wrap"><div class="footer-callout"><UmIcon name="globe" /><span>有 U，自在买。<small>用 USDT，连接你与全球好物。</small></span><button type="button" @click="router.push({ path:'/help', query:{ topic:'pay' } })">了解支付流程<UmIcon name="arrow" /></button></div><div class="footer-links"><div class="footer-brand"><BrandLogo /><p>全球好物 / 用 U 探索<br />把喜欢，融入日常。</p><span>GOOD FINDS. BETTER DAYS.</span></div><div v-for="group in footerGroups" :key="group.title"><h4>{{ group.title }}</h4><button v-for="link in group.links" :key="link.label" type="button" @click="router.push(link.to)">{{ link.label }}</button></div></div><div class="footer-bottom"><span>{{ BRAND.copyright }}</span><div><button type="button" @click="router.push({ path:'/help', query:{ agreement:'user' } })">用户协议</button><button type="button" @click="router.push({ path:'/help', query:{ agreement:'privacy' } })">隐私政策</button><button type="button" @click="router.push({ path:'/help', query:{ agreement:'aml' } })">AML 政策</button></div></div></div></footer>
    <div v-if="!isMessaging" class="floating-tools"><button type="button" aria-label="联系客服" @click="router.push('/im')"><UmIcon name="headset" /></button><button type="button" aria-label="回到顶部" @click="scrollTop">↑</button></div>
  </div></template>

<style scoped>
.layout-default { min-height:100vh; display:flex; flex-direction:column; }
.main-container { flex:1; outline:0; }
.layout-default.is-messaging { height:100dvh; min-height:0; overflow:hidden; }
.is-messaging > .header,.is-messaging > :deep(.utility-bar) { flex-shrink:0; }
.is-messaging .main-container { display:flex; flex-direction:column; min-height:0; padding-block:12px; }
.header-search { min-width:0; }
.nav-rail-host { min-width:0; position:relative; height:100%; }
.edge-scroll-layer { inset:0; }
@media (max-width:700px) { .category-focus-mode > .main { width:100%; padding:0; } }
</style>
