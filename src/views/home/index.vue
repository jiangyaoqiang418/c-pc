<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import ProductCard from '@/components/product/product-card.vue';
import SideNav from '@/components/layout/side-nav.vue';
import V47Rail from '@/components/home/v47-rail.vue';
import { useCategoryNavigation } from '@/composables/use-category-navigation';
import { useUiTheme } from '@/composables/use-ui-theme';
import { useUserStore, useWalletStore } from '@/stores';
import { formatAmount } from '@shared';
import { Message } from '@/lib/feedback';
import * as productApi from '@/service/api/product';
import * as orderApi from '@/service/api/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { PRODUCT_IMAGE_PLACEHOLDER, setImageFallback } from '@/utils/image-placeholder';
import marketScene from '@/assets/images/v47-home/meme-market-scene.svg';
import classicHero from '@/assets/images/v47-home/hero.png';
import coatImage from '@/assets/images/v47-home/coat.jpg';
import shoeImage from '@/assets/images/v47-home/shoe.jpg';
import phoneImage from '@/assets/images/v47-home/phone.jpg';
import coffeeImage from '@/assets/images/v47-home/coffee.jpg';
import bagImage from '@/assets/images/v47-home/bag.jpg';
import type { HomeVisualFixture } from '@/visual/types';

const props = defineProps<{ visualFixture?: HomeVisualFixture }>();
const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();
const { currentTheme } = useUiTheme();
const categories = props.visualFixture ? computed(() => props.visualFixture!.categories) : useCategoryNavigation().categories;
const isMeme = computed(() => String(currentTheme.value) === 'web3-meme');
const buyerActive = computed(() => !props.visualFixture && userStore.isBuyerActive);
const user = computed(() => props.visualFixture ? undefined : userStore.currentUser);
type HomeSection = 'banners' | 'recommendations' | 'hot' | 'newest' | 'flash';
type FeedMode = 'curated' | 'popular' | 'new';
const recommendations = ref<Api.RealProduct.Record[]>(props.visualFixture?.recommendations || []);
const hot = ref<Api.RealProduct.Record[]>(props.visualFixture?.hot || []);
const newest = ref<Api.RealProduct.Record[]>(props.visualFixture?.newest || []);
const flash = ref<Api.RealProduct.Record[]>([]);
const banners = ref<Api.RealProduct.BannerDTO[]>([]);
const sectionErrors = reactive<Record<HomeSection, string>>({ banners: '', recommendations: '', hot: '', newest: '', flash: '' });
const sectionLoading = reactive<Record<HomeSection, boolean>>({ banners: false, recommendations: false, hot: false, newest: false, flash: false });
const sectionGuards = Object.fromEntries(['banners', 'recommendations', 'hot', 'newest', 'flash'].map(key => [key, createLatestRequestGuard()])) as Record<HomeSection, ReturnType<typeof createLatestRequestGuard>>;
const feedMode = ref<FeedMode>('curated');
const featuredSource = computed<HomeSection>(() => feedMode.value === 'popular' ? 'hot' : feedMode.value === 'new' ? 'newest' : 'recommendations');
const featured = computed(() => (feedMode.value === 'popular' ? hot.value : feedMode.value === 'new' ? newest.value : recommendations.value).slice(0, 10));
const radarModes = [{ id: 'curated', label: '买手精选' }, { id: 'popular', label: '人气好物' }, { id: 'new', label: '新发现' }] as const;
const brandLabels = ['Apple', 'SONY', 'NIKE', 'COACH', 'OMEGA', 'BURBERRY'];
const rankingProducts = computed(() => props.visualFixture?.rankingProducts || hot.value);
const marketCount = computed(() => props.visualFixture ? props.visualFixture.feedRecords.length
  : sectionLoading.recommendations || sectionErrors.recommendations ? '—' : recommendations.value.length);
function discoveryProducts(index: number) {
  if (props.visualFixture?.discoveryProducts) return props.visualFixture.discoveryProducts[index] || [];
  return (index === 2 ? hot.value : recommendations.value).slice(index * 2, index * 2 + 2);
}
function discoverySection(index: number): HomeSection { return index === 2 ? 'hot' : 'recommendations'; }

