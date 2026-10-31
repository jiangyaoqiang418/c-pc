<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CategoryOption {
  value: string | number;
  label: string;
  children?: CategoryOption[];
}
const props = withDefaults(defineProps<{
  modelValue?: string | number;
  modelValues?: (string | number)[];
  multiple?: boolean;
  max?: number;
  options: CategoryOption[];
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  id?: string;
}>(), { placeholder: '选择商品分类', max: 20 });
const emit = defineEmits<{ 'update:modelValue': [value: string | number | undefined]; 'update:modelValues': [value: (string | number)[]] }>();
const fallbackId = useId();
const open = ref(false);
const keyword = ref('');
const expandedPath = ref<string[]>([]);
const searchLimit = ref(60);
const panel = ref<HTMLElement>();
const blocked = computed(() => props.disabled || props.loading);
interface CategoryEntry {
  node: CategoryOption;
  keys: string[];
  path: string;
  searchText: string;
}
// 索引仅用于回显/搜索；弹层不渲染整棵树，只渲染当前展开路径的各列。
const entries = computed(() => {
  const result = new Map<string, CategoryEntry>();
  function visit(nodes: CategoryOption[], parents: string[] = [], keys: string[] = []) {
    for (const node of nodes) {
      const labels = [...parents, node.label];
      const nextKeys = [...keys, String(node.value)];
      const path = labels.join(' / ');
      result.set(String(node.value), { node, keys: nextKeys, path, searchText: path.toLocaleLowerCase() });
      if (node.children?.length) visit(node.children, labels, nextKeys);
    }
  }
  visit(props.options);
  return result;
});
const chosenValues = computed(() => [...new Map([props.modelValue, ...(props.multiple ? props.modelValues || [] : [])]
  .filter((value): value is string | number => value !== undefined && value !== '')
  .map(value => [String(value), value])).values()]);
const chosenKeys = computed(() => new Set(chosenValues.value.map(String)));
const hasValue = computed(() => chosenValues.value.length > 0);
const showAllChosen = ref(false);
const visibleChosen = computed(() => showAllChosen.value ? chosenValues.value : chosenValues.value.slice(0, 3));
function isSelected(value: string | number) { return chosenKeys.value.has(String(value)); }
function categoryName(value: string | number) { return entries.value.get(String(value))?.path || '当前分类暂不可用'; }
function categoryLabel(value: string | number) { return entries.value.get(String(value))?.node.label || '分类不可用'; }
const selected = computed(() => hasValue.value ? entries.value.get(String(props.modelValue)) : undefined);
const displayText = computed(() => props.loading ? '正在读取分类…'
  : props.multiple && hasValue.value ? `已选 ${chosenValues.value.length} 个分类`
  : selected.value?.path || (hasValue.value ? '当前分类暂不可用，请重新选择' : props.placeholder));
const columns = computed(() => {
  const result = [props.options];
  for (let depth = 0; depth < expandedPath.value.length; depth += 1) {
    const node = result[depth]?.find(item => String(item.value) === expandedPath.value[depth]);
    if (!node?.children?.length) break;
    result.push(node.children);
  }
  return result;
});
const searchTerms = computed(() => keyword.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean));
const searching = computed(() => searchTerms.value.length > 0);
const matches = computed(() => searching.value ? [...entries.value.values()]
  .filter(entry => searchTerms.value.every(term => entry.searchText.includes(term))) : []);
const visibleMatches = computed(() => matches.value.slice(0, searchLimit.value));

watch(open, value => {
  if (!value) return;
  keyword.value = '';
  searchLimit.value = 60;
  expandedPath.value = selected.value?.keys.slice() || [];
});
watch(keyword, () => { searchLimit.value = 60; });
watch(blocked, value => { if (value) open.value = false; });
watch(() => props.options, () => { expandedPath.value = selected.value?.keys.slice() || []; });

