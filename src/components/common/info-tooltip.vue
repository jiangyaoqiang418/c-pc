<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  text: string;
  size?: number;
}
withDefaults(defineProps<Props>(), { size: 14 });
</script>

<template>
  <a-tooltip :content="text" position="top" mini>
    <Icon icon="lucide:info" :width="size" :height="size" class="info-icon" />
  </a-tooltip>
</template>

<style scoped>
.info-icon {
  color: var(--yb-faint);
  cursor: help;
  vertical-align: middle;
  margin-left: 4px;
  transition: color 0.15s;
  display: inline-block;
}
.info-icon:hover {
  color: var(--yb-primary);
}
</style>
