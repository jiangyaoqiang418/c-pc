<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { Message } from '@/lib/feedback';
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


const previewOpen = ref(false);
const previewIndex = ref(0);
watch(() => props.modelValue, () => { previewOpen.value = false; });
</script>

<template>
  <div class="evidence" :aria-busy="uploading">
    <input ref="inputRef" class="file-input" type="file" accept="image/*" multiple :disabled="disabled || uploading" @change="onFileChange" />
    <div v-for="(u, i) in modelValue" :key="`${u}:${i}`" class="cell">
      <button type="button" class="preview" :aria-label="`预览凭证 ${i + 1}`" @click="previewIndex = i; previewOpen = true"><img :src="u" :alt="`凭证 ${i + 1}`" @error="setImageFallback" /></button>
      <button class="remove" type="button" :disabled="disabled" :aria-label="`删除凭证 ${i + 1}`" :title="`删除凭证 ${i + 1}`" @click="remove(i)"><Icon icon="lucide:x" width="14" /></button>
    </div>
    <button v-if="modelValue.length < max" class="add" type="button" aria-label="添加凭证图片" :disabled="disabled || uploading" @click="pickFile"><Icon :icon="uploading ? 'lucide:loader-circle' : 'lucide:plus'" width="22" :class="{ 'animate-spin': uploading }" /><span>{{ uploading ? '上传中…' : '添加图片' }}</span></button>
    <Alert v-if="failedFiles.length" class="failure"><AlertDescription>{{ failedFiles.length }} 张图片上传失败，成功图片已保留。</AlertDescription><Button type="button" variant="outline" size="sm" :disabled="disabled || modelValue.length >= max || uploading" @click="uploadFiles([...failedFiles])">重试失败图片</Button></Alert>
    <small class="hint">最多 {{ max }} 张 · 支持 JPG / PNG / WebP</small>
    <ImagePreview v-model="previewOpen" :images="modelValue" :start-index="previewIndex" title="凭证图片" />
  </div>
</template>

<style scoped>
.file-input { display:none; }.evidence { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }.cell { position:relative; width:96px; height:96px; border-radius:6px; border:1px solid var(--yb-hairline); background:var(--yb-fill); }.preview { display:block; width:100%; height:100%; border:0; border-radius:6px; overflow:hidden; padding:0; cursor:zoom-in; }.cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .2s; }.preview:hover img { transform:scale(1.03); }.remove { position:absolute; top:5px; right:5px; display:grid; place-items:center; background:rgb(20 30 25 / 65%); color:#fff; border:none; width:24px; height:24px; border-radius:50%; cursor:pointer; }.preview:focus-visible,.remove:focus-visible,.add:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.add { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:8px; width:96px; height:96px; background:var(--yb-fill); border:1px dashed var(--yb-hairline-2); border-radius:6px; color:var(--yb-muted); cursor:pointer; font-size:13px; transition:border-color .15s,color .15s,background .15s; }.add:hover:not(:disabled) { border-color:var(--yb-brand-primary); color:var(--yb-brand-primary); background:var(--yb-primary-soft); }.add:disabled,.remove:disabled { cursor:not-allowed; opacity:.5; }.hint { flex-basis:100%; font-size:12px; color:var(--yb-muted); }.failure { flex-basis:100%; display:flex; align-items:center; flex-wrap:wrap; gap:12px; }@media(prefers-reduced-motion:reduce) { .cell img,.add { transition:none; }.preview:hover img { transform:none; } }
</style>
