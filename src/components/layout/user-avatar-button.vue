<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Message } from '@/lib/feedback';
import { useUserStore, useWalletStore } from '@/stores';
import { formatAmount } from '@shared';
import VipBadge from '@/components/common/vip-badge.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();
const open = ref(false);
const walletError = ref(false);
const avatarInitial = computed(() => userStore.displayName.slice(0, 1).toUpperCase() || '?');
let requestVersion = 0;
const customerLinks = [
  { label: '我的订单', icon: 'lucide:package', to: '/order' },
  { label: '我的收藏', icon: 'lucide:heart', to: '/favorites' },
  { label: '我的钱包', icon: 'lucide:wallet', to: '/wallet' },
  { label: '地址管理', icon: 'lucide:map-pin', to: '/address' },
  { label: '我的求购', icon: 'lucide:search', to: '/purchase' },
  { label: '我的售后', icon: 'lucide:rotate-ccw', to: '/aftersale' }
];
const buyerLinks = [
  { label: '买手订单', icon: 'lucide:package', to: '/buyer/orders' },
  { label: '商品管理', icon: 'lucide:shopping-bag', to: '/buyer/products' },
  { label: '买手钱包', icon: 'lucide:wallet', to: '/buyer/wallet' },
  { label: '可接求购', icon: 'lucide:handshake', to: '/buyer/claimable' },
  { label: '售后记录', icon: 'lucide:rotate-ccw', to: '/buyer/aftersales' },
  { label: '押金管理', icon: 'lucide:shield-check', to: '/buyer/deposit' }
];
const links = computed(() => userStore.isBuyerActive ? buyerLinks : customerLinks);
const balance = computed(() => walletError.value || walletStore.account?.available === undefined ? '—' : formatAmount(walletStore.account.available));
async function loadWallet() {
  const version = ++requestVersion;
  walletError.value = false;
  const id = userStore.currentUser?.id;
  if (!open.value || id === undefined || walletStore.loading) return;
  if (walletStore.account && Date.now() - walletStore.lastFetchedAt < 60_000) return;
  try { await walletStore.fetchWallet(id); }
  catch { if (version === requestVersion && open.value && String(userStore.currentUser?.id) === String(id)) walletError.value = true; }
}
watch([open, () => userStore.currentUser?.id], () => {
  if (!userStore.isLoggedIn) open.value = false;
  void loadWallet();
});
onBeforeUnmount(() => { requestVersion += 1; });
function go(to: string) { open.value = false; void router.push(to); }
function logout() {
  open.value = false;
  userStore.logout();
  Message.success('已退出登录');
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="account-menu">
    <Dialog v-if="userStore.isLoggedIn" v-model:open="open">
      <DialogTrigger as-child><Button type="button" variant="outline" class="account-trigger"><Icon icon="lucide:user-round" width="16" />我的账户</Button></DialogTrigger>
      <DialogContent class="account-dialog max-w-[380px] gap-[18px] rounded-xl p-7 sm:rounded-xl">
        <DialogTitle class="sr-only">我的账户</DialogTitle>
        <DialogDescription class="sr-only">查看账户资料、切换视角，以及打开订单、钱包等常用功能。</DialogDescription>
        <div class="account-identity"><span class="avatar">{{ avatarInitial }}</span><div class="identity-meta"><h2 :title="userStore.displayName">{{ userStore.displayName }}</h2><div class="member-info"><VipBadge v-if="userStore.currentUser" :level="userStore.currentUser.vipLevel" size="sm" /><span v-if="userStore.currentUser?.accountInfoUnavailable">资料未更新</span><span v-else>{{ userStore.isBuyerActive ? '买手视角' : '顾客视角' }}</span></div></div></div>
        <AudienceSegment v-if="userStore.canSwitchToBuyer" variant="cards" />
        <Button v-else type="button" variant="outline" @click="go('/buyer/apply')"><Icon icon="lucide:store" width="16" />申请成为买手<Icon icon="lucide:arrow-right" width="16" /></Button>
        <button type="button" class="account-balance" @click="go('/wallet')"><span>钱包可用余额<small>USDT</small></span><strong>{{ walletStore.loading ? '正在加载…' : balance }}</strong><span class="balance-hint">{{ walletError || (!walletStore.loading && !walletStore.account) ? '暂不可用，前往钱包重试' : '查看钱包' }}<Icon icon="lucide:arrow-right" width="14" /></span></button>
        <nav class="account-links" aria-label="账户快捷入口"><button v-for="item in links" :key="item.to" type="button" @click="go(item.to)"><Icon :icon="item.icon" width="21" /><span>{{ item.label }}</span></button></nav>
        <Button type="button" class="profile-button" @click="go('/profile')">进入个人中心<Icon icon="lucide:arrow-right" width="16" /></Button>
        <div class="account-footer"><Button type="button" variant="ghost" size="sm" @click="go('/im')"><Icon icon="lucide:headphones" width="15" />消息与客服</Button><Button type="button" variant="ghost" size="sm" @click="logout"><Icon icon="lucide:log-out" width="15" />退出登录</Button></div>
      </DialogContent>
    </Dialog>
    <div v-else class="guest-actions"><Button variant="ghost" size="sm" @click="router.push({ name: 'login' })">登录</Button><Button variant="outline" size="sm" @click="router.push({ name: 'register' })">注册</Button></div>
  </div>
</template>

<style scoped>
.account-menu { min-width: 0; }
.account-trigger { white-space: nowrap; height: 38px; padding-inline: 13px; font-size: 12px; background: transparent; box-shadow: none; }
.account-dialog { max-width: 380px; gap: 18px; padding: 28px; border-radius: 12px; }
.account-identity { display: flex; align-items: center; gap: 14px; padding-right: 16px; }
.avatar { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--yb-fill); color: var(--yb-primary); font-size: 20px; font-weight: 600; }
.identity-meta { min-width: 0; }.identity-meta h2 { margin: 0 0 5px; font-size: 16px; font-weight: 650; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.member-info { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--yb-muted); }
.account-balance { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 12px; text-align: left; padding: 16px; border-radius: 8px; background: var(--yb-fill); }.account-balance>span:first-child { grid-column: 1; display: flex; gap: 8px; font-size: 11px; color: var(--yb-muted); }.account-balance small { font-size: 10px; letter-spacing: 1px; }.account-balance strong { grid-column: 1; font-size: 18px; line-height: 1.3; font-weight: 650; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }.balance-hint { grid-column: 2; grid-row: 1 / 3; display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--yb-primary); }
.account-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }.account-links button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 66px; padding: 7px 2px; border-radius: 6px; font-size: 11px; color: var(--yb-muted); transition: background 150ms, color 150ms; }.account-links button:hover { background: var(--yb-fill); color: var(--yb-primary); }
.profile-button { width: 100%; justify-content: space-between; min-height: 40px; font-size: 12px; }.account-footer { display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--yb-hairline); }.account-footer button { font-size: 11px; padding-inline: 3px; }
.guest-actions { display: flex; align-items: center; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .account-links button { transition: none; } }
</style>
