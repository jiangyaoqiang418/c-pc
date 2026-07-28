<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  modelValue?: string[];
  max?: number;
}
const props = withDefaults(defineProps<Props>(), { max: 6, modelValue: () => [] });
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const uploading = ref(false);

async function addOne() {
  if (props.modelValue.length >= props.max) return;
  uploading.value = true;
  try {
    await new Promise(r => setTimeout(r, 700));
    const url = `https://picsum.photos/seed/ev-${Date.now()}-${props.modelValue.length}/320/240`;
    emit('update:modelValue', [...props.modelValue, url]);
  } finally {
    uploading.value = false;
  }
}

function remove(i: number) {
  const next = [...props.modelValue];
  next.splice(i, 1);
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="evidence">
    <div v-for="(u, i) in modelValue" :key="u" class="cell">
      <img :src="u" />
      <button class="remove" @click="remove(i)">✕</button>
    </div>
    <button v-if="modelValue.length < max" class="add" :disabled="uploading" @click="addOne">
      {{ uploading ? '上传中…' : '+ 添加图片' }}
    </button>
    <div class="hint">最多 {{ max }} 张 · 原型模式自动生成占位图</div>
  </div>
</template>

<style scoped>
.evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.cell {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #f2f3f5;
}
.cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.remove {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 11px;
}
.add {
  width: 96px;
  height: 96px;
  background: #f7f8fa;
  border: 1.5px dashed #c9cdd4;
  border-radius: 6px;
  color: #86909c;
  cursor: pointer;
  font-size: 12px;
}
.add:hover {
  border-color: var(--bw-brand-primary);
  color: var(--bw-brand-primary);
}
.hint {
  flex-basis: 100%;
  margin-top: 4px;
  font-size: 11px;
  color: #86909c;
}
</style>
