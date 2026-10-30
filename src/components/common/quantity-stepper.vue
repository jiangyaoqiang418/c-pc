<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Input } from '@/components/ui/input';

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}>(), { min: 1, max: Number.MAX_SAFE_INTEGER, disabled: false, label: '数量' });
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const draft = ref(String(props.modelValue));
const error = ref('');
const maximum = computed(() => Math.max(props.min, props.max));
watch(() => props.modelValue, value => { draft.value = String(value); error.value = ''; });

function update(value: number) {
  if (props.disabled) return;
  error.value = '';
  draft.value = String(value);
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function commit() {
  if (props.disabled) return;
  const value = Number(draft.value);
  if (!draft.value.trim() || !Number.isSafeInteger(value) || value < props.min || value > maximum.value) {
    error.value = `请输入 ${props.min} 至 ${maximum.value} 之间的整数`;
    draft.value = String(props.modelValue);
    return;
  }
  update(value);
}

function step(direction: number) {
  const entered = Number(draft.value);
  const current = Number.isSafeInteger(entered) ? entered : props.modelValue;
  update(Math.max(props.min, Math.min(maximum.value, current + direction)));
}
</script>

<template>
  <div class="quantity-field">
    <div class="quantity-stepper" :class="{ disabled }">
      <button type="button" :disabled="disabled || modelValue <= min" :aria-label="`减少${label}`" @click="step(-1)"><Icon icon="lucide:minus" width="14" /></button>
      <Input placeholder="请输入数量" v-model="draft" class="quantity-input" inputmode="numeric" role="spinbutton" :aria-label="label" :aria-valuemin="min" :aria-valuemax="maximum" :aria-valuenow="modelValue" :aria-invalid="!!error" :disabled="disabled" @blur="commit" @keydown.enter.prevent="commit" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)" />
      <button type="button" :disabled="disabled || modelValue >= maximum" :aria-label="`增加${label}`" @click="step(1)"><Icon icon="lucide:plus" width="14" /></button>
    </div>
    <span v-if="error" class="quantity-error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.quantity-stepper { display: inline-flex; align-items: center; height: 40px; border: 1px solid var(--yb-hairline-2); border-radius: 6px; background: var(--yb-surface); overflow: hidden; }
.quantity-stepper button { display: grid; place-items: center; width: 32px; height: 38px; flex-shrink: 0; transition: background 150ms; }
.quantity-stepper button:hover:not(:disabled) { background: var(--yb-fill); }
.quantity-stepper button:disabled { opacity: .4; }
.quantity-input { width: 48px; height: 38px; padding: 0 2px; border: 0; border-radius: 0; text-align: center; font-size: 14px; box-shadow: none; }
.quantity-stepper.disabled { opacity: .55; }
.quantity-error { display: block; margin-top: 4px; max-width: 180px; color: var(--yb-danger); font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .quantity-stepper button { transition: none; } }
</style>
