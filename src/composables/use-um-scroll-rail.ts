import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch, type Ref } from 'vue';

interface RailOptions {
  cardStep?: boolean;
  onHeroStep?: (direction: -1 | 1) => void;
}

/** v47 native rails: 8px drag intent, 35px hero swipe and 350ms click suppression. */
export function useUmScrollRail(element: Ref<HTMLElement | undefined>, options: RailOptions = {}) {
  const overflow = ref(false);
  const isDragging = ref(false);
  const left = ref(0);
  const extent = ref(0);
  const canPrev = computed(() => overflow.value && left.value >= 3);
  const canNext = computed(() => overflow.value && left.value < extent.value - 3);
  let resize: ResizeObserver | undefined;
  let gesture: { id: number; x: number; y: number; left: number; dragged: boolean } | undefined;
  let blockedUntil = 0;

  function update() {
    const rail = element.value;
    if (!rail) return;
    left.value = rail.scrollLeft;
    extent.value = Math.max(0, rail.scrollWidth - rail.clientWidth);
    overflow.value = rail.clientWidth > 0 && rail.clientHeight > 0 && extent.value > 3;
  }
  function step(direction: -1 | 1) {
    const rail = element.value;
    if (!rail) return;
    if (options.onHeroStep) { options.onHeroStep(direction); return; }
    const first = rail.firstElementChild;
    const distance = options.cardStep && first
      ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(rail).columnGap) || 0)
      : rail.clientWidth * .75;
    rail.scrollBy({ left: direction * distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function onPointerdown(event: PointerEvent) {
    const rail = element.value;
    const target = event.target instanceof Element ? event.target : null;
    if (!rail || event.button !== 0 || (!options.onHeroStep && event.pointerType !== 'mouse')) return;
    if (target?.closest('input,textarea,select,[contenteditable],.edge-scroll-button')) return;
    if (!options.onHeroStep && !overflow.value) return;
    // A nested rail owns its own gesture.
    if (!options.onHeroStep && target?.closest('[data-um-rail]') !== rail) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rail.scrollLeft, dragged: false };
  }
  function onPointermove(event: PointerEvent) {
    const rail = element.value;
    if (!rail || !gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragged) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { gesture = undefined; return; }
      if (Math.abs(dx) < 8) return;
      gesture.dragged = true;
      isDragging.value = true;
      window.getSelection()?.removeAllRanges();
      rail.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    if (!options.onHeroStep) { rail.scrollLeft = gesture.left - dx; update(); }
  }
  function onPointerend(event: PointerEvent) {
    const rail = element.value;
    if (!rail || !gesture || gesture.id !== event.pointerId) return;
    const current = gesture;
    gesture = undefined;
    if (current.dragged) {
      blockedUntil = performance.now() + 350;
      if (options.onHeroStep && event.type === 'pointerup' && Math.abs(event.clientX - current.x) > 35) {
        options.onHeroStep(event.clientX < current.x ? 1 : -1);
      }
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      isDragging.value = false;
      update();
    }
  }
  function onClickCapture(event: MouseEvent) {
    if (event.isTrusted && performance.now() < blockedUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.target !== element.value || event.defaultPrevented || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }
  function onDragStart(event: DragEvent) { event.preventDefault(); }
  function connect() {
    resize?.disconnect();
    if (!element.value) return;
    element.value.dataset.umRail = '';
    resize?.observe(element.value);
    for (const child of element.value.children) resize?.observe(child);
    update();
  }
  onMounted(() => { resize = new ResizeObserver(update); connect(); });
  watch(element, (next, previous) => {
    if (next !== previous) {
      const pointerId = gesture?.id;
      gesture = undefined;
      isDragging.value = false;
      if (pointerId !== undefined && previous?.hasPointerCapture(pointerId)) previous.releasePointerCapture(pointerId);
      if (!next) {
        overflow.value = false;
        left.value = 0;
        extent.value = 0;
      }
    }
    void nextTick(connect);
  });
  onUpdated(() => { connect(); });
  onBeforeUnmount(() => { resize?.disconnect(); gesture = undefined; });

  return { overflow, canPrev, canNext, isDragging, step, update, onPointerdown, onPointermove, onPointerend, onClickCapture, onKeydown, onDragStart };
}
