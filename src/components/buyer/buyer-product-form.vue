<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';
import UmIcon from '@/components/common/um-icon.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CategoryPicker from '@/components/common/category-picker.vue';
import AmountInput from '@/components/common/amount-input.vue';
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import RichTextEditor from '@/components/common/rich-text-editor.vue';
import BuyerDetailImages from './buyer-detail-images.vue';
import { buyerProductDraftKey, readBuyerProductDraft, type BuyerProductDraft } from './buyer-product-draft';
import { fetchCreateCategoryOptions, isSelectableCategory, type CategoryOption } from '@/service/api/category';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { createUnsavedFormState } from '@/composables/use-unsaved-form';
import { richTextError, sanitizeRichText } from '@/utils/rich-text';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import { exactDecimalNumber } from '@/components/wallet/decimal-amount';

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
const router = useRouter();
const userStore = useUserStore();
const draftOwnerId = userStore.currentUser?.id;
const draftProductId = props.initialProduct?.id;
const draftAudience = userStore.currentAudience;
const draftKey = draftOwnerId === undefined ? undefined : buyerProductDraftKey(draftOwnerId, draftProductId);
const active = ref(true);
const currentContext = computed(() => active.value && draftOwnerId !== undefined
  && String(userStore.currentUser?.id) === String(draftOwnerId)
  && userStore.currentAudience === draftAudience && userStore.isBuyerActive
  && String(props.initialProduct?.id) === String(draftProductId));
const savedDraft = ref<BuyerProductDraft>();
const draftError = ref('');
const draftRevision = ref(0);
let savedDraftRaw: string | undefined;
let submitted = false;
const leaveVisible = ref(false);
let leaveDecision: Promise<boolean> | undefined;
let resolveLeave: ((value: boolean) => void) | undefined;

const cascaderOptions = ref<CategoryOption[]>([]);
const categoryLoadError = ref('');
const categoryLoading = ref(false);
const uploadStates = reactive({ product: false, description: false, details: false });
const uploading = computed(() => uploadStates.product || uploadStates.description || uploadStates.details);
const draftBlocked = computed(() => props.submitting || uploading.value || !currentContext.value);
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
const amountTexts = reactive({ price:'100', shippingFee:'0', tax:'0' });
if (props.initialProduct) {
  const p = props.initialProduct;
  Object.assign(amountTexts, { price:String(p.price), shippingFee:p.shippingFee === undefined ? '' : String(p.shippingFee), tax:p.tax === undefined ? '' : String(p.tax) });
  Object.assign(form, {
    title: p.title, categoryId: p.categoryId, price: exactDecimalNumber(amountTexts.price).value ?? NaN,
    shippingFee: exactDecimalNumber(amountTexts.shippingFee, true).value ?? NaN,
    tax: exactDecimalNumber(amountTexts.tax, true).value ?? NaN, stock: p.stock,
    aftersaleType: p.aftersaleType === 'unknown' ? undefined : p.aftersaleType,
    overseasCustoms: p.overseasCustoms, summary: p.summary, description: p.description,
    images: (p.imageFiles || []).map(item => item.url)
  });
  (p.imageFiles || []).forEach(item => uploadedImageMap.set(item.url, { bucket: item.bucket, filePath: item.filePath }));
}
const { dirty, markInteracted, markSaved: markFormSaved } = createUnsavedFormState(() => ({ ...form, amountTexts:{...amountTexts} }));

function readDraft() {
  if (!draftKey || !currentContext.value) return;
  try {
    const raw = localStorage.getItem(draftKey);
    savedDraft.value = raw ? readBuyerProductDraft(raw, draftOwnerId!, draftProductId) : undefined;
    savedDraftRaw = raw || undefined;
    draftError.value = '';
  } catch {
    savedDraft.value = undefined;
    draftError.value = '本地草稿读取失败或资料不完整，现有表单保持不变。';
  }
}

