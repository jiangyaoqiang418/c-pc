<script setup lang="ts">
import RichTextContent from '@/components/common/rich-text-content.vue';
defineProps<{ summary?: string; description?: string }>();
</script>

<template>
  <section class="product-description">
    <p v-if="summary" class="description-summary">{{ summary }}</p>
    <h2>商品详情</h2><RichTextContent :content="description" />
  </section>
</template>

<style scoped>
.product-description { width:100%; max-width:960px; margin:0 auto; min-width:0; }.product-description h2 { margin:0 0 20px; font-size:20px; }.description-summary { margin:0 0 24px; line-height:1.8; color:var(--muted); overflow-wrap:anywhere; }
</style>
