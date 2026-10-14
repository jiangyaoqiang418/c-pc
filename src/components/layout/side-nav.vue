<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import V47CategoryLeafRail from './v47-category-leaf-rail.vue';
import { useCategoryNavigation } from '@/composables/use-category-navigation';

interface CategoryNode {
  readonly id: string;
  readonly name: string;
  readonly summary?: string;
  readonly icon?: string;
  readonly children?: readonly CategoryNode[];
}

const props = withDefaults(defineProps<{ mode?: 'home' | 'nav' }>(), { mode: 'home' });
const route = useRoute();
const { categories, loading, loadError, activeMenu, loadCategories } = useCategoryNavigation();
const menuId = `category-menu-${useId()}`;
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const expanded = ref(false);
const activeIds = ref<string[]>([]);
const panelHeight = ref(520);
const panelWidth = ref(720);
const openedByHover = ref(false);
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let pointerInside = false;
let focusInside = false;

const activePath = computed<CategoryNode[]>(() => {
  const path: CategoryNode[] = [];
  let nodes: readonly CategoryNode[] = categories.value;
  for (const id of activeIds.value) {
    const node = nodes.find(item => item.id === id);
    if (!node) break;
    path.push(node);
    nodes = node.children || [];
  }
  return path;
});
const current = computed(() => activePath.value[activePath.value.length - 1] || categories.value[0]);
const selectedRootId = computed(() => activePath.value[0]?.id ?? current.value?.id ?? '');

function cancelClose() {
  if (closeTimer === undefined) return;
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

function measurePanel() {
  if (!root.value) return;
  const rect = root.value.getBoundingClientRect();
  const top = props.mode === 'nav' ? rect.bottom : rect.top;
  panelHeight.value = Math.max(180, window.innerHeight - top - 16);
  panelWidth.value = Math.max(180, Math.min(props.mode === 'nav' ? 950 : 720,
    window.innerWidth - (props.mode === 'nav' ? rect.left : rect.right) - 24));
}

function close(restoreFocus = false) {
  cancelClose();
  expanded.value = false;
  openedByHover.value = false;
  if (activeMenu.value === menuId) activeMenu.value = null;
  if (restoreFocus) void nextTick(() => {
    if (props.mode === 'nav') trigger.value?.focus();
    else Array.from(root.value?.querySelectorAll<HTMLButtonElement>('.category-root-button') || [])
      .find(button => button.dataset.categoryId === selectedRootId.value)?.focus();
  });
}

function show(fromHover = false) {
  cancelClose();
  measurePanel();
  if (!expanded.value) openedByHover.value = fromHover;
  expanded.value = true;
  activeMenu.value = menuId;
  if (!activePath.value.length && categories.value[0]) activeIds.value = [categories.value[0].id];
  void loadCategories();
}

function toggle() {
  // 移入已打开时，第一次点击确认打开，避免 pointerenter 紧接 click 又关掉。
  if (expanded.value && !openedByHover.value) close();
  else {
    show();
    openedByHover.value = false;
  }
}

function selectRoot(node: CategoryNode, fromHover = false) {
  activeIds.value = [node.id];
  show(fromHover);
}

function pointerEnter(event: PointerEvent, node?: CategoryNode) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (node) selectRoot(node, true);
  else if (props.mode === 'nav') show(true);
}

function scheduleClose() {
  cancelClose();
  if (pointerInside || focusInside) return;
  closeTimer = setTimeout(() => close(), 280);
}

function pointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  pointerInside = false;
  scheduleClose();
}

function focusLeave(event: FocusEvent) {
  focusInside = event.relatedTarget instanceof Node && !!root.value?.contains(event.relatedTarget);
  if (!focusInside && !(event.relatedTarget === null && pointerInside)) close();
}

function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}

function browse(node: CategoryNode) {
  return { name: 'product-list', query: { categoryId: node.id } };
}

function summary(node: CategoryNode) {
  return node.summary || node.children?.slice(0, 3).map(child => child.name).join(' / ') || '浏览该分类商品';
}

