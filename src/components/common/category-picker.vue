<script setup lang="ts">
import { computed, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CategoryOption {
  value: string | number;
  label: string;
  children?: CategoryOption[];
}
const props = withDefaults(defineProps<{
  modelValue?: string | number;
  options: CategoryOption[];
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  id?: string;
}>(), { placeholder: '选择商品分类' });
const emit = defineEmits<{ 'update:modelValue': [value: string | number | undefined] }>();
const fallbackId = useId();
const rows = computed(() => {
  const result: Array<{ value: string | number; path: string }> = [];
  function visit(nodes: CategoryOption[], parents: string[] = []) {
    for (const node of nodes) {
      const path = [...parents, node.label];
      result.push({ value: node.value, path: path.join(' / ') });
      if (node.children?.length) visit(node.children, path);
    }
  }
  visit(props.options);
  return result;
});
function select(value: unknown) {
  const row = rows.value.find(item => String(item.value) === String(value));
  if (row) emit('update:modelValue', row.value);
}
</script>

<template>
  <div class="category-picker">
    <Select :model-value="modelValue === undefined || modelValue === '' ? undefined : String(modelValue)" :disabled="disabled || loading" @update:model-value="select">
      <SelectTrigger :id="id || fallbackId" class="category-trigger"><SelectValue :placeholder="loading ? '正在读取分类…' : placeholder" /></SelectTrigger>
      <SelectContent><SelectItem v-for="row in rows" :key="String(row.value)" :value="String(row.value)">{{ row.path }}</SelectItem><p v-if="!rows.length" class="empty">暂无可选择分类</p></SelectContent>
    </Select>
    <Button v-if="modelValue !== undefined && modelValue !== ''" type="button" variant="ghost" size="icon" :disabled="disabled || loading" aria-label="清除分类选择" @click="emit('update:modelValue', undefined)"><Icon icon="lucide:x" width="15" /></Button>
  </div>
</template>

<style scoped>
.category-picker { display:flex; align-items:center; gap:6px; min-width:0; }.category-trigger { width:100%; min-width:0; }.empty { padding:16px; color:var(--yb-muted); font-size:13px; margin:0; }
</style>
