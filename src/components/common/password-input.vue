<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import { Input } from '@/components/ui/input';

defineOptions({ inheritAttrs: false });
defineProps<{ modelValue?: string; maxLength?: number; placeholder?: string; allowClear?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const revealed = ref(false);
</script>

<template>
  <div class="relative">
    <Input v-bind="$attrs" :type="revealed ? 'text' : 'password'" :model-value="modelValue" :maxlength="maxLength"
      :placeholder="placeholder" :disabled="disabled" :inputmode="maxLength === 6 ? 'numeric' : undefined"
      autocomplete="off" class="pr-11" @update:model-value="value => emit('update:modelValue', String(value))" />
    <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" :disabled="disabled"
      :aria-label="revealed ? '隐藏密码' : '显示密码'" :aria-pressed="revealed" @click="revealed = !revealed">
      <Icon :icon="revealed ? 'lucide:eye-off' : 'lucide:eye'" />
    </button>
  </div>
</template>
