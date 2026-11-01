<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Icon } from '@iconify/vue';
import { computed } from 'vue';

interface Props {
  state: 'idle' | 'connecting' | 'open' | 'closed';
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'reconnect'): void }>();

const meta = computed(() => ({
  idle: { label: '实时未启动', tone: 'idle', icon: 'lucide:unplug' },
  connecting: { label: '正在连接实时服务', tone: 'connecting', icon: 'lucide:loader-circle' },
  open: { label: '实时已连接', tone: 'open', icon: 'lucide:wifi' },
  closed: { label: '实时连接已断开', tone: 'closed', icon: 'lucide:wifi-off' }
}[props.state]));


</script>

<template>

  <div class="realtime-status" :class="'is-' + meta.tone" role="status" aria-live="polite"><Icon :icon="meta.icon" class="status-icon" aria-hidden="true" /><span>{{ meta.label }}</span><Button v-if="state === 'closed'" type="button" variant="link" size="sm" class="reconnect" @click="emit('reconnect')"><Icon icon="lucide:refresh-cw" class="status-icon" aria-hidden="true" />立即重连</Button></div>
</template>

<style scoped>

.realtime-status { display:inline-flex; align-items:center; gap:6px; min-height:24px; color:var(--yb-muted); font-size:12px; white-space:nowrap; }.status-icon { width:14px; height:14px; flex-shrink:0; }.is-open { color:var(--yb-success); }.is-connecting { color:var(--yb-primary); }.is-connecting .status-icon { animation:status-spin .8s linear infinite; }.is-closed { color:var(--yb-warning); }.reconnect { height:auto; padding:0 4px; font-size:inherit; }
@keyframes status-spin { to { transform:rotate(360deg); } }@media (prefers-reduced-motion:reduce) { .is-connecting .status-icon { animation:none; } }

</style>
