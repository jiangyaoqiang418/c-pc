<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { productApi } from '@shared';

const router = useRouter();

interface CategoryNode {
  id: number;
  name: string;
  level: number;
  children?: CategoryNode[];
}

const categories = ref<CategoryNode[]>([]);
const megaOpen = ref(false);
let megaTimer: number | null = null;

onMounted(async () => {
  categories.value = ((await productApi.fetchCategoryTree()) as CategoryNode[]).slice(0, 8);
});

// 业务频道（占位路由）
const CHANNELS = [
  { key: 'select', label: '油宝严选' },
  { key: 'live', label: '买手直播' },
  { key: 'brand', label: '品牌直购' },
  { key: 'newest', label: '新品首发' },
  { key: 'value', label: '超级省' },
  { key: 'global', label: '全球寻货' }
];

function goChannel(key: string) {
  router.push({ name: 'product-list', query: { channel: key } });
}

function goCategory(id: number) {
  router.push({ name: 'product-list', query: { categoryId: String(id) } });
  megaOpen.value = false;
}

function openMega() {
  if (megaTimer) { clearTimeout(megaTimer); megaTimer = null; }
  megaOpen.value = true;
}
function scheduleClose() {
  if (megaTimer) clearTimeout(megaTimer);
  megaTimer = window.setTimeout(() => { megaOpen.value = false; }, 150);
}

const hoveredCat = ref<CategoryNode | null>(null);
const activeCat = computed(() => hoveredCat.value ?? categories.value[0] ?? null);
</script>

<template>
  <div class="category-nav">
    <div class="cn-inner">
      <!-- 全部分类按钮 + hover 弹全宽 mega -->
      <div
        class="cn-all-btn"
        :class="{ open: megaOpen }"
        @mouseenter="openMega"
        @mouseleave="scheduleClose"
      >
        <Icon icon="lucide:menu" width="16" />
        <span>全部分类</span>
        <Icon :icon="megaOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" width="12" />
      </div>

      <!-- 业务频道 pills -->
      <nav class="cn-channels">
        <button
          v-for="c in CHANNELS"
          :key="c.key"
          class="channel-link"
          @click="goChannel(c.key)"
        >
          {{ c.label }}
        </button>
      </nav>
    </div>

    <!-- 全宽 mega menu 弹层（悬停「全部分类」时显示） -->
    <transition name="mega-fade">
      <div
        v-if="megaOpen && categories.length"
        class="cn-mega"
        @mouseenter="openMega"
        @mouseleave="scheduleClose"
      >
        <div class="mega-inner">
          <ul class="mega-list">
            <li
              v-for="cat in categories"
              :key="cat.id"
              class="mega-list-item"
              :class="{ active: activeCat?.id === cat.id }"
              @mouseenter="hoveredCat = cat"
              @click="goCategory(cat.id)"
            >
              {{ cat.name }}
              <Icon icon="lucide:chevron-right" width="12" class="mega-arrow" />
            </li>
          </ul>
          <div v-if="activeCat" class="mega-detail">
            <div v-for="sub in (activeCat.children || [])" :key="sub.id" class="mega-sub-group">
              <div class="mega-sub-title" @click="goCategory(sub.id)">{{ sub.name }}</div>
              <div class="mega-brand-list">
                <span
                  v-for="brand in (sub.children || []).slice(0, 10)"
                  :key="brand.id"
                  class="mega-brand"
                  @click="goCategory(brand.id)"
                >
                  {{ brand.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.category-nav {
  position: sticky;
  top: 88px;
  height: 48px;
  background: var(--yb-surface);
  border-bottom: 1px solid var(--yb-hairline);
  z-index: 40;
}
.cn-inner {
  height: 100%;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  box-sizing: border-box;
}
.cn-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 36px;
  border-radius: 999px;
  background: var(--yb-ink);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.cn-all-btn:hover, .cn-all-btn.open {
  background: var(--yb-primary);
}
.cn-channels {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.channel-link {
  background: transparent;
  border: none;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--yb-ink-2);
  cursor: pointer;
  border-radius: 999px;
  transition: all 0.15s;
  font-weight: 500;
}
.channel-link:hover {
  color: var(--yb-ink);
  background: var(--yb-bg);
}

/* Full-width mega menu */
.cn-mega {
  position: absolute;
  left: 0;
  right: 0;
  top: 48px;
  background: var(--yb-surface);
  border-top: 1px solid var(--yb-hairline);
  box-shadow: 0 12px 28px rgba(15, 17, 26, 0.08);
  z-index: 50;
}
.mega-inner {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 320px;
  max-height: 480px;
  padding: 16px 24px;
  gap: 24px;
}
.mega-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border-right: 1px solid var(--yb-hairline);
  padding-right: 12px;
  overflow-y: auto;
}
.mega-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--yb-ink-2);
  cursor: pointer;
  transition: all 0.12s;
}
.mega-list-item:hover, .mega-list-item.active {
  background: var(--yb-bg);
  color: var(--yb-ink);
  font-weight: 600;
}
.mega-arrow {
  color: var(--yb-faint);
}
.mega-list-item.active .mega-arrow {
  color: var(--yb-primary);
}

.mega-detail {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 12px;
}
.mega-sub-group {
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--yb-hairline);
}
.mega-sub-group:last-child { border-bottom: none; }
.mega-sub-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--yb-ink);
  margin-bottom: 8px;
  cursor: pointer;
  transition: color 0.15s;
}
.mega-sub-title:hover { color: var(--yb-primary); }
.mega-brand-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.mega-brand {
  font-size: 12px;
  color: var(--yb-muted);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s;
}
.mega-brand:hover {
  background: var(--yb-primary-soft);
  color: var(--yb-primary);
}

.mega-fade-enter-active, .mega-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.mega-fade-enter-from, .mega-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
