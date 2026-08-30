<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';
import { RequestError } from '@/service/request';

interface Props {
  modelValue?: string[];
  max?: number;
  scene?: 'REVIEW' | 'DEMAND' | 'PRODUCT' | 'ORDER_VOUCHER';
  disabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), { max: 6, modelValue: () => [], scene: 'ORDER_VOUCHER' });
const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void;
  (e: 'uploaded', v: Api.RealProduct.FileUploadResult[]): void;
  (e: 'uploading', value: boolean): void;
}>();

const uploading = ref(false);
const failedFiles = ref<File[]>([]);
watch(uploading, value => emit('uploading', value), { flush: 'sync' });
const inputRef = ref<HTMLInputElement>();
let uploadVersion = 0;
let localImages: string[] | undefined;

watch(() => props.modelValue, value => {
  // 本组件删除/追加图片不更换业务上下文，上传结果仍可合并。
  if (toRaw(value) === localImages) {
    localImages = undefined;
    return;
  }
  localImages = undefined;
  uploadVersion += 1;
  uploading.value = false;
  failedFiles.value = [];
});

function updateImages(value: string[]) {
  localImages = value;
  emit('update:modelValue', value);
}

function pickFile() {
  if (props.disabled || uploading.value || props.modelValue.length >= props.max) return;
  inputRef.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  await uploadFiles(files);
}

async function uploadFiles(files: File[]) {
  if (!files.length || props.disabled || uploading.value) return;

  const available = props.max - props.modelValue.length;
  const picked = files.slice(0, available);
  if (!picked.length) return;
  const operation = ++uploadVersion;
  uploading.value = true;
  try {
    const results = await Promise.allSettled(picked.map(file => uploadFile(file, props.scene)));
    if (operation !== uploadVersion) return;
    const uploaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [picked[index]!] : []);
    failedFiles.value = [...failedFiles.value.filter(file => !picked.includes(file)), ...failures];
    if (uploaded.length) {
      updateImages([...props.modelValue, ...uploaded.map(item => item.url || item.filePath)].slice(0, props.max));
      emit('uploaded', uploaded);
    }
    if (failures.length) {
      const failure = results.find(result => result.status === 'rejected');
      const message = failure?.status === 'rejected' && failure.reason instanceof RequestError ? failure.reason.message : '';
      Message.warning(`已上传 ${uploaded.length} 张，${failures.length} 张失败。${message || '请重试失败图片'}`);
    } else if (uploaded.length) {
      Message.success(`已上传 ${uploaded.length} 张图片`);
    }
  } finally {
    if (operation === uploadVersion) uploading.value = false;
  }
}

onBeforeUnmount(() => {
  uploadVersion += 1;
  if (uploading.value) emit('uploading', false);
});

function remove(i: number) {
  if (props.disabled) return;
  const next = [...props.modelValue];
  next.splice(i, 1);
  updateImages(next);
}
</script>

<template>
  <div class="evidence">
    <input ref="inputRef" class="file-input" type="file" accept="image/*" multiple @change="onFileChange" />
    <div v-for="(u, i) in modelValue" :key="u" class="cell">
      <img :src="u" :alt="`售后凭证 ${i + 1}`" />
      <button class="remove" type="button" :disabled="disabled" :aria-label="`删除售后凭证 ${i + 1}`" :title="`删除售后凭证 ${i + 1}`" @click="remove(i)">✕</button>
    </div>
    <button v-if="modelValue.length < max" class="add" type="button" aria-label="添加售后凭证图片" :disabled="disabled || uploading" @click="pickFile">
      {{ uploading ? '上传中…' : '+ 添加图片' }}
    </button>
    <a-alert v-if="failedFiles.length" type="warning">
      {{ failedFiles.length }} 张图片上传失败，成功图片已保留。
      <template #action><a-button size="mini" :disabled="disabled || modelValue.length >= max" :loading="uploading" @click="uploadFiles([...failedFiles])">重试失败图片</a-button></template>
    </a-alert>
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
