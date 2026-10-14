<script setup lang="ts">
import { ref } from 'vue';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';

defineProps<{ label?: string }>();
const element = ref<HTMLElement>();
const rail = useUmScrollRail(element);
</script>

<template>
  <div class="category-leaf-rail-host">
    <div ref="element" class="category-leaves" :class="{ 'drag-scroll-overflow': rail.overflow.value, 'is-dragging': rail.isDragging.value }" :aria-label="label" data-um-rail :tabindex="rail.overflow.value ? 0 : undefined" @scroll.passive="rail.update" @pointerdown="rail.onPointerdown" @pointermove="rail.onPointermove" @pointerup="rail.onPointerend" @pointercancel="rail.onPointerend" @lostpointercapture="rail.onPointerend" @click.capture="rail.onClickCapture" @dragstart="rail.onDragStart" @keydown="rail.onKeydown"><slot /></div>
    <div v-if="rail.overflow.value" class="edge-scroll-layer edge-scroll-compact"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="!rail.canPrev.value" aria-label="向左滑动" @click="rail.step(-1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="!rail.canNext.value" aria-label="向右滑动" @click="rail.step(1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
  </div>
</template>

<style scoped>
.category-leaf-rail-host { position:relative; min-width:0; }
.edge-scroll-layer { inset:0; }
</style>
