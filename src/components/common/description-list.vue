<script setup lang="ts">
withDefaults(defineProps<{
  items: Array<{ label: string; value?: string | number | null }>;
  columns?: 1 | 2;
}>(), { columns: 1 });
</script>

<template>
  <dl class="description-list" :class="{ 'two-columns': columns === 2 }">
    <div v-for="item in items" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value === undefined || item.value === null || item.value === '' ? '—' : item.value }}</dd></div>
  </dl>
</template>

<style scoped>
.description-list { display:grid; gap:0 24px; margin:0; }.description-list>div { display:grid; grid-template-columns:110px minmax(0,1fr); gap:16px; padding:15px 0; border-bottom:1px solid var(--yb-hairline); }.description-list>div:last-child { border-bottom:0; }dt { color:var(--yb-muted); font-size:13px; }dd { margin:0; color:var(--yb-ink); font-size:14px; overflow-wrap:anywhere; white-space:pre-wrap; }.two-columns { grid-template-columns:repeat(2,minmax(0,1fr)); }@media(max-width:700px) { .two-columns { grid-template-columns:1fr; }.description-list>div { grid-template-columns:90px minmax(0,1fr); } }
</style>
