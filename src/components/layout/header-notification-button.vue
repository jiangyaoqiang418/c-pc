<script setup lang="ts">
import { useNotifyStore, useUserStore } from '@/stores';
import UmIcon from '@/components/common/um-icon.vue';

const user = useUserStore();
const notify = useNotifyStore();
</script>

<template>
  <RouterLink v-if="user.isLoggedIn" to="/notifications" class="header-notification" :aria-label="notify.notificationUnreadCount ? `通知，${notify.notificationUnreadCount} 条未读` : '通知'" title="平台通知">
    <span class="notification-icon"><UmIcon name="bell" /><b v-if="notify.notificationUnreadCount" aria-hidden="true">{{ notify.notificationUnreadCount > 99 ? '99+' : notify.notificationUnreadCount }}</b></span>
  </RouterLink>
</template>

<style scoped>
.header-notification { display:inline-flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; flex-shrink:0; padding:8px; border-radius:8px; color:var(--ink); white-space:nowrap; }
.header-notification:hover { background:var(--soft); }
.notification-icon { position:relative; display:inline-flex; }
.notification-icon svg { width:20px; height:20px; }
.notification-icon b { position:absolute; top:-8px; left:12px; min-width:16px; height:16px; padding:0 3px; display:grid; place-items:center; border-radius:999px; background:var(--green); color:var(--on-primary,#fff); box-shadow:0 0 0 2px var(--paper); font-size:9px; font-weight:500; line-height:1; font-variant-numeric:tabular-nums; }
</style>
