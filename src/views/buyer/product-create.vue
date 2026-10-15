<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import UmIcon from '@/components/common/um-icon.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@/lib/feedback';
import BuyerProductForm from '@/components/buyer/buyer-product-form.vue';
import * as productApi from '@/service/api/product';
import { fetchBuyerDepositSummary } from '@/service/api/buyer';
import { fetchCreateCategoryOptions, isSelectableCategory } from '@/service/api/category';
import { useUserStore } from '@/stores';
import { compareDecimalAmount } from '@/components/wallet/decimal-amount';

const router = useRouter();
const route = useRoute();
const editing = computed(() => route.name === 'buyer-product-edit');
const initialProduct = ref<Api.RealProduct.Record>();
const detailError = ref('');
const detailLoading = ref(false);
let detailVersion = 0;
const userStore = useUserStore();
const submitting = ref(false);
const confirmationOpen = ref(false);
const formRef = ref<InstanceType<typeof BuyerProductForm>>();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

async function loadDetail() {
  writeVersion += 1;
  confirmationModal?.close();
  confirmationOpen.value = false;
  submitting.value = false;
  const version = ++detailVersion;
  initialProduct.value = undefined;
  detailError.value = '';
  detailLoading.value = false;
  if (!editing.value || !userStore.currentUser) return;
  detailLoading.value = true;
  try {
    const p = await productApi.fetchSellerProductDetail(String(route.params.id));
    if (version !== detailVersion) return;
    if (String(p.sellerId) !== String(userStore.currentUser?.id)) throw new Error('无权编辑该商品');
    if (p.rawStatus !== 'OFF_SHELF' && p.rawStatus !== 'REJECTED') throw new Error('仅已下架或已驳回商品可编辑');
    if (p.hasSku) throw new Error('该商品包含多规格，当前编辑表单尚未支持 SKU 维护，暂不能提交整体修改，以免覆盖已有规格和库存');
    if (!p.imageFiles?.length || p.imageFiles.length !== p.images.length || p.imageFiles.some(item => !item.bucket || !item.filePath || !item.url)) {
      throw new Error('商品图片信息不完整，请刷新详情后重试');
    }
    initialProduct.value = p;
  } catch (error) {
    if (version === detailVersion) detailError.value = error instanceof Error ? error.message : '商品详情加载失败';
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
watch([() => route.params.id, editing, () => userStore.currentUser?.id], loadDetail, { immediate: true });

async function onSubmit(form: {
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
  images: Api.RealProduct.ProductImageParam[];
}) {
  if (!userStore.currentUser || submitting.value || confirmationOpen.value) return;
  if (editing.value && !initialProduct.value) return;
  const editProduct = initialProduct.value;
  const categoryId = form.categoryId;
  if (categoryId === undefined || categoryId === '') return;
  const requestedUserId = userStore.currentUser.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: editing.value ? '确认提交商品修改？' : '确认提交商品审核？',
    content: editing.value ? '修改后商品将进入平台审核，审核通过后自动上架，确认提交？' : '提交后将进入平台审核，预计 24h 内出结果。审核期间商品默认下架。',
    onCancel() {
      if (!isCurrentWrite()) return;
      confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentWrite()) {
        return;
      }
      submitting.value = true;
      try {
        try {
          const categories = await fetchCreateCategoryOptions();
          if (!isCurrentWrite()) return;
          if (!isSelectableCategory(categories, categoryId)) {
            Message.warning('商品分类已不可用，请重新选择');
            void formRef.value?.reloadCategories();
            return;
          }
          const depositSummary = await fetchBuyerDepositSummary({ showError: false });
          if (!isCurrentWrite()) return;
          if (!depositSummary.listable) {
            Message.warning('当前保证金不足，暂不能提交商品，请先处理保证金');
            void router.push('/buyer/deposit');
            return;
          }
          if (editProduct) {
            const latest = await productApi.fetchSellerProductDetail(editProduct.id);
            if (!isCurrentWrite()) return;
            if (latest.hasSku) {
              Message.warning('该商品已更新为多规格，当前编辑表单暂不支持提交，请返回商品管理');
              return;
            }
          }
          const productId = editProduct ? await productApi.updateProduct({
            id: editProduct.id, title: form.title.trim(), categoryId,
            price: compareDecimalAmount(form.price, editProduct.price) === 0 ? String(editProduct.price) : String(form.price),
            shippingFee: editProduct.shippingFee !== undefined && compareDecimalAmount(form.shippingFee, editProduct.shippingFee) === 0 ? String(editProduct.shippingFee) : String(form.shippingFee),
            taxFee: editProduct.tax !== undefined && compareDecimalAmount(form.tax, editProduct.tax) === 0 ? String(editProduct.tax) : String(form.tax),
            stock: form.stock,
            afterSaleType: ({ 'none': 'NONE', '7day-no-reason': 'SEVEN_DAY_NO_REASON', 'shop-warranty': 'SHOP_WARRANTY', 'national-warranty': 'NATIONAL_WARRANTY' } as const)[form.aftersaleType],
            overseasClearance: form.overseasCustoms, brief: form.summary.trim(),
            description: form.description, images: form.images
          }) : await productApi.createProduct({
            title: form.title.trim(),
            summary: form.summary.trim() || form.title.trim(),
            description: form.description.trim() || '—',
            categoryId,
            price: Number(form.price.toFixed(2)),
            shippingFee: Number(form.shippingFee.toFixed(2)),
            tax: Number(form.tax.toFixed(2)),
            stock: form.stock,
            aftersaleType: form.aftersaleType,
            overseasCustoms: form.overseasCustoms,
            images: form.images
          });
          if (!isCurrentWrite()) return;
          formRef.value?.markSubmitted();
          Message.success(`商品已提交审核（ID：${productId}）`);
          router.push('/buyer/products');
        } catch (error) {
          if (isCurrentWrite() && editProduct && error instanceof Error && error.message.includes('商品信息已变化')) {
            formRef.value?.markSaved();
            await loadDetail();
            Message.warning('已重新读取商品信息，请核对库存等内容后再次提交');
          }
          // 请求层已展示错误，保留商品表单和上传结果供用户修正后重试。
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

onBeforeUnmount(() => {
  detailVersion += 1;
  writeVersion += 1;
  confirmationModal?.close();
});
watch([() => userStore.currentUser?.id, () => userStore.currentAudience], ([nextUserId, nextAudience], [previousUserId, previousAudience]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience) return;
  writeVersion += 1;
  confirmationModal?.close();
  submitting.value = false;
  confirmationOpen.value = false;
});


</script>

<template>
  <div class="bp-create-page shop-container">
    <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/buyer/products">商品管理</RouterLink><span>/</span><span>{{ editing ? '编辑商品' : '创建商品' }}</span></nav><header class="buyer-page-top"><div><span class="eyebrow">UMAOMAO / BUYER STUDIO</span><h1>{{ editing ? '编辑商品' : '创建商品' }}</h1><p>完善商品资料，提交平台审核后即可上架销售。</p></div><Button class="outline" variant="outline" @click="router.push('/buyer/products')"><UmIcon name="return" />返回商品管理</Button></header>
    <Alert v-if="detailError" variant="destructive"><AlertDescription class="alert-row"><span>{{ detailError }}</span><Button class="outline" variant="outline" size="sm" :disabled="detailLoading" @click="loadDetail">重新加载</Button></AlertDescription></Alert>
    <div v-if="detailLoading" class="loading-form" aria-busy="true" aria-label="正在读取当前商品信息"><Skeleton v-for="n in 3" :key="n" class="form-skeleton" /></div>
    <Alert v-if="initialProduct?.draftAuditOpinion"><AlertDescription>驳回原因：{{ initialProduct.draftAuditOpinion }}</AlertDescription></Alert>
    <BuyerProductForm v-if="!editing || initialProduct" ref="formRef" :key="`${String(userStore.currentUser?.id)}:${userStore.currentAudience}:${String(initialProduct?.id)}`" :initial-product="initialProduct" :submitting="submitting || confirmationOpen" @submit="onSubmit" />
  </div>
</template>

<style scoped>
.alert-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.loading-form { display:grid; gap:24px; }
.form-skeleton { height:240px; }
</style>
