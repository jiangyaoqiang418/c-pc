<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { productApi } from '@shared';
import { avatarUrl, bannerImage } from '@shared/utils/image';
import ProductCard from '@/components/product/product-card.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import SideNav from '@/components/layout/side-nav.vue';
import RightPanel from '@/components/layout/right-panel.vue';

const router = useRouter();

const hot = ref<Api.Product.ProductRecord[]>([]);
const newest = ref<Api.Product.ProductRecord[]>([]);
const flash = ref<Api.Product.ProductRecord[]>([]);
const topSellers = ref<Api.Product.SellerDist[]>([]);
const flashCountdown = ref('02:14:38');

// 单张主 hero（taomall 骨架：不做自动轮播）
const heroBanner = {
  eyebrow: 'SUMMER TECH',
  title: '数码焕新季',
  titleAlt: '每件都值得',
  sub: '买手精选 100+ 人气新品 · 至高立减 800 元',
  cta: '立即逛逛',
  image: bannerImage(1, 1400),
  path: '/product/list?categoryId=2'
};

// 频道广场 6 卡组合
const channelCards = [
  { key: 'new', title: '新品首发', sub: '油宝小魔方 · 精选好物', tag: 'NEW', bg: 'champagne', large: true, image: bannerImage(1, 400) },
  { key: 'rank', title: '超级排行榜', sub: '你的最爱 · 榜上有名', tag: 'RANK', bg: 'cream', large: true, image: bannerImage(3, 400) },
  { key: 'select', title: '油宝甄选', sub: '又好又便宜', tag: 'PICK', bg: 'purple', image: bannerImage(2, 300) },
  { key: 'digital', title: '电脑数码', sub: '值得买低价', tag: 'DIGITAL', bg: 'cream', image: bannerImage(4, 300) },
  { key: 'fashion', title: '油宝服饰', sub: '时尚潮流 · 温暖速递', tag: 'FASHION', bg: 'purple', image: bannerImage(0, 300) },
  { key: 'brand', title: '油宝京造', sub: '油宝自有品牌', tag: 'BRAND', bg: 'champagne', image: bannerImage(5, 300) }
];

onMounted(async () => {
  const recs = await productApi.fetchHomeRecommends();
  hot.value = recs.hot;
  newest.value = recs.newest;
  flash.value = recs.flash;
  topSellers.value = recs.topSellers;
});

// BUYER'S PICK 今日值得逛：从 hot 里取前 4 张
const buyersPick = computed(() => hot.value.slice(0, 4));

function goCategory(id: number) {
  router.push({ name: 'product-list', query: { categoryId: String(id) } });
}
function goSeller(sellerId: number) {
  router.push({ name: 'product-list', query: { sellerId: String(sellerId) } });
}

const buyersWithMeta = computed(() =>
  topSellers.value.slice(0, 6).map((s, i) => ({
    ...s,
    avatar: avatarUrl(s.sellerId),
    rank: i + 1
  }))
);

// 为你推荐：hot + newest 混合
const recommendations = computed(() => {
  const mix: Api.Product.ProductRecord[] = [];
  const max = Math.max(hot.value.length, newest.value.length);
  for (let i = 0; i < max; i++) {
    if (hot.value[i]) mix.push(hot.value[i]);
    if (newest.value[i]) mix.push(newest.value[i]);
  }
  return mix.slice(0, 20);
});
</script>

<template>
  <div class="home-page">
    <!-- ============ Hero Band (全宽主 + 2 副) ============ -->
    <!-- ============ Hero Band · 3-col ONLY at top ============ -->
    <section class="hero-band">
      <SideNav class="hb-left" />

      <div class="hb-center">
        <div
          class="hero-single"
          :style="{ backgroundImage: `url(${heroBanner.image})` }"
          @click="router.push(heroBanner.path)"
        >
          <div class="hero-overlay" />
          <div class="hero-content">
            <div class="hero-tag">{{ heroBanner.eyebrow }}</div>
            <h2 class="hero-title">{{ heroBanner.title }}</h2>
            <h2 class="hero-title alt">{{ heroBanner.titleAlt }}</h2>
            <p class="hero-sub">{{ heroBanner.sub }}</p>
            <button class="hero-cta" @click.stop="router.push(heroBanner.path)">
              {{ heroBanner.cta }} <Icon icon="lucide:arrow-right" width="13" />
            </button>
          </div>
        </div>
      </div>

      <RightPanel class="hb-right" />
    </section>

    <!-- ============ BUYER'S PICK · 今日值得逛 ============ -->
    <section v-if="buyersPick.length" class="pick-section">
      <div class="pick-head">
        <div class="pick-eyebrow">BUYER'S PICK</div>
        <h3 class="pick-title">今日值得逛</h3>
        <button class="pick-more" @click="router.push({ name: 'product-list', query: { sort: 'sales' } })">
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
        <button class="text-link" @click="router.push({ name: 'product-list', query: { sort: 'flash' } })">
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
        <button class="text-link" @click="router.push({ name: 'product-list', query: { sort: 'sales' } })">
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
        <button class="text-link" @click="router.push({ name: 'product-list', query: { sort: 'newest' } })">
          查看全部 <Icon icon="lucide:arrow-right" width="12" />
        </button>
      </div>
      <div class="grid-4">
        <ProductCard v-for="p in newest.slice(0, 8)" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- ============ 买手榜 ============ -->
    <section v-if="buyersWithMeta.length" class="dense-section">
      <div class="sec-bar">
        <div class="sec-title-row">
          <div class="sec-tag gold"><Icon icon="lucide:crown" width="12" /> TOP</div>
          <h3 class="sec-title">买手风云榜</h3>
        </div>
      </div>
      <div class="seller-grid">
        <div v-for="(s, i) in buyersWithMeta" :key="s.sellerId" class="seller-card" @click="goSeller(s.sellerId)">
          <div class="rank" :class="{ top: s.rank <= 3 }">No.{{ s.rank }}</div>
          <img :src="s.avatar" :alt="s.sellerName" class="seller-avatar" />
          <div class="seller-name">{{ s.sellerName }}</div>
          <VipBadge :level="i < 2 ? 'VIP2' : 'VIP1'" size="sm" />
          <div class="seller-meta">
            <Icon icon="lucide:package" width="10" />
            <span class="yb-mono">{{ s.count }} 在售</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 分区装饰：为你推荐 ============ -->
    <div class="deco-title-wrap">
      <div class="deco-title">
        <span class="deco-mark">◆</span>
        <span class="deco-line" />
        <span class="deco-text">为你推荐</span>
        <span class="deco-line" />
        <span class="deco-mark">◆</span>
      </div>
    </div>

    <!-- 为你推荐密集流 -->
    <section class="dense-section">
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

/* Seller */
.seller-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}
.seller-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 14px 8px;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.seller-card:hover {
  transform: translateY(-3px);
  border-color: var(--yb-gold);
  box-shadow: 0 8px 24px rgba(184, 147, 90, 0.16);
}
.rank {
  font-family: var(--yb-font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--yb-muted);
}
.rank.top { color: var(--yb-gold); }
.seller-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--yb-champagne);
  border: 2px solid var(--yb-surface);
}
.seller-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--yb-ink);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.seller-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--yb-muted);
}

@media (max-width: 1439px) {
  .grid-4 { grid-template-columns: repeat(5, 1fr); }
}
@media (max-width: 1200px) {
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .channel-grid { grid-template-columns: 1.4fr 1.4fr 1fr 1fr; }
  .seller-grid { grid-template-columns: repeat(4, 1fr); }
}
</style>
