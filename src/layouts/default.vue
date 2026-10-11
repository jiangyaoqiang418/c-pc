<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { BRAND } from '@shared';
import { useCartStore, useUserStore } from '@/stores';
import SearchBar from '@/components/layout/search-bar.vue';
import UtilityBar from '@/components/layout/utility-bar.vue';
import UserAvatarButton from '@/components/layout/user-avatar-button.vue';
import BrandLogo from '@/components/layout/brand-logo.vue';
import ThemePicker from '@/components/layout/theme-picker.vue';
import BuyerWorkspace from '@/components/buyer/buyer-workspace.vue';

const route = useRoute();
const cart = useCartStore();
const user = useUserStore();
const cartCount = computed(() => cart.count);
const isCheckout = computed(() => String(route.name).startsWith('checkout'));
const isMessaging = computed(() => ['im', 'im-order-group'].includes(String(route.name)));
const currentCheckoutStep = computed(() => route.name === 'checkout-success' ? 1 : 0);
const checkoutSteps = ['收货与支付', '支付结果'];
const showBreadcrumb = computed(() => !route.meta.requiresBuyer && !['home', 'product-list', 'product-detail', 'category', 'order-detail', 'purchase-detail', 'aftersale-detail', 'aftersale-create', 'review-write', 'pay-password', 'login-password', 'finance-detail', 'finance-lockup-detail'].includes(String(route.name)));
const footerGroups = [
  { title: '购物指南', links: [{ label: '注册与登录', to: '/auth/login' }, { label: '全部商品', to: '/product/list' }, { label: '发起求购', to: '/purchase/create' }] },
  { title: '支付与配送', links: [{ label: '支付说明', to: '/help' }, { label: '我的钱包', to: '/wallet' }, { label: '订单追踪', to: '/order' }] },
  { title: '售后服务', links: [{ label: '退款政策', to: '/help' }, { label: '我的售后', to: '/aftersale' }, { label: '联系买手', to: '/im' }] },
  { title: '关于 Umaomao', links: [{ label: '帮助中心', to: '/help' }, { label: '平台公告', to: '/announcement' }, { label: '买手入驻', to: '/buyer/apply' }] }
];
const navigation = [
  { to: '/', name: 'home', label: '首页' },
  { to: '/product/list', name: 'product-list', label: '发现好物' },
  { to: '/purchase/hall', name: 'purchase-hall', label: '求购大厅' },
  { to: '/announcement', name: 'announcement', label: '平台公告' }
];
</script>

