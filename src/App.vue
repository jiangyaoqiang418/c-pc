<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCartStore, useNotifyStore, useUserStore } from '@/stores';

const layouts = {
  default: defineAsyncComponent(() => import('@/layouts/default.vue')),
  checkout: defineAsyncComponent(() => import('@/layouts/checkout.vue')),
  auth: defineAsyncComponent(() => import('@/layouts/auth.vue'))
} as const;

const route = useRoute();
const userStore = useUserStore();
const cartStore = useCartStore();
const notifyStore = useNotifyStore();

const layoutComponent = computed(() => layouts[route.meta.layout || 'default']);

onMounted(async () => {
  await userStore.init();
  cartStore.init(userStore.currentUser?.id);
  notifyStore.bindLifecycle();
  if (userStore.isLoggedIn) notifyStore.connect();
});

watch(() => userStore.isLoggedIn, loggedIn => {
  if (loggedIn) notifyStore.connect();
  else notifyStore.disconnect();
});
</script>

<template>
  <component :is="layoutComponent" />
</template>
