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
  <span class="type-tag" :class="[meta?.color || 'gray', size]">{{ meta?.label || type }}</span>
</template>

<style scoped>
.type-tag { display:inline-flex; align-items:center; padding:3px 8px; border-radius:4px; background:var(--yb-fill); color:var(--yb-muted); font-size:12px; line-height:1.4; white-space:nowrap; }
.medium { font-size:13px; padding:4px 10px; }
.orange { background:#fff3df; color:#9a5709; }.green { background:#e9f3eb; color:#326b43; }.red { background:#fcecea; color:#ad453e; }.blue,.arcoblue,.cyan { background:#edf3fc; color:#315a96; }.purple { background:#f2ebf7; color:#704a8d; }
</style>
