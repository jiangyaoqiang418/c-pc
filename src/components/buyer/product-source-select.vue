<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem,
  ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport
} from 'reka-ui';
import { normalizeProductSource, productSourceOptions } from '@/utils/product-source';

const props = defineProps<{ modelValue?: string | null; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
const fieldId = useId();
const open = ref(false);
const query = ref('');
const error = computed(() => {
  try {
    normalizeProductSource(props.modelValue);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
});
const options = computed(() => {
  const values = [...productSourceOptions, query.value ? undefined : props.modelValue?.trim()];
  return [...new Set(values.filter((value): value is string => !!value))]
    .filter(value => value.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()));
});
const custom = computed(() => {
  const value = query.value.trim();
  return value && !options.value.includes(value) ? value : '';
});

watch(open, value => { if (!value) query.value = ''; });

function choose(value: unknown) {
  if (props.disabled || typeof value !== 'string') return;
  emit('update:modelValue', value || null);
  open.value = false;
  query.value = '';
}
function input(event: Event) {
  if (props.disabled) return;
  query.value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', query.value || null);
}
</script>

<template>
  <div class="product-source-field">
    <label :for="fieldId">商品来源</label>
    <ComboboxRoot
      v-model:open="open" :model-value="modelValue || ''" :disabled="disabled"
      ignore-filter open-on-focus open-on-click @update:model-value="choose"
    >
      <ComboboxAnchor class="source-control">
        <ComboboxInput
          :id="fieldId" :model-value="modelValue || ''" :disabled="disabled"
          :display-value="value => String(value || '')" placeholder="请选择或输入商品来源"
          :aria-invalid="!!error" :aria-describedby="error ? fieldId + '-error' : undefined"
          autocomplete="off" @input="input" @focus="query = ''"
        />
        <button v-if="modelValue" type="button" :disabled="disabled" aria-label="清空商品来源" @click="choose('')">
          <Icon icon="lucide:x" width="16" />
        </button>
        <ComboboxTrigger type="button" aria-label="展开商品来源">
          <Icon icon="lucide:chevron-down" width="16" />
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent position="popper" align="start" :side-offset="6" :collision-padding="16" class="source-menu">
          <ComboboxViewport>
            <ComboboxItem v-for="option in options" :key="option" :value="option" class="source-option">
              {{ option }}
            </ComboboxItem>
            <ComboboxItem v-if="custom" :value="custom" :disabled="!!error" class="source-option">
              使用「{{ custom }}」
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <p v-if="error" :id="fieldId + '-error'" role="alert" class="source-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.product-source-field { min-width:0; }
.product-source-field label { display:block; margin-bottom:6px; color:var(--ink); font-weight:600; }
.source-control { display:flex; min-width:0; min-height:44px; border:1px solid var(--line); border-radius:6px; background:var(--paper); }
.source-control:focus-within { outline:2px solid var(--green); outline-offset:2px; }
.source-control input { flex:1; width:0; min-width:0; padding:10px 12px; border:0; background:transparent; color:var(--ink); outline:none; }
.source-control button { display:grid; place-items:center; flex-shrink:0; min-width:44px; min-height:44px; background:transparent; border:0; color:var(--ink); }
.source-menu { z-index:1000; width:var(--reka-combobox-trigger-width); max-width:calc(100vw - 32px); max-height:min(320px,var(--reka-combobox-content-available-height)); overflow:auto; padding:4px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); box-shadow:var(--shadow); }
.source-option { display:flex; align-items:center; min-height:44px; padding:8px 12px; overflow-wrap:anywhere; cursor:pointer; border-radius:4px; }
.source-option[data-highlighted] { outline:none; background:var(--soft); color:var(--green); }
.source-option[data-disabled] { opacity:.5; cursor:not-allowed; }
.source-error { margin:6px 0 0; color:var(--danger); font-size:12px; }
</style>