function expand(node: CategoryOption) {
  const entry = entries.value.get(String(node.value));
  if (entry) expandedPath.value = entry.keys.slice();
}
function select(node: CategoryOption) {
  if (blocked.value || !entries.value.has(String(node.value))) return;
  if (props.multiple) {
    if (isSelected(node.value)) updateMultiple(chosenValues.value.filter(value => String(value) !== String(node.value)));
    else if (chosenValues.value.length < props.max) updateMultiple([...chosenValues.value, node.value]);
    expand(node);
    return;
  }
  emit('update:modelValue', node.value);
  open.value = false;
}
function updateMultiple(values: (string | number)[]) {
  if (blocked.value) return;
  emit('update:modelValues', values);
  if (!values.some(value => String(value) === String(props.modelValue))) emit('update:modelValue', values[0]);
}
function remove(value: string | number) {
  updateMultiple(chosenValues.value.filter(item => String(item) !== String(value)));
}
function clear() {
  if (blocked.value) return;
  if (props.multiple) updateMultiple([]);
  else emit('update:modelValue', undefined);
}
async function focusRow(depth: number, row: number) {
  await nextTick();
  panel.value?.querySelector<HTMLButtonElement>(`[data-column="${depth}"][data-row="${row}"]`)?.focus();
}
function onNodeKeydown(event: KeyboardEvent, node: CategoryOption, depth: number, row: number) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const last = columns.value[depth].length - 1;
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : event.key === 'ArrowDown' ? Math.min(last, row + 1) : Math.max(0, row - 1);
    void focusRow(depth, next);
  } else if (event.key === 'ArrowRight' && node.children?.length) {
    event.preventDefault();
    expand(node);
    void focusRow(depth + 1, 0);
  } else if (event.key === 'ArrowLeft' && depth > 0) {
    event.preventDefault();
    const parentRow = columns.value[depth - 1].findIndex(item => String(item.value) === expandedPath.value[depth - 1]);
    expandedPath.value = expandedPath.value.slice(0, depth - 1);
    void focusRow(depth - 1, Math.max(0, parentRow));
  }
}
async function focusFirstResult() {
  await nextTick();
  panel.value?.querySelector<HTMLButtonElement>('.category-choice')?.focus();
}
</script>

