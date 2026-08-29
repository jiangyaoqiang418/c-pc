<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Message } from '@arco-design/web-vue';
import { bannerImage } from '@shared/utils/image';
import ProductCard from '@/components/product/product-card.vue';
import SideNav from '@/components/layout/side-nav.vue';
import RightPanel from '@/components/layout/right-panel.vue';
import * as realProductApi from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();

const hot = ref<Api.RealProduct.Record[]>([]);
const newest = ref<Api.RealProduct.Record[]>([]);
const flash = ref<Api.RealProduct.Record[]>([]);
const recommendations = ref<Api.RealProduct.Record[]>([]);
const banners = ref<Api.RealProduct.BannerDTO[]>([]);
const flashEndAt = ref<string | number>();
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;

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

const heroBanner = computed(() => banners.value[0]);

// 频道广场 6 卡组合
const channelCards = [
  { key: 'new', title: '新品首发', sub: '油宝小魔方 · 精选好物', tag: 'NEW', bg: 'champagne', large: true, image: bannerImage(1, 400) },
  { key: 'rank', title: '超级排行榜', sub: '你的最爱 · 榜上有名', tag: 'RANK', bg: 'cream', large: true, image: bannerImage(3, 400) },
  { key: 'select', title: '油宝甄选', sub: '又好又便宜', tag: 'PICK', bg: 'purple', image: bannerImage(2, 300) },
  { key: 'digital', title: '电脑数码', sub: '值得买低价', tag: 'DIGITAL', bg: 'cream', image: bannerImage(4, 300) },
  { key: 'fashion', title: '油宝服饰', sub: '时尚潮流 · 温暖速递', tag: 'FASHION', bg: 'purple', image: bannerImage(0, 300) },
  { key: 'brand', title: '油宝京造', sub: '油宝自有品牌', tag: 'BRAND', bg: 'champagne', image: bannerImage(5, 300) }
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
  void loadAllSections();

  countdownTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  Object.values(sectionGuards).forEach(guard => guard.invalidate());
  if (countdownTimer) window.clearInterval(countdownTimer);
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

function showUnavailableProductList() {
  router.push({ name: 'product-list' });
}
</script>

<template>
  <div class="home-page">
    <!-- ============ Hero Band (全宽主 + 2 副) ============ -->
    <!-- ============ Hero Band · 3-col ONLY at top ============ -->
    <section class="hero-band">
      <SideNav class="hb-left" />

      <div class="hb-center">
        <div
          v-if="heroBanner"
          class="hero-single"
          :style="{ backgroundImage: `url(${heroBanner.image})` }"
          @click="goBanner(heroBanner.pathTo)"
        >
          <div class="hero-overlay" />
          <div class="hero-content">
            <div v-if="heroBanner.tag" class="hero-tag">{{ heroBanner.tag }}</div>
            <h2 class="hero-title">{{ heroBanner.title }}</h2>
            <p v-if="heroBanner.subtitle" class="hero-sub">{{ heroBanner.subtitle }}</p>
            <button v-if="heroBanner.pathTo" class="hero-cta" @click.stop="goBanner(heroBanner.pathTo)">
              立即查看 <Icon icon="lucide:arrow-right" width="13" />
            </button>
          </div>
        </div>
        <div v-else class="hero-unavailable">
          <span>{{ sectionErrors.banners ? '首页活动加载失败' : '暂无首页活动' }}</span>
          <a-button v-if="sectionErrors.banners" size="small" :loading="sectionLoading.banners" @click="sectionLoaders.banners">重新加载</a-button>
        </div>
      </div>

      <RightPanel class="hb-right" />
    </section>

    <a-alert v-if="failedProductSections.length" type="error" :closable="false" class="home-error">
      {{ failedProductSections.join('、') }}加载失败，未使用本地数据替代。
      <template #action><a-button size="mini" @click="retryProductSections">重新加载</a-button></template>
    </a-alert>

    <!-- ============ BUYER'S PICK · 今日值得逛 ============ -->
    <section v-if="buyersPick.length" class="pick-section">
      <div class="pick-head">
        <div class="pick-eyebrow">BUYER'S PICK</div>
        <h3 class="pick-title">今日值得逛</h3>
        <button class="pick-more" @click="showUnavailableProductList">
          更多精选 <Icon icon="lucide:arrow-up-right" width="12" />
        </button>
      </div>
      <div class="pick-grid">
        <ProductCard v-for="p in buyersPick" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- ============ 分区标题装饰: 频道广场 ============ -->
    <div class="deco-title-wrap">
      <div class="deco-title">
        <span class="deco-mark">◆</span>
        <span class="deco-line" />
        <span class="deco-text">频道广场</span>
        <span class="deco-line" />
        <span class="deco-mark">◆</span>
      </div>
    </div>

    <!-- 频道广场 6 卡组合 -->
    <section class="channel-grid">
      <div
        v-for="c in channelCards"
        :key="c.key"
        class="channel-card"
        :class="[`bg-${c.bg}`, { large: c.large }]"
      >
        <div class="ch-content">
          <div class="ch-eyebrow">{{ c.tag }}</div>
          <div class="ch-title">{{ c.title }}</div>
          <div class="ch-sub">{{ c.sub }}</div>
        </div>
        <img :src="c.image" :alt="c.title" class="ch-thumb" loading="lazy" />
      </div>
    </section>

    <!-- ============ 限时秒杀 ============ -->
    <section v-if="flash.length" class="dense-section">
      <div class="sec-bar">
        <div class="sec-title-row">
          <div class="sec-tag flash"><Icon icon="lucide:flame" width="12" /> LIMITED</div>
          <h3 class="sec-title">限时秒杀</h3>
          <div class="countdown"><Icon icon="lucide:clock" width="12" /> 距结束 <span class="yb-mono">{{ flashCountdown }}</span></div>
        </div>
        <button class="text-link" @click="showUnavailableProductList">
          查看全部 <Icon icon="lucide:arrow-right" width="12" />
        </button>
      </div>
      <div class="grid-4">
        <ProductCard v-for="p in flash.slice(0, 4)" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- ============ 热销 ============ -->
    <section v-if="hot.length" class="dense-section">
      <div class="sec-bar">
        <div class="sec-title-row">
          <div class="sec-tag hot"><Icon icon="lucide:trending-up" width="12" /> HOT</div>
          <h3 class="sec-title">热销榜</h3>
        </div>
        <button class="text-link" @click="showUnavailableProductList">
          查看全部 <Icon icon="lucide:arrow-right" width="12" />
        </button>
      </div>
      <div class="grid-4">
        <ProductCard v-for="p in hot.slice(0, 8)" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- ============ 新品 ============ -->
    <section v-if="newest.length" class="dense-section">
      <div class="sec-bar">
        <div class="sec-title-row">
          <div class="sec-tag new"><Icon icon="lucide:sparkles" width="12" /> NEW</div>
          <h3 class="sec-title">新品直邮</h3>
        </div>
        <button class="text-link" @click="showUnavailableProductList">
          查看全部 <Icon icon="lucide:arrow-right" width="12" />
        </button>
      </div>
      <div class="grid-4">
        <ProductCard v-for="p in newest.slice(0, 8)" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- ============ 分区装饰：为你推荐 ============ -->
    <div v-if="recommendations.length" class="deco-title-wrap">
      <div class="deco-title">
        <span class="deco-mark">◆</span>
        <span class="deco-line" />
        <span class="deco-text">为你推荐</span>
        <span class="deco-line" />
        <span class="deco-mark">◆</span>
      </div>
    </div>

    <!-- 为你推荐密集流 -->
    <section v-if="recommendations.length" class="dense-section">
      <div class="grid-4">
        <ProductCard v-for="p in recommendations" :key="p.id" :product="p" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  padding-bottom: 40px;
}
.home-error {
  margin-bottom: 20px;
}

