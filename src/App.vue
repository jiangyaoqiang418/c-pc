<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCartStore, useNotifyStore, useUserStore } from '@/stores';
import { ACCESS_TOKEN_KEY } from '@/service/request/token';
import FeedbackHost from '@/components/common/feedback-host.vue';
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import EmptyState from '@/components/common/empty-state.vue';

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
const routeReady = ref(false);
void router.isReady().then(
  () => { routeReady.value = true; },
  () => { routeReady.value = true; }
);

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
  <TooltipProvider :delay-duration="300" :skip-delay-duration="100">
  <FeedbackHost />
  <div v-if="!routeReady" class="route-loading" role="status" aria-live="polite">
    <Icon icon="lucide:loader-circle" width="28" class="animate-spin" />
    <span>正在加载页面</span>
  </div>
  <div v-else-if="protectedSessionPending" class="session-state" role="status" aria-live="polite">
    <EmptyState :icon="userStore.initializationError ? 'lucide:circle-alert' : 'lucide:shield-check'" :title="userStore.initializationError ? '会话读取失败' : '正在核对登录状态'" :description="userStore.initializationError || '核对完成后继续访问当前页面。'" />
    <Button v-if="userStore.initializationError" type="button" :disabled="userStore.initializing" @click="retrySession"><Icon v-if="userStore.initializing" icon="lucide:loader-circle" width="16" class="animate-spin" />重新读取会话</Button>
  </div>
  <template v-else>
    <div v-if="!route.matched.length" class="session-state"><EmptyState icon="lucide:map" title="页面不存在" description="当前地址无对应页面，请检查链接。" action-text="返回首页" @action="router.push('/')" /></div>
    <template v-else>
      <div v-if="userStore.demoUser && !userStore.isLoggedIn" class="demo-notice" role="status"><Icon icon="lucide:info" width="16" /><span>当前为本地演示模式，仅浏览公开页面；钱包、订单等真实业务需要平台账号登录。</span><Button type="button" variant="link" size="sm" @click="router.push({ name: 'login' })">真实账号登录</Button></div>
      <component :is="layoutComponent" />
    </template>
  </template>
  </TooltipProvider>
</template>

<style scoped>
.route-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--yb-muted);
}
.session-state { min-height: 70dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; }.session-state :deep(.empty-state) { padding: 24px; }.demo-notice { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; padding: 8px 24px; color: var(--yb-primary); background: var(--yb-primary-soft); font-size: 13px; }.demo-notice > svg { flex-shrink: 0; }
</style>
