<script setup lang="ts">
import { ref, watch } from 'vue';
import { Input } from '@/components/ui/input';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  modelValue?: number;
  precision?: number;
  min?: number;
  max?: number;
}>(), { precision: 2 });
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>();
const displayValue = (value?: number) => value !== undefined && Number.isFinite(value) ? String(value) : '';
const draft = ref(displayValue(props.modelValue));
const focused = ref(false);
let lastEmitted = props.modelValue;

watch(() => props.modelValue, value => {
  if (!focused.value || !Object.is(value, lastEmitted)) {
    draft.value = displayValue(value);
    lastEmitted = value;
  }
});
function input(value: string | number) {
  draft.value = String(value);
  const text = draft.value.trim();
  lastEmitted = /^\d*(?:\.\d*)?$/.test(text) && text !== '' && text !== '.' ? Number(text) : NaN;
  emit('update:modelValue', lastEmitted);
}
function commit() {
  if (!Number.isFinite(lastEmitted)) return;
  const precision = Number.isFinite(props.precision) ? Math.min(18, Math.max(0, Math.trunc(props.precision))) : 2;
  let value = Number(lastEmitted!.toFixed(precision));
  if (props.min !== undefined && Number.isFinite(props.min)) value = Math.max(props.min, value);
  if (props.max !== undefined && Number.isFinite(props.max)) value = Math.min(props.max, value);
  lastEmitted = value;
  draft.value = String(value);
  emit('update:modelValue', value);
}
function blur() { commit(); focused.value = false; }
</script>

<template>
  <Input v-bind="$attrs" :model-value="draft" inputmode="decimal" autocomplete="off" @update:model-value="input" @focus="focused = true" @blur="blur" @keydown.enter="(event: KeyboardEvent) => { if (!event.isComposing) commit(); }" />
</template>