function categoryIcon(node: CategoryNode) {
  if (/手机|数码|平板/.test(node.name)) return 'phone';
  if (/电脑|办公/.test(node.name)) return 'laptop';
  if (/家电|电器/.test(node.name)) return 'sun';
  if (/服饰|箱包/.test(node.name)) return 'bag';
  if (/运动|户外/.test(node.name)) return 'globe';
  if (/钟表|腕表/.test(node.name)) return 'clock';
  if (/美妆|护肤/.test(node.name)) return 'star';
  return 'grid';
}

function drill(group: CategoryNode, node: CategoryNode) {
  activeIds.value = [...activePath.value.map(item => item.id), group.id, node.id];
  void nextTick(() => root.value?.querySelector<HTMLElement>('.category-mega-heading a')?.focus());
}

function restorePath(index: number) {
  activeIds.value = activeIds.value.slice(0, index + 1);
}

function focusRoot(index: number) {
  const node = categories.value[index];
  if (!node) return;
  selectRoot(node);
  void nextTick(() => root.value?.querySelectorAll<HTMLButtonElement>('.category-root-button')[index]?.focus());
}

function triggerKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  show();
  focusRoot(event.key === 'ArrowUp' ? categories.value.length - 1 : 0);
}

function keyboard(event: KeyboardEvent, index: number) {
  const length = categories.value.length;
  if (!length) return;
  let target: number | undefined;
  if (event.key === 'ArrowDown') target = (index + 1) % length;
  if (event.key === 'ArrowUp') target = (index + length - 1) % length;
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = length - 1;
  if (target !== undefined) {
    event.preventDefault();
    focusRoot(target);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    selectRoot(categories.value[index]);
    void nextTick(() => root.value?.querySelector<HTMLElement>('.category-mega a')?.focus());
  }
}

watch(activeMenu, id => { if (id !== menuId && expanded.value) close(); });
watch(() => route.fullPath, () => close());
watch(categories, () => {
  if (!activePath.value.length) activeIds.value = categories.value[0] ? [categories.value[0].id] : [];
});
onMounted(() => {
  measurePanel();
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', measurePanel);
});
onBeforeUnmount(() => {
  close();
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('resize', measurePanel);
});
</script>

