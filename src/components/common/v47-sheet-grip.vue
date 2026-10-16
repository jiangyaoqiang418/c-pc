<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useUiTheme } from '@/composables/use-ui-theme';

const props = withDefaults(defineProps<{ disabled?: boolean; open?: boolean }>(), { open: true });
const emit = defineEmits<{ dismiss: [] }>();
const { currentTheme, isMemeLayout } = useUiTheme();
let drag: { start: number; delta: number; pointerId: number; grip: HTMLElement; dialog: HTMLElement; transform: string } | undefined;

function settle(event?: PointerEvent, cancelled = false) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  const current = drag;
  drag = undefined;
  current.dialog.classList.remove('meme-sheet-dragging');
  current.dialog.style.transform = current.transform;
  if (current.grip.hasPointerCapture(current.pointerId)) current.grip.releasePointerCapture(current.pointerId);
  if (!cancelled && current.delta > 80 && !props.disabled && props.open) emit('dismiss');
}

function start(event: PointerEvent) {
  if (props.disabled || !props.open || !isMemeLayout || window.innerWidth > 700 || event.button !== 0 || !event.isPrimary) return;
  const grip = event.currentTarget as HTMLElement;
  const dialog = grip.closest<HTMLElement>('[role="dialog"]');
  if (!dialog) return;
  settle(undefined, true);
  for (const animation of dialog.getAnimations()) {
    if (animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
  drag = { start: event.clientY, delta: 0, pointerId: event.pointerId, grip, dialog, transform: dialog.style.transform };
  grip.setPointerCapture(event.pointerId);
  dialog.classList.add('meme-sheet-dragging');
}

function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.delta = Math.max(0, event.clientY - drag.start);
  drag.dialog.style.transform = `translateY(${drag.delta}px)`;
}

function cancel() { settle(undefined, true); }
function cancelPointer(event: PointerEvent) { settle(event, true); }
watch([() => props.disabled, () => props.open, currentTheme], cancel);
onMounted(() => { window.addEventListener('resize', cancel); window.addEventListener('blur', cancel); });
onBeforeUnmount(() => { cancel(); window.removeEventListener('resize', cancel); window.removeEventListener('blur', cancel); });
</script>

<template>
  <div class="meme-sheet-grip" aria-hidden="true" @pointerdown="start" @pointermove="move" @pointerup="settle($event)" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer" />
</template>
