<script setup lang="ts">
import { useUiTheme } from '@/composables/use-ui-theme';
import fullLogo from '@/assets/images/brand/umaomao-full-logo.svg';
import catLogo from '@/assets/images/brand/umaomao-cat-logo.svg';

const { isDark } = useUiTheme();
</script>

<template>
  <RouterLink to="/" class="logo um-brand" aria-label="Umaomao 首页"><picture class="brand-art" :style="{ background: isDark ? 'transparent' : '#101210' }"><source media="(max-width:700px)" :srcset="catLogo" /><img :src="fullLogo" alt="Umaomao" width="1385" height="210" decoding="async" /></picture></RouterLink>
</template>