function saveDraft() {
  if (draftBlocked.value || !draftKey) return false;
  try {
    const descriptionIssue = richTextError(form.description);
    if (descriptionIssue) {
      draftError.value = descriptionIssue + '，请精简后保存草稿';
      Message.warning(draftError.value);
      return false;
    }
    const description = sanitizeRichText(form.description);
    const detail = document.createElement('div');
    detail.innerHTML = description;
    const imageUrls = new Set([...form.images, ...Array.from(detail.querySelectorAll('img'), image => image.getAttribute('src') || '')]);
    const draft: BuyerProductDraft = {
      version:1, ownerId:draftOwnerId!, productId:draftProductId, savedAt:Date.now(),
      form:{ title:form.title, categoryId:form.categoryId, price:Number.isFinite(form.price) ? form.price : null,
        shippingFee:Number.isFinite(form.shippingFee) ? form.shippingFee : null, tax:Number.isFinite(form.tax) ? form.tax : null,
        stock:Number.isFinite(form.stock) ? form.stock : null, aftersaleType:form.aftersaleType, overseasCustoms:form.overseasCustoms,
        summary:form.summary, description, images:[...form.images], amountTexts:{...amountTexts} },
      imageFiles:Array.from(uploadedImageMap, ([url,image]) => ({ url,...image })).filter(image => imageUrls.has(image.url))
    };
    const raw = JSON.stringify(draft);
    const validated = readBuyerProductDraft(raw, draftOwnerId!, draftProductId);
    localStorage.setItem(draftKey, raw);
    if (localStorage.getItem(draftKey) !== raw) throw new Error('草稿未保存');
    savedDraft.value = validated;
    savedDraftRaw = raw;
    draftError.value = '';
    markFormSaved();
    Message.success('草稿已保存在当前浏览器');
    return true;
  } catch {
    draftError.value = '本地草稿保存失败，请检查浏览器存储或商品图片上传信息后重试。';
    Message.error(draftError.value);
    return false;
  }
}

function restoreDraft() {
  if (draftBlocked.value || !draftKey) return;
  readDraft();
  const draft = savedDraft.value;
  if (!draft) return;
  if (!draft.form.amountTexts && props.initialProduct && [props.initialProduct.price, props.initialProduct.shippingFee, props.initialProduct.tax]
    .some((value, index) => value !== undefined && exactDecimalNumber(value, index !== 0).value === undefined)) {
    draftError.value = '旧草稿缺少原始金额文本，无法安全恢复，请核对当前商品金额后重新保存草稿。';
    Message.warning(draftError.value);
    return;
  }
  const description = sanitizeRichText(draft.form.description);
  const issue = richTextError(description);
  if (issue) { draftError.value = issue + '，草稿未恢复'; return; }
  markInteracted();
  uploadedImageMap.clear();
  draft.imageFiles.forEach(image => uploadedImageMap.set(image.url, { bucket:image.bucket, filePath:image.filePath }));
  Object.assign(form, { ...draft.form, price:draft.form.price ?? NaN, shippingFee:draft.form.shippingFee ?? NaN,
    tax:draft.form.tax ?? NaN, stock:draft.form.stock ?? NaN, description, images:[...draft.form.images] });
  Object.assign(amountTexts, draft.form.amountTexts || { price:draft.form.price === null ? '' : String(draft.form.price),
    shippingFee:draft.form.shippingFee === null ? '' : String(draft.form.shippingFee), tax:draft.form.tax === null ? '' : String(draft.form.tax) });
  draftRevision.value += 1;
  Message.success('已恢复本地草稿，请核对当前分类与商品状态后再提交');
}

