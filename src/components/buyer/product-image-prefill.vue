<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { uploadAiImage } from '@/service/api/ai';
import { prefillProductImage } from '@/service/api/product';
import { createLatestRequestGuard } from '@/utils/latest-request';

const props = defineProps<{ disabled?: boolean; contextKey: string }>();
const emit = defineEmits<{ apply: [value: Api.RealProduct.ImagePrefillSelection]; busy: [value: boolean] }>();
const id = useId();
const fileInput = ref<HTMLInputElement>();
const file = ref<File>();
const fileId = ref<Api.RealProduct.Id>();
const hint = ref('');
const busy = ref(false);
const error = ref('');
const result = ref<Api.RealProduct.ImagePrefillResult>();
const category = ref('');
const brand = ref('');
const fields = reactive({ title: true, description: true, category: true, brand: true, parameters: true });
const requests = createLatestRequestGuard(() => props.contextKey);

function chooseFile(event: Event) {
  requests.invalidate();
  file.value = (event.target as HTMLInputElement).files?.[0];
  fileId.value = undefined;
  result.value = undefined;
  error.value = '';
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
    Object.assign(fields, { title: !!suggestion.title, description: !!suggestion.description, category: true, brand: true, parameters: !!suggestion.parameters.length });
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : '识别失败，原表单已保留，请重试或手动填写';
  } finally {
    if (current()) { busy.value = false; emit('busy', false); }
  }
}

function apply() {
  const suggestion = result.value;
  if (props.disabled || busy.value || !suggestion) return;
  emit('apply', {
    ...(fields.title && suggestion.title ? { title: suggestion.title } : {}),
    ...(fields.description && suggestion.description ? { description: suggestion.description } : {}),
    ...(fields.category && category.value ? { category: suggestion.categoryCandidates.find(item => String(item.id) === category.value) } : {}),
    ...(fields.brand && brand.value ? { brand: suggestion.brandCandidates.find(item => String(item.id) === brand.value) } : {}),
    ...(fields.parameters && suggestion.parameters.length ? { parameters: suggestion.parameters.map(item => ({ ...item })) } : {})
  });
}

function clear() {
  requests.invalidate();
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
    <header><h3>识图填写</h3><p>上传一张商品图片，获取可编辑的信息建议。</p></header>
    <div class="recognition-fields">
      <div><Label :for="id + '-file'">识别图片</Label><input :id="id + '-file'" ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" :disabled="disabled || busy" @change="chooseFile" /><small>JPG、PNG、WebP，最多 5 MiB、2000 万像素。正式商品图片仍需在下方上传。</small></div>
      <div><Label :for="id + '-hint'">识别提示（选填）</Label><Input :id="id + '-hint'" v-model="hint" maxlength="120" :disabled="disabled || busy" placeholder="如：识别品牌、型号和外观" /></div>
    </div>
    <button type="button" class="outline" :disabled="disabled || busy || !file" @click="recognize"><Icon v-if="busy" icon="lucide:loader-circle" class="animate-spin" />{{ busy ? '正在识别，预计最多60秒…' : fileId ? '重新识别（复用已上传图片）' : '识别商品信息' }}</button>
    <p v-if="busy" role="status">正在生成建议，已填内容会保留，请等待结果。</p>
    <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}。可重试或继续手动填写。</AlertDescription></Alert>
    <div v-if="result" class="suggestions">
      <h4>确认需要填入的字段</h4>
      <label class="check"><input v-model="fields.title" type="checkbox" :disabled="disabled || !result.title" />商品标题</label>
      <Input v-model="result.title" maxlength="128" :disabled="disabled" aria-label="识别建议标题" />
      <label class="check"><input v-model="fields.description" type="checkbox" :disabled="disabled || !result.description" />外观描述（替换原画布或富文本详情）</label>
      <textarea v-model="result.description" rows="3" :disabled="disabled" aria-label="识别建议外观描述" />
      <label class="check"><input v-model="fields.category" type="checkbox" :disabled="disabled || !result.categoryCandidates.length" />主分类</label>
      <select v-if="result.categoryCandidates.length" v-model="category" :disabled="disabled" aria-label="识别建议分类"><option value="">保留原分类，稍后手动选择</option><option v-for="item in result.categoryCandidates" :key="String(item.id)" :value="String(item.id)">{{ item.name }}</option></select>
      <small v-else>未匹配到分类，请在表单中手动选择。</small>
      <label class="check"><input v-model="fields.brand" type="checkbox" :disabled="disabled || !result.brandCandidates.length" />商品品牌</label>
      <select v-if="result.brandCandidates.length" v-model="brand" :disabled="disabled" aria-label="识别建议品牌"><option value="">保留原品牌，稍后手动选择</option><option v-for="item in result.brandCandidates" :key="String(item.id)" :value="String(item.id)">{{ item.name }}</option></select>
      <small v-else>未匹配到品牌，请在表单中手动选择。</small>
      <label class="check"><input v-model="fields.parameters" type="checkbox" :disabled="disabled || !result.parameters.length" />商品展示参数</label>
      <dl v-if="result.parameters.length"><div v-for="(item, index) in result.parameters" :key="index"><dt>{{ item.name }}</dt><dd>{{ item.value }}</dd></div></dl><small v-else>没有识别到参数，保留已有输入。</small>
      <p>确认后将覆盖勾选字段的现有内容，其他字段保留。SKU、价格、库存、运费、税费、售后及图片请自行核对填写。</p>
      <div class="button-row"><button type="button" class="primary" :disabled="disabled" @click="apply">确认填入所选字段</button><button type="button" class="outline" @click="result = undefined">放弃建议</button></div>
    </div>
  </section>
</template>

<style scoped>
.image-prefill { padding:16px; margin-bottom:20px; border:1px solid var(--line); border-radius:8px; background:var(--soft); }.image-prefill header p,.image-prefill small,.image-prefill p { color:var(--muted); font-size:12px; line-height:1.6; }.recognition-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:12px 0; }.recognition-fields>div,.suggestions { display:grid; gap:8px; min-width:0; }input[type=file] { width:100%; min-width:0; font-size:12px; }.suggestions { margin-top:16px; }.check { display:flex; align-items:center; gap:8px; font-size:13px; }.check input { width:auto; }select,textarea { width:100%; min-width:0; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); }.button-row { flex-wrap:wrap; }dl>div { display:flex; gap:12px; font-size:13px; }dd { overflow-wrap:anywhere; }@media(max-width:700px) { .recognition-fields { grid-template-columns:1fr; } }
</style>
