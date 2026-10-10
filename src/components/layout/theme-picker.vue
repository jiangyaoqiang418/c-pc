<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useUiTheme, type UiTheme } from '@/composables/use-ui-theme';

const { currentTheme, themes, setTheme } = useUiTheme();
function selectTheme(value: unknown) {
  if (themes.some(theme => theme.id === value)) setTheme(value as UiTheme);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button type="button" class="theme-trigger" aria-label="切换商城主题"><Icon icon="lucide:palette" /><span>主题</span><Icon icon="lucide:chevron-down" class="chevron" /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <DropdownMenuLabel>商城配色</DropdownMenuLabel>
      <DropdownMenuRadioGroup :model-value="currentTheme" @update:model-value="selectTheme">
        <DropdownMenuRadioItem v-for="theme in themes" :key="theme.id" :value="theme.id">
          <span class="theme-dot" :style="{ background: theme.primary, borderColor: theme.accent }" />{{ theme.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<style scoped>
.theme-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 8px 0; border: 0; background: none; color: var(--yb-muted); font-size: 13px; cursor: pointer; }
.theme-trigger:hover { color: var(--yb-primary); }
.chevron { font-size: 12px; }
.theme-dot { width: 16px; height: 16px; border-radius: 50%; border: 3px solid; margin-right: 6px; }
</style>
