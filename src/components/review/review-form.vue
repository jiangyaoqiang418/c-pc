<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ImagePreview from '@/components/common/image-preview.vue';
import { setImageFallback } from '@/utils/image-placeholder';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { Message } from '@/lib/feedback';
import { uploadFile } from '@/service/api/product';
import { useUnsavedForm } from '@/composables/use-unsaved-form';

// Bundled Lucide icon data (ISC), so review controls also render without the icon CDN.
const reviewIcons = {"package-check": {"body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M12 22V12m4 5l2 2l4-4\"/><path d=\"M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753\"/><path d=\"M3.29 7L12 12l8.71-5M7.5 4.27l8.997 5.148\"/></g>", "width": 24, "height": 24}, "handshake": {"body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"m11 17l2 2a1 1 0 1 0 3-3\"/><path d=\"m14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4\"/><path d=\"m21 3l1 11h-2M3 3L2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8\"/></g>", "width": 24, "height": 24}, "star": {"body": "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z\"/>", "width": 24, "height": 24}, "x": {"body": "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M18 6L6 18M6 6l12 12\"/>", "width": 24, "height": 24}, "loader-circle": {"body": "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M21 12a9 9 0 1 1-6.219-8.56\"/>", "width": 24, "height": 24}, "camera": {"body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/></g>", "width": 24, "height": 24}, "info": {"body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4m0-4h.01\"/></g>", "width": 24, "height": 24}, "arrow-up-right": {"body": "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M7 7h10v10M7 17L17 7\"/>", "width": 24, "height": 24}};

interface FormState {
  productScore: number;
  sellerScore: number;
  content: string;
  photoUrls: string[];
}

