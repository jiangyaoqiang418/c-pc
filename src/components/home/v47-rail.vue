<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = defineProps<{ label: string; cards?: boolean }>();
const railId = `v47-rail-${useId()}`;
const rail = ref<HTMLElement>();
const host = ref<HTMLElement>();
const overflow = ref(false);
const compact = ref(false);
const atStart = ref(true);
const atEnd = ref(true);
const dragging = ref(false);
const layerStyle = ref<Record<string, string>>({});
let resizeObserver: ResizeObserver | undefined;
let mutationObserver: MutationObserver | undefined;
let frame = 0;
let blockedUntil = 0;
let start: { id: number; x: number; y: number; left: number; dragged: boolean } | undefined;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function measure() {
  frame = 0;
  if (!rail.value || !host.value) return;
  const element = rail.value;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const parentRect = host.value.getBoundingClientRect();
  overflow.value = rect.width > 0 && rect.height > 0 && element.scrollWidth > element.clientWidth + 3 && ['auto', 'scroll'].includes(style.overflowX);
  atStart.value = element.scrollLeft < 3;
  atEnd.value = element.scrollLeft + element.clientWidth >= element.scrollWidth - 3;
  compact.value = rect.height < 100;
  layerStyle.value = { left: `${rect.left - parentRect.left + host.value.scrollLeft - host.value.clientLeft}px`, top: `${rect.top - parentRect.top + host.value.scrollTop - host.value.clientTop}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}
function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
function step(direction: number) {
  if (!rail.value) return;
  const child = rail.value.firstElementChild;
  const distance = props.cards && child ? child.getBoundingClientRect().width + (parseFloat(getComputedStyle(rail.value).columnGap) || 0) : rail.value.clientWidth * 0.75;
  rail.value.scrollBy({ left: direction * distance, behavior: reduced() ? 'instant' : 'smooth' });
}
function down(event: PointerEvent) {
  if (!overflow.value || event.button !== 0 || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('input,textarea,select,[contenteditable],.edge-scroll-button')) return;
  start = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rail.value?.scrollLeft || 0, dragged: false };
}
function move(event: PointerEvent) {
  if (!start || start.id !== event.pointerId || !rail.value) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (!start.dragged) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { start = undefined; return; }
    if (Math.abs(dx) < 8) return;
    start.dragged = true;
    dragging.value = true;
    window.getSelection()?.removeAllRanges();
    rail.value.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  rail.value.scrollLeft = start.left - dx;
}
function end(event: PointerEvent) {
  if (!start || start.id !== event.pointerId) return;
  const gesture = start;
  start = undefined;
  if (gesture.dragged) {
    blockedUntil = performance.now() + 350;
    if (rail.value?.hasPointerCapture(event.pointerId)) rail.value.releasePointerCapture(event.pointerId);
  }
  dragging.value = false;
  schedule();
}
function guardClick(event: MouseEvent) {
  if (event.isTrusted && performance.now() < blockedUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
}
function keyboard(event: KeyboardEvent) {
  if (event.target !== rail.value || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  step(event.key === 'ArrowLeft' ? -1 : 1);
}
onMounted(async () => {
  host.value = rail.value?.parentElement || undefined;
  if (host.value && getComputedStyle(host.value).position === 'static') host.value.classList.add('drag-scroll-host');
  resizeObserver = new ResizeObserver(schedule);
  if (rail.value) resizeObserver.observe(rail.value);
  if (host.value) resizeObserver.observe(host.value);
  mutationObserver = new MutationObserver(schedule);
  if (rail.value) mutationObserver.observe(rail.value, { childList: true, subtree: true, characterData: true });
  await nextTick();
  schedule();
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <div :id="railId" ref="rail" :class="{ 'drag-scroll-overflow': overflow, 'is-dragging': dragging }" :tabindex="overflow ? 0 : undefined" role="group" :aria-label="label" @scroll.passive="schedule" @load.capture="schedule" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @click.capture="guardClick" @keydown="keyboard" @dragstart.prevent>
    <slot />
    <Teleport v-if="host" :to="host"><div class="edge-scroll-layer" :class="{ 'edge-scroll-compact': compact }" :hidden="!overflow" :style="layerStyle"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="atStart" :aria-controls="railId" aria-label="向左滑动" @click="step(-1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="atEnd" :aria-controls="railId" aria-label="向右滑动" @click="step(1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div></Teleport>
  </div>
</template>

<style scoped>
.drag-scroll-overflow { cursor: grab; scrollbar-width: none !important; }
.drag-scroll-overflow::-webkit-scrollbar { display: none !important; }
.is-dragging { cursor: grabbing; scroll-snap-type: none !important; scroll-behavior: auto !important; user-select: none; -webkit-user-select: none; }
.is-dragging :deep(*) { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }
.edge-scroll-layer { position: absolute; z-index: 12; pointer-events: none; overflow: hidden; border-radius: inherit; }
.edge-scroll-layer[hidden] { display: none; }
.edge-scroll-button { position: absolute !important; top: 50%; transform: translateY(-50%); display: flex !important; align-items: center; justify-content: center; width: 40px !important; height: 48px !important; min-height: 0 !important; padding: 0 !important; border: 1px solid color-mix(in srgb, var(--paper) 55%, transparent) !important; border-radius: 14px !important; background: color-mix(in srgb, var(--paper) 58%, transparent) !important; color: var(--ink) !important; backdrop-filter: blur(7px); box-shadow: 0 2px 10px #0000000d; pointer-events: auto; opacity: .78; transition: opacity .18s, background .18s; }
.edge-scroll-button svg { width: 20px !important; height: 20px !important; pointer-events: none; }
.edge-scroll-prev { left: 6px; }
.edge-scroll-next { right: 6px; }
.edge-scroll-prev svg { transform: rotate(180deg); }
.edge-scroll-button:hover, .edge-scroll-button:focus-visible { opacity: 1; background: color-mix(in srgb, var(--paper) 88%, transparent) !important; transform: translateY(-50%) !important; }
.edge-scroll-button:disabled { visibility: hidden; pointer-events: none; opacity: 0; }
.edge-scroll-compact .edge-scroll-button { width: 26px !important; height: 30px !important; border-radius: 8px !important; box-shadow: none; backdrop-filter: blur(5px); }
.edge-scroll-compact .edge-scroll-prev { left: 0; }
.edge-scroll-compact .edge-scroll-next { right: 0; }
.edge-scroll-button:after { display: none !important; }
@media (max-width: 700px) {
  .edge-scroll-button { width: 30px !important; height: 42px !important; border-radius: 11px !important; }
  .edge-scroll-prev { left: 3px; }
  .edge-scroll-next { right: 3px; }
}
@media (prefers-reduced-motion: reduce) { .edge-scroll-button { transition: none; } }
</style>