function decideLeave(leave: boolean) {
  leaveVisible.value = false;
  const resolve = resolveLeave;
  resolveLeave = undefined;
  leaveDecision = undefined;
  resolve?.(leave);
}
async function confirmLeave() {
  if (submitted || !currentContext.value) return true;
  await nextTick();
  if (submitted || !currentContext.value) return true;
  if (props.submitting || uploading.value) { Message.warning('提交或上传正在处理，请稍候再离开'); return false; }
  if (!dirty.value || !currentContext.value) return true;
  if (!leaveDecision) {
    leaveVisible.value = true;
    leaveDecision = new Promise(resolve => { resolveLeave = resolve; });
  }
  return leaveDecision;
}
function discardAndLeave() { if (!draftBlocked.value) { markFormSaved(); decideLeave(true); } }
function saveAndLeave() { if (saveDraft()) decideLeave(true); }
function markSaved() { markFormSaved(); decideLeave(true); }
function markSubmitted() {
  submitted = true;
  markSaved();
  if (!draftKey || !currentContext.value) return;
  try {
    if (savedDraftRaw && localStorage.getItem(draftKey) === savedDraftRaw) localStorage.removeItem(draftKey);
    savedDraft.value = undefined;
    savedDraftRaw = undefined;
  } catch { Message.warning('商品已提交，本地草稿清理失败；请勿将草稿视为未提交的依据'); }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (submitted || !currentContext.value) return;
  if (!dirty.value && !uploading.value && !props.submitting) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate((to,from) => JSON.stringify(to.params) === JSON.stringify(from.params) ? true : confirmLeave());
watch([() => userStore.currentUser?.id, () => userStore.currentAudience], () => {
  savedDraft.value = undefined;
  draftRevision.value += 1;
  decideLeave(false);
}, { flush:'sync' });
defineExpose({ markSaved, markSubmitted, reloadCategories });

onMounted(async () => {
  readDraft();
  window.addEventListener('beforeunload', beforeUnload);
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

onBeforeUnmount(() => { active.value = false; categoryGuard.invalidate(); window.removeEventListener('beforeunload', beforeUnload); decideLeave(false); });

function submit() {
  if (!currentContext.value) return;
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
  for (const key of ['price', 'shippingFee', 'tax'] as const) {
    const result = exactDecimalNumber(amountTexts[key], key !== 'price');
    if (result.value === undefined || result.value !== form[key]) {
      Message.warning(result.error || '金额输入尚未核对，请重新确认');
      return;
    }
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
  if (!currentContext.value || props.submitting) return;
  items.forEach(item => {
    const reference = item.url || item.filePath;
    if (item.bucket && item.filePath && reference) uploadedImageMap.set(reference, { bucket: item.bucket, filePath: item.filePath });
  });
}

function updateDescription(value: string) {
  if (currentContext.value && !props.submitting) form.description = value;
}
function updateProductImages(value: string[]) {
  if (currentContext.value && !props.submitting) form.images = value;
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

</script>

<template>
  <form class="buyer-editor" @submit.prevent="submit" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <div class="buyer-editor-fields">
    <div v-if="savedDraft" class="buyer-draft"><span>发现一份本地草稿</span><button type="button" :disabled="draftBlocked" @click="restoreDraft">恢复草稿 →</button></div>
    <p v-if="draftError" class="buyer-rejection" role="alert">{{ draftError }}</p>
    <section class="paper"><header class="buyer-number-heading"><span>01</span><div><h2>商品信息</h2><p>清晰的图片与准确的信息，让选择更容易。</p></div></header>
      <div class="buyer-field"><Label for="product-title">商品标题 <span>*</span></Label><Input id="product-title" v-model="form.title" maxlength="128" :disabled="submitting" placeholder="如 iPhone 16 Pro Max 256GB 沙漠钛" /></div>
      <div class="buyer-two-cols"><div class="buyer-field"><Label for="product-category">商品分类 <span>*</span></Label><div class="category-row"><CategoryPicker id="product-category" v-model="form.categoryId" :options="cascaderOptions" :loading="categoryLoading" :disabled="submitting" /><Button class="outline" type="button" variant="outline" :disabled="categoryLoading || submitting" @click="reloadCategories(true)">{{ categoryLoading ? '读取中…' : '刷新分类' }}</Button></div><Alert v-if="categoryLoadError" variant="destructive"><AlertDescription>{{ categoryLoadError }}<Button type="button" variant="ghost" size="sm" :disabled="categoryLoading" @click="reloadCategories()">重新加载</Button></AlertDescription></Alert></div><div class="buyer-field"><span>没有合适的分类？</span><button class="outline" type="button" :disabled="draftBlocked" @click="router.push('/buyer/categories/apply')">申请新增分类 →</button></div></div>
      <div class="buyer-field"><Label for="product-summary">商品简介</Label><Input id="product-summary" v-model="form.summary" :disabled="submitting" maxlength="30" placeholder="一行简介，30 字以内" /><small>{{ form.summary.length }} / 30</small></div>
      <div class="buyer-field"><Label>商品图片 <span>*</span></Label><p class="helper">至少 1 张，最多 6 张。</p><AftersaleEvidenceUploader :key="draftRevision" class="buyer-upload-grid" :model-value="form.images" @update:model-value="updateProductImages" :cover-mode="true" scene="PRODUCT" :max="6" :disabled="submitting || uploadStates.description || uploadStates.details || !currentContext" @uploading="uploadStates.product = $event" @uploaded="onUploaded" /></div>
    </section>
    <section class="paper"><header class="buyer-number-heading"><span>02</span><div><h2>价格与配送</h2><p>按 USDT 结算，运费与税费单独展示。</p></div></header>
      <div class="buyer-two-cols"><div class="buyer-field"><Label for="product-price">售价（USDT）<span>*</span></Label><AmountInput id="product-price" :exact-decimal="true" v-model:raw-value="amountTexts.price" :model-value="form.price" :disabled="submitting" :min="0.00000001" :precision="initialProduct ? 8 : 2" placeholder="请输入商品售价" @update:model-value="form.price = $event ?? NaN" /></div><div class="buyer-field"><Label for="product-stock">库存 <span>*</span></Label><AmountInput id="product-stock" :model-value="form.stock" :disabled="submitting" :min="0" :precision="0" placeholder="请输入库存数量" @update:model-value="form.stock = $event ?? NaN" /></div><div class="buyer-field"><Label for="product-shipping">运费（USDT）</Label><AmountInput id="product-shipping" :exact-decimal="true" v-model:raw-value="amountTexts.shippingFee" :model-value="form.shippingFee" :disabled="submitting" :min="0" :precision="initialProduct ? 8 : 2" placeholder="免运费填 0" @update:model-value="form.shippingFee = $event ?? NaN" /></div><div class="buyer-field"><Label for="product-tax">税费（USDT）</Label><AmountInput id="product-tax" :exact-decimal="true" v-model:raw-value="amountTexts.tax" :model-value="form.tax" :disabled="submitting" :min="0" :precision="initialProduct ? 8 : 2" placeholder="无税费填 0" @update:model-value="form.tax = $event ?? NaN" /></div></div>
      <label class="buyer-field" for="product-aftersale">售后类型 *<select id="product-aftersale" v-model="form.aftersaleType" :disabled="submitting"><option value="none">无售后</option><option value="7day-no-reason">7 天无理由</option><option value="shop-warranty">店铺保修</option><option value="national-warranty">全国联保</option></select></label>
      <label class="buyer-switch" for="product-overseas"><span><b>海外直邮</b><small>海外过关后不可退，购买时向顾客提示。</small></span><input id="product-overseas" v-model="form.overseasCustoms" type="checkbox" role="switch" :disabled="submitting" /></label>
    </section>
    <section class="paper"><header class="buyer-number-heading"><span>03</span><div><h2>商品详情</h2><p>说明版本、材质、配件与使用信息。</p></div></header><div class="buyer-field"><Label>详细描述</Label><RichTextEditor :key="draftRevision" class="buyer-rich-editor" :context-key="(draftKey || 'no-owner') + ':' + draftRevision" :model-value="form.description" @update:model-value="updateDescription" :disabled="submitting || uploadStates.product || uploadStates.details || !currentContext" @uploading="uploadStates.description = $event" @uploaded="onUploaded" /></div><BuyerDetailImages :model-value="form.description" @update:model-value="updateDescription" :context="(draftKey || 'no-owner') + ':' + draftRevision" :disabled="submitting || uploadStates.product || uploadStates.description || !currentContext" @uploading="uploadStates.details = $event" @uploaded="onUploaded" /></section>
    <p v-if="uploading" class="buyer-inline-hint" role="status">图片正在上传，请稍候。</p>
    <footer class="buyer-form-footer"><button type="button" class="outline" :disabled="draftBlocked" @click="saveDraft">保存本地草稿</button><button type="submit" class="primary" :disabled="draftBlocked">{{ submitting ? '正在提交…' : '提交审核' }}<UmIcon name="arrow" /></button></footer>
    </div>
    <aside class="paper buyer-live-preview" aria-label="当前表单预览"><span class="eyebrow">LIVE PREVIEW</span><h3>顾客将看到</h3><img v-if="form.images.length" :src="form.images[0]" :alt="form.title || '当前上传的商品图片'" /><div v-else class="preview-empty"><UmIcon name="bag" /><span>上传商品图片后预览</span></div><small>{{ previewCategory || '尚未选择分类' }}</small><h3>{{ form.title || '尚未填写商品标题' }}</h3><p v-if="form.summary">{{ form.summary }}</p><strong>{{ Number.isFinite(form.price) ? formatAmount(form.price) : '—' }} <small>USDT</small></strong><div class="preview-service"><UmIcon name="shield" />{{ ({ 'none': '无售后', '7day-no-reason': '7 天无理由', 'shop-warranty': '店铺保修', 'national-warranty': '全国联保' })[form.aftersaleType] || '尚未选择售后类型' }}</div><p class="preview-hint">当前表单预览，尚未发布。提交后进入平台审核。</p></aside>
    <a-modal content-class="buyer-dialog" v-model:visible="leaveVisible" title="保存商品草稿？" :footer="false" @cancel="decideLeave(false)"><p>还有未保存的商品资料，可以保存草稿后离开。</p><p v-if="draftError" class="error-text" role="alert">{{ draftError }}</p><div class="button-row"><button type="button" class="outline" @click="decideLeave(false)">继续编辑</button><button type="button" class="outline" :disabled="draftBlocked" @click="discardAndLeave">放弃修改</button><button type="button" class="primary" :disabled="draftBlocked" @click="saveAndLeave">保存并离开</button></div></a-modal>
  </form>
</template>

<style scoped>
.buyer-editor-fields { min-width:0; }
.category-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; }
.helper { color:var(--muted); }
.preview-empty { display:grid; aspect-ratio:1; align-content:center; justify-items:center; gap:12px; background:var(--soft); border-radius:8px; margin:15px 0; }
.preview-service { display:flex; gap:8px; border-top:1px solid var(--line); margin-top:20px; padding-top:18px; }
.buyer-live-preview h3 { overflow-wrap:anywhere; }
.buyer-live-preview > img { width:100%; }
.error-text { color:var(--yb-danger); }
.buyer-editor :deep(.buyer-upload-grid) { display:flex; gap:10px; flex-wrap:wrap; margin:6px 0; }
.buyer-editor :deep(.buyer-upload-grid .cell),.buyer-editor :deep(.buyer-upload-grid .add) { width:86px; height:86px; border-radius:8px; }
.buyer-editor :deep(.buyer-upload-grid .cell > .preview) { position:static; inset:auto; background:none; }
.buyer-editor :deep(.buyer-upload-grid > .failure) { width:100%; aspect-ratio:auto; overflow:visible; }
.buyer-editor :deep(.buyer-rich-editor) { border:1px solid var(--ui-dfe4d9,#dfe4d9); border-radius:8px; }
.buyer-editor :deep(.buyer-rich-editor .toolbar) { gap:3px; padding:8px; background:var(--ui-f4f6ed,#f4f6ed); border-bottom-color:var(--ui-e7ebdf,#e7ebdf); }
.buyer-editor :deep(.buyer-rich-editor .toolbar button) { padding:7px 8px; min-width:30px; font-size:11px; border-radius:4px; background:none; }
.buyer-editor :deep(.buyer-rich-editor .tiptap) { min-height:220px; padding:16px; font-size:13px; line-height:1.9; }
.buyer-editor :deep(.buyer-rich-editor .tiptap p) { margin:6px 0; }
@media (min-width:701px) and (max-width:760px) { .buyer-form-footer { bottom:calc(61px + env(safe-area-inset-bottom)); } }
@media (max-width:900px) { .buyer-two-cols:has(.category-row) { grid-template-columns:minmax(0,1fr); } }
@media(max-width:700px) { .buyer-editor :deep(.buyer-upload-grid .cell),.buyer-editor :deep(.buyer-upload-grid .add) { width:76px; height:76px; } }
@media(max-width:700px) { .category-row { grid-template-columns:minmax(0,1fr); } }
</style>
