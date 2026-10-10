<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface Props {
  text: string;
  size?: number;
}
withDefaults(defineProps<Props>(), { size: 14 });
</script>

<template>
  <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child>
    <button type="button" class="info-icon" :aria-label="text"><Icon icon="lucide:info" :width="size" :height="size" /></button>
  </TooltipTrigger><TooltipContent side="top" class="max-w-80">{{ text }}</TooltipContent></Tooltip></TooltipProvider>
</template>

<style scoped>
.info-icon {
  color: var(--yb-faint);
  cursor: help;
  vertical-align: middle;
  margin-left: 4px;
  transition: color 0.15s;
  display: inline-flex;
  align-items: center;
  padding: 0;
  background: transparent;
  border: 0;
}
.info-icon:hover {
  color: var(--yb-primary);
}
</style>
