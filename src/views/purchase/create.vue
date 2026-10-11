<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AmountInput from '@/components/common/amount-input.vue';
import CategoryPicker from '@/components/common/category-picker.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useUnsavedForm } from '@/composables/use-unsaved-form';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import AddressSelector from '@/components/common/address-selector.vue';
import { fetchCreateCategoryOptions, isSelectableCategory, type CategoryOption } from '@/service/api/category';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const form = reactive<{
  productTitle: string;
  productDescription: string;
  categoryId?: string | number;
  addressId?: string | number;
  budgetAmount: number;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  evidenceUrls: string[];
}>({
  productTitle: (route.query.productHint as string) || '',
  productDescription: '',
  categoryId: typeof route.query.categoryId === 'string' ? route.query.categoryId : undefined,
  addressId: undefined,
  budgetAmount: 500,
  expectedDays: 14,
  overseasCustoms: false,
  aftersaleType: '7day-no-reason',
  appeal: '',
  evidenceUrls: []
});

const submitting = ref(false);
const { markInteracted, markSaved, acceptAutomaticField } = useUnsavedForm(() => form,
  () => `${String(userStore.currentUser?.id)}:${userStore.currentAudience}`);

function cancelCreate() {
  const back = router.options.history.state.back;
  if (typeof back === 'string' && ['/purchase', '/purchase/hall'].includes(back.split(/[?#]/)[0])) router.back();
  else void router.replace('/purchase/hall');
}
const confirmationOpen = ref(false);
const addressValid = ref(false);
const uploading = ref(false);
const categoryLoadError = ref('');
const categoryLoading = ref(false);
const categoryGuard = createLatestRequestGuard();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

const cascaderOptions = ref<CategoryOption[]>([]);
onMounted(reloadCategories);

async function reloadCategories() {
  const isCurrent = categoryGuard.begin();
  categoryLoading.value = true;
  categoryLoadError.value = '';
  try {
    const options = await fetchCreateCategoryOptions({ signal: isCurrent.signal });
    if (isCurrent()) cascaderOptions.value = options;
  } catch {
    if (!isCurrent()) return;
    cascaderOptions.value = [];
    categoryLoadError.value = '商品分类加载失败，请检查网络后重新加载。';
  } finally {
    if (isCurrent()) categoryLoading.value = false;
  }
}

onBeforeUnmount(() => {
  writeVersion += 1;
  confirmationModal?.close();
  categoryGuard.invalidate();
});

watch([() => userStore.currentUser?.id, () => userStore.currentAudience], ([nextUserId, nextAudience], [previousUserId, previousAudience]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience) return;
  writeVersion += 1;
  confirmationModal?.close();
  submitting.value = false;
  confirmationOpen.value = false;
  if (String(nextUserId) !== String(previousUserId)) {
    form.addressId = undefined;
    addressValid.value = false;
    form.productTitle = '';
    form.productDescription = '';
    form.categoryId = undefined;
    form.budgetAmount = 500;
    form.expectedDays = 14;
    form.overseasCustoms = false;
    form.aftersaleType = '7day-no-reason';
    form.appeal = '';
    form.evidenceUrls = [];
  }
});

const CNY_RATE = 7.18;
const budgetCny = computed(() => Number.isFinite(form.budgetAmount)
  ? formatAmount((form.budgetAmount * CNY_RATE).toFixed(2))
  : '—');

function preventImplicitSubmit(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (['text', 'number', 'search', 'tel', 'email'].includes(target.type)) {
    event.preventDefault();
  }
}

async function submit() {
  if (submitting.value || confirmationOpen.value || uploading.value) return;
  if (!form.productTitle.trim()) {
    Message.warning('请填写商品标题');
    return;
  }
  const categoryId = form.categoryId;
  if (categoryId === undefined || !isSelectableCategory(cascaderOptions.value, categoryId)) {
    Message.warning('请选择商品分类');
    return;
  }
  if (!addressValid.value || form.addressId === undefined || form.addressId === null || form.addressId === '') {
    Message.warning('请等待地址读取成功后选择收货地址');
    return;
  }
  if (!Number.isFinite(form.budgetAmount) || form.budgetAmount < 10) {
    Message.warning('求购预算不得低于 10 U');
    return;
  }
  if (!Number.isFinite(form.expectedDays) || form.expectedDays < 1 || form.expectedDays > 60) {
    Message.warning('期望发货天数需为 1-60 天');
    return;
  }
  const addressId = form.addressId;
  if (form.appeal.trim().length < 10) {
    Message.warning('求购说明至少 10 字');
    return;
  }
  if (!userStore.currentUser) return;

  const requestedUserId = userStore.currentUser.id;
  const params = {
    productTitle: form.productTitle.trim(),
    productDescription: form.productDescription.trim() || form.appeal.trim(),
    categoryId,
    addressId,
    budgetAmount: String(form.budgetAmount),
    expectedDays: form.expectedDays,
    overseasCustoms: form.overseasCustoms,
    aftersaleType: form.aftersaleType,
    appeal: form.appeal.trim(),
    evidenceUrls: [...form.evidenceUrls]
  };
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId);

  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '确认发起求购？',
    content: `预算 U ${form.budgetAmount} · 期望 ${form.expectedDays} 天内发货`,
    onCancel() {
      if (!isCurrentWrite()) return;
      confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentWrite() || !addressValid.value || String(form.addressId) !== String(addressId)) {
        if (isCurrentWrite()) {
          confirmationOpen.value = false;
          Message.warning('收货地址已变化，请重新确认');
        }
        return;
      }
      submitting.value = true;
      try {
        try {
          const categories = await fetchCreateCategoryOptions();
          if (!isCurrentWrite()) return;
          if (!addressValid.value || String(form.addressId) !== String(addressId)) {
            Message.warning('收货地址已变化，请重新确认');
            return;
          }
          cascaderOptions.value = categories;
          if (!isSelectableCategory(categories, categoryId)) {
            Message.warning('商品分类已不可用，请重新选择');
            return;
          }
          const r = await purchaseApi.createPurchase(params);
          if (r && isCurrentWrite()) {
            markSaved();
            Message.success('求购已发起');
            router.push({ name: 'purchase-detail', params: { id: String(r) } });
          }
        } catch {
          // 请求层已展示错误，保留表单内容供用户修正后重试。
        }
      } finally {
        if (operation === writeVersion) {
          submitting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}


function selectAftersale(value: unknown) {
  if (value === 'none' || value === '7day-no-reason' || value === 'shop-warranty' || value === 'national-warranty') form.aftersaleType = value;
}

</script>

<template>

  <div class="purchase-create-page">
    <header class="page-heading"><div><span class="eyebrow">MAKE A WISH COME TRUE</span><h1>发起求购</h1><p>说清楚商品要求，让买手找到你的心仪好物。</p></div><Button type="button" variant="ghost" :disabled="submitting || confirmationOpen || uploading" @click="router.push('/purchase/hall')"><Icon icon="lucide:arrow-left" width="16" />返回大厅</Button></header>
    <form @submit.prevent @keydown.enter.capture="preventImplicitSubmit" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
      <fieldset :disabled="submitting || confirmationOpen" class="form-fields">
        <section class="paper"><h2><span>01</span>基本信息</h2>
          <div class="field"><label for="request-title">商品标题 <em>*</em></label><Input id="request-title" v-model="form.productTitle" placeholder="填写商品名称、规格、版本与颜色" :disabled="submitting || confirmationOpen" /></div>
          <div class="field"><span class="field-label">收货地址 <em>*</em></span><AddressSelector v-if="userStore.currentUser" v-model="form.addressId" :user-id="userStore.currentUser.id" @validity="addressValid = $event" @initialized="acceptAutomaticField('addressId', $event)" /></div>
          <div class="field"><label for="request-category">商品分类 <em>*</em></label><CategoryPicker id="request-category" v-model="form.categoryId" :options="cascaderOptions" :loading="categoryLoading" :disabled="submitting || confirmationOpen" placeholder="选择分类（支持一至五级）" /><p v-if="categoryLoadError" class="error" role="alert">{{ categoryLoadError }}<Button type="button" variant="link" size="sm" :disabled="categoryLoading" @click="reloadCategories">重新加载</Button></p></div>
          <div class="field"><label for="request-description">商品描述 <small>可选</small></label><Textarea id="request-description" v-model="form.productDescription" :rows="3" placeholder="详细描述商品规格、版本、颜色等" /></div>
        </section>
        <section class="paper"><h2><span>02</span>预算与期限</h2><div class="form-grid">
          <div class="field"><label for="request-budget">预算 · USDT <em>*</em></label><AmountInput id="request-budget" :model-value="form.budgetAmount" :min="10" :precision="2" placeholder="请输入预算金额" @update:model-value="form.budgetAmount = $event ?? NaN" /><p class="hint">≈ ¥{{ budgetCny }} · 1 USDT = ¥{{ CNY_RATE.toFixed(2) }}<br>非实时参考折算，以 USDT 结算</p></div>
          <div class="field"><label for="request-expected-days">期望发货天数 <em>*</em></label><AmountInput id="request-expected-days" :model-value="form.expectedDays" :min="1" :max="60" :precision="0" placeholder="期望发货天数" @update:model-value="form.expectedDays = $event ?? NaN" /><p class="hint">可填写 1–60 天。</p></div>
        </div></section>
        <section class="paper"><h2><span>03</span>物流与售后</h2>
          <div class="field"><label for="request-aftersale">售后类型 <em>*</em></label><Select :model-value="form.aftersaleType" :disabled="submitting || confirmationOpen" @update:model-value="selectAftersale"><SelectTrigger id="request-aftersale"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">无售后</SelectItem><SelectItem value="7day-no-reason">7 天无理由</SelectItem><SelectItem value="shop-warranty">店铺保修</SelectItem><SelectItem value="national-warranty">全国联保</SelectItem></SelectContent></Select></div>
          <div class="checkbox-field"><Checkbox id="request-overseas" :model-value="form.overseasCustoms" :disabled="submitting || confirmationOpen" @update:model-value="form.overseasCustoms = $event === true" /><label for="request-overseas">海外过关<small>海外直邮过关后不可退</small></label></div>
          <div class="field"><label for="request-appeal">求购说明 <em>*</em></label><Textarea id="request-appeal" v-model="form.appeal" :rows="5" :maxlength="500" placeholder="至少 10 字，说明版本、颜色、采购地区等特殊要求" /><p class="counter">{{ form.appeal.length }}/500 · 至少 10 字</p></div>
          <div class="field"><span class="field-label">参考图片 <small>可选，最多 4 张</small></span><AftersaleEvidenceUploader v-model="form.evidenceUrls" scene="DEMAND" :max="4" :disabled="submitting || confirmationOpen" @uploading="uploading = $event" /></div>
        </section>
      </fieldset>
      <div class="actions"><Button type="button" variant="secondary" :disabled="submitting || confirmationOpen || uploading" @click="cancelCreate">取消</Button><Button type="button" :disabled="submitting || confirmationOpen || uploading || !addressValid" @click="submit"><Icon v-if="submitting" icon="lucide:loader-circle" class="animate-spin" width="16" />{{ submitting || confirmationOpen ? '提交中…' : '提交求购' }}<Icon v-if="!submitting && !confirmationOpen" icon="lucide:arrow-right" width="16" /></Button></div>
    </form>
  </div>

</template>

<style scoped>

.purchase-create-page { max-width:670px; margin:0 auto; padding-bottom:32px; }.page-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.page-heading h1 { font-size:28px; font-weight:650; margin:6px 0; }.page-heading p { font-size:14px; color:var(--yb-muted); margin:0; }.form-fields { padding:28px 32px 0; border:1px solid var(--yb-hairline); border-bottom:0; border-radius:8px 8px 0 0; margin:0; min-width:0; background:var(--yb-paper); }.paper { padding:0 0 24px; margin-bottom:24px; border:0; border-bottom:1px solid var(--yb-hairline); background:transparent; }.paper h2 { font-size:16px; font-weight:600; display:flex; align-items:center; gap:12px; margin:0 0 24px; }.paper h2 span { font-family:var(--yb-font-mono); font-size:13px; color:var(--yb-gold); }.field { display:flex; flex-direction:column; gap:8px; margin-bottom:22px; }.field:last-child { margin-bottom:0; }.field label,.field-label { font-size:14px; color:var(--yb-ink); }.field em,.field-label em { font-style:normal; color:var(--yb-danger); }.field small,.field-label small { font-size:12px; color:var(--yb-muted); margin-left:8px; }.field textarea { resize:vertical; min-height:96px; }.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }.form-grid .field { margin-bottom:0; min-width:0; }.hint,.counter { font-size:12px; color:var(--yb-muted); line-height:1.6; margin:0; }.counter { text-align:right; }.checkbox-field { display:flex; align-items:flex-start; gap:12px; margin:24px 0; }.checkbox-field>button { margin-top:4px; }.checkbox-field label { font-size:14px; cursor:pointer; }.checkbox-field small { display:block; color:var(--yb-muted); font-size:12px; }.error { margin:0; color:var(--yb-danger); font-size:13px; }.actions { display:flex; justify-content:flex-end; gap:16px; padding:0 32px 28px; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-top:0; border-radius:0 0 8px 8px; }.actions>button { min-width:100px; }

</style>