<template>
  <div class="layout-default" :class="{ 'is-messaging': isMessaging }">
    <UtilityBar />
    <header class="header">
      <div class="header-inner um-wrap">
        <BrandLogo />
        <SearchBar class="header-search" />
        <div class="header-actions">
          <RouterLink to="/cart" class="cart-cta"><Icon icon="lucide:shopping-bag" /><span>购物车</span><span v-if="cartCount" class="cart-badge">{{ cartCount > 99 ? '99+' : cartCount }}</span></RouterLink>
          <UserAvatarButton /><ThemePicker />
        </div>
      </div>
      <nav class="desktop-nav um-wrap" aria-label="商城导航">
        <RouterLink to="/category" class="all-categories" :aria-current="route.name === 'category' ? 'page' : undefined"><Icon icon="lucide:menu" />全部商品分类<Icon icon="lucide:chevron-right" /></RouterLink>
        <div class="nav-links">
          <RouterLink v-for="item in navigation" :key="item.name" :to="item.to" :class="{ active: route.name === item.name }" :aria-current="route.name === item.name ? 'page' : undefined">{{ item.label }}</RouterLink>
        </div>
        <div class="nav-tools"><RouterLink to="/favorites" class="nav-shortcut"><Icon icon="lucide:heart" />收藏</RouterLink><RouterLink to="/wallet" class="nav-shortcut"><Icon icon="lucide:wallet" />钱包</RouterLink><RouterLink :to="user.canSwitchToBuyer ? '/buyer/dashboard' : '/buyer/apply'" class="buyer-entry"><Icon icon="lucide:store" />{{ user.canSwitchToBuyer ? '买手工作台' : '成为买手' }}</RouterLink></div>
      </nav>
    </header>
    <main id="main-content" class="main-container um-wrap">
      <nav v-if="showBreadcrumb && !isMessaging" class="global-breadcrumb" aria-label="当前位置"><RouterLink to="/">首页</RouterLink><Icon icon="lucide:chevron-right" width="12" /><span aria-current="page">{{ route.meta.title }}</span></nav>
      <ol v-if="isCheckout" class="checkout-progress" aria-label="结算流程"><li v-for="(step, index) in checkoutSteps" :key="step" :aria-current="currentCheckoutStep === index ? 'step' : undefined"><span>{{ index + 1 }}</span>{{ step }}<Icon v-if="index === 0" icon="lucide:arrow-right" width="18" /></li></ol>
      <slot><BuyerWorkspace :enabled="!!route.meta.requiresBuyer"><RouterView v-slot="{ Component }"><Transition name="um-page" mode="out-in"><component :is="Component" :key="route.path" /></Transition></RouterView></BuyerWorkspace></slot>
    </main>
    <footer v-if="!isMessaging" class="footer">
      <div class="payment-banner um-wrap"><Icon icon="lucide:globe" width="28" /><strong>数字支付，清晰结算。</strong><span>用 USDT，连接你与全球好物。</span><RouterLink to="/help">了解支付流程 <Icon icon="lucide:arrow-right" width="18" /></RouterLink></div>
      <div class="footer-inner um-wrap">
        <div class="footer-brand"><BrandLogo /><p>{{ BRAND.slogan }}</p></div>
        <section v-for="group in footerGroups" :key="group.title" class="footer-group"><h2>{{ group.title }}</h2><RouterLink v-for="link in group.links" :key="link.label" :to="link.to">{{ link.label }}</RouterLink></section>
        <div class="copyright"><span>{{ BRAND.copyright }}</span><div><RouterLink :to="{ path: '/help', query: { agreement: 'user' } }">用户协议</RouterLink><RouterLink :to="{ path: '/help', query: { agreement: 'privacy' } }">隐私政策</RouterLink><RouterLink :to="{ path: '/help', query: { agreement: 'aml' } }">AML 政策</RouterLink></div></div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.checkout-progress { display:flex; justify-content:center; gap:28px; list-style:none; padding:8px 0 28px; margin:0; color:var(--yb-muted); font-size:12px; }