<template>
  <div
    ref="root"
    class="category-browser"
    :class="[`category-browser-${mode}`, { 'side-nav': mode === 'home', 'is-expanded': expanded }]"
    :style="{ '--category-panel-height': `${panelHeight}px`, '--category-panel-width': `${panelWidth}px` }"
    @pointerenter="pointerInside = true; cancelClose()"
    @pointerleave="pointerLeave"
    @focusin="focusInside = true; cancelClose()"
    @focusout="focusLeave"
    @keydown.esc.stop.prevent="close(true)"
  >
    <button v-if="mode === 'nav'" ref="trigger" type="button" class="all-categories category-menu-trigger" :aria-expanded="expanded" :aria-controls="`${menuId}-panel`" @pointerenter="pointerEnter($event)" @click="toggle" @keydown="triggerKeyboard">
      <UmIcon name="menu" />全部商品分类<UmIcon name="chevron" />
    </button>
    <div v-if="mode === 'home' || expanded" :id="`${menuId}-panel`" class="category-menu-surface">
      <nav class="category-root-list" aria-label="一级商品分类" :aria-busy="loading">
        <p v-if="loading && !categories.length" class="category-status" role="status">正在加载分类…</p>
        <div v-else-if="loadError" class="category-status" role="alert">
          <span>{{ loadError }}</span><button type="button" :disabled="loading" @click="loadCategories(true)">{{ loading ? '正在重试…' : '重新加载' }}</button>
        </div>
        <p v-else-if="!categories.length" class="category-status">暂无有商品的分类</p>
        <button
          v-for="(category, index) in categories"
          :key="category.id"
          type="button"
          class="category-root-button"
          :class="{ active: expanded && selectedRootId === category.id }"
          :data-category-id="category.id"
          :aria-expanded="expanded && selectedRootId === category.id"
          :aria-controls="`${menuId}-children`"
          @pointerenter="pointerEnter($event, category)"
          @click="selectRoot(category)"
          @keydown="keyboard($event, index)"
        >
          <UmIcon :name="categoryIcon(category)" /><span>{{ category.name }}<small>{{ summary(category) }}</small></span><UmIcon name="chevron" />
        </button>
        <RouterLink v-if="mode === 'home'" to="/category" class="category-all-link" @click="close()">发现全部分类<UmIcon name="arrow" /></RouterLink>
      </nav>
      <Transition name="category-reveal">
        <section v-if="expanded && current" :id="`${menuId}-children`" class="category-mega" :aria-label="`${current.name}的下级分类`">
          <div v-if="activePath.length > 1" class="category-path" aria-label="当前分类层级">
            <template v-for="(node, index) in activePath" :key="node.id">
              <UmIcon v-if="index" name="chevron" />
              <button v-if="index < activePath.length - 1" type="button" @click="restorePath(index)">{{ node.name }}</button>
              <span v-else>{{ node.name }}</span>
            </template>
          </div>
          <div class="category-mega-heading"><h2>{{ current.name }}</h2><RouterLink :to="browse(current)" @click="close()">查看全部<UmIcon name="arrow" /></RouterLink></div>
          <div v-if="current.children?.length" class="category-subgroups">
            <section v-for="group in current.children" :key="group.id" class="category-subgroup">
              <h3><RouterLink :to="browse(group)" @click="close()">{{ group.name }}<UmIcon name="chevron" /></RouterLink></h3>
              <V47CategoryLeafRail :label="`${group.name}细分商品`">
                <div v-for="leaf in group.children" :key="leaf.id" class="category-leaf">
                  <RouterLink :to="browse(leaf)" @click="close()">{{ leaf.name }}</RouterLink>
                  <button v-if="leaf.children?.length" type="button" :aria-label="`展开${leaf.name}的子分类`" @click="drill(group, leaf)"><UmIcon name="chevron" /></button>
                </div>
              </V47CategoryLeafRail>
            </section>
          </div>
          <p v-else class="category-empty">该分类暂无下级分类，可点击“查看全部”浏览商品。</p>
        </section>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.category-browser-home { align-self:stretch; }
.category-menu-trigger { min-height:42px; }
.category-root-list { max-height:var(--category-panel-height); overflow-y:auto; scrollbar-width:thin; }
.category-root-button { width:100%; flex-shrink:0; }
.category-root-button > span { overflow-wrap:anywhere; }
.category-root-button small { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.category-browser-nav .category-menu-surface { z-index:50; width:var(--category-panel-width); max-height:var(--category-panel-height); }
.category-browser-home .category-mega { width:var(--category-panel-width); min-height:min(320px,var(--category-panel-height)); }
.category-mega { max-height:var(--category-panel-height); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; }
.category-leaf { display:flex; align-self:start; flex-shrink:0; }
.category-leaf > a { flex:none; }
.category-leaf:has(> button) > a { border-right:0; border-top-right-radius:0; border-bottom-right-radius:0; }
.category-leaf > button { display:grid; place-items:center; min-width:32px; border:1px solid var(--line); border-radius:0 6px 6px 0; background:var(--soft); color:var(--green); }
.category-leaf > button svg { width:14px; height:14px; }
.category-path { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; color:var(--muted); font-size:12px; }
.category-path > svg { width:12px; height:12px; }
.category-path button { padding:4px 0; color:var(--green); }
.category-empty,.category-status { padding:16px; color:var(--muted); font-size:13px; }
.category-status { margin:0; display:grid; gap:8px; }
.category-status button { justify-self:start; color:var(--green); }
@media (min-width:701px) and (max-width:1100px) { .category-browser-nav { width:160px; } .category-browser-nav .category-menu-trigger { width:160px; } }
</style>
