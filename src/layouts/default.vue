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
const { isMemeLayout: isMeme } = useUiTheme();
const { categories } = useCategoryNavigation();
const isMessaging = computed(() => ['im', 'im-order-group'].includes(String(route.name)));
const isBuyerWalletOperation = computed(() => user.isBuyerActive && ['wallet-deposit', 'wallet-withdraw'].includes(String(route.name)));
const isBuyerWorkspace = computed(() => user.isBuyerActive && (route.path.startsWith('/buyer/') || isBuyerWalletOperation.value));
const mobileLinks = computed(() => isBuyerWorkspace.value ? [
  { label:'工作台', icon:'grid', to:'/buyer/dashboard' }, { label:'商品', icon:'bag', to:'/buyer/products' },
  { label:'订单', icon:'box', to:'/buyer/orders' }, { label:'接单', icon:'search', to:'/buyer/claimable' }, { label:'钱包', icon:'wallet', to:'/buyer/wallet' }
] : [
  { label:'首页', icon:'home', to:'/' }, { label:'分类', icon:'grid', to:'/category' },
  { label:'求购', icon:'search', to:'/purchase/hall' }, { label:'购物袋', icon:'bag', to:'/cart' }, { label:'我的', icon:'user', to:'/profile' }
]);
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
const showBreadcrumb = computed(() => !['home', 'brand', 'product-list', 'product-detail', 'favorites', 'category', 'order-detail', 'purchase-detail', 'aftersale-detail', 'aftersale-create', 'review-write', 'pay-password', 'login-password', 'finance-detail', 'finance-lockup-detail', 'buyer-apply', 'buyer-product-create', 'buyer-product-edit', 'wallet-deposit', 'wallet-withdraw'].includes(String(route.name)));
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
watch(() => route.fullPath, (target, previous) => { if (isMessaging.value && target.split('?')[0] === previous.split('?')[0]) return; void nextTick(() => main.value?.focus({ preventScroll:true })); });
</script>

<template>
  <div class="layout-default" :class="{ 'is-messaging': isMessaging, 'is-meme': isMeme, 'category-focus-mode': route.name === 'category', 'buyer-workspace-mode': isBuyerWorkspace }">
    <UtilityBar v-if="!isMessaging" />
    <header v-if="isMessaging" class="messaging-header"><RouterLink to="/" class="messaging-return" aria-label="返回商城"><UmIcon name="chevron" /><span>返回商城</span></RouterLink><BrandLogo /><div class="messaging-account-actions"><UserAvatarButton /><ThemePicker /></div></header>
    <header v-if="isBuyerWorkspace" class="buyer-focus-header"><button type="button" aria-label="退出工作台，返回商城" @click="router.push('/')"><UmIcon name="chevron" /><span>返回商城</span></button><div><b>买手工作台</b><small>UMAOMAO STUDIO</small></div><div class="buyer-focus-actions"><ThemePicker /><button type="button" aria-label="买手消息" @click="router.push('/im')"><UmIcon name="chat" /></button><UserAvatarButton workspace /></div></header>
    <header v-if="!isMessaging" class="header">
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
      <slot><BuyerWorkspace :enabled="!!route.meta.requiresBuyer || isBuyerWalletOperation || (isBuyerWorkspace && route.name === 'buyer-apply')"><RouterView v-slot="{ Component }"><Transition :name="isMeme ? 'um-page' : undefined"><component :is="Component" :key="route.path" /></Transition></RouterView></BuyerWorkspace></slot>
    </main>
    <footer v-if="!isMessaging" class="footer"><div class="wrap um-wrap"><div class="footer-callout"><UmIcon name="globe" /><span>有 U，自在买。<small>用 USDT，连接你与全球好物。</small></span><button type="button" @click="router.push({ path:'/help', query:{ topic:'pay' } })">了解支付流程<UmIcon name="arrow" /></button></div><div class="footer-links"><div class="footer-brand"><BrandLogo /><p>全球好物 / 用 U 探索<br />把喜欢，融入日常。</p><span>GOOD FINDS. BETTER DAYS.</span></div><div v-for="group in footerGroups" :key="group.title"><h4>{{ group.title }}</h4><button v-for="link in group.links" :key="link.label" type="button" @click="router.push(link.to)">{{ link.label }}</button></div></div><div class="footer-bottom"><span>{{ BRAND.copyright }}</span><div><button type="button" @click="router.push({ path:'/help', query:{ agreement:'user' } })">用户协议</button><button type="button" @click="router.push({ path:'/help', query:{ agreement:'privacy' } })">隐私政策</button><button type="button" @click="router.push({ path:'/help', query:{ agreement:'aml' } })">AML 政策</button><button type="button" @click="router.push('/design')">页面总览 ↗</button></div></div></div></footer>
    <nav class="mobile-nav" :aria-label="isBuyerWorkspace ? '买手工作台导航' : '手机主导航'"><button v-for="link in mobileLinks" :key="link.to" type="button" :class="{ active: route.path === link.to }" :aria-current="route.path === link.to ? 'page' : undefined" @click="router.push(link.to)"><span><UmIcon :name="link.icon" /><b v-if="link.to === '/cart' && cart.count">{{ cart.count }}</b></span>{{ link.label }}</button></nav>
    <div v-if="!isMessaging" class="floating-tools"><button type="button" aria-label="联系客服" @click="router.push('/im')"><UmIcon name="headset" /></button><button type="button" aria-label="页面总览" @click="router.push('/design')"><UmIcon name="grid" /></button><button type="button" aria-label="回到顶部" @click="scrollTop">↑</button></div>
  </div></template>

