<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { Message } from '@/lib/feedback';
import ReviewStars from '@/components/common/review-stars.vue';
import { uploadFile } from '@/service/api/product';
import { useUnsavedForm } from '@/composables/use-unsaved-form';

interface FormState {
  productScore: number;
  sellerScore: number;
  content: string;
  photoUrls: string[];
}

interface Props {
  initial?: Partial<FormState>;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', f: FormState): void }>();

const MAX_PHOTOS = 9;

const form = reactive<FormState>({
  productScore: props.initial?.productScore ?? 5,
  sellerScore: props.initial?.sellerScore ?? 5,
  content: props.initial?.content ?? '',
  photoUrls: props.initial?.photoUrls ?? []
});
const { markInteracted, markSaved } = useUnsavedForm(() => form, () => undefined);
defineExpose({ markSaved });

const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
let uploadVersion = 0;

function choosePhoto() {
  if (!props.submitting && !uploading.value && form.photoUrls.length < MAX_PHOTOS) fileInputRef.value?.click();
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.submitting || uploading.value) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请选择图片文件');
    return;
  }
  const operation = ++uploadVersion;
  uploading.value = true;
  try {
    const uploaded = await uploadFile(file, 'REVIEW');
    if (operation !== uploadVersion) return;
    if (!uploaded.url) throw new Error('上传结果缺少图片地址');
    form.photoUrls.push(uploaded.url);
  } catch (error) {
    if (operation !== uploadVersion) return;
    Message.error(error instanceof Error ? error.message : '评价图片上传失败');
  } finally {
    if (operation === uploadVersion) uploading.value = false;
  }
}

onBeforeUnmount(() => {
  uploadVersion += 1;
});

function removePhoto(idx: number) {
  if (props.submitting) return;
  form.photoUrls.splice(idx, 1);
}

const canSubmit = computed(() => form.productScore > 0 && form.sellerScore > 0 && form.content.length <= 1000);

const scoreLabel = computed(() => {
  if (form.productScore >= 4) return '👍 好评';
  if (form.productScore === 3) return '🙂 中评';
  return '👎 差评';
});

function submit() {
  if (uploading.value || props.submitting) return;
  if (!canSubmit.value) {
      Message.warning('请完善商品和买手服务评分，评价内容不能超过 1000 字');
    return;
  }
  emit('submit', { ...form, photoUrls: [...form.photoUrls] });
}


const previewOpen = ref(false);
const previewIndex = ref(0);
const submitDisabledReason = computed(() => props.submitting ? '正在核对或提交原评价，请稍候' : uploading.value ? '请等待图片上传完成' : !canSubmit.value ? '请完善评分，评价内容不能超过 1000 字' : '');
</script>

<template>
  <section class="review-form" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <h2>分享这次购物体验</h2>
    <div class="row"><span class="lbl">商品评分</span><ReviewStars v-model:score="form.productScore" :mode="submitting ? 'readonly' : 'input'" size="lg" /><span class="score-label">{{ scoreLabel }}</span></div>
    <div class="row"><span class="lbl">买手服务</span><ReviewStars v-model:score="form.sellerScore" :mode="submitting ? 'readonly' : 'input'" size="lg" /></div>
    <div class="field"><Label for="review-content">评价内容 <small>选填</small></Label><Textarea id="review-content" v-model="form.content" :disabled="submitting" maxlength="1000" rows="5" placeholder="说说商品如何、买手服务怎么样" /><small class="word-count">{{ form.content.length }}/1000</small></div>
    <div class="field"><span class="field-label">图片 <small>选填，最多 {{ MAX_PHOTOS }} 张</small></span>
      <input ref="fileInputRef" class="file-input" type="file" accept="image/*" :disabled="submitting || uploading" @change="onPhotoSelected" />
      <div class="photos"><div v-for="(u, i) in form.photoUrls" :key="`${u}:${i}`" class="photo-item"><button type="button" class="preview" :aria-label="`预览评价图片 ${i + 1}`" @click="previewIndex = i; previewOpen = true"><img :src="u" :alt="`评价图片 ${i + 1}`" @error="setImageFallback" /></button><button class="remove" type="button" :disabled="submitting" :aria-label="`删除评价图片 ${i + 1}`" :title="`删除评价图片 ${i + 1}`" @click="removePhoto(i)"><Icon icon="lucide:x" width="14" /></button></div><button v-if="form.photoUrls.length < MAX_PHOTOS" class="add" type="button" aria-label="上传评价图片" :disabled="uploading || submitting" @click="choosePhoto"><Icon :icon="uploading ? 'lucide:loader-circle' : 'lucide:plus'" width="22" :class="{ 'animate-spin': uploading }" /><span>{{ uploading ? '上传中…' : '上传图片' }}</span></button></div>
    </div>
    <footer class="actions"><TooltipProvider><Tooltip><TooltipTrigger as-child><span :tabindex="submitDisabledReason ? 0 : undefined"><Button :disabled="!!submitDisabledReason" @click="submit">{{ submitting ? '提交中…' : '提交评价' }}</Button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider></footer>
    <ImagePreview v-model="previewOpen" :images="form.photoUrls" :start-index="previewIndex" title="评价图片" />
  </section>
</template>

<style scoped>
.review-form { background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; padding:28px; }h2 { font-size:20px; font-weight:600; margin:0 0 26px; }.row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:22px; }.lbl { min-width:88px; color:var(--yb-ink-2); font-size:14px; }.score-label { color:var(--yb-ink-2); font-size:13px; }.field { display:grid; gap:10px; margin-top:26px; }.field-label { font-size:14px; font-weight:500; }.field small { font-size:12px; color:var(--yb-muted); font-weight:400; }.word-count { text-align:right; }.photos { display:flex; flex-wrap:wrap; gap:12px; }.file-input { display:none; }.photo-item { position:relative; width:88px; height:88px; border-radius:6px; border:1px solid var(--yb-hairline); background:var(--yb-fill); }.preview { display:block; width:100%; height:100%; padding:0; border:0; border-radius:6px; overflow:hidden; cursor:zoom-in; }.photo-item img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .2s; }.preview:hover img { transform:scale(1.03); }.remove { position:absolute; display:grid; place-items:center; top:4px; right:4px; background:rgb(20 30 25 / 65%); color:#fff; border:none; width:24px; height:24px; border-radius:50%; cursor:pointer; }.preview:focus-visible,.remove:focus-visible,.add:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.add { width:88px; height:88px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:8px; background:var(--yb-fill); border:1px dashed var(--yb-hairline-2); border-radius:6px; color:var(--yb-muted); cursor:pointer; font-size:12px; transition:background .15s,border-color .15s,color .15s; }.add:hover:not(:disabled) { border-color:var(--yb-brand-primary); color:var(--yb-brand-primary); background:var(--yb-primary-soft); }.add:disabled,.remove:disabled { opacity:.5; cursor:not-allowed; }.actions { display:flex; justify-content:flex-end; margin-top:28px; }@media(max-width:700px) { .review-form { padding:22px; }.score-label { margin-left:100px; } }@media(prefers-reduced-motion:reduce) { .photo-item img,.add { transition:none; }.preview:hover img { transform:none; } }
</style>
