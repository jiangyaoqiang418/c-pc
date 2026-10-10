<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';

interface Props {
  state: 'idle' | 'connecting' | 'open' | 'closed';
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'reconnect'): void }>();

const meta = computed(() => ({
  idle: { label: '实时未启动', tone: 'idle' },
  connecting: { label: '正在连接实时服务', tone: 'connecting' },
  open: { label: '实时已连接', tone: 'open' },
  closed: { label: '实时连接已断开', tone: 'closed' }
}[props.state]));


</script>

<template>

  <div class="realtime-status" :class="'is-' + meta.tone" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true" /><span>{{ meta.label }}</span><Button v-if="state === 'closed'" type="button" variant="link" size="sm" class="reconnect" @click="emit('reconnect')">立即重连</Button></div>
</template>

<style scoped>

.realtime-status { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; color: var(--yb-muted); font-size: 12px; white-space: nowrap; }.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--yb-muted); }.is-open { color: var(--yb-success); }.is-open .status-dot { background: currentColor; }.is-connecting { color: var(--yb-primary); }.is-connecting .status-dot { background: currentColor; animation: pulse 1.4s ease-in-out infinite; }.is-closed { color: var(--yb-warning); }.is-closed .status-dot { background: currentColor; }.reconnect { height: auto; padding: 0 4px; font-size: inherit; }
@keyframes pulse { 50% { opacity: .35; } }@media (prefers-reduced-motion: reduce) { .is-connecting .status-dot { animation: none; } }

</style>