<style scoped>
.layout-default { min-height:100vh; display:flex; flex-direction:column; }
.main-container { flex:1; outline:0; }
.layout-default.is-messaging { height:100dvh; min-height:0; overflow:hidden; }
.is-messaging > .header,.is-messaging > :deep(.utility-bar) { flex-shrink:0; }
.is-messaging .main-container { display:flex; flex-direction:column; min-height:0; padding-block:12px; }
.is-messaging .main-container { width:calc(100% - 32px); max-width:none; margin:0 auto; }
.is-messaging > .mobile-nav { display:none; }
.messaging-header { display:flex; align-items:center; gap:24px; min-height:60px; padding:10px 20px; border-bottom:1px solid var(--line); background:var(--paper); flex-shrink:0; }
.messaging-return { display:flex; align-items:center; gap:6px; min-height:36px; color:var(--muted); font-size:12px; }
.messaging-return > svg { width:18px; transform:rotate(180deg); }
.is-messaging .messaging-header :deep(.logo .brand-art) { width:152px; height:auto; aspect-ratio:6; padding:0; background:transparent; border-radius:0; box-sizing:border-box; line-height:0; }
.messaging-account-actions { display:flex; align-items:center; gap:12px; margin-left:auto; }
.messaging-account-actions :deep(.account-trigger) { display:flex; align-items:center; gap:8px; font-size:12px; }
.messaging-account-actions :deep(.mobile-account-trigger) { display:none; }
@media (max-width:700px) {
  .messaging-header { min-height:54px; padding:7px 12px; gap:10px; }
  .messaging-return > span { display:none; }
  .is-messaging .messaging-header :deep(.logo .brand-art) { width:32px; aspect-ratio:1; }
  .messaging-account-actions { gap:10px; }
  .messaging-account-actions :deep(.account-trigger) { display:none; }
  .messaging-account-actions :deep(.mobile-account-trigger) { display:flex; }
  .messaging-account-actions :deep(.mobile-account-trigger) { flex-direction:column; align-items:center; gap:2px; min-width:36px; min-height:44px; }
  .messaging-account-actions :deep(.mobile-account-avatar) { width:28px; height:28px; }
  .messaging-account-actions :deep(.mobile-account-label) { display:flex; align-items:center; gap:2px; font-size:9px; line-height:10px; }
  .messaging-account-actions :deep(.mobile-account-label svg) { width:8px; height:8px; }
  .is-messaging .main-container { width:calc(100% - 16px); padding-block:8px; }
}
.header-search { min-width:0; }
.nav-rail-host { min-width:0; position:relative; height:100%; }
.nav-rail-host > .store-nav-links { height:100%; }
.edge-scroll-layer { inset:0; }
@media (max-width:700px) {
  .nav-rail-host { flex:1; }
  .nav-rail-host > .store-nav-links { display:flex; align-items:stretch; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; overscroll-behavior-x:contain; }
  .nav-rail-host > .store-nav-links > a { flex-shrink:0; }
}
@media (max-width:700px) { .category-focus-mode > .main { width:100%; padding:0; } }
@media (max-width:700px) { .buyer-workspace-mode .buyer-focus-header { grid-template-columns:auto minmax(0,1fr) auto; } .buyer-focus-header>div { min-width:0; } }
@media (max-width:700px) { .is-messaging .main-container { padding-bottom:max(8px,env(safe-area-inset-bottom)); } }
</style>
