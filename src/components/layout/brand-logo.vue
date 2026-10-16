<script setup lang="ts">
import BrandWordmark from './brand-wordmark.vue';
import catLogo from '@/assets/images/brand/umaomao-cat-logo.svg';
</script>

<template>
  <RouterLink to="/" class="logo um-brand" aria-label="Umaomao 首页"><span class="brand-art" style="background:transparent"><BrandWordmark class="brand-full" /><img class="brand-cat" :src="catLogo" alt="" width="800" height="800" decoding="async" /></span></RouterLink>
</template>

<style scoped>
.um-brand .brand-art { display:block; }
.um-brand .brand-art > .brand-full { display:block; width:100%; height:auto; margin:0; }
.um-brand .brand-art > .brand-cat { display:none; }
@media (max-width:700px) {
  .um-brand .brand-art > .brand-full { display:none; }
  .um-brand .brand-art > .brand-cat { display:block; }
}
</style>
