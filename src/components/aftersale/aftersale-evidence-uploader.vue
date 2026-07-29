<script setup lang="ts">
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';
import { RequestError } from '@/service/request';

interface Props {
  modelValue?: string[];
  max?: number;
  dir?: string;
}
const props = withDefaults(defineProps<Props>(), { max: 6, modelValue: () => [], dir: 'evidence' });
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const uploading = ref(false);
const inputRef = ref<HTMLInputElement>();

function pickFile() {
  if (props.modelValue.length >= props.max) return;
  inputRef.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;

  const available = props.max - props.modelValue.length;
  const picked = files.slice(0, available);
  uploading.value = true;
  try {
    const uploaded = await Promise.all(picked.map(file => uploadFile(file, props.dir)));
    emit('update:modelValue', [...props.modelValue, ...uploaded.map(item => item.url || item.filePath)]);
    Message.success(picked.length > 1 ? `已上传 ${picked.length} 张图片` : '图片已上传');
  } catch (error) {
    const message = error instanceof RequestError ? error.message : '';
    if (message.includes('MinIO') || message.includes('对象存储')) {
      Message.error('对象存储暂未配置，当前无法上传图片');
    } else {
      Message.error(message || '图片上传失败，请稍后重试');
    }
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
    <input ref="inputRef" class="file-input" type="file" accept="image/*" multiple @change="onFileChange" />
    <div v-for="(u, i) in modelValue" :key="u" class="cell">
      <img :src="u" />
      <button class="remove" @click="remove(i)">✕</button>
    </div>
    <button v-if="modelValue.length < max" class="add" :disabled="uploading" @click="pickFile">
      {{ uploading ? '上传中…' : '+ 添加图片' }}
    </button>
    <div class="hint">最多 {{ max }} 张 · 支持 JPG / PNG / WebP · 上传失败不会保留本地占位图</div>
  </div>
</template>

<style scoped>
.file-input {
  display: none;
}
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
