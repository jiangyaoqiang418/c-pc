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
  width: 96px;
  height: 96px;
  border-radius: 999px;
  background: var(--yb-champagne);
  color: var(--yb-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.icon {
  width: 44px;
  height: 44px;
}
.title {
  font-size: 17px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.01em;
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
  background: var(--yb-brand-pink);
  color: #fff;
  border: none;
  border-radius: var(--yb-radius-pill);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s, transform 0.15s;
}
.action:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
}
</style>
