<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  status: Api.Order.OrderStatus;
  size?: 'small' | 'medium' | 'large';
  plain?: boolean;
}
const props = withDefaults(defineProps<Props>(), { size: 'medium' });

const meta = computed(() => enums.ORDER_STATUS_META[props.status]);
</script>

<template>
  <b v-if="plain" class="status-text">{{ meta?.label || '状态待核对' }}</b>
  <span v-else class="status-tag" :class="[size, meta?.color || 'gray']">{{ meta?.label || '状态待核对' }}</span>
</template>

<style scoped>
.status-tag { --status-tone: var(--muted); display: inline-flex; align-items: center; flex-shrink: 0; padding: 3px 8px; border-radius: 5px; background: color-mix(in srgb, var(--status-tone) 10%, var(--paper)); color: color-mix(in srgb, var(--status-tone) 50%, var(--ink)); font-size: 13px; line-height: 1.5; font-weight: 500; }
.status-tag.small { font-size: 12px; padding: 2px 6px; }
.status-tag.large { font-size: 15px; padding: 6px 12px; }
.orange { --status-tone: var(--yb-warning); }
.arcoblue, .blue, .purple { --status-tone: var(--yb-info); }
.cyan { --status-tone: var(--green); }
.green { --status-tone: var(--yb-success); }
.red { --status-tone: var(--yb-danger); }
</style>
