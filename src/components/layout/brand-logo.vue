<script setup lang="ts">
import { computed } from 'vue';
import { useUiTheme } from '@/composables/use-ui-theme';
import memeWordmark from '@/assets/images/v47/umaomao-meme-wordmark.svg';
import memeCat from '@/assets/images/v47/umaomao-meme-cat.svg';
import standardWordmark from '@/assets/images/v47/umaomao-cat-swiss-wordmark.svg';
import standardCat from '@/assets/images/v47/umaomao-cat-head.svg';

const { currentTheme } = useUiTheme();
const isMeme = computed(() => currentTheme.value === 'web3-meme');
</script>

<template>
  <RouterLink to="/" class="logo um-brand" aria-label="Umaomao 首页"><picture class="brand-art"><source media="(max-width:700px)" :srcset="isMeme ? memeCat : standardCat" /><img :src="isMeme ? memeWordmark : standardWordmark" alt="Umaomao" width="840" height="140" decoding="async" /></picture></RouterLink>
</template>
