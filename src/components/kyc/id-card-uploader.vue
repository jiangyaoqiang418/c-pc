<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { onBeforeUnmount, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import { uploadKycFile } from '@/service/api/kyc';
import { RequestError } from '@/service/request';

interface Props {
  side: 'front' | 'back' | 'face';
  modelValue?: string | number;
  contextKey: string;
  disabled?: boolean;
  label?: string;
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
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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
    Message.success(`${props.label || sideLabel[props.side]}上传成功`);
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
  <div class="id-uploader" :class="{ uploaded: !!modelValue }">
    <input ref="inputRef" class="file-input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || uploading" @change="onFileChange" />
    <button type="button" class="preview" :disabled="disabled || uploading" :aria-label="`上传${label || sideLabel[side]}`" @click="pickFile">
      <img v-if="previewUrl" :src="previewUrl" :alt="label || sideLabel[side]" class="img" @error="previewUrl = ''" />
      <span v-else class="placeholder"><Icon :icon="uploading ? 'lucide:loader-circle' : modelValue ? 'lucide:badge-check' : 'lucide:image-plus'" width="26" :class="{ spinning: uploading }" /><span>{{ uploading ? '上传中…' : modelValue ? '证件已上传，暂无可用预览' : `点击上传${label || sideLabel[side]}` }}</span><small>JPG / PNG / WebP，≤ 10 MB</small></span><span v-if="uploading && previewUrl" class="overlay">上传中…</span>
    </button>
    <div class="meta"><span class="title">{{ label || sideLabel[side] }}</span><Button v-if="modelValue" type="button" variant="link" size="sm" class="reset-button" :disabled="disabled || uploading" @click="clearFromUser">重新上传</Button><span v-else class="hint">上传真实证件资料</span></div>
  </div>
</template>

<style scoped>
.file-input { display:none; }.id-uploader { display:grid; gap:12px; min-width:0; }.preview { position:relative; width:100%; aspect-ratio:1.6; border:1px dashed var(--yb-hairline-2); border-radius:8px; overflow:hidden; background:var(--yb-fill); padding:0; cursor:pointer; transition:background .15s,border-color .15s; }.preview:not(:disabled):hover { background:var(--yb-primary-soft); border-color:var(--yb-brand-primary); }.preview:disabled { cursor:not-allowed; opacity:.65; }.preview:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.uploaded .preview { border-style:solid; border-color:var(--yb-hairline-2); }.img { width:100%; height:100%; object-fit:cover; display:block; }.placeholder { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--yb-muted); font-size:13px; padding:16px; }.placeholder svg { color:var(--yb-brand-primary); }.placeholder small { font-size:12px; color:var(--yb-muted); }.overlay { position:absolute; inset:0; display:grid; place-items:center; background:rgb(0 0 0 / 45%); color:#fff; font-size:14px; }.meta { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; }.title { color:var(--yb-ink); font-weight:500; }.hint { color:var(--yb-muted); }.reset-button { padding:0; height:auto; color:var(--yb-danger); }.spinning { animation:spin 1s linear infinite; }@keyframes spin { to { transform:rotate(360deg); } }@media(prefers-reduced-motion:reduce) { .preview { transition:none; }.spinning { animation:none; } }
</style>
