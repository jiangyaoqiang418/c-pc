<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  type: Api.Wallet.TxnType;
  size?: 'small' | 'medium';
}
const props = withDefaults(defineProps<Props>(), { size: 'small' });

const meta = computed(() => enums.TXN_TYPE_META[props.type]);
</script>

<template>
  <a-tag :color="meta.color" :size="size">{{ meta.label }}</a-tag>
</template>