async function loadSection(section: HomeSection, task: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>) {
  if (props.visualFixture) return;
  if (sectionLoading[section]) return;
  const isCurrent = sectionGuards[section].begin();
  sectionLoading[section] = true;
  sectionErrors[section] = '';
  try { await task(isCurrent.signal, isCurrent); }
  catch {
    if (!isCurrent()) return;
    if (section === 'banners') banners.value = [];
    else if (section === 'recommendations') recommendations.value = [];
    else if (section === 'hot') hot.value = [];
    else if (section === 'newest') newest.value = [];
    else flash.value = [];
    sectionErrors[section] = '加载失败，请重试';
  } finally { if (isCurrent()) sectionLoading[section] = false; }
}
const sectionLoaders: Record<HomeSection, () => Promise<void>> = {
  // 保留运营供数；v47 固定主视觉为品牌设计，不用任意 Banner 覆盖冻结的文案和素材。
  banners: () => loadSection('banners', async (signal, isCurrent) => {
    const result = await productApi.fetchHomeBanners({ signal });
    if (isCurrent()) banners.value = result;
  }),
  recommendations: () => loadSection('recommendations', async (signal, isCurrent) => {
    const revision = feedRevision;
    const result = await productApi.fetchHomeRecommendations(20, { signal });
    if (!isCurrent()) return;
    recommendations.value = result;
    if (homeCategory.value === '' && revision === feedRevision) {
      feedRecords.value = result;
      recommendationLimit.value = 20;
      feedExhausted.value = result.length < 20;
      feedError.value = '';
    }
  }),
  hot: () => loadSection('hot', async (signal, isCurrent) => {
    const result = await productApi.fetchBestSellers(20, { signal });
    if (isCurrent()) hot.value = result;
  }),
  newest: () => loadSection('newest', async (signal, isCurrent) => {
    const result = await productApi.fetchNewArrivals(20, { signal });
    if (isCurrent()) newest.value = result;
  }),
  flash: () => loadSection('flash', async (signal, isCurrent) => {
    const result = await productApi.fetchFlashSale(20, { signal });
    if (isCurrent()) flash.value = result.map(item => item.product);
  })
};

const hero = ref(0);
const heroElement = ref<HTMLElement>();
const heroImages = [classicHero, coatImage, shoeImage];
const heroCategories = ['手机数码', '服饰箱包', '运动生活'];
let heroGesture: { id: number; x: number; y: number; dragged: boolean } | undefined;
const heroDragging = ref(false);
let blockHeroClickUntil = 0;
function moveHero(direction: number) { hero.value = (hero.value + direction + 3) % 3; }
function startHeroGesture(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('input,textarea,select,.edge-scroll-button')) return;
  heroGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
}
function moveHeroGesture(event: PointerEvent) {
  if (!heroGesture || heroGesture.id !== event.pointerId) return;
  const dx = event.clientX - heroGesture.x;
  const dy = event.clientY - heroGesture.y;
  if (!heroGesture.dragged) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { heroGesture = undefined; return; }
    if (Math.abs(dx) < 8) return;
    heroGesture.dragged = true;
    heroDragging.value = true;
    window.getSelection()?.removeAllRanges();
    heroElement.value?.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}
