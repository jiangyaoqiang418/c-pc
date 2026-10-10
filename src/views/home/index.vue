<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/empty-state.vue';
import { Message } from '@/lib/feedback';
import ProductCard from '@/components/product/product-card.vue';
import SideNav from '@/components/layout/side-nav.vue';
import RightPanel from '@/components/layout/right-panel.vue';
import * as realProductApi from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';
import digitalHeroImage from '@/assets/images/home-hero-digital.jpg';
import homeHeroImage from '@/assets/images/home-hero-home.jpg';
import lifeHeroImage from '@/assets/images/home-hero-life.jpg';

const router = useRouter();

const hot = ref<Api.RealProduct.Record[]>([]);
const newest = ref<Api.RealProduct.Record[]>([]);
const flash = ref<Api.RealProduct.Record[]>([]);
const recommendations = ref<Api.RealProduct.Record[]>([]);
const banners = ref<Api.RealProduct.BannerDTO[]>([]);
const flashEndAt = ref<string | number>();
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let heroTimer: ReturnType<typeof setTimeout> | undefined;
let motionPreference: MediaQueryList | undefined;
const homeStarted = ref(false);
const heroHovered = ref(false);
const pageVisible = ref(true);

type HomeSection = 'banners' | 'recommendations' | 'hot' | 'newest' | 'flash';
const sectionErrors = reactive<Record<HomeSection, string>>({
  banners: '',
  recommendations: '',
  hot: '',
  newest: '',
  flash: ''
});
const sectionLoading = reactive<Record<HomeSection, boolean>>({
  banners: false,
  recommendations: false,
  hot: false,
  newest: false,
  flash: false
});
const sectionGuards: Record<HomeSection, ReturnType<typeof createLatestRequestGuard>> = {
  banners: createLatestRequestGuard(),
  recommendations: createLatestRequestGuard(),
  hot: createLatestRequestGuard(),
  newest: createLatestRequestGuard(),
  flash: createLatestRequestGuard()
};

type HeroSlide = Api.RealProduct.BannerDTO & { showcase?: boolean };

// 本地主题展示图只用于活动接口成功返回空列表的情况，不代表促销活动。
const showcaseBanners: HeroSlide[] = [
  { id: 'showcase-digital', image: digitalHeroImage, title: '精选科技，升级生活', subtitle: '发现值得逛的数码好物', tag: '数码好物', showcase: true },
  { id: 'showcase-home', image: homeHeroImage, title: '品质家电，焕新日常', subtitle: '让每一天多一点舒适与从容', tag: '品质生活', showcase: true },
  { id: 'showcase-life', image: lifeHeroImage, title: '生活好物，随心发现', subtitle: '从日常出发，探索更多好物', tag: '生活灵感', showcase: true }
];
const heroSlides = computed<HeroSlide[]>(() => {
  if (!homeStarted.value || sectionLoading.banners || sectionErrors.banners) return [];
  return banners.value.length ? banners.value : showcaseBanners;
});
const heroCurrent = ref(1);
const heroPaused = ref(false);
const heroFocused = ref(false);
const reducedMotion = ref(false);
const activeHero = computed(() => heroSlides.value[heroCurrent.value - 1]);
const heroAutoPlay = computed(() => heroSlides.value.length > 1 && !heroPaused.value && !heroFocused.value
  && !heroHovered.value && pageVisible.value && !reducedMotion.value);

function restartHeroTimer() {
  if (heroTimer !== undefined) window.clearTimeout(heroTimer);
  heroTimer = undefined;
  if (heroAutoPlay.value) heroTimer = window.setTimeout(() => moveHero(1), 5000);
}
watch([heroAutoPlay, heroCurrent, heroSlides], restartHeroTimer);
function updateMotionPreference() { reducedMotion.value = !!motionPreference?.matches; }
function updatePageVisibility() { pageVisible.value = !document.hidden; }

watch(heroSlides, () => { heroCurrent.value = 1; });

function moveHero(direction: number) {
  const count = heroSlides.value.length;
  if (count) heroCurrent.value = (heroCurrent.value - 1 + direction + count) % count + 1;
}

function onHeroFocusOut(event: FocusEvent) {
  heroFocused.value = (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null);
}

