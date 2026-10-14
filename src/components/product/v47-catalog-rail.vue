<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';

interface CategoryOption { readonly id: string; readonly name: string; }
const props = defineProps<{ items: readonly CategoryOption[]; allId: string; activeId?: string; label: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const element = ref<HTMLElement>();
const rail = useUmScrollRail(element);
async function reveal() {
  await nextTick();
  const row = element.value;
  const active = row?.querySelector<HTMLElement>('.active');
  if (!row || !active) return;
  const childBox = active.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  if (childBox.left < box.left || childBox.right > box.right) row.scrollTo({ left:row.scrollLeft + childBox.left - box.left - (box.width - childBox.width) / 2, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
onMounted(() => { void reveal(); });
watch(() => [props.activeId, props.items], () => { void reveal(); });
</script>

<template>
  <div class="catalog-rail-host">
    <div ref="element" class="catalog-category-options" :class="{ 'drag-scroll-overflow': rail.overflow.value, 'is-dragging': rail.isDragging.value }" role="group" :aria-label="label" data-um-rail :tabindex="rail.overflow.value ? 0 : undefined" @scroll.passive="rail.update" @pointerdown="rail.onPointerdown" @pointermove="rail.onPointermove" @pointerup="rail.onPointerend" @pointercancel="rail.onPointerend" @lostpointercapture="rail.onPointerend" @click.capture="rail.onClickCapture" @dragstart="rail.onDragStart" @keydown="rail.onKeydown">
      <button type="button" :class="{ active: !activeId || activeId === allId }" :aria-pressed="!activeId || activeId === allId" @click="emit('select', allId)">全部</button><button v-for="item in items" :key="item.id" type="button" :class="{ active: activeId === item.id }" :aria-pressed="activeId === item.id" @click="emit('select', item.id)">{{ item.name }}</button>
    </div>
    <div v-if="rail.overflow.value" class="edge-scroll-layer edge-scroll-compact"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="!rail.canPrev.value" aria-label="向左滑动" @click="rail.step(-1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="!rail.canNext.value" aria-label="向右滑动" @click="rail.step(1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
  </div>
</template>

<style scoped>
.catalog-rail-host { position:relative; min-width:0; }
.edge-scroll-layer { inset:0; }
</style>