/* ========== Hero Band 3-col ========== */
.hero-band {
  display: grid;
  grid-template-columns: 220px 1fr 280px;
  gap: 16px;
  align-items: stretch;
  margin-bottom: 24px;
}
.hb-left,
.hb-right {
  align-self: stretch;
}
.hb-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (max-width: 1200px) {
  .hero-band {
    grid-template-columns: 200px 1fr 260px;
  }
}
@media (max-width: 992px) {
  .hero-band {
    grid-template-columns: 1fr;
  }
  .hb-left,
  .hb-right {
    display: none;
  }
}

/* ========== Hero (single) ========== */
.hero-single {
  position: relative;
  min-height: 320px;
  flex: 1;
  border-radius: 14px;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  cursor: pointer;
}
.hero-unavailable {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--yb-hairline);
  border-radius: 14px;
  background: var(--yb-surface);
  color: var(--yb-muted);
  font-size: 14px;
  flex-direction: column;
  gap: 12px;
}
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, rgba(15, 17, 26, 0.72) 0%, rgba(15, 17, 26, 0.35) 50%, transparent 100%);
}
.hero-content {
  position: relative;
  padding: 48px 56px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: #fff;
  max-width: 620px;
}
.hero-tag {
  display: inline-flex;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  margin-bottom: 14px;
  align-self: flex-start;
}
.hero-title {
  font-family: var(--yb-font-display);
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.1;
}
.hero-title.alt {
  color: var(--yb-gold);
  margin-bottom: 12px;
}
.hero-sub {
  font-size: 14px;
  opacity: 0.88;
  margin: 0 0 20px;
}
.hero-cta {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 26px;
  background: #fff;
  color: var(--yb-ink);
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
}
.hero-cta:hover { transform: translateY(-2px); }

