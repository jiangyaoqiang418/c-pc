<script setup lang="ts">
import { computed } from 'vue';
import { Input } from '@/components/ui/input';

const props = withDefaults(defineProps<{ modelValue?: string; disabled?: boolean; id?: string }>(), { modelValue: '' });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const localValue = computed(() => {
  if (!props.modelValue) return '';
  const date = new Date(/^\d+$/.test(props.modelValue) ? Number(props.modelValue) : props.modelValue);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
});
function update(value: string | number) {
  if (!value) return emit('update:modelValue', '');
  const timestamp = new Date(String(value)).getTime();
  if (Number.isFinite(timestamp)) emit('update:modelValue', String(timestamp));
}
</script>

<template>
  <Input :id="id" type="datetime-local" step="1" :model-value="localValue" :disabled="disabled" @update:model-value="update" />
</template>
