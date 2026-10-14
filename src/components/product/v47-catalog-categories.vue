<script setup lang="ts">
import { computed } from 'vue';
import V47CatalogRail from './v47-catalog-rail.vue';

interface CategoryNode { readonly id: string; readonly name: string; readonly children?: readonly CategoryNode[]; }
const props = defineProps<{ roots: readonly CategoryNode[]; selectedId?: string }>();
defineEmits<{ select: [id: string] }>();
function findPath(nodes: readonly CategoryNode[], id?: string): CategoryNode[] {
  if (!id) return [];
  for (const node of nodes) {
    if (node.id === id) return [node];
    const childPath = findPath(node.children || [], id);
    if (childPath.length) return [node, ...childPath];
  }
  return [];
}
const path = computed(() => findPath(props.roots, props.selectedId));
const root = computed(() => path.value[0]);
const second = computed(() => path.value[1]);
const leaves = computed(() => second.value?.children || root.value?.children?.flatMap(node => node.children || []) || []);
</script>

<template>
  <section v-if="root?.children?.length" class="catalog-categories" aria-label="商品类目筛选">
    <div class="catalog-category-row"><V47CatalogRail :items="root.children" :all-id="root.id" :active-id="second?.id" :label="`${root.name}分类`" @select="$emit('select', $event)" /></div>
    <div v-if="leaves.length" class="catalog-category-row"><V47CatalogRail :items="leaves" :all-id="second?.id || root.id" :active-id="path[2]?.id" :label="`${second?.name || root.name}细分商品`" @select="$emit('select', $event)" /></div>
  </section>
</template>

<style scoped>
</style>