function finishHeroGesture(event: PointerEvent) {
  if (!heroGesture || heroGesture.id !== event.pointerId) return;
  const gesture = heroGesture;
  heroGesture = undefined;
  if (gesture.dragged) {
    blockHeroClickUntil = performance.now() + 350;
    if (event.type === 'pointerup' && Math.abs(event.clientX - gesture.x) > 35) moveHero(event.clientX < gesture.x ? 1 : -1);
    if (heroElement.value?.hasPointerCapture(event.pointerId)) heroElement.value.releasePointerCapture(event.pointerId);
  }
  heroDragging.value = false;
}
function guardHeroClick(event: MouseEvent) {
  if (event.isTrusted && performance.now() < blockHeroClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
}
function go(path: string) { void router.push(path); }
function browseCategory(name: string) {
  const category = categories.value.find(item => item.name === name);
  if (!category) { Message.info('该分类暂未提供商品'); return; }
  void router.push({ name: 'product-list', query: { categoryId: category.id } });
}
function openProduct(product: Api.RealProduct.Record) { void router.push({ name: 'product-detail', params: { id: String(product.id) } }); }
function displayPrice(value: string) {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  const fraction = match[3]?.replace(/0+$/, '');
  return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}
function rankingCaption(product: Api.RealProduct.Record, index: number) {
  return props.visualFixture ? ['声音里的小世界', '每一步，都有态度', '性能与美感兼得'][index] : product.summary || product.categoryPath;
}
function openBrand(brand?: string) { void router.push({ path:'/brand', query:brand ? { keyword:brand } : undefined }); }
function goProductList(sort: productApi.StorefrontSort = 'DEFAULT') { void router.push({ name: 'product-list', query: { sort: sort === 'DEFAULT' ? undefined : sort } }); }
function switchRole(role: 'customer' | 'buyer') {
  if (props.visualFixture) return;
  if (role === 'buyer' && !userStore.canSwitchToBuyer) {
    go(user.value ? '/buyer/apply' : '/auth/login?redirect=%2Fbuyer%2Fapply');
    return;
  }
  userStore.setAudience(role);
}
function login() { void router.push({ name: 'login', query: { redirect: '/' } }); }
function ignoreVisualFavorite() { /* The independent visual entry must never submit a favorite. */ }

const accountGuard = createLatestRequestGuard();
const orderCounts = ref<Record<string, number>>({});
const favoriteCount = ref<number>();
const orderError = ref('');
const walletError = ref(false);
async function loadAccount() {
  if (props.visualFixture) return;
  const isCurrent = accountGuard.begin();
  const userId = user.value?.id;
  orderCounts.value = {};
  favoriteCount.value = undefined;
  orderError.value = '';
  walletError.value = false;
  if (userId === undefined) return;
  await Promise.allSettled([
    (async () => { try { await walletStore.fetchWallet(userId); } catch { if (isCurrent()) walletError.value = true; } })(),
    (async () => {
      if (buyerActive.value) return;
      try {
        const result = await orderApi.countMyOrdersByStatus({ signal: isCurrent.signal });
        if (isCurrent() && String(user.value?.id) === String(userId)) orderCounts.value = result;
      } catch { if (isCurrent()) orderError.value = '订单统计加载失败'; }
    })(),
    (async () => {
      if (buyerActive.value) return;
      try {
        const result = await productApi.fetchMyFavorites({ size: 1, signal: isCurrent.signal });
        if (isCurrent() && String(user.value?.id) === String(userId)) favoriteCount.value = result.total;
      } catch { /* 未知收藏数保持空值，不以 0 替代加载失败。 */ }
    })()
  ]);
}
function orderCount(...statuses: string[]) {
  const values = statuses.map(status => orderCounts.value[status]);
  return values.some(value => value === undefined || !Number.isFinite(value) || value < 0) ? '—' : values.reduce((sum, value) => sum + value, 0);
}
const availableBalance = computed(() => walletError.value || walletStore.loading || !walletStore.account ? '—' : formatAmount(walletStore.account.available));

const homeCategory = ref('');
const feedRecords = ref<Api.RealProduct.Record[]>(props.visualFixture?.feedRecords || []);
const feedLimit = ref(20);
const recommendationLimit = ref(20);
const feedTotal = ref<number>();
const feedPage = ref(1);
const feedLoading = ref(false);
const feedError = ref('');
const feedExhausted = ref(!!props.visualFixture);
const feedGuard = createLatestRequestGuard();
const feedRoot = ref<HTMLElement>();
const feedSentinel = ref<HTMLElement>();
let feedObserver: IntersectionObserver | undefined;
let disposed = false;
let feedRevision = 0;
const visibleFeed = computed(() => feedRecords.value.slice(0, feedLimit.value));
const hasMoreFeed = computed(() => feedLimit.value < feedRecords.value.length || !feedExhausted.value);
const recommendationsLoading = computed(() => feedLoading.value || (homeCategory.value === '' && sectionLoading.recommendations));
const recommendationCount = computed(() => recommendationsLoading.value || feedError.value || sectionErrors.recommendations
  ? '—' : feedTotal.value ?? feedRecords.value.length);
async function loadFeed(reset = false) {
  if (props.visualFixture) {
    const selectedIds = new Set<string>();
    const collectIds = (nodes: readonly Api.RealCategory.DisplayCategoryNode[]) => nodes.forEach(node => {
      selectedIds.add(node.id);
      if (node.children) collectIds(node.children);
    });
    const selectedCategory = props.visualFixture.categories.find(category => category.id === homeCategory.value);
    if (selectedCategory) collectIds([selectedCategory]);
    feedRecords.value = homeCategory.value ? props.visualFixture.feedRecords.filter(product => selectedIds.has(String(product.categoryId))) : props.visualFixture.feedRecords;
    feedTotal.value = feedRecords.value.length;
    feedLimit.value = 20;
    feedExhausted.value = true;
    return;
  }
  if (feedLoading.value && !reset) return;
  const isCurrent = feedGuard.begin();
  const categoryId = homeCategory.value;
  feedLoading.value = true;
  feedError.value = '';
  if (reset) {
    feedRecords.value = [];
    feedPage.value = 1;
    feedTotal.value = undefined;
    feedLimit.value = 20;
    feedExhausted.value = false;
  }
  try {
    if (!categoryId) {
      const limit = reset ? 20 : recommendationLimit.value + 10;
      const result = await productApi.fetchHomeRecommendations(limit, { signal: isCurrent.signal });
      if (!isCurrent()) return;
      feedRecords.value = result;
      recommendations.value = result;
      sectionErrors.recommendations = '';
      recommendationLimit.value = limit;
      feedExhausted.value = result.length < limit;
    } else {
      const pageNo = reset ? 1 : feedPage.value + 1;
      const result = await productApi.fetchStorefrontProducts({ current: pageNo, size: 20, categoryId, sort: 'DEFAULT', signal: isCurrent.signal });
      if (!isCurrent()) return;
      const merged = reset ? result.records : [...feedRecords.value, ...result.records];
      feedRecords.value = [...new Map(merged.map(product => [String(product.id), product])).values()];
      feedPage.value = pageNo;
      feedTotal.value = result.total;
      feedExhausted.value = feedRecords.value.length >= result.total || !result.records.length;
    }
  } catch { if (isCurrent()) feedError.value = '推荐商品加载失败，请重试'; }
  finally { if (isCurrent()) feedLoading.value = false; }
}
async function loadMoreFeed() {
  if (disposed || recommendationsLoading.value || feedError.value || !hasMoreFeed.value) return;
  const currentCategory = homeCategory.value;
  const revision = feedRevision;
  if (feedLimit.value >= feedRecords.value.length) await loadFeed();
  if (disposed || revision !== feedRevision || currentCategory !== homeCategory.value || feedError.value) return;
  feedLimit.value = Math.min(feedLimit.value + 10, feedRecords.value.length);
  await nextTick();
  observeFeed();
}
function observeFeed() {
  feedObserver?.disconnect();
  if (!disposed && feedSentinel.value && hasMoreFeed.value && !feedError.value) feedObserver?.observe(feedSentinel.value);
}
watch(homeCategory, async () => {
  feedRevision += 1;
  feedObserver?.disconnect();
  if (feedRoot.value && feedRoot.value.getBoundingClientRect().top < 120) feedRoot.value.scrollIntoView({ block: 'start', behavior: 'instant' });
  await loadFeed(true);
  await nextTick();
  observeFeed();
});
watch([recommendationsLoading, hasMoreFeed, feedError], async () => { await nextTick(); observeFeed(); });
watch([() => user.value?.id, buyerActive, () => userStore.sessionVersion], loadAccount);
onMounted(() => {
  if (!props.visualFixture) {
    void Promise.all(Object.values(sectionLoaders).map(load => load()));
    void loadAccount();
  }
  if ('IntersectionObserver' in window) feedObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void loadMoreFeed();
  }, { rootMargin: '0px 0px 480px 0px' });
  observeFeed();
});
onUnmounted(() => {
  disposed = true;
  Object.values(sectionGuards).forEach(guard => guard.invalidate());
  accountGuard.invalidate();
  feedGuard.invalidate();
  feedObserver?.disconnect();
});
</script>

