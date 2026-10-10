<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';

const props = withDefaults(defineProps<{
  total: number;
  current: number;
  pageSize: number;
  loading?: boolean;
}>(), { loading: false });
const emit = defineEmits<{ change: [page: number] }>();
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));
const pages = computed(() => {
  const start = Math.max(2, Math.min(props.current - 2, pageCount.value - 4));
  const end = Math.min(pageCount.value - 1, Math.max(props.current + 2, 5));
  const result: (number | 'before' | 'after')[] = [1];
  if (start > 2) result.push('before');
  for (let page = start; page <= end; page++) result.push(page);
  if (end < pageCount.value - 1) result.push('after');
  if (pageCount.value > 1) result.push(pageCount.value);
  return result;
});

function change(page: number) {
  if (props.loading || page === props.current || page < 1 || page > pageCount.value) return;
  emit('change', page);
}
</script>

<template>
  <nav class="business-pagination" aria-label="分页">
    <span class="pagination-total">共 {{ total }} 条</span>
    <Button variant="outline" size="icon" aria-label="上一页" :disabled="loading || current <= 1" @click="change(current - 1)">
      <Icon icon="lucide:chevron-left" width="16" />
    </Button>
    <template v-for="page in pages" :key="page">
      <span v-if="typeof page !== 'number'" class="pagination-gap" aria-hidden="true">…</span>
      <Button
        v-else
        :variant="page === current ? 'default' : 'ghost'"
        size="icon"
        :aria-label="`第 ${page} 页`"
        :aria-current="page === current ? 'page' : undefined"
        :disabled="loading"
        @click="change(page)"
      >{{ page }}</Button>
    </template>
    <Button variant="outline" size="icon" aria-label="下一页" :disabled="loading || current >= pageCount" @click="change(current + 1)">
      <Icon icon="lucide:chevron-right" width="16" />
    </Button>
  </nav>
</template>

<style scoped>
.business-pagination { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
.pagination-total { margin-right: 12px; color: var(--yb-muted); font-size: 13px; }
.pagination-gap { width: 28px; text-align: center; color: var(--yb-muted); }
</style>