<template>
  <div class="category-picker" :class="{ multiple }">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger as-child>
        <Button :id="id || fallbackId" type="button" variant="outline" class="category-trigger outline" :disabled="blocked" :title="displayText" @keydown.down.prevent="open = !blocked; focusFirstResult()">
          <span :class="{ placeholder: !selected }">{{ displayText }}</span><Icon :icon="loading ? 'lucide:loader-circle' : 'lucide:chevron-down'" :class="{ 'animate-spin': loading }" width="16" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent v-if="open" align="start" :side-offset="6" :collision-padding="16" style="z-index:1100" aria-label="选择商品分类">
          <div ref="panel" class="category-panel" :class="{ searching, multiple }">
            <div class="category-search"><Icon icon="lucide:search" width="16" /><Input v-model="keyword" aria-label="搜索分类名称或路径" placeholder="搜索分类名称或路径" @keydown.down.prevent="focusFirstResult" /></div>
            <p class="category-hint">{{ multiple ? `可多选，最多 ${max} 个；首选为主分类。已选 ${chosenValues.length} / ${max} 个。` : '点击名称选中任意层级，悬浮或点击箭头展开子分类。' }}</p>
            <template v-if="searching">
              <p class="search-count" role="status">共找到 {{ matches.length }} 个分类</p>
              <ul class="search-results" aria-label="分类搜索结果">
                <li v-for="entry in visibleMatches" :key="String(entry.node.value)"><button type="button" class="category-choice search-choice" :aria-pressed="isSelected(entry.node.value)" :disabled="multiple && chosenValues.length >= max && !isSelected(entry.node.value)" :title="entry.path" @click="select(entry.node)"><Icon v-if="isSelected(entry.node.value)" icon="lucide:check" width="15" /><span>{{ entry.path }}</span></button></li>
              </ul>
              <p v-if="!matches.length" class="empty">没有匹配的分类，请更换关键词。</p>
              <Button v-if="visibleMatches.length < matches.length" type="button" variant="ghost" size="sm" class="more-results" @click="searchLimit += 60">显示更多（已显示 {{ visibleMatches.length }} / {{ matches.length }}）</Button>
            </template>
            <div v-else-if="options.length" class="category-columns">
              <ul v-for="(nodes, depth) in columns" :key="depth" class="category-column" :aria-label="`第 ${depth + 1} 级分类`">
                <li v-for="(node, row) in nodes" :key="String(node.value)" class="category-row" :class="{ active: expandedPath[depth] === String(node.value) }">
                  <button type="button" class="category-choice" :data-column="depth" :data-row="row" :aria-pressed="isSelected(node.value)" :disabled="multiple && chosenValues.length >= max && !isSelected(node.value)" :title="node.label" @pointerenter="event => { if (event.pointerType === 'mouse') expand(node); }" @click="select(node)" @keydown="onNodeKeydown($event, node, depth, row)"><Icon :icon="isSelected(node.value) ? (multiple ? 'lucide:square-check' : 'lucide:circle-check') : (multiple ? 'lucide:square' : 'lucide:circle')" width="15" /><span>{{ node.label }}</span></button>
                  <button v-if="node.children?.length" type="button" class="category-expand" :aria-label="`展开${node.label}的子分类`" :aria-expanded="expandedPath[depth] === String(node.value)" @click="expand(node); focusRow(depth + 1, 0)"><Icon icon="lucide:chevron-right" width="16" /></button>
                </li>
              </ul>
              <p v-if="columns.length < 3" class="category-guide"><Icon icon="lucide:layers" width="24" /><span>点击名称选择当前分类<br />展开箭头查看下一级</span></p>
            </div>
            <p v-else class="empty">暂无可选择分类</p>
            <div v-if="multiple" class="category-panel-footer"><Button type="button" size="sm" @click="open = false">完成选择</Button></div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <Button v-if="hasValue" type="button" variant="ghost" size="icon" :disabled="blocked" aria-label="清除分类选择" @click="clear"><Icon icon="lucide:x" width="15" /></Button>
    <ul v-if="multiple && hasValue" class="category-selected" aria-label="已选商品分类">
      <li v-for="value in visibleChosen" :key="String(value)"><span :title="categoryName(value)">{{ categoryLabel(value) }}</span><em v-if="String(value) === String(modelValue)" class="category-primary" title="主分类">主</em><button type="button" :disabled="blocked" :aria-label="`移除分类：${categoryName(value)}`" @click="remove(value)"><Icon icon="lucide:x" width="12" /></button></li>
      <li v-if="chosenValues.length > 3" class="category-selected-more"><button type="button" :aria-expanded="showAllChosen" @click="showAllChosen = !showAllChosen">{{ showAllChosen ? '收起' : `+${chosenValues.length - 3} 个` }}</button></li>
    </ul>
  </div>
</template>

