<script setup lang="ts">
import RichTextContent from '@/components/common/rich-text-content.vue';
defineProps<{ description?: string }>();
</script>

<template>
  <section class="product-description">
    <h2>商品详情</h2><slot /><RichTextContent :content="description" />
  </section>
</template>

<style scoped>
.product-description { width:100%; max-width:960px; margin:0 auto; min-width:0; }.product-description h2 { margin:0 0 20px; font-size:20px; }
</style>
