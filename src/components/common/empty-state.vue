<script setup lang="ts">
import { computed } from 'vue';
import UmIcon from './um-icon.vue';

interface Props {
  title: string;
  description?: string;
  actionText?: string;
  icon?: string;
}
const props = withDefaults(defineProps<Props>(), { icon: 'lucide:inbox' });
defineEmits<{ (e: 'action'): void }>();
const sourceIcon = computed(() => {
  const name = props.icon.split(':').at(-1) || '';
  if (/search/.test(name)) return 'search';
  if (/heart/.test(name)) return 'heart';
  if (/message|chat|headphone/.test(name)) return 'chat';
  if (/wallet|banknote/.test(name)) return 'wallet';
  if (/bell/.test(name)) return 'bell';
  if (/shield/.test(name)) return 'shield';
  if (/sparkle|star/.test(name)) return 'star';
  if (/book|file|folder/.test(name)) return 'grid';
  return 'bag';
});
</script>

<template>
  <div class="empty empty-state">
    <UmIcon :name="sourceIcon" />
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <button v-if="actionText" type="button" class="primary" @click="$emit('action')">{{ actionText }}</button>
  </div>
</template>
