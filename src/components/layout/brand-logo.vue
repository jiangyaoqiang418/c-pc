<script setup lang="ts">
import wordmark from '@/assets/images/umaomao-wordmark.svg';
</script>

<template>
  <RouterLink to="/" class="um-brand" aria-label="Umaomao 首页"><img :src="wordmark" alt="Umaomao" width="208" height="33" /></RouterLink>
</template>

<style scoped>
.um-brand { display: inline-flex; flex: none; align-items: center; width: 208px; }
.um-brand img { width: 100%; height: auto; filter: none; }
@media (max-width: 1100px) { .um-brand { width: 160px; } }
</style>
