<script setup lang="ts">

import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { enums } from '@shared';

interface Props {
  level: Api.PurchaseRequest.PushBatchLevel;
}
const props = defineProps<Props>();

const meta = computed(() => enums.PUSH_LEVEL_META[props.level]);
const iconName = computed(() => {
  const map: Record<string, string> = {
    VIP2: 'lucide:crown',
    VIP1: 'lucide:star',
    VIP0: 'lucide:circle-dot'
  };
  return map[props.level] || 'lucide:circle';
});


</script>

<template>

  <span class="tier-badge" :class="`tier-${level.toLowerCase()}`"><Icon :icon="iconName" width="13" /><span>{{ meta.label }}</span></span>

</template>

<style scoped>

.tier-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:500; white-space:nowrap; }.tier-vip2 { background:var(--um-gold-light); color:var(--yb-accent-ink); }.tier-vip1 { background:var(--yb-champagne); color:var(--yb-gold); }.tier-vip0 { background:var(--yb-fill); color:var(--yb-muted); }

</style>
