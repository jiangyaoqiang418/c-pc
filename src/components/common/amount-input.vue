<script setup lang="ts">
import { ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { exactDecimalNumber } from '@/components/wallet/decimal-amount';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  modelValue?: number;
  precision?: number;
  min?: number;
  max?: number;
  exactDecimal?: boolean;
  preserveInput?: boolean;
  rawValue?: string;
}>(), { precision: 2 });
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void; (event: 'update:rawValue', value: string): void }>();
const displayValue = (value?: number) => value !== undefined && Number.isFinite(value) ? String(value) : '';
const draft = ref((props.exactDecimal || props.preserveInput) && props.rawValue !== undefined ? props.rawValue : displayValue(props.modelValue));
const amountError = ref('');
const focused = ref(false);
let lastEmitted = props.modelValue;

watch(() => props.modelValue, value => {
  if (props.exactDecimal && Object.is(value, lastEmitted)) return;
  if (!focused.value || !Object.is(value, lastEmitted)) {
    draft.value = displayValue(value);
    lastEmitted = value;
  }
});
function emitExact(text: string) {
  const result = exactDecimalNumber(text, true);
  amountError.value = text.trim() ? result.error : '';
  lastEmitted = result.value ?? NaN;
  emit('update:modelValue', lastEmitted);
}
watch(() => props.rawValue, value => {
  if ((!props.exactDecimal && !props.preserveInput) || value === undefined) return;
  draft.value = value;
  if (props.exactDecimal) emitExact(value);
}, { immediate: true });
function input(value: string | number) {
  draft.value = String(value);
  const text = draft.value.trim();
  if (props.preserveInput && !props.exactDecimal) emit('update:rawValue', draft.value);
  if (props.exactDecimal) {
    emit('update:rawValue', draft.value);
    emitExact(text);
    return;
  }
  lastEmitted = /^\d*(?:\.\d*)?$/.test(text) && text !== '' && text !== '.' ? Number(text) : NaN;
  emit('update:modelValue', lastEmitted);
}
function commit() {
  // 表单自行校验时保留输入原文，不在失焦或回车时改写金额。
  if (props.preserveInput) return;
  if (!Number.isFinite(lastEmitted)) return;
  const precision = Number.isFinite(props.precision) ? Math.min(18, Math.max(0, Math.trunc(props.precision))) : 2;
  if (props.exactDecimal) {
    // Keep the existing intentional blur rounding only after the raw amount passed the JSON boundary.
    let text = String(Number(lastEmitted!.toFixed(precision)));
    const rounded = exactDecimalNumber(text, true);
    if (rounded.value === undefined) { emitExact(text); return; }
    if (props.min !== undefined && Number.isFinite(props.min) && rounded.value < props.min) text = String(props.min);
    if (props.max !== undefined && Number.isFinite(props.max) && rounded.value > props.max) text = String(props.max);
    draft.value = text;
    emit('update:rawValue', text);
    emitExact(text);
    return;
  }
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
  <p v-if="exactDecimal && amountError" class="error-text" role="alert">{{ amountError }}</p>
</template>

<style scoped>
.error-text { color:var(--yb-danger); font-size:12px; }
</style>
