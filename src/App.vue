<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCartStore, useNotifyStore, useUserStore } from '@/stores';
import { ACCESS_TOKEN_KEY } from '@/service/request/token';

const layouts = {
  default: defineAsyncComponent(() => import('@/layouts/default.vue')),
  checkout: defineAsyncComponent(() => import('@/layouts/checkout.vue')),
  auth: defineAsyncComponent(() => import('@/layouts/auth.vue'))
} as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const cartStore = useCartStore();
const notifyStore = useNotifyStore();

const layoutComponent = computed(() => layouts[route.meta.layout || 'default']);
const protectedSessionPending = computed(() => route.meta.requiresAuth
  && (!userStore.isLoggedIn || (route.meta.requiresBuyer && !userStore.canSwitchToBuyer)));

async function retrySession() {
  if (userStore.initializing) return;
  const target = route.fullPath;
  await userStore.init();
  if (route.fullPath === target && !userStore.initializationError) {
    await router.replace({ path: route.path, query: { ...route.query }, hash: route.hash, force: true });
  }
}

async function syncExternalSession() {
  const target = route.fullPath;
  const changed = await userStore.syncExternalSession();
  if (changed && route.fullPath === target && !userStore.initializationError) {
    await router.replace({ path: route.path, query: { ...route.query }, hash: route.hash, force: true });
  }
}

function onSessionStorage(event: StorageEvent) {
  if (event.storageArea === localStorage && (event.key === ACCESS_TOKEN_KEY || event.key === null)) {
    void syncExternalSession();
  }
}

onMounted(async () => {
  window.addEventListener('storage', onSessionStorage);
  window.addEventListener('storage', cartStore.onCartStorage);
  window.addEventListener('focus', cartStore.syncExternalCart);
  window.addEventListener('focus', syncExternalSession);
  await userStore.init();
  cartStore.init(userStore.currentUser?.id);
  notifyStore.bindLifecycle();
  if (userStore.isLoggedIn) notifyStore.connect();
});

onBeforeUnmount(() => {
  window.removeEventListener('storage', onSessionStorage);
  window.removeEventListener('storage', cartStore.onCartStorage);
  window.removeEventListener('focus', cartStore.syncExternalCart);
  window.removeEventListener('focus', syncExternalSession);
});

// 同账号重新登录也会更换凭证；只监听用户 ID 会留下忽略新消息的旧连接。
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], ([next]) => {
  notifyStore.disconnect();
  if (next !== undefined && next !== null) notifyStore.connect();
});

// 权限回读已失效时退出当前买手页，使页面卸载并关闭其未完成确认框。
watch(() => userStore.canSwitchToBuyer, allowed => {
  if (!allowed && userStore.isLoggedIn && route.meta.requiresBuyer) {
    void router.replace({ name: 'buyer-apply' });
  }
}, { flush: 'sync' });
</script>

<template>
  <a-result v-if="protectedSessionPending" status="warning" :title="userStore.initializationError ? '会话读取失败' : '正在核对登录状态'"
    :subtitle="userStore.initializationError || '核对完成后继续访问当前页面。'">
    <template #extra>
      <a-button v-if="userStore.initializationError" type="primary" :loading="userStore.initializing" @click="retrySession">重新读取会话</a-button>
    </template>
  </a-result>
  <template v-else>
    <a-result v-if="!route.matched.length" status="404" title="页面不存在" subtitle="当前地址无对应页面，请检查链接。">
      <template #extra><a-button type="primary" @click="router.push('/')">返回首页</a-button></template>
    </a-result>
    <template v-else>
      <a-alert v-if="userStore.demoUser && !userStore.isLoggedIn" type="info" :closable="false">
        当前为本地演示模式，仅浏览公开页面；钱包、订单等真实业务需要平台账号登录。
        <template #action><a-button size="mini" @click="router.push({ name: 'login' })">真实账号登录</a-button></template>
      </a-alert>
      <component :is="layoutComponent" />
    </template>
  </template>
</template>
