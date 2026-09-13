<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import { fetchCreateCategoryOptions, isSelectableCategory, type CategoryOption } from '@/service/api/category';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { useUnsavedForm } from '@/composables/use-unsaved-form';

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

async function reloadCategories() {
  const isCurrent = categoryGuard.begin();
  categoryLoadError.value = '';
  try {
    const options = await fetchCreateCategoryOptions({ signal: isCurrent.signal });
    if (isCurrent()) cascaderOptions.value = options;
  } catch {
    if (!isCurrent()) return;
    cascaderOptions.value = [];
    categoryLoadError.value = '商品分类加载失败，请检查网络后重新加载。';
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
  const images = form.images.map(url => uploadedImageMap.get(url)).filter(Boolean) as Api.RealProduct.ProductImageParam[];
  if (images.length !== form.images.length) {
    Message.warning('请重新上传商品图片');
    return;
  }
  emit('submit', { ...form, images });
}

function onUploaded(items: Api.RealProduct.FileUploadResult[]) {
  items.forEach(item => {
    uploadedImageMap.set(item.url || item.filePath, { bucket: item.bucket, filePath: item.filePath });
  });
}
</script>

<template>
  <a-form :model="form" layout="vertical" @pointerdown.capture="markInteracted" @keydown.capture="markInteracted" @focusin.capture="markInteracted">
    <a-form-item label="商品标题" required>
      <a-input v-model="form.title" :max-length="128" placeholder="如 iPhone 16 Pro Max 256GB 沙漠钛" size="large" />
    </a-form-item>

    <a-form-item label="商品分类" required>
      <a-cascader
        v-model="form.categoryId"
        :options="cascaderOptions"
        placeholder="选择分类"
        expand-trigger="hover"
        allow-clear
      />
      <div v-if="categoryLoadError" class="hint">{{ categoryLoadError }} <a-link role="button" tabindex="0" @click="reloadCategories" @keydown.enter="reloadCategories" @keydown.space.prevent="reloadCategories">重新加载</a-link></div>
    </a-form-item>

    <a-row :gutter="12">
      <a-col :span="8">
        <a-form-item label="售价 (USDT)" required>
          <a-input-number v-model="form.price" :min="0.00000001" :precision="initialProduct ? 8 : 2" size="large" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="运费 (USDT)">
          <a-input-number v-model="form.shippingFee" :min="0" :precision="initialProduct ? 8 : 2" size="large" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="税费 (USDT)">
          <a-input-number v-model="form.tax" :min="0" :precision="initialProduct ? 8 : 2" size="large" />
        </a-form-item>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="8">
        <a-form-item label="库存" required>
          <a-input-number v-model="form.stock" :min="0" size="large" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="售后类型" required>
          <a-select v-model="form.aftersaleType" size="large">
            <a-option value="none">无售后</a-option>
            <a-option value="7day-no-reason">7 天无理由</a-option>
            <a-option value="shop-warranty">店铺保修</a-option>
            <a-option value="national-warranty">全国联保</a-option>
          </a-select>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="海外过关">
          <a-switch v-model="form.overseasCustoms" />
          <span class="hint">海外直邮过关后不可退</span>
        </a-form-item>
      </a-col>
    </a-row>

    <a-form-item label="简介">
      <a-input v-model="form.summary" placeholder="一行简介，30 字以内" :max-length="30" />
    </a-form-item>

    <a-form-item label="详细描述">
      <a-textarea v-model="form.description" :rows="4" :max-length="500" show-word-limit />
    </a-form-item>

    <a-form-item label="商品图片（至少 1 张，最多 6 张）" required>
          <AftersaleEvidenceUploader v-model="form.images" scene="PRODUCT" :max="6" :disabled="submitting" @uploading="uploading = $event" @uploaded="onUploaded" />
    </a-form-item>

    <div class="actions">
      <a-button type="primary" size="large" :disabled="uploading" :loading="submitting" @click="submit">提交审核</a-button>
    </div>
  </a-form>
</template>

<style scoped>
.hint {
  margin-left: 8px;
  color: #86909c;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