<style scoped>
.category-picker { display:flex; align-items:center; gap:6px; min-width:0; }
.category-picker.multiple { flex-wrap:wrap; }
.category-picker.multiple>.category-trigger { flex-basis:calc(100% - 46px); }
.category-selected { display:flex; flex-wrap:wrap; gap:6px; width:100%; min-width:0; padding:0; margin:0; list-style:none; }
.category-selected li { display:flex; align-items:center; gap:4px; min-width:0; max-width:100%; padding:2px 6px; border:1px solid var(--yb-hairline); border-radius:5px; background:var(--yb-primary-soft); color:var(--yb-ink); font-size:12px; line-height:1.4; }
.category-selected li>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.category-selected .category-primary { font-style:normal; flex-shrink:0; padding:1px 3px; border-radius:3px; background:var(--yb-brand-primary); color:var(--yb-primary-foreground,var(--on-primary,#fff)); font-size:10px; }
.category-selected button { display:grid; place-items:center; flex-shrink:0; min-width:24px; min-height:24px; border-radius:4px; padding:0; }
.category-selected .category-selected-more { background:transparent; border-style:dashed; }
.category-selected-more button { padding:0 2px; }
.category-selected button:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:1px; }
.category-panel-footer { display:flex; justify-content:flex-end; padding:8px 12px; border-top:1px solid var(--yb-hairline); }
.category-choice:disabled { opacity:.5; cursor:not-allowed; }
.category-trigger { flex:1; width:100%; min-width:0; justify-content:space-between; font-weight:400; }
.category-trigger>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
.category-trigger>svg { flex-shrink:0; }
.placeholder { color:var(--yb-muted); }
.category-panel { --category-controls-height:110px; display:flex; flex-direction:column; width:min(662px,calc(100vw - 32px)); max-height:min(calc(100dvh - 32px),var(--reka-popover-content-available-height,100dvh)); overflow:hidden; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-surface); color:var(--yb-ink); box-shadow:0 10px 32px #00000014; }
.category-panel.multiple { --category-controls-height:160px; }
.category-search,.category-hint,.search-count,.category-panel-footer,.more-results { flex-shrink:0; }
.category-panel.searching { width:min(560px,calc(100vw - 32px)); }
.category-search { display:flex; align-items:center; gap:8px; padding:12px 12px 4px; color:var(--yb-muted); }
.category-search>svg { flex-shrink:0; }
.category-search input { height:34px; min-width:0; padding:0 10px; }
.category-hint,.search-count { margin:0; padding:8px 12px; color:var(--yb-muted); font-size:12px; line-height:1.5; }
.category-hint { display:flex; align-items:center; height:54px; border-bottom:1px solid var(--yb-hairline); }
.category-columns { display:flex; min-height:0; max-width:min(660px,calc(100vw - 34px)); overflow-x:auto; overscroll-behavior:contain; }
.category-column { flex:0 0 220px; width:220px; height:min(320px,calc(var(--reka-popover-content-available-height,420px) - var(--category-controls-height))); min-height:0; overflow-y:auto; padding:6px; margin:0; list-style:none; overscroll-behavior:contain; }
.category-column+.category-column { border-left:1px solid var(--yb-hairline); }
.category-guide { display:flex; flex:1; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-width:180px; margin:0; padding:20px; border-left:1px solid var(--yb-hairline); color:var(--yb-muted); font-size:12px; line-height:1.8; text-align:center; background:var(--yb-fill); }
.category-row { display:flex; align-items:center; border-radius:6px; }
.category-row.active,.category-row:hover { background:var(--yb-primary-soft); }
.category-choice,.category-expand { border:0; background:transparent; color:inherit; cursor:pointer; border-radius:6px; }
.category-choice { display:flex; align-items:center; gap:8px; width:100%; min-width:0; min-height:36px; padding:8px; text-align:left; font-size:13px; line-height:1.5; }
.category-choice>svg { flex-shrink:0; color:var(--yb-muted); }
.category-choice>span { min-width:0; overflow-wrap:anywhere; }
.category-choice[aria-pressed=true],.category-row.active { color:var(--yb-brand-primary); }
.category-choice[aria-pressed=true]>svg { color:var(--yb-brand-primary); }
.category-expand { display:grid; place-items:center; flex:0 0 32px; width:32px; min-height:36px; }
.category-choice:focus-visible,.category-expand:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:-2px; background:var(--yb-primary-soft); }
.search-results { min-height:0; max-height:min(320px,max(80px,calc(var(--reka-popover-content-available-height,492px) - 172px))); overflow-y:auto; list-style:none; padding:4px 6px; margin:0; overscroll-behavior:contain; }
.search-choice:hover { background:var(--yb-primary-soft); }
.more-results { width:100%; border-top:1px solid var(--yb-hairline); border-radius:0; }
.empty { padding:16px; color:var(--yb-muted); font-size:13px; margin:0; }
</style>
