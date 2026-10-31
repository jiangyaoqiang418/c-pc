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
import { productEditSnapshot, validateProductSkuWrite } from '@/utils/product-sku';
import { fetchBrandDetail } from '@/service/api/brand';

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
  const requestedProductId = String(route.params.id);
  detailLoading.value = true;
  try {
    const p = await productApi.fetchSellerProductDetail(requestedProductId);
    if (version !== detailVersion) return;
    if (String(p.id) !== requestedProductId) throw new Error('商品详情对象不一致');
    if (String(p.sellerId) !== String(userStore.currentUser?.id)) throw new Error('无权编辑该商品');
    if (p.rawStatus !== 'OFF_SHELF' && p.rawStatus !== 'REJECTED') throw new Error('仅已下架或已驳回商品可编辑');
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
watch([() => route.params.id, editing, () => userStore.currentUser?.id, () => userStore.sessionVersion], loadDetail, { immediate: true });

async function onSubmit(form: {
  title: string;
  categoryId?: string | number;
  categoryIds: Api.RealProduct.Id[];
  parameters: Api.RealProduct.ProductParameter[];
  brandId?: Api.RealProduct.Id | null;
  price: string;
  shippingFee: string;
  tax: string;
  stock: number;
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  summary: string;
  description: string;
  images: Api.RealProduct.ProductImageParam[];
  specGroups: Api.RealProduct.ProductSpecGroup[];
  skus: Api.RealProduct.ProductSkuSaveParams[];
}) {
  if (!userStore.currentUser || submitting.value || confirmationOpen.value) return;
  if (editing.value && !initialProduct.value) return;
  const editProduct = initialProduct.value;
  const categoryId = form.categoryId;
  if (categoryId === undefined || categoryId === '') return;
  const removedSkuCount = (editProduct?.skus || []).filter(sku => !form.skus.some(item => item.id !== undefined && item.id !== null && String(item.id) === String(sku.id))).length;
  const requestedUserId = userStore.currentUser.id;
  const requestedSession = userStore.sessionVersion;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && userStore.sessionVersion === requestedSession
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: editing.value ? '确认提交商品修改？' : '确认提交商品审核？',
    content: editing.value ? `修改后商品将进入平台审核，审核通过后自动上架。${removedSkuCount ? `本次将移除 ${removedSkuCount} 个已有 SKU；历史订单快照保留。` : ''}${!!editProduct?.hasSku !== !!form.specGroups.length ? '本次将切换规格模式，存在未完成订单或有效秒杀时服务器会拒绝。' : ''}确认提交？` : '提交后将进入平台审核，预计 24h 内出结果。审核期间商品默认下架。',
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
            void router.push({ path: '/buyer/deposit', query: { redirect: route.fullPath } });
            return;
          }
          if (editProduct) {
            const latest = await productApi.fetchSellerProductDetail(editProduct.id);
            if (!isCurrentWrite()) return;
            if (String(latest.sellerId) !== String(requestedUserId) || !['OFF_SHELF', 'REJECTED'].includes(latest.rawStatus || '')) {
              Message.warning('当前商品归属或状态已变化，不能提交修改，表单保持保留');
              return;
            }
            if (productEditSnapshot(latest) !== productEditSnapshot(editProduct)) {
              Message.warning('商品资料或库存已变化，未提交任何修改。请保存本地草稿后重新加载并核对商品');
              return;
            }
            validateProductSkuWrite(form.specGroups, form.skus, latest.skus);
          }
          if (form.brandId != null && String(form.brandId) !== String(editProduct?.brandId)) {
            const brand = await fetchBrandDetail(form.brandId);
            if (!isCurrentWrite()) return;
            if (!brand.enabled) { Message.warning('品牌已停用，请重新选择'); return; }
          }
          const productId = editProduct ? await productApi.updateProduct({
            id: editProduct.id, title: form.title.trim(), categoryId, categoryIds:form.categoryIds, parameters:form.parameters, brandId:form.brandId,
            price: form.price, shippingFee: form.shippingFee, taxFee: form.tax,
            stock: form.stock,
            specGroups: form.specGroups, skus: form.skus,
            afterSaleType: ({ 'none': 'NONE', '7day-no-reason': 'SEVEN_DAY_NO_REASON', 'shop-warranty': 'SHOP_WARRANTY', 'national-warranty': 'NATIONAL_WARRANTY' } as const)[form.aftersaleType],
            overseasClearance: form.overseasCustoms, brief: form.summary.trim(),
            description: form.description, images: form.images
          }) : await productApi.createProduct({
            title: form.title.trim(),
            summary: form.summary.trim() || form.title.trim(),
            description: form.description.trim() || '—',
            categoryId, categoryIds:form.categoryIds, parameters:form.parameters,
            brandId:form.brandId,
            price: form.price,
            shippingFee: form.shippingFee,
            tax: form.tax,
            stock: form.stock,
            specGroups: form.specGroups, skus: form.skus,
            aftersaleType: form.aftersaleType,
            overseasCustoms: form.overseasCustoms,
            images: form.images
          });
          if (!isCurrentWrite()) return;
          formRef.value?.markSubmitted();
          Message.success(`商品已提交审核（ID：${productId}）`);
          router.push('/buyer/products');
        } catch (error) {
          if (isCurrentWrite() && error instanceof Error && !('code' in error)) Message.warning(error.message);
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
watch([() => userStore.currentUser?.id, () => userStore.currentAudience, () => userStore.sessionVersion], ([nextUserId, nextAudience, nextSession], [previousUserId, previousAudience, previousSession]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience && nextSession === previousSession) return;
  writeVersion += 1;
  confirmationModal?.close();
  submitting.value = false;
  confirmationOpen.value = false;
});


</script>

<template>
  <div class="bp-create-page shop-container">
    <nav class="breadcrumb" aria-label="面包屑"><RouterLink to="/buyer/products">商品管理</RouterLink><span>/</span><span>{{ editing ? '编辑商品' : '创建商品' }}</span></nav><header class="buyer-page-top"><div><h1>{{ editing ? '编辑商品' : '创建商品' }}</h1><p>完善商品资料，提交平台审核后即可上架销售。</p></div><Button class="outline" variant="outline" @click="router.push('/buyer/products')"><UmIcon name="return" />返回商品管理</Button></header>
    <Alert v-if="detailError" variant="destructive"><AlertDescription class="alert-row"><span>{{ detailError }}</span><Button class="outline" variant="outline" size="sm" :disabled="detailLoading" @click="loadDetail">重新加载</Button></AlertDescription></Alert>
    <div v-if="detailLoading" class="loading-form" aria-busy="true" aria-label="正在读取当前商品信息"><Skeleton v-for="n in 3" :key="n" class="form-skeleton" /></div>
    <Alert v-if="initialProduct?.draftAuditOpinion"><AlertDescription>驳回原因：{{ initialProduct.draftAuditOpinion }}</AlertDescription></Alert>
    <BuyerProductForm v-if="!editing || initialProduct" ref="formRef" :key="`${String(userStore.currentUser?.id)}:${userStore.currentAudience}:${userStore.sessionVersion}:${String(initialProduct?.id)}`" :initial-product="initialProduct" :submitting="submitting || confirmationOpen" @submit="onSubmit" />
  </div>
</template>

<style scoped>
.alert-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.loading-form { display:grid; gap:24px; }
.form-skeleton { height:240px; }
</style>
