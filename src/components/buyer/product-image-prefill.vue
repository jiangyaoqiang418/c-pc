<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { uploadAiImage } from '@/service/api/ai';
import { prefillProductImage, uploadFile } from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';

const props = defineProps<{ disabled?: boolean; imageCount?: number; contextKey: string }>();
const emit = defineEmits<{ apply: [value: Api.RealProduct.ImagePrefillSelection]; busy: [value: boolean]; productImage: [value: Api.RealProduct.FileUploadResult] }>();
const id = useId();
const fileInput = ref<HTMLInputElement>();
const file = ref<File>();
const combined = ref(false);
const mainUploaded = ref(false);
const fileId = ref<Api.RealProduct.Id>();
const hint = ref('');
const overwrite = ref(false);
const busy = ref(false);
const error = ref('');
const result = ref<Api.RealProduct.ImagePrefillResult>();
const category = ref('');
const brand = ref('');
const fields = reactive({ title: true, description: false, category: true, brand: true, parameters: true, specs: false });
const requests = createLatestRequestGuard(() => props.contextKey);

function chooseFile(event: Event, asProduct = false) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length || busy.value || props.disabled) return;
  combined.value = asProduct;
  overwrite.value = false;
  mainUploaded.value = false;
  requests.invalidate();
  file.value = (event.target as HTMLInputElement).files?.[0];
  fileId.value = undefined;
  result.value = undefined;
  error.value = '';
  input.value = '';
  if (asProduct) return recognize();
}

async function recognize() {
  if (busy.value || props.disabled || !file.value) return;
  if (hint.value.length > 120) { error.value = '识别提示最多120字'; return; }
  const current = requests.begin();
  const requestHint = hint.value.trim();
  busy.value = true;
  emit('busy', true);
  error.value = '';
  result.value = undefined;
  try {
    if (combined.value && !mainUploaded.value) {
      if ((props.imageCount ?? 0) >= 6) throw new Error('已达到 6 张商品图上限');
      if (!['image/jpeg','image/png','image/webp'].includes(file.value.type) || file.value.size > 5 * 1024 * 1024) throw new Error('请选择不超过 5 MiB 的 JPG、PNG 或 WebP 图片');
      const image = await uploadFile(file.value, 'PRODUCT');
      if (!current()) return;
      emit('productImage', image);
      mainUploaded.value = true;
    }
    if (fileId.value === undefined) {
      const uploaded = await uploadAiImage(file.value, current.signal);
      if (!current()) return;
      fileId.value = uploaded.id;
    }
    const suggestion = await prefillProductImage({ fileId: fileId.value!, ...(requestHint ? { hint: requestHint } : {}) }, current.signal);
    if (!current()) return;
    result.value = suggestion;
    category.value = suggestion.categoryCandidates.length === 1 ? String(suggestion.categoryCandidates[0].id) : '';
    brand.value = suggestion.brandCandidates.length === 1 ? String(suggestion.brandCandidates[0].id) : '';
    Object.assign(fields, { title: !!suggestion.title, description: false, category: !!suggestion.categoryCandidates.length, brand: !!suggestion.brandCandidates.length, parameters: !!suggestion.parameters.length, specs: false });
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : '识别失败，原表单已保留，请重试或手动填写';
  } finally {
    if (current()) {
      busy.value = false; emit('busy', false);
      if (combined.value && result.value) { overwrite.value = false; apply(); }
    }
  }
}

function apply() {
  const suggestion = result.value;
  if (props.disabled || busy.value || !suggestion) return;
  emit('apply', {
    overwrite: overwrite.value,
    ...(fields.specs ? { specGroups: suggestion.specGroups } : {}),
    ...(fields.title && suggestion.title ? { title: suggestion.title } : {}),
    ...(fields.description && suggestion.description ? { description: suggestion.description } : {}),
    ...(fields.category && category.value ? { category: suggestion.categoryCandidates.find(item => String(item.id) === category.value) } : {}),
    ...(fields.brand && brand.value ? { brand: suggestion.brandCandidates.find(item => String(item.id) === brand.value) } : {}),
    ...(fields.parameters && suggestion.parameters.length ? { parameters: suggestion.parameters.map(item => ({ ...item })) } : {})
  });
}

function clear() {
  requests.invalidate();
  combined.value = false; mainUploaded.value = false;
  file.value = undefined;
  if (fileInput.value) fileInput.value.value = '';
  fileId.value = undefined;
  result.value = undefined;
  error.value = '';
  busy.value = false;
  emit('busy', false);
}
watch(() => props.contextKey, clear);
watch(() => props.disabled, disabled => { if (disabled) clear(); });
onBeforeUnmount(clear);
</script>

