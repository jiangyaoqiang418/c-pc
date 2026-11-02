<script setup lang="ts">
import { ref, watch } from 'vue';
const props = defineProps<{ src?: string | null; name: string }>();
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>
<template><span class="brand-mark"><img v-if="src && !failed" :src="src" :alt="name" loading="lazy" @error="failed = true" /><span v-else aria-hidden="true">{{ name.slice(0, 1) }}</span></span></template>
<style scoped>.brand-mark{display:inline-flex;width:36px;height:36px;flex-shrink:0;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--paper);vertical-align:middle;margin-right:8px}.brand-mark img{width:100%;height:100%;object-fit:contain}.brand-mark span{font-size:18px}</style>
