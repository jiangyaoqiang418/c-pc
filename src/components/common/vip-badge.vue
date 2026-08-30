<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  level?: Api.User.VipLevel;
  size?: 'sm' | 'md' | 'lg';
}
const props = withDefaults(defineProps<Props>(), { size: 'md' });

const label = computed(() => props.level ?? '等级待确认');
const iconName = computed(() => (props.level === 'VIP2' ? 'lucide:crown' : props.level === 'VIP1' ? 'lucide:star' : 'lucide:circle-user'));
</script>

<template>
  <span class="vip-badge" :class="[size, `level-${level?.toLowerCase() ?? 'unknown'}`]">
    <Icon :icon="iconName" class="icon" />
    <span class="label">{{ label }}</span>
  </span>
</template>

<style scoped>
.vip-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--yb-radius-pill);
  font-family: var(--yb-font-mono);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.2s;
}
.vip-badge.sm {
  padding: 2px 8px;
  font-size: 10px;
  gap: 3px;
}
.vip-badge.lg {
  padding: 5px 12px;
  font-size: 13px;
  gap: 5px;
}
.vip-badge .icon {
  font-size: 12px;
}
.vip-badge.sm .icon {
  font-size: 10px;
}
.vip-badge.lg .icon {
  font-size: 15px;
}

/* VIP0 - 石灰 */
.vip-badge.level-vip0 {
  background: var(--yb-hairline);
  color: var(--yb-muted);
}

/* VIP1 - 香槟金 */
.vip-badge.level-vip1 {
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border: 1px solid rgba(184, 147, 90, 0.24);
}

/* VIP2 - 金 gradient + subtle glow */
.vip-badge.level-vip2 {
  background: linear-gradient(135deg, #D4A574 0%, #B8935A 50%, #8F6E3E 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(184, 147, 90, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