<template>
  <section class="image-prefill" :aria-busy="busy" aria-label="识图填写商品">
    <header><h3>识图填写</h3><p>选一张商品图，自动补全空白标题、参数和唯一匹配的品牌、分类。原有内容保留。</p></header>
    <label class="combined-upload">上传商品图并识图填写<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || busy || (imageCount ?? 0) >= 6" @change="chooseFile($event, true)" /></label>
    <div class="recognition-fields">
      <div><Label :for="id + '-file'">仅作识别参考（选填）</Label><input :id="id + '-file'" ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || busy" @change="chooseFile" /><small>JPG、PNG、WebP，最多 5 MiB、2000 万像素。参考图不会加入商品相册。</small></div>
      <div><Label :for="id + '-hint'">识别提示（选填）</Label><Input :id="id + '-hint'" v-model="hint" maxlength="120" :disabled="disabled || busy" placeholder="如：识别品牌、型号和外观" /></div>
    </div>
    <button type="button" class="outline" :disabled="disabled || busy || !file" @click="recognize"><Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ busy ? '正在识别，请稍候…' : fileId ? '重新识别（复用已上传图片）' : '识别商品信息' }}</button>
    <p v-if="busy" role="status">正在生成建议，已填内容会保留，请等待结果。</p>
    <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}。{{ mainUploaded ? '商品图已保留；重试不会再次添加。' : '可重试或继续手动填写。' }}</AlertDescription></Alert>
    <div v-if="result" class="suggestions">
      <h4>核对识别建议</h4>
      <label class="check"><input v-model="fields.title" type="checkbox" :disabled="disabled || !result.title" />商品标题</label>
      <Input v-model="result.title" maxlength="128" :disabled="disabled" aria-label="识别建议标题" />
      <label class="check"><input v-model="fields.description" type="checkbox" :disabled="disabled || !result.description" />外观描述（仅填入空白详情，不覆盖画布）</label>
      <textarea v-model="result.description" rows="3" :disabled="disabled" aria-label="识别建议外观描述" />
      <label class="check"><input v-model="fields.category" type="checkbox" :disabled="disabled || !result.categoryCandidates.length" />主分类</label>
      <select v-if="result.categoryCandidates.length" v-model="category" :disabled="disabled" aria-label="识别建议分类"><option value="">保留原分类，稍后手动选择</option><option v-for="item in result.categoryCandidates" :key="String(item.id)" :value="String(item.id)">{{ item.name }}</option></select>
      <small v-else>未匹配到分类，请在表单中手动选择。</small>
      <label class="check"><input v-model="fields.brand" type="checkbox" :disabled="disabled || !result.brandCandidates.length" />商品品牌</label>
      <select v-if="result.brandCandidates.length" v-model="brand" :disabled="disabled" aria-label="识别建议品牌"><option value="">保留原品牌，稍后手动选择</option><option v-for="item in result.brandCandidates" :key="String(item.id)" :value="String(item.id)">{{ item.name }}</option></select>
      <small v-else>未匹配到品牌，请在表单中手动选择。</small>
      <label class="check"><input v-model="fields.parameters" type="checkbox" :disabled="disabled || !result.parameters.length" />商品展示参数</label>
      <dl v-if="result.parameters.length"><div v-for="(item, index) in result.parameters" :key="index"><dt>{{ item.name }}</dt><dd>{{ item.value }}</dd></div></dl><small v-else>没有识别到参数，保留已有输入。</small>
      <label v-if="result.specGroups?.length" class="check"><input v-model="fields.specs" type="checkbox" />补充销售规格（仅空白规格表）</label><p v-for="group in result.specGroups" :key="group.name">{{ group.name }}：{{ group.options.join(' / ') }}</p>
      <label class="check"><input v-model="overwrite" type="checkbox" />允许替换已有标题、品牌、分类和同名参数</label><p>默认只补充空字段，已有画布始终保留。规格建议不包含价格和库存，填入后请在下方生成组合并填写。</p>
      <div class="button-row"><button type="button" class="primary" :disabled="disabled" @click="apply">确认填入所选字段</button><button type="button" class="outline" @click="result = undefined">放弃建议</button></div>
    </div>
  </section>
</template>

<style scoped>
.image-prefill { padding:16px; margin-bottom:20px; border:1px solid var(--line); border-radius:8px; background:var(--soft); }.image-prefill header p,.image-prefill small,.image-prefill p { color:var(--muted); font-size:12px; line-height:1.6; }.recognition-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; gap:12px; margin:12px 0; }.recognition-fields>div,.suggestions { display:grid; gap:8px; min-width:0; }input[type=file] { width:100%; min-width:0; font-size:12px; }.suggestions { margin-top:16px; }.check { display:flex; align-items:center; gap:8px; font-size:13px; }.check input { width:auto; }select,textarea { width:100%; min-width:0; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); }.button-row { flex-wrap:wrap; }dl>div { display:flex; gap:12px; font-size:13px; }dd { overflow-wrap:anywhere; }@media(max-width:700px) { .recognition-fields { grid-template-columns:1fr; } }
</style>
