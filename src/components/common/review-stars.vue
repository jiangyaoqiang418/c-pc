<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  score: number;
  mode?: 'readonly' | 'input';
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
}
const props = withDefaults(defineProps<Props>(), { mode: 'readonly', size: 'md', showScore: false });
const emit = defineEmits<{ (e: 'update:score', value: number): void }>();

const stars = [1, 2, 3, 4, 5];
const sizePx = computed(() => ({ sm: 12, md: 15, lg: 22 }[props.size]));
const safeScore = computed(() => (Number.isFinite(props.score) ? props.score : 0));
const scoreText = computed(() => (Number.isFinite(props.score) ? props.score.toFixed(1) : '—'));

function onClick(i: number) {
  if (props.mode === 'input') emit('update:score', i);
}
</script>

<template>
  <span class="stars" :class="[mode]">
    <span
      v-for="i in stars"
      :key="i"
      class="star-slot"
      :class="{ filled: i <= safeScore, half: i - 0.5 <= safeScore && i > safeScore }"
      @click="onClick(i)"
    >
      <Icon :icon="i <= safeScore ? 'lucide:star' : 'lucide:star'" :style="{ fontSize: sizePx + 'px' }" />
    </span>
    <span v-if="showScore" class="score" :style="{ fontSize: (sizePx - 2) + 'px' }">{{ scoreText }}</span>
  </span>
</template>

<style scoped>
.stars {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.stars.input .star-slot {
  cursor: pointer;
}
.stars.input .star-slot:hover {
  transform: scale(1.15);
}
.star-slot {
  color: var(--yb-hairline);
  line-height: 1;
  display: inline-flex;
  transition: color 0.18s, transform 0.15s;
}
.star-slot.filled {
  color: var(--yb-gold);
}
.star-slot.filled :deep(svg) {
  fill: currentColor;
}
.score {
  margin-left: 8px;
  font-family: var(--yb-font-mono);
  font-weight: 600;
  color: var(--yb-gold);
  font-variant-numeric: tabular-nums;
}
</style>
