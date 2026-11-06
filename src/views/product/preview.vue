<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ProductDetail from './detail.vue';
import { fetchProductPreview } from '@/service/api/detail-studio';
import { fetchSellerProductDetail, toProductRecord } from '@/service/api/product';
const route = useRoute();
const product = ref<Api.RealProduct.Record>();
const error = ref('');
onMounted(async () => {
  try {
    const hash = new URLSearchParams(route.hash.slice(1));
    const ticket = hash.get('ticket'), local = hash.get('local');
    if (typeof route.query.ownerProduct === 'string' && /^\d+$/.test(route.query.ownerProduct)) product.value = await fetchSellerProductDetail(route.query.ownerProduct);
    else if (ticket) product.value = toProductRecord(await fetchProductPreview(ticket));
    else if (local) { const value = sessionStorage.getItem('product-preview:' + local); if (!value) throw new Error('预览已关闭，请重新打开'); product.value = JSON.parse(value); }
    else throw new Error('缺少预览凭证');
  } catch (e) { error.value = (e as Error).message; }
});
</script>
<template><div class="preview-note">商品展示预览 · 当前已保存内容 · 交易操作已停用</div><p v-if="error" role="alert">{{ error }}</p><ProductDetail v-else-if="product" :preview-product="product" /><p v-else>正在读取商品预览…</p></template>
<style scoped>.preview-note{padding:12px;text-align:center;background:#eef3e4;color:#344222;font-size:13px}</style>
