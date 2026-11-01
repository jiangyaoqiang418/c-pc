<script setup lang="ts">
withDefaults(defineProps<{ label?: string; compact?: boolean; block?: boolean }>(), { label: '正在加载…', compact: false, block: false });
</script>

<template>
  <span class="loading-status" :class="{ compact, block }" role="status" aria-live="polite">
    <svg class="loading-status-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity=".2" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    <span :class="{ 'sr-only': compact }">{{ label }}</span>
  </span>
</template>

<style scoped>
.loading-status { display:inline-flex; align-items:center; gap:8px; max-width:100%; color:var(--green); font-size:13px; font-weight:400; line-height:1.5; vertical-align:middle; }
.loading-status-spinner { flex:none; width:16px; height:16px; animation:loading-status-spin .85s linear infinite; }
.loading-status.compact { gap:0; }
.loading-status.inherit-color { color:inherit; }
.loading-status.block { display:flex; margin:12px 0; padding:10px 12px; border:1px solid var(--line); border-radius:7px; background:color-mix(in srgb,var(--green) 6%,var(--paper)); }
@keyframes loading-status-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .loading-status-spinner { animation:none; } }
</style>
