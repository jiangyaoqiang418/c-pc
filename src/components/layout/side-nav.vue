<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import * as categoryApi from '@/service/api/category';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();

interface CategoryNode {
  id: string | number;
  name: string;
  level: number;
  children?: CategoryNode[];
}

const categories = ref<CategoryNode[]>([]);
const hoveredCatId = ref<string | number | null>(null);
const loading = ref(false);
const loadError = ref('');
const categoryGuard = createLatestRequestGuard();

async function loadCategories() {
  if (loading.value) return;
  const isCurrent = categoryGuard.begin();
  loading.value = true;
  loadError.value = '';
  try {
    const next = ((await categoryApi.fetchCategoryTree({ signal: isCurrent.signal })) as CategoryNode[]).slice(0, 8);
    if (isCurrent()) categories.value = next;
  } catch {
    if (!isCurrent()) return;
    categories.value = [];
    loadError.value = '分类加载失败';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(loadCategories);
onBeforeUnmount(categoryGuard.invalidate);

function goCategory(id: string | number) {
  router.push({ name: 'product-list', query: { categoryId: String(id) } });
  hoveredCatId.value = null;
}
</script>

<template>
  <aside class="side-nav">
    <div class="cat-eyebrow">CATEGORIES · 全部分类</div>
    <button v-if="loadError" class="cat-retry" :disabled="loading" @click="loadCategories">
      {{ loading ? '正在加载…' : `${loadError}，重新加载` }}
    </button>
    <div
      v-for="(cat, i) in categories"
      :key="cat.id"
      class="cat-row"
      :class="{ hovered: hoveredCatId === cat.id }"
      @mouseenter="hoveredCatId = cat.id"
      @mouseleave="hoveredCatId = null"
      @click="goCategory(cat.id)"
    >
      <span class="cat-num">{{ String(i + 1).padStart(2, '0') }}</span>
      <span class="cat-name">{{ cat.name }}</span>
      <Icon icon="lucide:chevron-right" class="cat-arrow" width="14" />

      <!-- hover 弹二级 mega -->
      <div v-if="hoveredCatId === cat.id && cat.children?.length" class="mega-menu">
        <div class="mega-inner">
          <div v-for="sub in cat.children" :key="sub.id" class="mega-sub">
            <div class="mega-sub-title" @click.stop="goCategory(sub.id)">
              {{ sub.name }}
            </div>
            <div class="mega-brands">
              <span
                v-for="brand in (sub.children || []).slice(0, 10)"
                :key="brand.id"
                class="mega-brand"
                @click.stop="goCategory(brand.id)"
              >
                {{ brand.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 220px;
  flex-shrink: 0;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
}
.cat-eyebrow {
  padding: 8px 12px 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
}
.cat-retry {
  margin: 8px 12px;
  padding: 8px;
  border: 1px solid var(--yb-hairline);
  border-radius: 8px;
  background: var(--yb-bg);
  color: var(--yb-danger);
  font-size: 12px;
  cursor: pointer;
}
.cat-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: var(--yb-ink-2);
}
.cat-row:hover,
.cat-row.hovered {
  background: var(--yb-bg);
  color: var(--yb-ink);
}
.cat-num {
  font-family: var(--yb-font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--yb-muted);
  min-width: 22px;
  letter-spacing: -0.02em;
}
.cat-row.hovered .cat-num,
.cat-row:hover .cat-num {
  color: var(--yb-primary);
}
.cat-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}
.cat-arrow {
  color: var(--yb-faint);
  transition: transform 0.15s, color 0.15s;
}
.cat-row.hovered .cat-arrow,
.cat-row:hover .cat-arrow {
  transform: translateX(4px);
  color: var(--yb-primary);
}

/* Mega menu 二级弹出 */
.mega-menu {
  position: absolute;
  left: calc(100% + 4px);
  top: -8px;
  width: 720px;
  min-height: 320px;
  max-height: 520px;
  overflow-y: auto;
  background: var(--yb-surface);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 17, 26, 0.10);
  border: 1px solid var(--yb-hairline);
  padding: 20px 24px;
  z-index: 200;
  cursor: default;
}
.mega-inner {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px 32px;
}
.mega-sub-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--yb-ink);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--yb-hairline);
  cursor: pointer;
  transition: color 0.15s;
}
.mega-sub-title:hover { color: var(--yb-primary); }
.mega-brands {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.mega-brand {
  font-size: 12px;
  color: var(--yb-muted);
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 4px;
}
.mega-brand:hover {
  color: var(--yb-primary);
  background: var(--yb-primary-soft);
}
</style>