/* ========== BUYER'S PICK · 今日值得逛 ========== */
.pick-section {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 14px;
  padding: 24px 24px 20px;
  margin-bottom: 20px;
}
.pick-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.pick-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-gold);
}
.pick-title {
  font-family: var(--yb-font-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--yb-ink);
  margin: 0;
}
.pick-more {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--yb-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.pick-more:hover { color: var(--yb-ink); }
.pick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 1200px) {
  .pick-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 992px) {
  .pick-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ========== Decorative section title ========== */
.deco-title-wrap {
  display: flex;
  justify-content: center;
  margin: 28px 0 20px;
}
.deco-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.deco-mark {
  color: var(--yb-gold);
  font-size: 12px;
}
.deco-line {
  width: 40px;
  height: 1px;
  background: var(--yb-hairline-2);
}
.deco-text {
  font-family: var(--yb-font-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--yb-ink);
}

/* ========== Channel grid (2 big + 4 small in 4x2) ========== */
.channel-grid {
  display: grid;
  grid-template-columns: 1.6fr 1.6fr 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
  height: 260px;
}
.channel-card {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.channel-card.large {
  grid-row: span 2;
  padding: 28px;
}
.channel-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--yb-shadow-2);
}
.channel-card.bg-champagne { background: var(--yb-champagne); }
.channel-card.bg-cream { background: #FBF7F0; }
.channel-card.bg-purple { background: rgba(91, 92, 231, 0.08); }
.ch-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
}
.ch-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--yb-gold);
}
.channel-card.bg-purple .ch-eyebrow { color: var(--yb-primary); }
.ch-title {
  font-family: var(--yb-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--yb-ink);
}
.channel-card.large .ch-title { font-size: 22px; }
.ch-sub {
  font-size: 12px;
  color: var(--yb-muted);
}
.ch-thumb {
  width: 70px;
  height: 70px;
  border-radius: 12px;
  object-fit: cover;
  align-self: flex-end;
}
.channel-card.large .ch-thumb {
  width: 120px;
  height: 120px;
  align-self: center;
}

/* ========== Dense sections ========== */
.dense-section {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 14px;
  padding: 16px 20px 20px;
  margin-bottom: 16px;
}
.sec-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.sec-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sec-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.sec-tag.flash { background: var(--yb-danger-soft); color: var(--yb-danger); }
.sec-tag.hot   { background: var(--yb-primary-soft); color: var(--yb-primary); }
.sec-tag.new   { background: var(--yb-success-soft); color: var(--yb-success); }
.sec-tag.gold  { background: var(--yb-champagne); color: var(--yb-gold); }
.sec-title {
  font-family: var(--yb-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--yb-ink);
  margin: 0;
}
.countdown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--yb-danger-soft);
  color: var(--yb-danger);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
}
.text-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--yb-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.text-link:hover { color: var(--yb-ink); }

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 1439px) {
  .grid-4 { grid-template-columns: repeat(5, 1fr); }
}
@media (max-width: 1200px) {
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .channel-grid { grid-template-columns: 1.4fr 1.4fr 1fr 1fr; }
}
</style>
