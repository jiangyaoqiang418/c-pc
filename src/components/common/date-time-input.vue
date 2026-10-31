<script setup lang="ts">
import { computed } from 'vue';
import { Input } from '@/components/ui/input';

const props = withDefaults(defineProps<{ modelValue?: string; disabled?: boolean; id?: string; hourOnly?: boolean }>(), { modelValue: '' });
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
function openPicker(event: MouseEvent) {
  const input = event.target;
  if (input instanceof HTMLInputElement && !props.disabled) {
    try { input.showPicker?.(); } catch { /* 原生输入仍可使用键盘编辑。 */ }
  }
}
function updateHourPart(part: 'date' | 'hour', value: string) {
  if (!value) return emit('update:modelValue', '');
  const date = part === 'date' ? value : localValue.value.slice(0, 10);
  const hour = part === 'hour' ? value : localValue.value.slice(11, 13) || '00';
  if (date) update(`${date}T${hour}:00:00`);
}
</script>

<template>
  <div v-if="hourOnly" class="hour-input">
    <Input :id="id" type="date" :model-value="localValue.slice(0, 10)" :disabled="disabled" @click="openPicker" @update:model-value="updateHourPart('date', String($event))" />
    <select aria-label="预计送达小时" :value="localValue.slice(11, 13)" :disabled="disabled || !localValue" @change="updateHourPart('hour', ($event.target as HTMLSelectElement).value)"><option value="" disabled>选择小时</option><option v-for="hour in 24" :key="hour" :value="String(hour - 1).padStart(2, '0')">{{ String(hour - 1).padStart(2, '0') }} 时</option></select>
  </div>
  <Input v-else :id="id" type="datetime-local" step="1" :model-value="localValue" :disabled="disabled" @click="openPicker" @update:model-value="update" />
</template>

<style scoped>
.hour-input { display:flex; gap:8px; min-width:0; }.hour-input > :first-child { min-width:0; flex:1; }.hour-input select { border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); padding:0 10px; min-height:44px; }
</style>
