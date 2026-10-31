<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeRichText } from '@/utils/rich-text';

const props = defineProps<{ content?: string; emptyText?: string }>();
const html = computed(() => sanitizeRichText(props.content) || `<p>${props.emptyText || '暂无详情'}</p>`);
</script>

<template><div class="rich-text-content" v-html="html" /></template>

<style scoped>
.rich-text-content { color: inherit; line-height: 1.75; overflow-wrap: anywhere; }
.rich-text-content :deep(p), .rich-text-content :deep(h2), .rich-text-content :deep(h3), .rich-text-content :deep(blockquote) { margin: 0 0 12px; }
.rich-text-content :deep(ul), .rich-text-content :deep(ol) { margin: 0 0 12px; padding-left: 24px; }
.rich-text-content :deep(em), .rich-text-content :deep(i) { font-style: italic; }
.rich-text-content :deep(ul) { list-style: disc outside; }
.rich-text-content :deep(ol) { list-style: decimal outside; }
.rich-text-content :deep(li) { display: list-item; }
.rich-text-content :deep(li p) { margin: 0; }
.rich-text-content :deep(li + li) { margin-top: 4px; }
.rich-text-content :deep(img) { display: block; max-width: 100%; height: auto; margin: 12px auto; border-radius: 6px; }
.rich-text-content :deep(a) { color: var(--yb-brand-primary); text-decoration: underline; }
.rich-text-content :deep(blockquote) { padding-left: 12px; border-left: 3px solid var(--yb-hairline-2); color: var(--yb-ink-2); }
.rich-text-content :deep(blockquote p) { color: inherit; }
.rich-text-content :deep(table) { width: 100%; border-collapse: collapse; margin: 12px 0; }
.rich-text-content :deep(th), .rich-text-content :deep(td) { padding: 7px; border: 1px solid var(--yb-hairline-2); text-align: left; }
@media (max-width:700px) {
  .rich-text-content { min-width:0; max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; }
  .rich-text-content :deep(pre) { max-width:100%; overflow-x:auto; }
}
</style>
