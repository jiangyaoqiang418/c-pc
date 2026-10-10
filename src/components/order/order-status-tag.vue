<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  status: Api.Order.OrderStatus;
  size?: 'small' | 'medium' | 'large';
}
const props = withDefaults(defineProps<Props>(), { size: 'medium' });

const meta = computed(() => enums.ORDER_STATUS_META[props.status]);
</script>

<template>
  <span class="status-tag" :class="[size, meta?.color || 'gray']">{{ meta?.label || '状态待核对' }}</span>
</template>

<style scoped>
.status-tag { display: inline-flex; align-items: center; flex-shrink: 0; padding: 3px 8px; border-radius: 5px; background: var(--yb-fill); color: var(--yb-muted); font-size: 13px; line-height: 1.5; font-weight: 500; }
.status-tag.small { font-size: 12px; padding: 2px 6px; }
.status-tag.large { font-size: 15px; padding: 6px 12px; }
.orange { background: #fff3df; color: #9a5709; }
.arcoblue, .blue { background: #edf3fc; color: #315a96; }
.cyan { background: #e7f4f4; color: #276d6d; }
.purple { background: #f2ebf7; color: #704a8d; }
.green { background: #e9f3eb; color: #326b43; }
.red { background: #fcecea; color: #ad453e; }
</style>
