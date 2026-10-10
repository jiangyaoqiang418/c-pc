<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Message } from '@/lib/feedback';
import { useUserStore } from '@/stores';
import VipBadge from '@/components/common/vip-badge.vue';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const router = useRouter();
const userStore = useUserStore();
const avatarInitial = computed(() => userStore.displayName.slice(0, 1).toUpperCase() || '?');
function logout() {
  userStore.logout();
  Message.success('已退出登录');
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="account-menu">
    <DropdownMenu v-if="userStore.isLoggedIn">
      <DropdownMenuTrigger as-child>
        <button type="button" class="account-trigger" aria-label="打开账户菜单">
          <span class="avatar">{{ avatarInitial }}</span>
          <span class="meta"><TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="name">{{ userStore.displayName }}</span></TooltipTrigger><TooltipContent>{{ userStore.displayName }}</TooltipContent></Tooltip></TooltipProvider>
            <VipBadge v-if="userStore.currentUser" :level="userStore.currentUser.vipLevel" size="sm" />
            <span v-if="userStore.currentUser?.accountInfoUnavailable" class="account-warning">会员资料未更新</span>
          </span><Icon icon="lucide:chevron-down" class="account-chevron" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuLabel>我的账户</DropdownMenuLabel>
        <DropdownMenuItem @select="router.push({ name: 'profile' })"><Icon icon="lucide:user" class="mr-2 size-4" />个人中心</DropdownMenuItem>
        <DropdownMenuItem @select="router.push({ name: 'order-list' })"><Icon icon="lucide:package" class="mr-2 size-4" />我的订单</DropdownMenuItem>
        <DropdownMenuItem @select="router.push('/wallet')"><Icon icon="lucide:wallet" class="mr-2 size-4" />我的钱包</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="logout"><Icon icon="lucide:log-out" class="mr-2 size-4" />退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div v-else class="guest-actions"><Button variant="ghost" size="sm" @click="router.push({ name: 'login' })">登录</Button><Button variant="outline" size="sm" @click="router.push({ name: 'register' })">注册</Button></div>
  </div>
</template>

<style scoped>
.account-menu { min-width: 0; }
.account-trigger { display: flex; align-items: center; gap: 8px; padding:6px 10px; border:1px solid var(--yb-hairline); border-radius:6px; background:var(--yb-fill); cursor: pointer; transition: background 150ms; }
.account-trigger:hover { background: var(--yb-fill); }
.avatar { flex:none; display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--yb-primary); color:white; font-weight:600; }
.meta { display: flex; flex-direction: column; gap: 3px; text-align: left; min-width: 0; }
.name { max-width: 76px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 13px; font-weight: 600; color: var(--yb-ink); }
.account-warning { max-width:90px; font-size:10px; line-height:12px; color:var(--yb-muted); white-space:nowrap; }
.account-chevron { width: 12px; color: var(--yb-muted); }
.guest-actions { display: flex; align-items: center; gap: 6px; }
</style>