interface Props {
  initial?: Partial<FormState>;
  submitting?: boolean;
  blockedReason?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', f: FormState): void }>();

const MAX_PHOTOS = 9;

const form = reactive<FormState>({
  productScore: props.initial?.productScore ?? 5,
  sellerScore: props.initial?.sellerScore ?? 5,
  content: props.initial?.content ?? '',
  photoUrls: [...(props.initial?.photoUrls ?? [])]
});
const uploading = ref(false);
const { markInteracted, markSaved } = useUnsavedForm(() => ({ ...form, uploading:uploading.value }), () => undefined);
defineExpose({ markSaved });
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


function submit() {
  if (uploading.value || props.submitting || props.blockedReason) return;
  if (!canSubmit.value) {
      Message.warning('请完善商品和买手服务评分，评价内容不能超过 1000 字');
    return;
  }
  emit('submit', { ...form, photoUrls: [...form.photoUrls] });
}


const previewOpen = ref(false);
const previewIndex = ref(0);
const submitDisabledReason = computed(() => props.blockedReason || (props.submitting ? '正在核对或提交原评价，请稍候' : uploading.value ? '请等待图片上传完成' : !canSubmit.value ? '请完善评分，评价内容不能超过 1000 字' : ''));
</script>

<template>
  <section class="review-form" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <div class="rating-grid">
      <div v-for="rating in ([{ key: 'productScore', title: '商品评分', hint: '外观、品质与使用体验', icon: 'package-check' }, { key: 'sellerScore', title: '买手服务', hint: '沟通、响应与服务体验', icon: 'handshake' }] as const)" :key="rating.key" class="rating-card">
        <div class="rating-heading"><Icon :icon="reviewIcons[rating.icon]" width="18" /><span>{{ rating.title }}</span><strong aria-live="polite">{{ ['请选择', '很不满意', '不满意', '一般', '满意', '非常满意'][form[rating.key]] }}</strong></div>
        <p>{{ rating.hint }}</p>
        <div class="rating-stars" role="group" :aria-label="rating.title"><button v-for="n in 5" :key="n" type="button" :class="{ active: form[rating.key] >= n }" :aria-label="`${rating.title} ${n} 星`" :aria-pressed="form[rating.key] === n" :disabled="submitting" @click="form[rating.key] = n"><Icon :icon="reviewIcons['star']" width="26" /></button><span class="rating-value">{{ form[rating.key] }}<small> / 5</small></span></div>
      </div>
    </div>
    <div class="field"><Label for="review-content">写下你的使用感受 <small>选填</small></Label><Textarea id="review-content" v-model="form.content" :disabled="submitting" maxlength="1000" rows="5" placeholder="商品有哪些让你满意的细节？实际使用感受如何？也可以聊聊买手的服务。" /><div class="editor-note"><span>真实的体验，比完美的措辞更有帮助</span><small class="word-count">{{ form.content.length }} / 1000</small></div></div>
    <div class="field"><div class="photo-heading"><span class="field-label">晒出好物 <small>选填</small></span><small>{{ form.photoUrls.length }} / {{ MAX_PHOTOS }} 张</small></div><p class="photo-hint">分享实拍细节，让你的评价更有参考价值。</p>
      <input ref="fileInputRef" class="file-input" type="file" accept="image/*" :disabled="submitting || uploading" @change="onPhotoSelected" />
      <div class="photos"><div v-for="(u, i) in form.photoUrls" :key="`${u}:${i}`" class="photo-item"><button type="button" class="preview" :aria-label="`预览评价图片 ${i + 1}`" @click="previewIndex = i; previewOpen = true"><img :src="u" :alt="`评价图片 ${i + 1}`" @error="setImageFallback" /></button><button class="remove" type="button" :disabled="submitting" :aria-label="`删除评价图片 ${i + 1}`" :title="`删除评价图片 ${i + 1}`" @click="removePhoto(i)"><Icon :icon="reviewIcons['x']" width="14" /></button></div><button v-if="form.photoUrls.length < MAX_PHOTOS" class="add" type="button" aria-label="上传评价图片" :disabled="uploading || submitting" @click="choosePhoto"><Icon :icon="reviewIcons[uploading ? 'loader-circle' : 'camera']" width="22" :class="{ 'animate-spin': uploading }" /><span>{{ uploading ? '上传中…' : '上传图片' }}</span></button></div>
    </div>
    <footer class="actions"><p><Icon :icon="reviewIcons['info']" width="16" />评价提交后不可修改，请确认后提交。</p><TooltipProvider><Tooltip><TooltipTrigger as-child><span :tabindex="submitDisabledReason ? 0 : undefined"><button type="button" class="primary submit-review" :disabled="!!submitDisabledReason" @click="submit">{{ submitting ? '提交中…' : '提交评价' }}<Icon :icon="reviewIcons['arrow-up-right']" width="18" /></button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider></footer>
    <ImagePreview v-model="previewOpen" :images="form.photoUrls" :start-index="previewIndex" title="评价图片" />
  </section>
</template>

<style scoped>
.review-form { color:var(--ink); }
.rating-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:30px; }
.rating-card { padding:20px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(135deg,color-mix(in srgb,var(--green) 5%,var(--paper)),var(--paper)); }
.rating-heading { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; }.rating-heading>svg { color:var(--green); }.rating-heading strong { margin-left:auto; color:var(--green); font-size:11px; font-weight:500; }
.rating-card p { margin:8px 0 14px; color:var(--muted); font-size:12px; }
.rating-stars { display:flex; align-items:center; gap:4px; }.rating-stars button { display:grid; place-items:center; width:40px; height:44px; border:0; border-radius:8px; padding:0; color:var(--line); background:transparent; cursor:pointer; transition:transform .15s,background .15s; }.rating-stars button.active { color:var(--yb-gold); }.rating-stars button.active :deep(svg),.rating-stars button.active :deep(path) { fill:currentColor; }.rating-stars button:hover:not(:disabled) { background:var(--soft); transform:translateY(-2px); }.rating-stars button:focus-visible,.add:focus-visible { outline:2px solid var(--green); outline-offset:3px; }.rating-value { margin-left:auto; font-size:20px; font-weight:600; font-variant-numeric:tabular-nums; }.rating-value small { color:var(--muted); font-size:11px; font-weight:400; }
.field { display:grid; gap:12px; margin:0 0 26px; }.field label,.field-label { font-size:14px; font-weight:600; }.field label small,.field-label small { margin-left:6px; font-size:11px; font-weight:400; }.field :deep(textarea) { min-height:156px; height:auto; padding:16px; font-size:14px; line-height:1.8; background:var(--paper); color:var(--ink); border:1px solid var(--line); border-radius:12px; box-shadow:none; resize:vertical; }.field :deep(textarea:focus-visible) { border-color:var(--green); outline:2px solid color-mix(in srgb,var(--green) 16%,transparent); outline-offset:1px; }.field small { color:var(--muted); }.editor-note { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:11px; }.word-count { white-space:nowrap; font-variant-numeric:tabular-nums; }.photo-heading { display:flex; align-items:center; justify-content:space-between; }.photo-hint { margin:-4px 0 0; font-size:12px; color:var(--muted); }.photos { display:flex; flex-wrap:wrap; gap:12px; }.file-input { display:none; }
.photo-item { position:relative; width:100px; height:100px; border:1px solid var(--line); border-radius:12px; }.preview { width:100%; height:100%; border-radius:12px; overflow:hidden; }.photo-item img { width:100%; height:100%; object-fit:cover; }.remove { position:absolute; top:4px; right:4px; width:24px; height:24px; display:grid; place-items:center; background:#0009; color:white; border-radius:50%; }.add { width:100px; height:100px; display:grid; align-content:center; justify-items:center; gap:10px; border:1px dashed var(--line); border-radius:12px; background:var(--soft); color:var(--muted); font-size:12px; }.add:hover:not(:disabled) { border-color:var(--green); color:var(--green); }
.actions { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:28px; padding-top:24px; border-top:1px solid var(--line); }.actions p { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:11px; line-height:1.6; margin:0; }.actions p svg { flex-shrink:0; }.submit-review { display:flex; align-items:center; justify-content:center; gap:24px; min-width:180px; min-height:46px; border-radius:12px; font-size:14px; }.actions>span { display:block; }
@media(max-width:600px) { .rating-grid { grid-template-columns:1fr; gap:12px; margin-bottom:24px; }.rating-card { padding:16px; }.rating-stars { gap:8px; }.rating-stars button { width:40px; height:44px; }.field :deep(textarea) { font-size:16px; }.editor-note { font-size:10px; }.actions { flex-direction:column; align-items:stretch; gap:16px; }.submit-review { width:100%; }.photo-item,.add { width:84px; height:84px; } }
@media(prefers-reduced-motion:reduce) { .rating-stars button { transition:none; } }
</style>
