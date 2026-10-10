<script setup lang="ts">
import { computed, ref } from 'vue';
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
const hoverScore = ref(0);
const sizePx = computed(() => ({ sm: 14, md: 18, lg: 26 }[props.size]));
const safeScore = computed(() => Number.isFinite(props.score) ? Math.max(0, Math.min(5, props.score)) : 0);
const displayScore = computed(() => props.mode === 'input' && hoverScore.value ? hoverScore.value : safeScore.value);
const scoreText = computed(() => Number.isFinite(props.score) ? safeScore.value.toFixed(1) : '—');
function select(score: number) { if (props.mode === 'input') emit('update:score', score); }
</script>

<template>
  <span class="stars" :class="mode" :role="mode === 'input' ? 'group' : 'img'" :aria-label="mode === 'input' ? '选择评分' : `${scoreText} / 5 星`" @mouseleave="hoverScore = 0">
    <component
      :is="mode === 'input' ? 'button' : 'span'"
      v-for="star in stars"
      :key="star"
      :type="mode === 'input' ? 'button' : undefined"
      class="star-slot"
      :class="{ filled: star <= displayScore }"
      :aria-label="mode === 'input' ? `${star} 星` : undefined"
      :aria-pressed="mode === 'input' ? star === score : undefined"
      :aria-hidden="mode === 'readonly' ? 'true' : undefined"
      @click="select(star)"
      @mouseenter="mode === 'input' && (hoverScore = star)"
      @focus="mode === 'input' && (hoverScore = star)"
      @blur="hoverScore = 0"
    >
      <Icon icon="lucide:star" :width="sizePx" :height="sizePx" />
      <Icon v-if="star - .5 <= displayScore && star > displayScore" icon="lucide:star" :width="sizePx" :height="sizePx" class="half-star" />
    </component>
    <span v-if="showScore" class="score" :style="{ fontSize: (sizePx - 2) + 'px' }">{{ scoreText }}</span>
  </span>
</template>

<style scoped>
.stars { display: inline-flex; align-items: center; gap: 3px; }
.star-slot { position: relative; display: inline-flex; align-items: center; padding: 0; border: 0; background: transparent; color: var(--yb-hairline-2); line-height: 1; transition: color 150ms; }
.stars.input .star-slot { cursor: pointer; }
.star-slot.filled { color: var(--yb-gold); }
.star-slot.filled :deep(svg), .star-slot.filled :deep(svg path), .half-star :deep(path) { fill: currentColor; }
.half-star { position: absolute; inset: 0; color: var(--yb-gold); fill: currentColor; clip-path: inset(0 50% 0 0); }
.score { margin-left: 8px; font-weight: 600; color: var(--yb-gold); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .star-slot { transition: none; } }
</style>
