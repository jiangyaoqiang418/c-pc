<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useNotifyStore, useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const notifyStore = useNotifyStore();

function go(name: string) {
  router.push({ name });
}
</script>

<template>
  <div class="utility-bar">
    <div class="ub-inner">
      <div class="ub-left">
        <span class="ub-region">中国大陆</span>
        <span class="ub-sep">·</span>
        <span class="ub-welcome">欢迎来到油宝</span>
      </div>
      <div class="ub-right">
        <template v-if="userStore.isLoggedIn">
          <button type="button" class="ub-link badge-link" @click="go('im')">消息<span v-if="notifyStore.imUnreadCount" class="badge">{{ notifyStore.imUnreadCount > 99 ? '99+' : notifyStore.imUnreadCount }}</span></button>
          <span class="ub-sep">·</span>
          <button type="button" class="ub-link badge-link" @click="go('notification-list')">通知<span v-if="notifyStore.notificationUnreadCount" class="badge">{{ notifyStore.notificationUnreadCount > 99 ? '99+' : notifyStore.notificationUnreadCount }}</span></button>
          <span class="ub-sep">·</span>
        </template>
        <button type="button" class="ub-link" @click="go('order-list')">我的订单</button>
        <span class="ub-sep">·</span>
        <button type="button" class="ub-link" @click="go('favorites')">收藏夹</button>
        <span class="ub-sep">·</span>
        <button type="button" class="ub-link" @click="go('help')">帮助中心</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.utility-bar {
  height: 32px;
  background: var(--yb-bg);
  border-bottom: 1px solid var(--yb-hairline);
  font-size: 12px;
  color: var(--yb-muted);
}
.ub-inner {
  height: 100%;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}
.ub-left, .ub-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ub-region {
  font-weight: 600;
  color: var(--yb-ink-2);
}
.ub-welcome {
  color: var(--yb-muted);
}
.ub-sep {
  color: var(--yb-hairline-2);
}
.ub-link {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  color: var(--yb-muted);
  transition: color 0.15s;
}
.ub-link:hover {
  color: var(--yb-ink);
}
.badge-link { display: inline-flex; align-items: center; gap: 4px; }
.badge { min-width: 16px; height: 16px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #f53f3f; color: #fff; font-size: 9px; line-height: 1; }
</style>
