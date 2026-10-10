<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CategoryPicker from '@/components/common/category-picker.vue';
import AmountInput from '@/components/common/amount-input.vue';
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message } from '@/lib/feedback';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import RichTextEditor from '@/components/common/rich-text-editor.vue';
import { fetchCreateCategoryOptions, isSelectableCategory, type CategoryOption } from '@/service/api/category';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { useUnsavedForm } from '@/composables/use-unsaved-form';
import { richTextError, sanitizeRichText } from '@/utils/rich-text';

interface FormState {
  title: string;
  categoryId?: string | number;
  price: number;
  shippingFee: number;
  tax: number;
  stock: number;
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  summary: string;
  description: string;
  images: string[];
}

interface SubmitForm extends Omit<FormState, 'images'> {
  images: Api.RealProduct.ProductImageParam[];
}

interface Props {
  submitting?: boolean;
  initialProduct?: Api.RealProduct.Record;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', form: SubmitForm): void }>();

const cascaderOptions = ref<CategoryOption[]>([]);
const categoryLoadError = ref('');
const categoryLoading = ref(false);
const uploading = ref(false);
const uploadedImageMap = new Map<string, Api.RealProduct.ProductImageParam>();
const categoryGuard = createLatestRequestGuard();

const form = reactive<FormState>({
  title: '',
  categoryId: undefined,
  price: 100,
  shippingFee: 0,
  tax: 0,
  stock: 10,
  aftersaleType: '7day-no-reason',
  overseasCustoms: false,
  summary: '',
  description: '',
  images: []
});
if (props.initialProduct) {
  const p = props.initialProduct;
  Object.assign(form, {
    title: p.title, categoryId: p.categoryId, price: Number(p.price),
    shippingFee: Number(p.shippingFee), tax: Number(p.tax), stock: p.stock,
    aftersaleType: p.aftersaleType === 'unknown' ? undefined : p.aftersaleType,
    overseasCustoms: p.overseasCustoms, summary: p.summary, description: p.description,
    images: (p.imageFiles || []).map(item => item.url)
  });
  (p.imageFiles || []).forEach(item => uploadedImageMap.set(item.url, { bucket: item.bucket, filePath: item.filePath }));
}
const { markInteracted, markSaved } = useUnsavedForm(() => form, () => undefined);
defineExpose({ markSaved, reloadCategories });

onMounted(async () => {
  await reloadCategories();
});

async function reloadCategories(showSuccess = false) {
  const isCurrent = categoryGuard.begin();
  categoryLoading.value = true;
  categoryLoadError.value = '';
  try {
    const options = await fetchCreateCategoryOptions({ signal: isCurrent.signal });
    if (!isCurrent()) return;
    cascaderOptions.value = options;
    if (showSuccess) Message.success('商品分类已刷新');
  } catch {
    if (!isCurrent()) return;
    cascaderOptions.value = [];
    categoryLoadError.value = '商品分类加载失败，请检查网络后重新加载。';
  } finally {
    if (isCurrent()) categoryLoading.value = false;
  }
}

onBeforeUnmount(categoryGuard.invalidate);

function submit() {
  if (uploading.value || props.submitting) return;
  if (!form.title.trim()) {
    Message.warning('请输入商品标题');
    return;
  }
  if (!form.aftersaleType) return Message.warning('请选择售后类型');
  if (!isSelectableCategory(cascaderOptions.value, form.categoryId)) {
    Message.warning('请选择商品分类');
    return;
  }
  if (!Number.isFinite(form.price) || form.price <= 0) {
    Message.warning('请输入正确的商品售价');
    return;
  }
  if (!Number.isFinite(form.shippingFee) || form.shippingFee < 0) {
    Message.warning('请输入正确的运费');
    return;
  }
  if (!Number.isFinite(form.tax) || form.tax < 0) {
    Message.warning('请输入正确的税费');
    return;
  }
  if (!Number.isInteger(form.stock) || form.stock < 0) {
    Message.warning('请输入正确的库存');
    return;
  }
  if (form.images.length === 0) {
    Message.warning('至少上传 1 张商品图');
    return;
  }
  const descriptionError = richTextError(form.description);
  if (descriptionError) return Message.warning(descriptionError);
  const images = form.images.map(url => uploadedImageMap.get(url)).filter(Boolean) as Api.RealProduct.ProductImageParam[];
  if (images.length !== form.images.length) {
    Message.warning('请重新上传商品图片');
    return;
  }
  emit('submit', { ...form, description: sanitizeRichText(form.description) || form.summary.trim(), images });
}

function onUploaded(items: Api.RealProduct.FileUploadResult[]) {
  items.forEach(item => {
    uploadedImageMap.set(item.url || item.filePath, { bucket: item.bucket, filePath: item.filePath });
  });
}

const previewCategory = computed(() => {
  function path(nodes: CategoryOption[], parents: string[] = []): string | undefined {
    for (const node of nodes) {
      const labels = [...parents, node.label];
      if (String(node.value) === String(form.categoryId)) return labels.join(' / ');
      const match = node.children && path(node.children, labels);
      if (match) return match;
    }
  }
  return path(cascaderOptions.value);
});

function selectAftersale(value: unknown) {
  if (typeof value === 'string' && ['none', '7day-no-reason', 'shop-warranty', 'national-warranty'].includes(value)) {
    form.aftersaleType = value as Api.Product.AftersaleType;
  }
}
</script>

<template>
  <form class="product-form" @submit.prevent="submit" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <div class="editor-fields">
    <section class="form-section"><header><span>01</span><div><h3>基本信息</h3><p>清晰的标题和分类，帮助顾客找到好物。</p></div></header>
      <div class="field"><Label for="product-title">商品标题 <span>*</span></Label><Input id="product-title" v-model="form.title" maxlength="128" :disabled="submitting" placeholder="如 iPhone 16 Pro Max 256GB 沙漠钛" /></div>
      <div class="field"><Label for="product-category">商品分类 <span>*</span></Label><div class="category-row"><CategoryPicker id="product-category" v-model="form.categoryId" :options="cascaderOptions" :loading="categoryLoading" :disabled="submitting" /><Button type="button" variant="outline" :disabled="categoryLoading || submitting" @click="reloadCategories(true)">{{ categoryLoading ? '读取中…' : '刷新分类' }}</Button></div><Alert v-if="categoryLoadError" variant="destructive"><AlertDescription>{{ categoryLoadError }}<Button type="button" variant="ghost" size="sm" :disabled="categoryLoading" @click="reloadCategories()">重新加载</Button></AlertDescription></Alert></div>
      <div class="field"><Label for="product-summary">商品简介</Label><Input id="product-summary" v-model="form.summary" :disabled="submitting" maxlength="30" placeholder="一行简介，30 字以内" /></div>
      <div class="field"><Label>商品图片 <span>*</span></Label><p class="helper">至少 1 张，最多 6 张。</p><AftersaleEvidenceUploader v-model="form.images" scene="PRODUCT" :max="6" :disabled="submitting" @uploading="uploading = $event" @uploaded="onUploaded" /></div>
    </section>
    <section class="form-section"><header><span>02</span><div><h3>售价与服务</h3><p>所有金额以 USDT 结算，编辑商品支持保留原有金额精度。</p></div></header>
      <div class="field-grid"><div class="field"><Label for="product-price">售价（USDT）<span>*</span></Label><AmountInput id="product-price" :model-value="form.price" :disabled="submitting" :min="0.00000001" :precision="initialProduct ? 8 : 2" placeholder="请输入商品售价" @update:model-value="form.price = $event ?? NaN" /></div><div class="field"><Label for="product-shipping">运费（USDT）</Label><AmountInput id="product-shipping" :model-value="form.shippingFee" :disabled="submitting" :min="0" :precision="initialProduct ? 8 : 2" placeholder="免运费填 0" @update:model-value="form.shippingFee = $event ?? NaN" /></div><div class="field"><Label for="product-tax">税费（USDT）</Label><AmountInput id="product-tax" :model-value="form.tax" :disabled="submitting" :min="0" :precision="initialProduct ? 8 : 2" placeholder="无税费填 0" @update:model-value="form.tax = $event ?? NaN" /></div></div>
      <div class="field-grid"><div class="field"><Label for="product-stock">库存 <span>*</span></Label><AmountInput id="product-stock" :model-value="form.stock" :disabled="submitting" :min="0" :precision="0" placeholder="请输入库存数量" @update:model-value="form.stock = $event ?? NaN" /></div><div class="field"><Label for="product-aftersale">售后类型 <span>*</span></Label><Select :model-value="form.aftersaleType" :disabled="submitting" @update:model-value="selectAftersale"><SelectTrigger id="product-aftersale" class="full"><SelectValue placeholder="请选择售后类型" /></SelectTrigger><SelectContent><SelectItem value="none">无售后</SelectItem><SelectItem value="7day-no-reason">7 天无理由</SelectItem><SelectItem value="shop-warranty">店铺保修</SelectItem><SelectItem value="national-warranty">全国联保</SelectItem></SelectContent></Select></div><div class="field"><Label for="product-overseas">海外过关</Label><div class="checkbox-row"><Checkbox id="product-overseas" :model-value="form.overseasCustoms" :disabled="submitting" @update:model-value="form.overseasCustoms = $event === true" /><Label for="product-overseas">海外直邮</Label></div><p class="helper">海外直邮过关后不可退。</p></div></div>
    </section>
    <section class="form-section"><header><span>03</span><div><h3>商品详情</h3><p>补充真实描述与图片，让顾客更安心。</p></div></header><div class="field"><Label>详细描述</Label><RichTextEditor v-model="form.description" :disabled="submitting" @uploading="uploading = $event" /></div></section>
    <footer class="form-actions"><span>{{ uploading ? '图片正在上传，请稍候。' : '提交后将进入平台审核。' }}</span><Button type="submit" :disabled="uploading || submitting">{{ submitting ? '正在提交…' : '提交审核' }}</Button></footer>
    </div>
    <aside class="draft-preview" aria-label="当前表单预览"><span class="eyebrow">LIVE PREVIEW</span><h3>顾客将看到</h3><img v-if="form.images.length" :src="form.images[0]" :alt="form.title || '当前上传的商品图片'" /><div v-else class="preview-empty"><Icon icon="lucide:image" /><span>上传商品图片后预览</span></div><small>{{ previewCategory || '尚未选择分类' }}</small><h4>{{ form.title || '尚未填写商品标题' }}</h4><p v-if="form.summary">{{ form.summary }}</p><strong>{{ Number.isFinite(form.price) ? formatAmount(form.price) : '—' }} <small>USDT</small></strong><div class="preview-service"><Icon icon="lucide:shield-check" />{{ ({ 'none': '无售后', '7day-no-reason': '7 天无理由', 'shop-warranty': '店铺保修', 'national-warranty': '全国联保' })[form.aftersaleType] || '尚未选择售后类型' }}</div><p class="preview-hint">当前表单预览，尚未发布。提交后进入平台审核。</p></aside>
  </form>
</template>

<style scoped>
.product-form { display:grid; grid-template-columns:minmax(0,1fr) 250px; gap:20px; align-items:start; }.editor-fields { display:grid; gap:26px; min-width:0; }.draft-preview { position:sticky; top:170px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:8px; padding:26px; min-width:0; }.draft-preview>.eyebrow { color:var(--yb-gold); font-size:10px; letter-spacing:1.6px; }.draft-preview h3 { font-size:17px; font-weight:600; margin:10px 0 20px; }.draft-preview>img,.preview-empty { width:100%; aspect-ratio:4/3; border-radius:7px; object-fit:cover; margin-bottom:18px; }.preview-empty { display:grid; align-content:center; justify-items:center; gap:12px; color:var(--yb-muted); background:var(--yb-fill); font-size:12px; }.preview-empty svg { width:28px; height:28px; }.draft-preview>small { font-size:11px; color:var(--yb-muted); }.draft-preview h4 { font-size:15px; margin:12px 0; line-height:1.7; overflow-wrap:anywhere; font-weight:600; }.draft-preview>p { color:var(--yb-muted); font-size:12px; line-height:1.8; margin:12px 0; overflow-wrap:anywhere; }.draft-preview>strong { font-family:var(--yb-font-body); font-size:23px; font-weight:550; }.draft-preview strong small { font-size:11px; font-weight:400; }.preview-service { margin-top:22px; padding-top:18px; border-top:1px solid var(--yb-hairline); display:flex; align-items:center; gap:7px; font-size:12px; color:var(--yb-primary); }.preview-service svg { width:16px; }.draft-preview>.preview-hint { margin-bottom:0; }.form-section { padding:28px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:8px; display:grid; gap:22px; }.form-section header { display:flex; align-items:flex-start; gap:14px; margin-bottom:5px; }.form-section header>span { padding-top:3px; color:var(--yb-muted); font-family:Georgia,serif; font-size:17px; font-style:italic; flex-shrink:0; }.form-section h3 { font-size:17px; font-weight:600; margin:0 0 6px; }.form-section header p { margin:0; font-size:12px; color:var(--yb-muted); }.field { display:grid; gap:10px; min-width:0; }.field label>span { color:var(--yb-danger); }.field-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }.category-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; }.full { width:100%; }.checkbox-row { display:flex; align-items:center; gap:10px; height:40px; }.checkbox-row label { cursor:pointer; font-weight:400; }.helper { color:var(--yb-muted); font-size:12px; margin:0; }.form-actions { position:sticky; bottom:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:24px 28px; background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:8px; box-shadow:0 -3px 12px rgb(0 0 0 / 3%); }.form-actions>span { color:var(--yb-muted); font-size:12px; }@media(max-width:1150px) { .product-form { grid-template-columns:1fr; }.draft-preview { display:none; }.field-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }@media(max-width:700px) { .field-grid { grid-template-columns:1fr; }.form-section { padding:20px; } }
</style>
