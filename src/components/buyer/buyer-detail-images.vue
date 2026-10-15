<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import { uploadFile } from '@/service/api/product';
import { richTextError, sanitizeRichText } from '@/utils/rich-text';
import { setImageFallback } from '@/utils/image-placeholder';

const props = defineProps<{ modelValue: string; context: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; uploading: [value: boolean]; uploaded: [items: Api.RealProduct.FileUploadResult[]] }>();
const uploading = ref(false);
const error = ref('');
let version = 0;
let active = true;

function content() {
  const element = document.createElement('div');
  element.innerHTML = sanitizeRichText(props.modelValue);
  return element;
}
const images = computed(() => Array.from(content().querySelectorAll('img')).map(image => image.getAttribute('src') || ''));
watch(uploading, value => emit('uploading', value), { flush:'sync' });
watch(() => props.context, () => { version += 1; uploading.value = false; error.value = ''; });
onBeforeUnmount(() => { active = false; version += 1; uploading.value = false; });

function remove(index: number) {
  if (props.disabled || uploading.value) return;
  const element = content();
  const image = element.querySelectorAll('img')[index];
  if (!image) return;
  const paragraph = image.parentElement;
  image.remove();
  if (paragraph?.tagName === 'P' && !paragraph.textContent?.trim() && !paragraph.querySelector('img')) paragraph.remove();
  emit('update:modelValue', sanitizeRichText(element.innerHTML));
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const chosen = Array.from(input.files || []);
  input.value = '';
  if (props.disabled || uploading.value || !chosen.length) return;
  error.value = '';
  const supported = chosen.filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
  if (supported.length !== chosen.length) Message.warning('仅支持 10MB 以内的 JPG、PNG、WebP 图片，不符合要求的文件未上传');
  const selected = supported.slice(0, Math.max(0, 30 - images.value.length));
  if (selected.length < supported.length) Message.warning('商品详情最多插入 30 张图片，超出的文件未上传');
  if (!selected.length) return;
  const operation = ++version;
  const context = props.context;
  uploading.value = true;
  try {
    const results = await Promise.allSettled(selected.map(file => uploadFile(file, 'PRODUCT')));
    if (!active || operation !== version || context !== props.context || props.disabled) return;
    const uploaded = results.flatMap(result => result.status === 'fulfilled' && result.value
      && typeof result.value.bucket === 'string' && result.value.bucket.trim()
      && typeof result.value.filePath === 'string' && result.value.filePath.trim()
      && (typeof result.value.url === 'string' && result.value.url.trim() || result.value.filePath.trim()) ? [result.value] : []);
    const element = content();
    const accepted = uploaded.slice(0, Math.max(0, 30 - element.querySelectorAll('img').length));
    for (const item of accepted) {
      const paragraph = document.createElement('p');
      const image = document.createElement('img');
      image.setAttribute('src', item.url || item.filePath);
      image.setAttribute('alt', '商品详情图片');
      paragraph.appendChild(image);
      element.appendChild(paragraph);
    }
    const next = sanitizeRichText(element.innerHTML);
    const issue = richTextError(next);
    if (issue) { error.value = issue + '，已上传图片未插入正文'; return; }
    if (accepted.length) {
      emit('uploaded', accepted);
      emit('update:modelValue', next);
    }
    const failed = results.length - uploaded.length;
    if (failed) error.value = `${failed} 张详情图片上传失败，成功图片已保留，可重新选择失败文件`;
    if (accepted.length !== uploaded.length) error.value = '详情图片已达到 30 张，超出的上传结果未插入正文';
    if (accepted.length) Message.success(`已插入 ${accepted.length} 张详情图片`);
  } catch {
    if (active && operation === version && context === props.context) error.value = '详情图片处理失败，当前正文保持不变，请重试';
  } finally { if (operation === version) uploading.value = false; }
}
</script>

<template>
  <details class="buyer-detail-images">
    <summary>添加详情图片</summary><p>详情图片支持 JPG / PNG / WebP，最多 30 张。</p>
    <input type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="disabled || uploading || images.length >= 30" aria-label="上传商品详情图片" @change="upload" />
    <p v-if="uploading" role="status">正在上传详情图片…</p><p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div class="buyer-upload-grid"><div v-for="(image,index) in images" :key="`${image}:${index}`"><img :src="image" alt="商品详情图片" @error="setImageFallback" /><button type="button" :disabled="disabled || uploading" :aria-label="'移除第 ' + (index + 1) + ' 张商品详情图片'" @click="remove(index)">×</button></div></div>
  </details>
</template>

<style scoped>
.buyer-detail-images > input { width:100%; max-width:100%; min-width:0; }
.error-text { color:var(--yb-danger); }
</style>