// 每张探索卡都对应已有路由或真实列表排序，不创建不存在的品牌频道。
const channelCards = [
  { title: '新品到货', subtitle: '发现刚刚上架的新商品', tag: 'NEW ARRIVALS', icon: 'lucide:sparkles', route: '/product/list?sort=NEW' },
  { title: '人气热销', subtitle: '看看大家正在选什么', tag: 'BEST SELLERS', icon: 'lucide:trending-up', route: '/product/list?sort=SALES' },
  { title: '精选好物', subtitle: '从真实商品中找到心头好', tag: 'DISCOVER', icon: 'lucide:shopping-bag', route: '/product/list' },
  { title: '品类探索', subtitle: '按商品分类慢慢挑选', tag: 'CATEGORIES', icon: 'lucide:layers', route: '/category' },
  { title: '求购大厅', subtitle: '寻找好物，也发布你的需求', tag: 'WANTED', icon: 'lucide:search', route: '/purchase/hall' },
  { title: '我的钱包', subtitle: '查看余额、充值与资金记录', tag: 'WALLET', icon: 'lucide:wallet', route: '/wallet' }
];
const serviceLinks = [
  { title: '数字支付', subtitle: 'USDT 支付与钱包管理', icon: 'lucide:wallet', route: '/wallet' },
  { title: '全球好物', subtitle: '按真实品类发现商品', icon: 'lucide:globe', route: '/category' },
  { title: '安心选购', subtitle: '了解平台规则与售后', icon: 'lucide:shield-check', route: '/help' },
  { title: '沟通服务', subtitle: '查看消息与订单会话', icon: 'lucide:headphones', route: '/im' }
];

async function loadSection(section: HomeSection, task: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>) {
  if (sectionLoading[section]) return;
  const isCurrent = sectionGuards[section].begin();
  sectionLoading[section] = true;
  sectionErrors[section] = '';
  try {
    await task(isCurrent.signal, isCurrent);
  } catch {
    if (!isCurrent()) return;
    clearSectionData(section);
    sectionErrors[section] = '加载失败';
  } finally {
    if (isCurrent()) sectionLoading[section] = false;
  }
}

function clearSectionData(section: HomeSection) {
  if (section === 'banners') {
    banners.value = [];
    return;
  }
  if (section === 'recommendations') {
    recommendations.value = [];
    return;
  }
  if (section === 'hot') {
    hot.value = [];
    return;
  }
  if (section === 'newest') {
    newest.value = [];
    return;
  }
  flash.value = [];
  flashEndAt.value = undefined;
}

const sectionLoaders: Record<HomeSection, () => Promise<void>> = {
  banners: () => loadSection('banners', async (signal, isCurrent) => {
    const value = await realProductApi.fetchHomeBanners({ signal });
    if (isCurrent()) banners.value = value;
  }),
  recommendations: () => loadSection('recommendations', async (signal, isCurrent) => {
    const value = await realProductApi.fetchHomeRecommendations(20, { signal });
    if (isCurrent()) recommendations.value = value;
  }),
  hot: () => loadSection('hot', async (signal, isCurrent) => {
    const value = await realProductApi.fetchBestSellers(20, { signal });
    if (isCurrent()) hot.value = value;
  }),
  newest: () => loadSection('newest', async (signal, isCurrent) => {
    const value = await realProductApi.fetchNewArrivals(20, { signal });
    if (isCurrent()) newest.value = value;
  }),
  flash: () => loadSection('flash', async (signal, isCurrent) => {
    const result = await realProductApi.fetchFlashSale(20, { signal });
    if (!isCurrent()) return;
    flash.value = result.map(item => item.product);
    flashEndAt.value = result.find(item => item.sessionEndTime)?.sessionEndTime;
  })
};

function loadAllSections() {
  return Promise.all(Object.values(sectionLoaders).map(load => load()));
}

const failedProductSections = computed(() => [
  ['recommendations', '推荐'],
  ['hot', '热销榜'],
  ['newest', '新品'],
  ['flash', '秒杀']
].filter(([key]) => sectionErrors[key as HomeSection]).map(([, label]) => label));

