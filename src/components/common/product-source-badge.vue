<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ source?: string | null; detail?: boolean }>();
const label = computed(() => props.source?.trim());
</script>

<template>
  <span v-if="label" class="product-source-badge" :class="{ detail }" :title="label" :aria-label="'商品来源：' + label">{{ label }}</span>
</template>

<style scoped>
.product-source-badge { display:inline-block; box-sizing:border-box; max-width:40%; margin-inline-end:5px; padding:2px 6px; border:1px solid var(--line); border-radius:999px; background:var(--yb-primary-soft,var(--soft)); color:var(--yb-brand-primary,var(--green)); font-size:12px; font-weight:500; line-height:1.3; vertical-align:text-top; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.product-source-badge.detail { max-width:100%; padding-inline:8px; font-size:13px; white-space:normal; overflow-wrap:anywhere; }
</style>
