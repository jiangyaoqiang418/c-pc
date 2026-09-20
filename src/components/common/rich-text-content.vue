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
.rich-text-content :deep(img) { display: block; max-width: 100%; height: auto; margin: 12px auto; border-radius: 6px; }
.rich-text-content :deep(a) { color: #165dff; text-decoration: underline; }
.rich-text-content :deep(blockquote) { padding-left: 12px; border-left: 3px solid #c9cdd4; color: #4e5969; }
.rich-text-content :deep(table) { width: 100%; border-collapse: collapse; margin: 12px 0; }
.rich-text-content :deep(th), .rich-text-content :deep(td) { padding: 7px; border: 1px solid #c9cdd4; text-align: left; }
</style>
