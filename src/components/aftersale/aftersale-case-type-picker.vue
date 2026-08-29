<script setup lang="ts">
import { enums } from '@shared';

interface Props {
  modelValue?: Api.Order.AftersaleCaseType;
}
defineProps<Props>();
defineEmits<{ (e: 'update:modelValue', v: Api.Order.AftersaleCaseType): void }>();

interface TypeDef {
  type: Api.Order.AftersaleCaseType;
  emoji: string;
  hint: string;
}

const TYPES: TypeDef[] = [
  { type: 'REFUND', emoji: '↩️', hint: '退还商品并退还货款' },
  { type: 'REPLACE', emoji: '🔄', hint: '更换为相同或同等价值商品' },
  { type: 'REPAIR', emoji: '🔧', hint: '维修商品保留所有权' },
  { type: 'PARTIAL_REFUND', emoji: '💰', hint: '保留商品退还部分货款' },
  { type: 'REFUND_ONLY', emoji: '📥', hint: '退款但不退还商品（适用未发货）' }
];
</script>

<template>
  <div class="type-picker" role="radiogroup" aria-label="售后类型">
    <div
      v-for="t in TYPES"
      :key="t.type"
      class="type-card"
      :class="{ active: modelValue === t.type }"
      role="radio"
      tabindex="0"
      :aria-checked="modelValue === t.type"
      :aria-label="enums.AFTERSALE_CASE_TYPE_META[t.type].label"
      @click="$emit('update:modelValue', t.type)"
      @keydown.enter="$emit('update:modelValue', t.type)"
      @keydown.space.prevent="$emit('update:modelValue', t.type)"
    >
      <div class="check" v-if="modelValue === t.type">✓</div>
      <div class="emoji">{{ t.emoji }}</div>
      <div class="label">{{ enums.AFTERSALE_CASE_TYPE_META[t.type].label }}</div>
      <div class="hint">{{ t.hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.type-picker {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.type-card {
  position: relative;
  padding: 18px 12px 16px;
  border: 2px solid #f2f3f5;
  border-radius: 8px;
  background: #fff;
  text-align: center;
  cursor: pointer;
  transition: all 0.18s;
}
.type-card:hover {
  border-color: #94c1ff;
}
.type-card.active {
  border-color: var(--bw-brand-primary);
  background: linear-gradient(135deg, #f3f7ff 0%, #fff 60%);
}
.type-card:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
}
.check {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bw-brand-primary);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.emoji {
  font-size: 28px;
  margin-bottom: 4px;
}
.label {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 2px;
}
.hint {
  font-size: 11px;
  color: #86909c;
  line-height: 1.4;
}
</style>
