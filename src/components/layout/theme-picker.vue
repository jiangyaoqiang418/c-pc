<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUiTheme } from '@/composables/use-ui-theme';

const { isDark, setTheme } = useUiTheme();
const nextTheme = computed(() => isDark.value ? 'navy-coral' : 'web3-meme');
const label = computed(() => isDark.value ? '切换为浅色模式' : '切换为深色模式');
</script>

<template>
  <span class="theme-toggle-container">
  <TooltipProvider :delay-duration="200"><Tooltip>
    <TooltipTrigger as-child>
      <Button type="button" variant="ghost" size="icon" class="theme-toggle" :aria-label="label" :data-theme-target="nextTheme" @click="setTheme(nextTheme)">
        <Icon :icon="isDark ? 'lucide:sun' : 'lucide:moon'" width="20" height="20" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip></TooltipProvider>
  </span>
</template>

<style scoped>
.theme-toggle-container { display:inline-flex; align-items:center; flex-shrink:0; }
.theme-toggle { flex-shrink:0; width:44px; height:44px; color:var(--ink); }
.theme-toggle:hover { background:var(--soft); color:var(--green); }
.theme-toggle :deep(svg) { width:20px; height:20px; }
</style>
