<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import BuyerProductForm from '@/components/buyer/buyer-product-form.vue';
import * as productApi from '@/service/api/product';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const submitting = ref(false);
const confirmationOpen = ref(false);
const formRef = ref<InstanceType<typeof BuyerProductForm>>();
let writeVersion = 0;
let confirmationModal: ReturnType<typeof Modal.confirm> | undefined;

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
  const categoryId = form.categoryId;
  if (categoryId === undefined || categoryId === '') return;
  const requestedUserId = userStore.currentUser.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId)
    && userStore.isBuyerActive;
  confirmationOpen.value = true;
  confirmationModal = Modal.confirm({
    title: '确认提交商品审核？',
    content: '提交后将进入平台审核，预计 24h 内出结果。审核期间商品默认下架。',
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
          const productId = await productApi.createProduct({
            title: form.title.trim(),
            summary: form.summary.trim() || form.title.trim(),
            description: form.description.trim() || '—',
            categoryId,
            price: form.price.toFixed(2),
            shippingFee: form.shippingFee.toFixed(2),
            tax: form.tax.toFixed(2),
            stock: form.stock,
            aftersaleType: form.aftersaleType,
            overseasCustoms: form.overseasCustoms,
            images: form.images
          });
          if (!isCurrentWrite()) return;
          formRef.value?.markSaved();
          Message.success(`商品已提交审核（ID：${productId}）`);
          router.push('/buyer/products');
        } catch {
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
    <a-breadcrumb class="bread">
      <a-breadcrumb-item role="link" tabindex="0" @click="router.push('/buyer/products')" @keydown.enter="router.push('/buyer/products')" @keydown.space.prevent="router.push('/buyer/products')">商品管理</a-breadcrumb-item>
      <a-breadcrumb-item>创建商品</a-breadcrumb-item>
    </a-breadcrumb>

    <a-card class="form-card" :body-style="{ padding: '28px 32px' }" :bordered="false">
      <h2 class="page-title">创建商品</h2>
      <p class="hint">填写商品信息，提交后平台审核通过即可上架销售。</p>
      <BuyerProductForm ref="formRef" :key="`${String(userStore.currentUser?.id)}:${userStore.currentAudience}`" :submitting="submitting || confirmationOpen" @submit="onSubmit" />
    </a-card>
  </div>
</template>

<style scoped>
.bp-create-page {
  padding-top: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.bread {
  margin-bottom: 12px;
}
.form-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.page-title {
  font-size: 22px;
  margin: 0;
}
.hint {
  color: #86909c;
  font-size: 13px;
  margin: 0 0 20px;
}
</style>
