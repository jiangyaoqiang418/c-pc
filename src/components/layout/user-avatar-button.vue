<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import { useUserStore } from '@/stores';
import VipBadge from '@/components/common/vip-badge.vue';

const router = useRouter();
const userStore = useUserStore();

const avatarInitial = computed(() => userStore.displayName.slice(0, 1).toUpperCase() || '?');

function goLogin() {
  router.push({ name: 'login' });
}
function goRegister() {
  router.push({ name: 'register' });
}
function goProfile() {
  router.push({ name: 'profile' });
}
function logout() {
  userStore.logout();
  Message.success('已退出登录');
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="user-avatar-btn">
    <template v-if="userStore.isLoggedIn">
      <a-dropdown position="br" trigger="click">
        <div class="trigger">
          <div class="avatar">{{ avatarInitial }}</div>
          <div class="meta">
            <div class="name">{{ userStore.displayName }}</div>
            <VipBadge v-if="userStore.currentUser" :level="userStore.currentUser.vipLevel" size="sm" />
            <span v-if="userStore.currentUser?.accountInfoUnavailable">会员资料未更新</span>
          </div>
        </div>
        <template #content>
          <a-doption @click="goProfile">
            <template #icon><Icon icon="lucide:user" width="14" /></template>
            个人中心
          </a-doption>
          <a-doption @click="logout">
            <template #icon><Icon icon="lucide:log-out" width="14" /></template>
            退出登录
          </a-doption>
        </template>
      </a-dropdown>
    </template>
    <template v-else>
      <a-space>
        <a-button type="text" size="small" @click="goLogin">登录</a-button>
        <a-button type="outline" size="small" @click="goRegister">注册</a-button>
      </a-space>
    </template>
  </div>
</template>

<style scoped>
.user-avatar-btn {
  display: flex;
  align-items: center;
}
.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s;
}
.trigger:hover {
  background: var(--yb-bg);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--yb-brand-pink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}
.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--yb-ink);
}
</style>
