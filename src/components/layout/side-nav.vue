<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useCategoryNavigation } from '@/composables/use-category-navigation';

interface CategoryNode {
  readonly id: string;
  readonly name: string;
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
  return node.children?.slice(0, 3).map(child => child.name).join(' / ') || '浏览该分类商品';
}

function categoryIcon(node: CategoryNode) {
  if (/手机|数码|平板/.test(node.name)) return 'lucide:smartphone';
  if (/电脑|办公/.test(node.name)) return 'lucide:laptop';
  if (/家电|电器/.test(node.name)) return 'lucide:sun';
  if (/服饰|箱包/.test(node.name)) return 'lucide:shopping-bag';
  if (/运动|户外/.test(node.name)) return 'lucide:globe';
  if (/钟表|腕表/.test(node.name)) return 'lucide:clock';
  if (/美妆|护肤/.test(node.name)) return 'lucide:star';
  return 'lucide:layers';
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
    <button v-if="mode === 'nav'" ref="trigger" type="button" class="category-menu-trigger" :aria-expanded="expanded" :aria-controls="`${menuId}-panel`" @pointerenter="pointerEnter($event)" @click="toggle" @keydown="triggerKeyboard">
      <Icon icon="lucide:menu" />全部商品分类<Icon icon="lucide:chevron-right" />
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
          <Icon :icon="categoryIcon(category)" /><span>{{ category.name }}<small>{{ summary(category) }}</small></span><Icon icon="lucide:chevron-right" />
        </button>
        <RouterLink to="/category" class="category-all-link" @click="close()">发现全部分类<Icon icon="lucide:arrow-right" /></RouterLink>
      </nav>
      <Transition name="category-reveal">
        <section v-if="expanded && current" :id="`${menuId}-children`" class="category-mega" :aria-label="`${current.name}的下级分类`">
          <div v-if="activePath.length > 1" class="category-path" aria-label="当前分类层级">
            <template v-for="(node, index) in activePath" :key="node.id">
              <Icon v-if="index" icon="lucide:chevron-right" />
              <button v-if="index < activePath.length - 1" type="button" @click="restorePath(index)">{{ node.name }}</button>
              <span v-else>{{ node.name }}</span>
            </template>
          </div>
          <div class="category-mega-heading"><h2>{{ current.name }}</h2><RouterLink :to="browse(current)" @click="close()">查看全部<Icon icon="lucide:arrow-right" /></RouterLink></div>
          <div v-if="current.children?.length" class="category-subgroups">
            <section v-for="group in current.children" :key="group.id" class="category-subgroup">
              <h3><RouterLink :to="browse(group)" @click="close()">{{ group.name }}<Icon icon="lucide:chevron-right" /></RouterLink></h3>
              <div class="category-leaves">
                <div v-for="leaf in group.children" :key="leaf.id" class="category-leaf">
                  <RouterLink :to="browse(leaf)" @click="close()">{{ leaf.name }}</RouterLink>
                  <button v-if="leaf.children?.length" type="button" :aria-label="`展开${leaf.name}的子分类`" @click="drill(group, leaf)"><Icon icon="lucide:chevron-right" /></button>
                </div>
              </div>
            </section>
          </div>
          <p v-else class="category-empty">该分类暂无下级分类，可点击“查看全部”浏览商品。</p>
        </section>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.category-browser { position: relative; min-width: 0; }
.category-browser-home { width: 190px; align-self: start; }
.category-browser-nav { align-self: stretch; display: flex; }
.category-menu-trigger { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 42px; padding: 0 18px; border-radius: 6px 6px 0 0; background: var(--yb-primary); color: white; font-size: 14px; font-weight: 600; white-space: nowrap; }
.category-menu-trigger > svg { width: 16px; height: 16px; flex-shrink: 0; }
.category-menu-trigger > svg:last-child { margin-left: auto; width: 14px; transition: transform 150ms var(--um-ease); }
.is-expanded .category-menu-trigger > svg:last-child { transform: rotate(90deg); }
.category-root-list { display: flex; flex-direction: column; padding: 9px 0; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-paper); max-height: var(--category-panel-height); overflow-y: auto; scrollbar-width: thin; }
.category-root-button { display: flex; align-items: center; gap: 11px; position: relative; width: 100%; min-height: 70px; padding: 12px 17px; flex-shrink: 0; text-align: left; font-size: 15px; font-weight: 500; color: var(--yb-ink); transition: color 150ms, background 150ms; }
.category-root-button > svg:first-child { width: 19px; height: 19px; flex-shrink: 0; color: var(--yb-muted); }
.category-root-button > svg:last-child { margin-left: auto; width: 13px; height: 13px; flex-shrink: 0; color: var(--yb-faint); }
.category-root-button > span { min-width: 0; overflow-wrap: anywhere; }
.category-root-button small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; font-size: 12px; font-weight: 400; line-height: 1.5; color: var(--yb-muted); }
.category-root-button::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; background: var(--yb-accent); transform: scaleY(0); transition: transform 150ms; }
.category-root-button:hover, .category-root-button.active { background: var(--yb-primary-soft); color: var(--yb-primary); }
.category-root-button.active::before { transform: scaleY(1); }
.category-all-link { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; margin: 5px 15px 0; padding: 10px 2px; border-top: 1px solid var(--yb-hairline); font-size: 12px; color: var(--yb-muted); flex-shrink: 0; }
.category-all-link > svg { width: 16px; height: 16px; }
.category-mega { min-width: 0; padding: 28px 30px; background: var(--yb-paper); overflow-y: auto; max-height: var(--category-panel-height); overscroll-behavior: contain; scrollbar-width: thin; }
.category-browser-home .category-mega { position: absolute; left: calc(100% - 1px); top: 0; z-index: 30; width: var(--category-panel-width); min-height: min(320px, var(--category-panel-height)); border: 1px solid var(--yb-hairline); border-radius: 0 12px 12px 0; box-shadow: 14px 12px 30px rgba(var(--yb-primary-rgb), .12); }
.category-browser-home.is-expanded .category-root-list { border-radius: 8px 0 0 8px; }
.category-browser-nav .category-menu-surface { position: absolute; top: 100%; left: 0; z-index: 50; display: grid; grid-template-columns: 190px minmax(0, 1fr); width: var(--category-panel-width); max-height: var(--category-panel-height); background: var(--yb-paper); border: 1px solid var(--yb-hairline); border-radius: 0 0 12px 12px; overflow: hidden; box-shadow: 0 18px 36px rgba(var(--yb-primary-rgb), .12); }
.category-browser-nav .category-root-list { border: 0; border-right: 1px solid var(--yb-hairline); border-radius: 0; }
.category-browser-nav .category-mega { min-height: min(320px, var(--category-panel-height)); }
.category-mega-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 1px dashed var(--yb-hairline); }
.category-mega-heading h2 { min-width: 0; margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.category-mega-heading > a { display: flex; align-items: center; gap: 8px; min-height: 44px; white-space: nowrap; font-size: 12px; }
.category-mega-heading > a svg { width: 16px; height: 16px; }
.category-subgroups { padding: 8px 0; }
.category-subgroup { display: grid; grid-template-columns: fit-content(160px) minmax(0, 1fr); gap: 12px; padding: 12px 0; align-items: start; }
.category-subgroup + .category-subgroup { border-top: 1px dashed var(--yb-hairline); }
.category-subgroup h3 { min-width: 0; margin: 0; font-size: 14px; font-weight: 600; }
.category-subgroup h3 a { display: flex; align-items: center; gap: 6px; min-height: 40px; overflow-wrap: anywhere; }
.category-subgroup h3 svg { width: 13px; height: 13px; flex-shrink: 0; color: var(--yb-faint); }
.category-leaves { display: flex; gap: 8px; min-width: 0; padding: 2px 1px 7px; overflow-x: auto; scrollbar-width: thin; overscroll-behavior-x: contain; }
.category-leaf { display: flex; align-self: start; flex-shrink: 0; border: 1px solid var(--yb-hairline); border-radius: 6px; background: var(--yb-fill); overflow: hidden; }
.category-leaf > a { display: flex; align-items: center; min-height: 40px; padding: 7px 13px; white-space: nowrap; color: var(--yb-muted); font-size: 12px; transition: color 150ms, background 150ms; }
.category-leaf > button { display: flex; align-items: center; justify-content: center; min-width: 32px; border-left: 1px solid var(--yb-hairline); color: var(--yb-primary); }
.category-leaf > button svg { width: 14px; height: 14px; }
.category-leaf > a:hover, .category-leaf > button:hover { background: var(--yb-primary); color: var(--yb-paper); }
.category-all-link:hover, .category-subgroup h3 a:hover, .category-mega-heading > a:hover { color: var(--yb-primary); }
.category-path { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--yb-muted); font-size: 12px; }
.category-path > svg { width: 12px; height: 12px; }
.category-path button { padding: 4px 0; color: var(--yb-primary); }
.category-empty, .category-status { padding: 16px; color: var(--yb-muted); font-size: 13px; }
.category-empty { padding-inline: 0; }
.category-status { margin: 0; display: grid; gap: 8px; }
.category-status button { justify-self: start; color: var(--yb-primary); }
.category-root-button:focus-visible { outline-offset: -4px; z-index: 1; }
.category-reveal-enter-active { transition: opacity 160ms, transform 160ms var(--um-ease); }
.category-reveal-enter-from { opacity: 0; transform: translateX(-5px); }
.category-reveal-leave-active { transition: opacity 100ms; }
.category-reveal-leave-to { opacity: 0; }
@media (max-width: 1100px) {
  .category-root-button { padding-inline: 12px; gap: 8px; }
  .category-browser-nav .category-menu-surface { grid-template-columns: 180px minmax(0, 1fr); }
  .category-menu-trigger { padding-inline: 12px; gap: 8px; }
  .category-subgroup { grid-template-columns: fit-content(140px) minmax(0, 1fr); }
  .category-mega { padding: 20px; }
}
@media (max-width: 700px) {
  .category-browser-nav .category-menu-surface { grid-template-columns: 140px minmax(0, 1fr); }
  .category-mega { padding: 16px; }
  .category-subgroup { grid-template-columns: 1fr; gap: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .category-reveal-enter-active, .category-reveal-leave-active, .category-root-button, .category-root-button::before, .category-menu-trigger > svg:last-child, .category-leaf > a { transition: none; }
}
</style>
