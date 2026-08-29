<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';
import { RequestError } from '@/service/request';

interface Props {
  modelValue?: string[];
  max?: number;
  scene?: 'REVIEW' | 'DEMAND' | 'PRODUCT' | 'ORDER_VOUCHER';
}
const props = withDefaults(defineProps<Props>(), { max: 6, modelValue: () => [], scene: 'ORDER_VOUCHER' });
const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void;
  (e: 'uploaded', v: Api.RealProduct.FileUploadResult[]): void;
}>();

const uploading = ref(false);
const inputRef = ref<HTMLInputElement>();
let uploadVersion = 0;

watch(() => props.modelValue, () => {
  uploadVersion += 1;
});

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
  const operation = ++uploadVersion;
  uploading.value = true;
  try {
    const uploaded = await Promise.all(picked.map(file => uploadFile(file, props.scene)));
    if (operation !== uploadVersion) return;
    emit('update:modelValue', [...props.modelValue, ...uploaded.map(item => item.url || item.filePath)]);
    emit('uploaded', uploaded);
    Message.success(picked.length > 1 ? `已上传 ${picked.length} 张图片` : '图片已上传');
  } catch (error) {
    const message = error instanceof RequestError ? error.message : '';
    if (message.includes('MinIO') || message.includes('对象存储')) {
      Message.error('对象存储暂未配置，当前无法上传图片');
    } else {
      Message.error(message || '图片上传失败，请稍后重试');
    }
  } finally {
    if (operation === uploadVersion) uploading.value = false;
  }
}

onBeforeUnmount(() => {
  uploadVersion += 1;
});

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
      <img :src="u" :alt="`售后凭证 ${i + 1}`" />
      <button class="remove" type="button" :aria-label="`删除售后凭证 ${i + 1}`" :title="`删除售后凭证 ${i + 1}`" @click="remove(i)">✕</button>
    </div>
    <button v-if="modelValue.length < max" class="add" type="button" aria-label="添加售后凭证图片" :disabled="uploading" @click="pickFile">
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
.remove:focus-visible,
.add:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
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
