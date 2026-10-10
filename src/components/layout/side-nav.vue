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
let closeTimer: number | undefined;
const nav = ref<HTMLElement>();
let pointerInside = false;
let focusInside = false;

function cancelClose() {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

function openCategory(id: string | number) {
  cancelClose();
  hoveredCatId.value = id;
}

function scheduleClose() {
  cancelClose();
  if (pointerInside || focusInside) return;
  closeTimer = window.setTimeout(() => {
    hoveredCatId.value = null;
    closeTimer = undefined;
  }, 300);
}

function pointerEnter() {
  pointerInside = true;
  cancelClose();
}

function pointerLeave() {
  pointerInside = false;
  scheduleClose();
}

function focusLeave(event: FocusEvent) {
  focusInside = event.relatedTarget instanceof Node && !!nav.value?.contains(event.relatedTarget);
  if (!focusInside) scheduleClose();
}

function dismissMenu() {
  cancelClose();
  hoveredCatId.value = null;
}

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
onBeforeUnmount(() => {
  categoryGuard.invalidate();
  cancelClose();
});

function goCategory(id: string | number) {
  cancelClose();
  router.push({ name: 'product-list', query: { categoryId: String(id) } });
  hoveredCatId.value = null;
}

function descendantOptions(nodes: CategoryNode[], parents: string[] = []): CategoryNode[] {
  return nodes.flatMap(node => {
    const path = [...parents, node.name];
    return [{ ...node, name: path.join(' / ') }, ...descendantOptions(node.children || [], path)];
  });
}
</script>

<template>
  <aside ref="nav" class="side-nav" aria-label="商品分类" @mouseenter="pointerEnter" @mouseleave="pointerLeave" @focusin="focusInside = true; cancelClose()" @focusout="focusLeave" @keydown.esc.stop="dismissMenu">
    <div class="cat-eyebrow"><Icon icon="lucide:layers" width="16" /> 全部分类</div>
    <div v-if="loading" class="cat-status" role="status">正在加载分类…</div>
    <div v-else-if="!categories.length && !loadError" class="cat-status">暂无商品分类</div>
    <button v-if="loadError" class="cat-retry" :disabled="loading" @click="loadCategories">
      {{ loading ? '正在加载…' : `${loadError}，重新加载` }}
    </button>
    <div
      v-for="(cat, i) in categories"
      :key="cat.id"
      class="cat-row"
      :class="{ hovered: hoveredCatId === cat.id }"
      role="link"
      tabindex="0"
      :aria-expanded="hoveredCatId === cat.id && !!cat.children?.length"
      @mouseenter="openCategory(cat.id)"
      @click="goCategory(cat.id)"
      @focus="openCategory(cat.id)"
      @keydown.enter="goCategory(cat.id)"
      @keydown.space.prevent="goCategory(cat.id)"
    >
      <span class="cat-num">{{ String(i + 1).padStart(2, '0') }}</span>
      <span class="cat-name">{{ cat.name }}</span>
      <Icon icon="lucide:chevron-right" class="cat-arrow" width="14" />

      <!-- 连续的透明连接区与弹层共同属于分类栏，跨越时不触发关闭。 -->
      <div
        v-if="hoveredCatId === cat.id && cat.children?.length"
        class="mega-menu"
        @click.stop
        @keydown.enter.stop
        @keydown.space.stop
      >
        <div class="mega-panel">
        <div class="mega-inner" :class="{ 'single-group': cat.children.length === 1 }">
          <div v-for="sub in cat.children" :key="sub.id" class="mega-sub">
            <div
              class="mega-sub-title"
              role="link"
              tabindex="0"
              @click.stop="goCategory(sub.id)"
              @keydown.enter.stop="goCategory(sub.id)"
              @keydown.space.stop.prevent="goCategory(sub.id)"
            >
              {{ sub.name }}
            </div>
            <div class="mega-brands">
              <span
                v-for="brand in descendantOptions(sub.children || [])"
                :key="brand.id"
                class="mega-brand"
                role="link"
                tabindex="0"
                @click.stop="goCategory(brand.id)"
                @keydown.enter.stop="goCategory(brand.id)"
                @keydown.space.stop.prevent="goCategory(brand.id)"
              >
                {{ brand.name }}
              </span>
            </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--yb-ink);
}
.cat-status { padding: 16px 12px; color: var(--yb-muted); font-size: 13px; }
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
.cat-row:focus-visible,
.mega-sub-title:focus-visible,
.mega-brand:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: -2px;
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
  font-size: 14px;
  font-weight: 500;
}
.cat-arrow {
  color: var(--yb-faint);
  transition: transform 0.15s, color 0.15s;
}
.cat-row.hovered .cat-arrow,
.cat-row:hover .cat-arrow {
  transform: translateX(2px);
  color: var(--yb-primary);
}

/* Mega menu 二级弹出 */
.mega-menu {
  position: absolute;
  left: calc(100% - 1px);
  top: -8px;
  width: max-content;
  min-width: 220px;
  max-width: min(720px, calc(100vw - 268px));
  padding-left: 9px;
  z-index: 200;
  cursor: default;
}
.mega-panel {
  min-height: 320px;
  max-height: 520px;
  overflow-y: auto;
  background: var(--yb-surface);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(32, 56, 46, 0.10);
  border: 1px solid var(--yb-hairline);
  padding: 20px 24px;
  animation: menu-reveal 150ms var(--um-ease);
}
.mega-inner {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 32px;
}
.mega-inner.single-group {
  grid-template-columns: minmax(0, 1fr);
}
.mega-sub {
  min-width: 0;
  overflow-wrap: anywhere;
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
@keyframes menu-reveal { from { opacity: 0; transform: translateX(-3px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) {
  .mega-panel { animation: none; }
  .cat-row, .cat-arrow, .mega-sub-title, .mega-brand { transition: none; }
}
</style>
