<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import BuyerProductForm from '@/components/buyer/buyer-product-form.vue';
import * as productApi from '@/service/api/product';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const submitting = ref(false);

async function onSubmit(form: {
  title: string;
  categoryPath: Array<string | number>;
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
  if (!userStore.currentUser) return;
  Modal.confirm({
    title: '确认提交商品审核？',
    content: '提交后将进入平台审核，预计 24h 内出结果。审核期间商品默认下架。',
    async onOk() {
      submitting.value = true;
      try {
        const product = await productApi.createProduct({
          title: form.title.trim(),
          summary: form.summary.trim() || form.title.trim(),
          description: form.description.trim() || '—',
          categoryId: form.categoryPath[form.categoryPath.length - 1],
          price: form.price.toFixed(2),
          shippingFee: form.shippingFee.toFixed(2),
          tax: form.tax.toFixed(2),
          stock: form.stock,
          aftersaleType: form.aftersaleType,
          overseasCustoms: form.overseasCustoms,
          images: form.images
        });
        Message.success(`商品已提交审核（${product.code}）`);
        router.push('/buyer/products');
      } finally {
        submitting.value = false;
      }
    }
  });
}
</script>

<template>
  <div class="bp-create-page shop-container">
    <a-breadcrumb class="bread">
      <a-breadcrumb-item @click="router.push('/buyer/products')">商品管理</a-breadcrumb-item>
      <a-breadcrumb-item>创建商品</a-breadcrumb-item>
    </a-breadcrumb>

    <a-card class="form-card" :body-style="{ padding: '28px 32px' }" :bordered="false">
      <h2 class="page-title">创建商品</h2>
      <p class="hint">填写商品信息，提交后平台审核通过即可上架销售。</p>
      <BuyerProductForm :submitting="submitting" @submit="onSubmit" />
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
