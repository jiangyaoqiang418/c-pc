<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useCartStore, useUserStore } from '@/stores';

const layouts = {
  default: defineAsyncComponent(() => import('@/layouts/default.vue')),
  checkout: defineAsyncComponent(() => import('@/layouts/checkout.vue')),
  auth: defineAsyncComponent(() => import('@/layouts/auth.vue'))
} as const;

const route = useRoute();
const userStore = useUserStore();
const cartStore = useCartStore();

const layoutComponent = computed(() => layouts[route.meta.layout || 'default']);

onMounted(async () => {
  await userStore.init();
  cartStore.init(userStore.currentUser?.id);
});
</script>

<template>
  <component :is="layoutComponent" />
</template>
