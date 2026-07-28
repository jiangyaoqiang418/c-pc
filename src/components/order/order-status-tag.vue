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
  <a-tag :color="meta.color" :size="size">{{ meta.label }}</a-tag>
</template>
