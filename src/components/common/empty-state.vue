<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  title: string;
  description?: string;
  actionText?: string;
  icon?: string;
}
withDefaults(defineProps<Props>(), { icon: 'lucide:inbox' });
defineEmits<{ (e: 'action'): void }>();
</script>

<template>
  <div class="empty-state">
    <div class="icon-wrap">
      <Icon :icon="icon" class="icon" />
    </div>
    <div class="title">{{ title }}</div>
    <div v-if="description" class="desc">{{ description }}</div>
    <button v-if="actionText" class="action" @click="$emit('action')">
      {{ actionText }}
      <Icon icon="lucide:arrow-right" width="14" />
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  padding: 64px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.icon-wrap {
  width: 56px;
  height: 56px;
  color: var(--yb-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.icon {
  width: 48px;
  height: 48px;
}
.title {
  font-size: 24px;
  font-weight: 650;
  color: var(--yb-ink);
  line-height: 1.4;
}
.desc {
  font-size: 13px;
  color: var(--yb-muted);
  max-width: 320px;
  line-height: 1.6;
}
.action {
  margin-top: 16px;
  padding: 10px 20px;
  background: var(--yb-brand-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s, transform 0.15s;
}
.action:hover {
  background: var(--yb-brand-hover);
  transform: translateY(-1px);
}
.action:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 3px; }
@media(prefers-reduced-motion:reduce) { .action { transition:none; }.action:hover { transform:none; } }
</style>