<template>
  <div class="home-page home-main">
    <div v-if="isMeme" class="meme-market-heading"><div><span class="meme-dot" /><b>好物发现</b><span>THE GOOD STUFF MARKET</span><small class="meme-market-count">{{ marketCount }} 件好物</small></div><button @click="go('/finance')"><UmIcon name="vault" />小金库<UmIcon name="arrow" /></button></div>
    <div class="home-hero-layout">
      <SideNav mode="home" />
      <section ref="heroElement" class="hero" :class="[`slide-${hero}`, { 'meme-hero': isMeme, 'is-dragging': heroDragging }]" aria-label="首页精选主视觉" @pointerdown="startHeroGesture" @pointermove="moveHeroGesture" @pointerup="finishHeroGesture" @pointercancel="finishHeroGesture" @lostpointercapture="finishHeroGesture" @click.capture="guardHeroClick" @dragstart.prevent>
        <template v-if="isMeme"><div class="meme-hero-grid" aria-hidden="true" /><span class="meme-hero-type" aria-hidden="true">GOOD<br>FINDS.</span><span class="meme-hero-index">UM / DROP 00{{ hero + 1 }}</span><div :key="hero" class="hero-content"><span class="eyebrow"><i class="meme-dot" />{{ ['GOOD FINDS. NO BORING STUFF.', 'YOUR NEXT COLLECTIBLE.', 'GET OUT. STAND OUT.'][hero] }}</span><h1>{{ ['有 U，', '好品味，', '不跟风，'][hero] }}<br><em>{{ ['就有好物。', '值得收藏。', '只跟热爱。'][hero] }}</em></h1><p>{{ ['把链上的 U，变成生活里的酷东西。', '从全球买手手中，发现你的下一件珍藏。', '数码、穿搭、生活好物，一起解锁。'][hero] }}</p><button class="gold" @click="browseCategory(heroCategories[hero])"><span>发现好物</span><UmIcon name="arrow" /></button></div><div class="meme-hero-art" aria-hidden="true"><img :src="marketScene" alt=""></div></template>
        <template v-else><img class="hero-photo" :src="heroImages[hero]" alt="精选手机、笔记本与咖啡机"><div :key="hero" class="hero-content"><span class="eyebrow">{{ ['THE ART OF EVERYDAY', 'THE AUTUMN EDIT', 'MOVE YOUR EVERYDAY'][hero] }}</span><h1>{{ ['精选科技，', '经典风格，', '自在运动，'][hero] }}<br>{{ ['升级生活。', '融入日常。', '随心出发。'][hero] }}</h1><p>{{ ['从一份灵感，到每一天的好生活。', '在时光里，找到属于自己的从容。', '把热爱穿在身上，让日常充满能量。'][hero] }}</p><button class="gold" @click="browseCategory(heroCategories[hero])"><span class="hero-cta-desktop">探索本期精选</span><span class="hero-cta-mobile">去逛逛</span><UmIcon name="arrow" /></button><span class="hero-caption">全球好物 · 买手甄选 · USDT 结算</span></div></template>
        <div class="hero-controls"><div><button v-for="i in 3" :key="i" :class="{ active: hero === i - 1 }" :aria-label="`切换第 ${i} 张主视觉`" :aria-pressed="hero === i - 1" @click="hero = i - 1" /></div><span>{{ isMeme ? 'GLOBAL FINDS / REAL LIFE' : `0${hero + 1}` }} <em>{{ isMeme ? `0${hero + 1} / 03` : '/ 03' }}</em></span></div><button class="edge-scroll-button edge-scroll-prev hero-edge-prev" aria-label="上一张主视觉" @click="moveHero(-1)"><UmIcon name="chevron" /></button><button class="edge-scroll-button edge-scroll-next hero-edge-next" aria-label="下一张主视觉" @click="moveHero(1)"><UmIcon name="chevron" /></button>
      </section>
      <aside class="home-account" aria-label="账户与身份切换">
        <div class="account-welcome"><span class="account-avatar"><UmIcon name="user" /><i v-if="user" /></span><div><small>{{ user ? '很高兴又见到你' : '欢迎来到 Umaomao' }}</small><h3>{{ user ? userStore.displayName : isMeme ? 'GM，来点好东西' : '发现好物，悦享生活' }}</h3></div></div>
        <div class="role-switch" role="group" aria-label="切换账户视角"><span :class="{ buyer: buyerActive }" /><button :aria-pressed="!buyerActive" @click="switchRole('customer')">顾客</button><button :aria-pressed="buyerActive" @click="switchRole('buyer')">买手<UmIcon name="arrow" /></button></div>
        <template v-if="user"><div class="account-balance"><span>{{ buyerActive ? '买手工作台' : '我的可用余额' }}<small>{{ buyerActive ? 'BUYER' : 'USDT' }}</small></span><strong>{{ buyerActive ? '好物，由你精选' : availableBalance }}</strong><button @click="go(buyerActive ? '/buyer/wallet' : '/wallet')">{{ buyerActive ? '查看买手钱包' : '查看钱包' }}<UmIcon :name="buyerActive ? 'arrow' : 'plus'" /></button></div><div v-if="!buyerActive" class="account-shortcuts"><button @click="go('/order?tab=pending')"><b>{{ orderCount('PENDING_PAYMENT') }}</b>待付款</button><button @click="go('/order?tab=receiving')"><b>{{ orderCount('IN_TRANSIT', 'AFTERSALE_CONFIRM') }}</b>待收货</button><button @click="go('/favorites')"><b>{{ favoriteCount ?? '—' }}</b>收藏夹</button></div><div v-else class="account-shortcuts"><button @click="go('/buyer/products')"><UmIcon name="bag" />商品</button><button @click="go('/buyer/orders')"><UmIcon name="box" />订单</button><button @click="go('/buyer/claimable')"><UmIcon name="search" />接单</button></div><button v-if="orderError" class="account-retry" @click="loadAccount">{{ orderError }}，重新加载</button><button class="primary full account-enter" @click="go(buyerActive ? '/buyer/dashboard' : '/profile')">{{ buyerActive ? '进入买手中心' : '进入个人中心' }}<UmIcon name="arrow" /></button></template>
        <template v-else><p class="account-intro">收藏你的心动，<br>让每一份期待都有回响。</p><div class="account-auth"><button class="primary" @click="login">登录</button><button class="outline" @click="go('/auth/register')">注册</button></div><div class="account-shortcuts"><button @click="go('/order')"><UmIcon name="box" />我的订单</button><button @click="go('/favorites')"><UmIcon name="heart" />我的收藏</button><button @click="go('/help')"><UmIcon name="headset" />帮助中心</button></div></template>
        <button class="account-discover" @click="go(buyerActive ? '/buyer/products/create' : '/purchase/create')"><span><small>{{ buyerActive ? 'CURATE & SHARE' : 'FIND YOUR FAVORITE' }}</small><b>{{ buyerActive ? '发布你的精选好物' : '心仪好物，让买手帮你找' }}</b></span><UmIcon name="arrow" /></button>
      </aside>
      <section v-for="(group, index) in [{ title: '数码精选', tag: '科技好物' }, { title: '品质日常', tag: '悦享生活' }, { title: '人气推荐', tag: '买手甄选' }]" :key="group.title" class="home-discovery-cell" :aria-label="group.title"><div class="discovery-cell-heading"><h2>{{ group.title }}</h2><span>{{ group.tag }}</span></div><div class="discovery-cell-products"><button v-for="product in discoveryProducts(index)" :key="product.id" class="discovery-product" @click="openProduct(product)"><span class="discovery-product-image"><img :src="product.images[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="product.title" @error="setImageFallback"></span><span class="discovery-product-name">{{ product.title }}</span><strong>{{ displayPrice(product.price) }}<small>USDT</small></strong></button><div v-if="!discoveryProducts(index).length" class="discovery-cell-state" role="status"><p>{{ sectionLoading[discoverySection(index)] ? '正在发现好物…' : sectionErrors[discoverySection(index)] ? '好物读取失败' : '暂无好物' }}</p><button v-if="sectionErrors[discoverySection(index)]" type="button" class="text-link" @click="sectionLoaders[discoverySection(index)]()">重新加载</button></div></div></section>
    </div>
    <div class="trust-strip"><button @click="go('/help?topic=pay')"><UmIcon name="wallet" /><span>数字支付<small>USDT，轻松结算</small></span></button><button @click="go('/help?topic=delivery')"><UmIcon name="truck" /><span>全球好物<small>品质买手，为你精选</small></span></button><button @click="go('/help?topic=return')"><UmIcon name="shield" /><span>安心选购<small>售后规则，清晰透明</small></span></button><button @click="go('/im')"><UmIcon name="headset" /><span>专属服务<small>每一份期待，都被照顾</small></span></button></div>
    <section class="section home-featured" :aria-busy="sectionLoading[featuredSource]"><div class="section-heading"><h2><template v-if="isMeme"><UmIcon name="fire" />好物雷达<small>THE PICKS</small></template><template v-else>热门好物</template></h2><div v-if="isMeme" class="meme-market-tabs" role="group" aria-label="好物雷达筛选"><button v-for="mode in radarModes" :key="mode.id" :aria-pressed="feedMode === mode.id" @click="feedMode = mode.id">{{ mode.label }}</button></div><button class="text-link" @click="goProductList()">全部商品<UmIcon name="arrow" /></button></div><div v-if="featured.length" class="product-grid featured-grid"><ProductCard v-for="product in featured" :key="product.id"  :product="product" variant="home" :favorite-handler="visualFixture ? ignoreVisualFavorite : undefined" /></div><div v-else class="empty home-section-state"><UmIcon :name="sectionLoading[featuredSource] ? 'clock' : 'bag'" /><h2>{{ sectionLoading[featuredSource] ? '正在发现好物…' : sectionErrors[featuredSource] ? '好物加载失败' : '暂无好物' }}</h2><button v-if="sectionErrors[featuredSource]" class="outline" @click="sectionLoaders[featuredSource]()">重新加载</button></div></section>
    <section class="section"><div class="section-heading"><div><span class="eyebrow">CURATED FOR YOU</span><h2>{{ isMeme ? '你的风格，你说了算' : '把喜欢，融入日常' }}<span>{{ isMeme ? 'CURATED COLLECTIONS' : '值得探索的生活灵感' }}</span></h2></div><button class="text-link" @click="go('/category')">发现全部<UmIcon name="arrow" /></button></div><V47Rail class="editorials" label="生活灵感" cards><button class="editorial tech" @click="browseCategory('手机数码')"><img :src="phoneImage" alt="数码精选"><div><span>01 / DIGITAL</span><h3>科技有型<br>生活有趣</h3><p>发现数码新灵感</p><UmIcon name="arrow" /></div></button><button class="editorial home" @click="browseCategory('家用电器')"><img :src="coffeeImage" alt="品质居家"><div><span>02 / LIVING</span><h3>家的温度<br>从细节开始</h3><p>用好物，认真生活</p><UmIcon name="arrow" /></div></button><button class="editorial fashion" @click="openBrand()"><img :src="bagImage" alt="经典包袋"><div><span>03 / STYLE</span><h3>经得起时光<br>也装得下日常</h3><p>探索经典品牌</p><UmIcon name="arrow" /></div></button></V47Rail></section>
    <V47Rail class="brand-strip" label="品牌发现"><span>与喜爱的品牌相遇</span><button v-for="brand in brandLabels" :key="brand" :class="brand.toLowerCase()" @click="openBrand(brand)">{{ brand }}</button><button class="text-link" @click="openBrand()">全部品牌<UmIcon name="arrow" /></button></V47Rail>
    <section class="ranking section" :aria-busy="sectionLoading.hot"><div class="section-heading"><div><span class="eyebrow">MOST LOVED</span><h2>大家都在喜欢</h2></div><button class="text-link" @click="goProductList('SALES')">探索热销榜<UmIcon name="arrow" /></button></div><V47Rail v-if="rankingProducts.length" class="rank-grid" label="热销好物" cards><button v-for="(product, index) in rankingProducts.slice(0, 3)" :key="product.id" @click="openProduct(product)"><em>0{{ index + 1 }}</em><div><small>{{ rankingCaption(product, index) }}</small><h3>{{ product.title }}</h3><p>{{ displayPrice(product.price) }} <span>USDT</span></p></div><img :src="product.images[0]?.url || PRODUCT_IMAGE_PLACEHOLDER" :alt="product.title" @error="setImageFallback"></button></V47Rail><div v-else class="empty home-section-state"><p>{{ sectionLoading.hot ? '正在加载热销好物…' : sectionErrors.hot ? '热销榜加载失败' : '暂无热销好物' }}</p><button v-if="sectionErrors.hot" class="outline" @click="sectionLoaders.hot()">重新加载</button></div></section>
    <section class="join-banner"><div><span class="eyebrow">{{ isMeme ? 'YOUR WISHLIST. GLOBAL BUYERS.' : 'A WORLD OF POSSIBILITIES' }}</span><h2>{{ isMeme ? '想要的好物，全网帮你找。' : '世界的好物，离你更近。' }}</h2><p>没有找到心仪商品？告诉全球买手，让你的期待有回应。</p></div><button class="gold" @click="go('/purchase/create')">发起我的求购<UmIcon name="arrow" /></button></section>
    <section class="section home-recommendations"><div class="section-heading"><h2>猜你喜欢</h2><span class="recommend-count">{{ recommendationCount }} 件好物</span></div><V47Rail class="recommend-tabs" label="推荐商品分类"><button :class="{ active: homeCategory === '' }" :aria-pressed="homeCategory === ''" @click="homeCategory = ''">为你推荐</button><button v-for="category in categories" :key="category.id" :class="{ active: homeCategory === category.id }" :aria-pressed="homeCategory === category.id" @click="homeCategory = category.id">{{ category.name }}</button></V47Rail><div ref="feedRoot" class="product-feed" :aria-busy="recommendationsLoading"><div v-if="visibleFeed.length" class="product-grid feed-grid home-feed-grid"><ProductCard v-for="product in visibleFeed" :key="product.id"  :product="product" variant="home" :favorite-handler="visualFixture ? ignoreVisualFavorite : undefined" /></div><div v-else class="empty home-section-state"><p>{{ recommendationsLoading ? '正在加载好物…' : feedError || sectionErrors.recommendations || '暂无推荐商品' }}</p><button v-if="feedError || sectionErrors.recommendations" class="outline" @click="loadFeed(true)">重新加载</button></div><div v-if="feedRecords.length" ref="feedSentinel" class="feed-status"><template v-if="hasMoreFeed"><span aria-live="polite">已展示 {{ visibleFeed.length }} / {{ recommendationCount }} 件</span><button :disabled="recommendationsLoading" @click="feedError ? loadFeed() : loadMoreFeed()">{{ feedError ? '重新加载' : recommendationsLoading ? '正在加载…' : '继续浏览' }}<UmIcon name="chevron" /></button></template><span v-else role="status">已展示全部 {{ recommendationCount }} 件好物</span></div></div></section>
  </div>
</template>

<style scoped>
.discovery-cell-state { grid-column:1 / -1; min-height:140px; display:grid; align-content:center; justify-items:center; gap:8px; color:var(--muted); }
.discovery-cell-state p { font-size:13px; }
.home-page { min-width: 0; }
.account-retry { color: var(--muted); font-size: 12px; text-align: left; }
.home-section-state { min-height: 200px; }
</style>
