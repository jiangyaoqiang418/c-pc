<script setup lang="ts">
import { computed } from 'vue';
import DetailScene from '@/components/detail-studio/detail-scene.vue';
import { parseScene } from '@/components/detail-studio/scene';
import RichTextContent from '@/components/common/rich-text-content.vue';
const props = defineProps<{ description?: string; detailDesignJson?: string }>();
const scene = computed(() => parseScene(props.detailDesignJson));
</script>

<template>
  <section class="product-description">
    <h2>商品详情</h2><slot /><DetailScene v-if="scene?.mode === 'mixed'" :document="scene" /><RichTextContent v-else :content="description" />
  </section>
</template>

<style scoped>
.product-description { width:100%; max-width:960px; margin:0 auto; min-width:0; }.product-description h2 { margin:0 0 20px; font-size:20px; }
</style>
