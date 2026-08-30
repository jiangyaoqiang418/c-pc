<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { uploadKycFile } from '@/service/api/kyc';
import { RequestError } from '@/service/request';

interface Props {
  side: 'front' | 'back' | 'face';
  modelValue?: string | number;
  contextKey: string;
  disabled?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number): void;
  (e: 'uploading', v: boolean): void;
}>();

const uploading = ref(false);
const previewUrl = ref('');
const inputRef = ref<HTMLInputElement>();
let uploadVersion = 0;

const sideLabel: Record<'front' | 'back' | 'face', string> = {
  front: '身份证人像面',
  back: '身份证国徽面',
  face: '手持证件照'
};

function pickFile() {
  if (!props.disabled && !uploading.value) inputRef.value?.click();
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.disabled || uploading.value) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请上传 JPG、PNG 或 WebP 格式的图片');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    Message.warning('单张证件图片不能超过 10 MB');
    return;
  }

  const operation = ++uploadVersion;
  uploading.value = true;
  emit('uploading', true);
  try {
    const uploaded = await uploadKycFile(file);
    if (operation !== uploadVersion) return;
    emit('update:modelValue', String(uploaded.id));
    previewUrl.value = uploaded.url || '';
    Message.success(`${sideLabel[props.side]}上传成功`);
  } catch (error) {
    if (operation !== uploadVersion) return;
    const message = error instanceof RequestError ? error.message : '';
    Message.error(message || '图片上传失败，请稍后重试');
  } finally {
    if (operation === uploadVersion) {
      uploading.value = false;
      emit('uploading', false);
    }
  }
}

function clear() {
  uploadVersion += 1;
  if (uploading.value) {
    uploading.value = false;
    emit('uploading', false);
  }
  previewUrl.value = '';
  emit('update:modelValue', '');
}

function clearFromUser() {
  if (!props.disabled) clear();
}

watch(() => props.contextKey, clear, { flush: 'sync' });
watch(() => props.modelValue, value => {
  if (value !== undefined && value !== '') return;
  uploadVersion += 1;
  previewUrl.value = '';
  uploading.value = false;
  emit('uploading', false);
}, { flush: 'sync' });

onBeforeUnmount(() => {
  uploadVersion += 1;
  if (uploading.value) emit('uploading', false);
});
</script>

<template>
  <div class="id-uploader" :class="{ uploaded: !!modelValue, face: side === 'face' }">
    <input ref="inputRef" class="file-input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || uploading" @change="onFileChange" />
    <div
      class="preview"
      role="button"
      :tabindex="disabled || uploading ? -1 : 0"
      :aria-label="`上传${sideLabel[side]}`"
      :aria-disabled="disabled || uploading ? 'true' : undefined"
      @click="pickFile"
      @keydown.enter="pickFile"
      @keydown.space.prevent="pickFile"
    >
      <img v-if="previewUrl" :src="previewUrl" :alt="sideLabel[side]" class="img" />
      <div v-else class="placeholder">
        <span>{{ uploading ? '上传中…' : `点击上传${sideLabel[side]}` }}</span>
        <small>JPG / PNG / WebP，≤ 10 MB</small>
      </div>
      <div v-if="uploading" class="overlay">上传中…</div>
    </div>
    <div class="meta">
      <span class="title">{{ sideLabel[side] }}</span>
      <a-link v-if="modelValue" role="button" :tabindex="disabled ? -1 : 0" :disabled="disabled" status="danger" @click="clearFromUser" @keydown.enter="clearFromUser" @keydown.space.prevent="clearFromUser">重新上传</a-link>
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
.preview:focus-visible { outline: 2px solid var(--bw-brand-primary); outline-offset: 3px; }
.img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #4e5969; font-size: 13px; }
.placeholder small { color: #86909c; font-size: 11px; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 13px; }
.meta { display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 12px; }
.title { color: #1d2129; font-weight: 500; }
.hint { color: #86909c; }
</style>