.checkout-progress li { display:flex; align-items:center; gap:12px; }
.checkout-progress [aria-current] { color:var(--yb-primary); font-weight:600; }
.checkout-progress li>svg { margin-left:18px; }
.layout-default { min-height: 100vh; display: flex; flex-direction: column; }
.layout-default.is-messaging { height: 100dvh; min-height: 0; overflow: hidden; }
.is-messaging > .header, .is-messaging > :deep(.utility-bar) { flex-shrink: 0; }
.is-messaging .main-container { display: flex; flex-direction: column; min-height: 0; padding-block: 12px; }
.um-wrap { width: calc(100% - 96px); max-width: 1320px; margin-inline: auto; }
.header { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid var(--yb-hairline); background: color-mix(in srgb, var(--yb-surface) 94%, transparent); backdrop-filter: blur(18px); }
.header-inner { display: grid; grid-template-columns: minmax(208px, 1fr) minmax(260px, 580px) minmax(208px, 1fr); gap: 28px; align-items: center; min-height: 76px; padding-block: 10px; }
.header-search { width: 100%; min-width: 0; }
.header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; min-width: 0; }
.cart-cta { display: inline-flex; align-items: center; gap: 6px; color: var(--yb-ink); font-size: 13px; white-space: nowrap; }
.cart-cta > svg { width: 20px; height: 20px; }
.cart-cta:hover { color: var(--yb-primary); }
.cart-badge { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 50px; background: var(--yb-primary); color: white; font-size: 11px; }
.desktop-nav { display: grid; grid-template-columns: 180px minmax(0, 1fr) auto; gap: 28px; min-height: 42px; align-items: center; }
.all-categories { display: flex; gap: 10px; align-items: center; height: 42px; padding: 0 18px; border-radius: 6px 6px 0 0; background: var(--yb-primary); color: white; font-size: 14px; font-weight: 600; }
.all-categories > svg:last-child { margin-left: auto; width: 14px; }
.all-categories { white-space: nowrap; }
.header-actions > * { flex-shrink: 0; }
.nav-links { display: flex; align-items: center; justify-content: space-around; gap: 20px; height: 100%; }
.nav-links a { display: inline-flex; position: relative; align-items: center; height: 100%; font-size: 14px; color: var(--yb-muted); white-space: nowrap; }
.nav-links a:hover, .nav-links a.active { color: var(--yb-primary); }
.nav-links a.active::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--yb-primary); }
.nav-tools { display: flex; align-items: center; gap: 20px; }
.buyer-entry { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.main-container { flex: 1; padding-block: 20px 64px; min-height: 55vh; }
.main-container:has(> .global-breadcrumb) { padding-top:12px; }
.global-breadcrumb { display:flex; align-items:center; gap:12px; margin-bottom:16px; color:var(--yb-muted); font-size:12px; }
.nav-shortcut { display:inline-flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap; }.nav-shortcut svg { width:17px; }
.payment-banner { display:flex; align-items:center; gap:22px; padding-block:26px; border-bottom:1px solid var(--yb-hairline); }.payment-banner strong { font-size:16px; font-weight:600; }.payment-banner>span { font-size:12px; color:var(--yb-muted); }.payment-banner a { display:flex; align-items:center; gap:20px; margin-left:auto; font-size:13px; }
.footer { background: var(--yb-fill); border-top: 1px solid var(--yb-hairline); }
.footer-inner { display: grid; grid-template-columns: 1.8fr repeat(4,1fr); gap: 40px; padding-block: 36px 24px; }
.footer-brand p { margin: 14px 0 0; font-size: 13px; color: var(--yb-muted); }

.footer-group { display:grid; align-content:start; gap:10px; font-size:12px; color:var(--yb-muted); }.footer-group h2 { margin:4px 0 12px; font-size:14px; font-weight:600; color:var(--yb-ink); }.footer-group a:hover { color:var(--yb-primary); }
.copyright { grid-column: 1 / -1; display:flex; justify-content:space-between; gap:20px; border-top: 1px solid var(--yb-hairline); padding-top: 20px; color: var(--yb-muted); font-size: 12px; }.copyright>div { display:flex; flex-wrap:wrap; gap:20px; }
.um-page-enter-active, .um-page-leave-active { transition: opacity 180ms var(--um-ease); }
.um-page-enter-from, .um-page-leave-to { opacity: 0; }
@media (max-width: 1100px) { .um-wrap { width: calc(100% - 48px); } .header-inner { grid-template-columns: 160px minmax(240px, 1fr) 230px; gap: 20px; } .desktop-nav { grid-template-columns: 160px minmax(0, 1fr) auto; gap: 20px; } .nav-links { gap: 20px; } .nav-tools { gap: 14px; } }
@media (min-width: 901px) and (max-width: 1250px) { .header-inner { grid-template-columns: 160px minmax(240px, 1fr) auto; gap: 20px; }.header-actions { gap: 10px; } }
@media (max-width: 1100px) { .all-categories { gap: 8px; padding-inline: 12px; }.all-categories > svg:first-child { width: 16px; } }
@media (max-width: 900px) { .header-inner { grid-template-columns: 160px minmax(200px, 1fr); } .header-actions { grid-column: 1 / -1; } .desktop-nav { display: flex; flex-wrap: wrap; gap: 20px; } .nav-links { min-height: 40px; } .nav-tools { margin-left: auto; } .footer-inner { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .um-page-enter-active, .um-page-leave-active { transition: none; } }
</style>
