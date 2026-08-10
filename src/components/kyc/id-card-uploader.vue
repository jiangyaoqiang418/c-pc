<script setup lang="ts">
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';
import { RequestError } from '@/service/request';

interface Props {
  side: 'front' | 'back' | 'face';
  modelValue?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'uploading', v: boolean): void;
}>();

const uploading = ref(false);
const inputRef = ref<HTMLInputElement>();

const sideLabel: Record<'front' | 'back' | 'face', string> = {
  front: '身份证人像面',
  back: '身份证国徽面',
  face: '手持证件照'
};

function pickFile() {
  if (!uploading.value) inputRef.value?.click();
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请上传 JPG、PNG 或 WebP 格式的图片');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    Message.warning('单张证件图片不能超过 10 MB');
    return;
  }

  uploading.value = true;
  emit('uploading', true);
  try {
    const uploaded = await uploadFile(file, 'kyc');
    emit('update:modelValue', uploaded.url);
    Message.success(`${sideLabel[props.side]}上传成功`);
  } catch (error) {
    const message = error instanceof RequestError ? error.message : '';
    Message.error(message || '图片上传失败，请稍后重试');
  } finally {
    uploading.value = false;
    emit('uploading', false);
  }
}

function clear() {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="id-uploader" :class="{ uploaded: !!modelValue, face: side === 'face' }">
    <input ref="inputRef" class="file-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onFileChange" />
    <div class="preview" @click="pickFile">
      <img v-if="modelValue" :src="modelValue" :alt="sideLabel[side]" class="img" />
      <div v-else class="placeholder">
        <span>{{ uploading ? '上传中…' : `点击上传${sideLabel[side]}` }}</span>
        <small>JPG / PNG / WebP，≤ 10 MB</small>
      </div>
      <div v-if="uploading" class="overlay">上传中…</div>
    </div>
    <div class="meta">
      <span class="title">{{ sideLabel[side] }}</span>
      <a-link v-if="modelValue" status="danger" @click="clear">重新上传</a-link>
      <span v-else class="hint">上传真实证件资料</span>
    </div>
  </div>
</template>

<style scoped>
.file-input { display: none; }
.id-uploader { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.id-uploader.face { width: 220px; }
.id-uploader:not(.face) { width: 360px; }
.preview {
  position: relative; width: 100%; border-radius: 6px; overflow: hidden; cursor: pointer;
  border: 2px dashed #c9cdd4; background: #f7f8fa; transition: border-color 0.15s;
}
.id-uploader:not(.face) .preview { aspect-ratio: 360 / 220; }
.id-uploader.face .preview { aspect-ratio: 1; border-radius: 50%; }
.id-uploader.uploaded .preview { border-color: var(--bw-brand-primary); border-style: solid; }
.preview:hover { border-color: var(--bw-brand-primary); }
.img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #4e5969; font-size: 13px; }
.placeholder small { color: #86909c; font-size: 11px; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 13px; }
.meta { display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 12px; }
.title { color: #1d2129; font-weight: 500; }
.hint { color: #86909c; }
</style>
