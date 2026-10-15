<script setup lang="ts">
import { computed } from 'vue';
import UmIcon from './um-icon.vue';

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
  <nav class="business-pagination pagination" aria-label="分页">
    <span class="pagination-total">共 {{ total }} 条</span>
    <button type="button" class="pagination-prev" aria-label="上一页" :disabled="loading || current <= 1" @click="change(current - 1)"><UmIcon name="chevron" /></button>
    <template v-for="page in pages" :key="page">
      <span v-if="typeof page !== 'number'" class="pagination-gap" aria-hidden="true">…</span>
      <button
        v-else
        type="button"
        class="page-number"
        :class="{ active: page === current }"
        :aria-label="`第 ${page} 页`"
        :aria-current="page === current ? 'page' : undefined"
        :disabled="loading"
        @click="change(page)"
      >{{ page }}</button>
    </template>
    <span class="pagination-count">{{ current }} / {{ pageCount }}</span>
    <button type="button" aria-label="下一页" :disabled="loading || current >= pageCount" @click="change(current + 1)"><UmIcon name="chevron" /></button>
  </nav>
</template>

<style scoped>
.business-pagination { align-items:center; flex-wrap:wrap; }
.business-pagination button { display:grid; place-items:center; }
.business-pagination svg { width:16px; height:16px; }
.pagination-prev svg { transform:rotate(180deg); }
.pagination-total { margin-right: 12px; color: var(--yb-muted); font-size: 13px; }
.pagination-gap { width: 28px; text-align: center; color: var(--yb-muted); }
@media (max-width:700px) { .pagination-gap { display:none; } }
</style>