function retryProductSections() {
  failedProductSections.value.forEach(label => {
    const section = ({ 推荐: 'recommendations', 热销榜: 'hot', 新品: 'newest', 秒杀: 'flash' } as const)[label as '推荐' | '热销榜' | '新品' | '秒杀'];
    void sectionLoaders[section]();
  });
}

onMounted(() => {
  homeStarted.value = true;
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  updateMotionPreference();
  updatePageVisibility();
  motionPreference.addEventListener('change', updateMotionPreference);
  document.addEventListener('visibilitychange', updatePageVisibility);
  void loadAllSections();

  countdownTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  Object.values(sectionGuards).forEach(guard => guard.invalidate());
  if (countdownTimer) window.clearInterval(countdownTimer);
  if (heroTimer !== undefined) window.clearTimeout(heroTimer);
  motionPreference?.removeEventListener('change', updateMotionPreference);
  document.removeEventListener('visibilitychange', updatePageVisibility);
});

const buyersPick = computed(() => recommendations.value.slice(0, 4));
const flashCountdown = computed(() => {
  if (!flashEndAt.value) return '进行中';
  const raw = flashEndAt.value;
  const endAt = typeof raw === 'number'
    ? raw
    : /^\d+$/.test(raw)
      ? Number(raw)
      : Date.parse(raw);
  if (!Number.isFinite(endAt)) return '时间待确认';
  const seconds = Math.max(0, Math.floor((endAt - now.value) / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
});

function goBanner(path?: string) {
  if (!path) return;
  const productDetail = path.match(/^\/product\/([^/?#]+)$/);
  if (productDetail) {
    router.push({ name: 'product-detail', params: { id: productDetail[1] } });
    return;
  }
  if (/^https?:\/\//.test(path)) {
    window.location.assign(path);
    return;
  }
  Message.info('活动页面暂未开放');
}

function goProductList(sort: realProductApi.StorefrontSort = 'DEFAULT') {
  router.push({ name: 'product-list', query: { sort: sort === 'DEFAULT' ? undefined : sort } });
}

const productLoading = computed(() => sectionLoading.recommendations || sectionLoading.hot || sectionLoading.newest || sectionLoading.flash);
const hasProducts = computed(() => !!(hot.value.length || newest.value.length || flash.value.length || recommendations.value.length));
const productSections = computed(() => [
  { key: 'pick', source: 'recommendations', title: '今日值得逛', eyebrow: 'CURATED FOR YOU', records: buyersPick.value, sort: 'DEFAULT' },
  { key: 'flash', source: 'flash', title: '限时秒杀', eyebrow: 'LIMITED TIME', records: flash.value.slice(0, 4), sort: 'DEFAULT' },
  { key: 'hot', source: 'hot', title: '人气热销', eyebrow: 'BEST SELLERS', records: hot.value.slice(0, 8), sort: 'SALES' },
  { key: 'newest', source: 'newest', title: '新品到货', eyebrow: 'NEW ARRIVALS', records: newest.value.slice(0, 8), sort: 'NEW' },
  { key: 'recommendations', source: 'recommendations', title: '为你推荐', eyebrow: 'MORE TO DISCOVER', records: recommendations.value, sort: 'DEFAULT' }
] satisfies { key: string; source: Exclude<HomeSection, 'banners'>; title: string; eyebrow: string; records: Api.RealProduct.Record[]; sort: realProductApi.StorefrontSort }[]);
</script>

<template>
  <div class="home-page">
    <section class="hero-band" aria-label="分类、精选活动与账户入口">
      <SideNav class="hb-left" />
      <div class="hb-center">
        <div
          v-if="activeHero"
          class="hero-stage"
          role="region"
          aria-roledescription="轮播"
          aria-label="首页精选"
          :aria-live="heroAutoPlay ? 'off' : 'polite'"
          @mouseenter="heroHovered = true"
          @mouseleave="heroHovered = false"
          @focusin="heroFocused = true"
          @focusout="onHeroFocusOut"
        >
          <Transition name="hero-fade">
            <div
              v-if="activeHero"
              :key="activeHero.id"
              class="hero-single"
              :class="{ 'hero-showcase': activeHero.showcase }"
              :style="{ backgroundImage: `url(${activeHero.image})` }"
              :role="activeHero.pathTo ? 'link' : undefined"
              :tabindex="activeHero.pathTo ? 0 : undefined"
              :aria-label="activeHero.pathTo ? `查看活动：${activeHero.title}` : undefined"
              @click="goBanner(activeHero.pathTo)"
              @keydown.enter.self="goBanner(activeHero.pathTo)"
              @keydown.space.self.prevent="goBanner(activeHero.pathTo)"
            >
              <div class="hero-overlay" />
              <div class="hero-content">
                <span v-if="activeHero.tag" class="hero-tag">{{ activeHero.tag }}</span>
                <h1>{{ activeHero.title }}</h1>
                <p v-if="activeHero.subtitle">{{ activeHero.subtitle }}</p>
                <button v-if="activeHero.showcase" class="hero-cta" @click.stop="goProductList()">
                  浏览商品 <Icon icon="lucide:arrow-right" width="16" />
                </button>
                <button v-else-if="activeHero.pathTo" class="hero-cta" @click.stop="goBanner(activeHero.pathTo)">
                  立即查看 <Icon icon="lucide:arrow-right" width="16" />
                </button>
              </div>
            </div>
          </Transition>
          <div v-if="heroSlides.length > 1" class="hero-controls">
            <button class="hero-control" aria-label="上一张" @click="moveHero(-1)"><Icon icon="lucide:chevron-left" width="16" /></button>
            <div class="hero-dots">
              <button v-for="(slide, index) in heroSlides" :key="slide.id" class="hero-dot" :class="{ active: heroCurrent === index + 1 }" :aria-label="`第 ${index + 1} 张：${slide.title}`" :aria-current="heroCurrent === index + 1 ? 'true' : undefined" @click="heroCurrent = index + 1"><span /></button>
            </div>
            <button class="hero-control" aria-label="下一张" @click="moveHero(1)"><Icon icon="lucide:chevron-right" width="16" /></button>
            <button v-if="!reducedMotion" class="hero-control" :aria-label="heroPaused ? '播放轮播' : '暂停轮播'" :aria-pressed="heroPaused" @click="heroPaused = !heroPaused">
              <Icon :icon="heroPaused ? 'lucide:play' : 'lucide:pause'" width="14" />
            </button>
          </div>
        </div>
        <div v-else class="hero-unavailable" :aria-busy="sectionLoading.banners || !homeStarted">
          <Icon icon="lucide:image" width="32" aria-hidden="true" />
          <h2>{{ !homeStarted || sectionLoading.banners ? '正在加载首页活动…' : '首页活动加载失败' }}</h2>
          <p>下方商品栏目可独立浏览</p>
          <Button v-if="sectionErrors.banners" variant="outline" size="sm" :disabled="sectionLoading.banners" @click="sectionLoaders.banners">重新加载</Button>
        </div>
      </div>
      <RightPanel class="hb-right" />
    </section>

    <nav class="service-band" aria-label="平台服务">
      <RouterLink v-for="service in serviceLinks" :key="service.route" :to="service.route" class="service-link">
        <Icon :icon="service.icon" width="28" />
        <div><strong>{{ service.title }}</strong><span>{{ service.subtitle }}</span></div>
      </RouterLink>
    </nav>

    <Alert v-if="failedProductSections.length" variant="destructive" class="home-error">
      <Icon icon="lucide:circle-alert" width="18" />
      <AlertDescription class="home-error-content">
        <span>{{ failedProductSections.join('、') }}加载失败，请稍后重试。</span>
        <Button variant="outline" size="sm" @click="retryProductSections">重新加载</Button>
      </AlertDescription>
    </Alert>

    <section class="channel-section" aria-labelledby="discovery-heading">
      <header class="section-heading"><div><span class="eyebrow">FIND YOUR NEXT FAVORITE</span><h2 id="discovery-heading">随心发现</h2></div></header>
      <div class="channel-grid">
        <RouterLink v-for="channel in channelCards" :key="channel.route" :to="channel.route" class="channel-card">
          <div><span class="channel-tag">{{ channel.tag }}</span><h3>{{ channel.title }}</h3><p>{{ channel.subtitle }}</p></div>
          <Icon :icon="channel.icon" width="32" class="channel-icon" />
          <Icon icon="lucide:arrow-up-right" width="16" class="channel-arrow" />
        </RouterLink>
      </div>
    </section>

    <template v-for="section in productSections" :key="section.key">
      <section v-if="section.records.length || sectionLoading[section.source] || sectionErrors[section.source]" class="product-section" :aria-label="section.title" :aria-busy="sectionLoading[section.source]">
        <header class="section-heading">
          <div><span class="eyebrow">{{ section.eyebrow }}</span><h2>{{ section.title }}</h2></div>
          <span v-if="section.key === 'flash' && flash.length" class="countdown"><Icon icon="lucide:clock" width="14" />{{ flashEndAt ? '距结束' : '' }} {{ flashCountdown }}</span>
          <Button variant="ghost" size="sm" class="section-more" @click="goProductList(section.sort)">浏览全部商品 <Icon icon="lucide:arrow-right" width="16" /></Button>
        </header>
        <div v-if="sectionLoading[section.source] && !section.records.length" class="home-products" aria-hidden="true">
          <div v-for="index in 4" :key="index" class="home-skeleton"><Skeleton class="aspect-square w-full" /><Skeleton class="mt-4 h-4 w-3/4" /><Skeleton class="mt-4 h-6 w-1/2" /></div>
        </div>
        <div v-else-if="section.records.length" class="home-products">
          <ProductCard v-for="product in section.records" :key="product.id" :product="product" variant="home" />
        </div>
        <EmptyState v-else :title="`${section.title}加载失败`" description="请检查网络后重新加载。" action-text="重新加载" @action="sectionLoaders[section.source]" />
      </section>
    </template>
    <EmptyState v-if="homeStarted && !productLoading && !hasProducts && !failedProductSections.length" title="暂时没有可展示的商品" description="可查看全部商品或稍后再来。" action-text="浏览商品" @action="goProductList()" />
  </div>
</template>

<style scoped>
.home-page { padding-top: 24px; padding-bottom: 48px; }
.hero-band { display: grid; grid-template-columns: 220px minmax(0, 1fr) 260px; gap: 20px; align-items: stretch; margin-bottom: 24px; }
.hb-left, .hb-center, .hb-right { min-width: 0; }
.hb-center { display: flex; }
.home-page :deep(.side-nav), .home-page :deep(.right-panel) { width: 100%; }
.hero-stage, .hero-unavailable { position: relative; min-height: 370px; width: 100%; height: 100%; border-radius: 12px; overflow: hidden; }
.hero-stage { background: var(--yb-deep); }
.hero-single { position: absolute; inset: 0; background-size: cover; background-position: center; }
.hero-single[role="link"] { cursor: pointer; }
.hero-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(var(--yb-primary-rgb), .88), rgba(var(--yb-primary-rgb), .3) 80%); }
.hero-showcase .hero-overlay { background: linear-gradient(90deg, rgba(var(--yb-primary-rgb), .72), rgba(var(--yb-primary-rgb), .06) 90%); }
.hero-content { position: relative; display: flex; flex-direction: column; justify-content: center; height: 100%; max-width: 90%; padding: 32px 32px 80px; color: #fff; }
.hero-tag { display: inline-flex; align-self: flex-start; margin-bottom: 18px; color: var(--yb-apricot); font-size: 12px; letter-spacing: .08em; }
.hero-content h1 { margin: 0 0 16px; font-size: clamp(26px, 2.4vw, 38px); font-weight: 600; line-height: 1.4; letter-spacing: -.7px; overflow-wrap: anywhere; }
.hero-content p { margin: 0 0 24px; color: rgb(255 255 255 / 82%); font-size: 15px; line-height: 1.8; }
.hero-cta { display: inline-flex; align-self: flex-start; align-items: center; gap: 16px; padding: 11px 18px; background: var(--yb-accent); color: var(--yb-accent-ink); border-radius: 6px; font-size: 14px; font-weight: 600; transition: background 150ms; }
.hero-cta:hover { background: var(--yb-apricot); }
.hero-controls { position: absolute; right: 18px; bottom: 18px; z-index: 2; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 6px; background: rgba(var(--yb-primary-rgb), .68); }
.hero-control, .hero-dot { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; border-radius: 4px; color: #fff; transition: background 150ms; }
.hero-control:hover, .hero-dot:hover { background: rgb(255 255 255 / 12%); }
.hero-controls button:focus-visible, .hero-cta:focus-visible { outline-color: var(--yb-apricot); }
.hero-dots { display: flex; }
.hero-dot { width: 24px; }
.hero-dot span { width: 6px; height: 6px; border-radius: 4px; background: rgb(255 255 255 / 50%); transition: width 150ms, background 150ms; }
.hero-dot.active span { width: 18px; background: var(--yb-apricot); }
.hero-fade-enter-active, .hero-fade-leave-active { transition: opacity 200ms var(--um-ease); }
.hero-fade-enter-from, .hero-fade-leave-to { opacity: 0; }
.hero-unavailable { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 32px; text-align: center; background: var(--yb-fill); border: 1px solid var(--yb-hairline); }
.hero-unavailable h2 { font-size: 20px; font-weight: 600; }
.hero-unavailable p { color: var(--yb-muted); font-size: 14px; }
.service-band { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 22px 0; margin-bottom: 40px; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-surface); }
.service-link { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 0 16px; color: var(--yb-primary); transition: color 150ms; }
.service-link + .service-link { border-left: 1px solid var(--yb-hairline); }
.service-link:hover { color: var(--yb-gold); }
.service-link strong { display: block; font-size: 14px; font-weight: 500; color: var(--yb-ink); }
.service-link span { display: block; margin-top: 4px; font-size: 12px; color: var(--yb-muted); }
.home-error { margin-bottom: 32px; }
.home-error-content { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.channel-section, .product-section { margin-bottom: 40px; }
.section-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 22px; }
.eyebrow { color: var(--yb-muted); font-size: 11px; letter-spacing: .14em; }
.section-heading h2 { margin-top: 6px; font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
.section-more { margin-left: auto; }
.channel-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.channel-card { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 144px; padding: 24px; background: var(--yb-surface); border: 1px solid var(--yb-hairline); border-radius: 12px; transition: transform 200ms var(--um-ease), border-color 150ms, box-shadow 200ms; }
.channel-card:nth-child(3n + 1) { background: var(--yb-fill); }
.channel-card:nth-child(3n + 2) { background: var(--yb-champagne); }
.channel-card:hover { transform: translateY(-2px); border-color: var(--yb-hairline-2); box-shadow: var(--yb-shadow-1); }
.channel-tag { color: var(--yb-muted); font-size: 10px; letter-spacing: .14em; }
.channel-card h3 { margin: 6px 0; color: var(--yb-ink); font-size: 20px; font-weight: 600; }
.channel-card p { color: var(--yb-muted); font-size: 13px; }
.channel-icon { color: var(--yb-primary); flex-shrink: 0; }
.channel-arrow { position: absolute; right: 16px; top: 16px; color: var(--yb-muted); }
.home-products { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
.home-skeleton { padding: 12px; background: var(--yb-surface); border-radius: 8px; }
.countdown { display: inline-flex; align-items: center; gap: 8px; color: var(--yb-danger); font-size: 13px; font-variant-numeric: tabular-nums; }
@media (max-width: 1200px) {
  .hero-band { grid-template-columns: 190px minmax(0, 1fr) 240px; gap: 16px; }
  .hero-content { padding-left: 24px; padding-right: 24px; }
  .service-link { gap: 10px; padding: 0 12px; }
  .home-products { gap: 20px; }
}
@media (max-width: 1024px) {
  .hero-band { grid-template-columns: 180px minmax(0, 1fr); }
  .hb-right { grid-column: 1 / -1; }
  .home-page :deep(.right-panel) { display: grid; grid-template-columns: 240px minmax(0, 1fr); }
  .service-band { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 20px; }
  .service-link:nth-child(3) { border-left: 0; }
  .home-products { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .hero-fade-enter-active, .hero-fade-leave-active, .hero-control, .hero-dot, .hero-dot span, .hero-cta, .service-link, .channel-card { transition: none; }
  .channel-card:hover { transform: none; }
}
</style>
