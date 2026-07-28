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
  <span class="tier-badge" :class="`tier-${level.toLowerCase()}`">
    <Icon :icon="iconName" class="tier-icon" />
    <span class="tier-label">{{ meta.label }}</span>
  </span>
</template>

<style scoped>
.tier-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.06em;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.2s;
}
.tier-icon {
  width: 10px;
  height: 10px;
}
.tier-vip2 {
  background: linear-gradient(135deg, #D4A574 0%, #B8935A 50%, #8F6E3E 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 6px rgba(184, 147, 90, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.tier-vip1 {
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border: 1px solid rgba(184, 147, 90, 0.28);
}
.tier-vip0 {
  background: var(--yb-hairline);
  color: var(--yb-muted);
  border: 1px solid var(--yb-hairline-2);
}
</style>
