<script setup lang="ts">
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
  <div class="realtime-status" :class="`is-${meta.tone}`" role="status" aria-live="polite">
    <span class="status-dot" aria-hidden="true" />
    <span>{{ meta.label }}</span>
    <a-link v-if="state === 'closed'" size="mini" @click="emit('reconnect')">立即重连</a-link>
  </div>
</template>

<style scoped>
.realtime-status { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; color: #86909c; font-size: 12px; white-space: nowrap; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #c9cdd4; }
.is-open { color: #00a870; }.is-open .status-dot { background: #00b42a; }
.is-connecting { color: #165dff; }.is-connecting .status-dot { background: #165dff; animation: pulse 1.4s ease-in-out infinite; }
.is-closed { color: #d25f00; }.is-closed .status-dot { background: #f77234; }
@keyframes pulse { 50% { opacity: .35; } }
</style>
