<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import { Message } from '@/lib/feedback';
import { useNotifyStore, useUserStore, useWalletStore } from '@/stores';
import { formatAmount } from '@shared';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();
const notify = useNotifyStore();
const open = ref(false);
let lastTrigger: HTMLElement | undefined;
const walletError = ref(false);
const role = computed(() => userStore.isBuyerActive ? 'buyer' : 'customer');
let requestVersion = 0;
const customerLinks = [
  { label: '我的订单', icon: 'box', to: '/order' },
  { label: '我的收藏', icon: 'heart', to: '/favorites' },
  { label: '我的钱包', icon: 'wallet', to: '/wallet' },
  { label: '收货地址', icon: 'pin', to: '/address' },
  { label: '我的求购', icon: 'search', to: '/purchase' },
  { label: '帮助中心', icon: 'headset', to: '/help' }
];
const buyerLinks = [
  { label: '商品管理', icon: 'bag', to: '/buyer/products' },
  { label: '买手订单', icon: 'box', to: '/buyer/orders' },
  { label: '求购接单', icon: 'search', to: '/buyer/claimable' },
  { label: '买手钱包', icon: 'wallet', to: '/buyer/wallet' },
  { label: '售后查看', icon: 'return', to: '/buyer/aftersales' },
  { label: '押金管理', icon: 'shield', to: '/buyer/deposit' }
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
watch([open, () => userStore.currentUser?.id], ([, id], previous) => {
  if (previous?.[1] !== undefined && id === undefined) open.value = false;
  void loadWallet();
});
onBeforeUnmount(() => { requestVersion += 1; });
function go(to: string) { open.value = false; void router.push(to); }
function rememberTrigger(event: MouseEvent) { if (event.currentTarget instanceof HTMLElement) lastTrigger = event.currentTarget; }
function restoreTrigger(event: Event) { event.preventDefault(); if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll:true }); }
function switchRole(next: 'customer' | 'buyer') {
  if (next === role.value) return;
  if (next === 'buyer' && !userStore.isLoggedIn) { go('/auth/login?redirect=/buyer/dashboard'); return; }
  if (next === 'buyer' && !userStore.canSwitchToBuyer) { go('/buyer/apply'); return; }
  userStore.setAudience(next);
}
function logout() {
  open.value = false;
  userStore.logout();
  Message.success('已退出登录');
  void router.push({ name: 'login' });
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child><button type="button" class="account-trigger" aria-label="打开账户功能与身份切换" @click="rememberTrigger"><UmIcon name="user" /><span>{{ userStore.isLoggedIn ? (userStore.isBuyerActive ? '买手账户' : '我的账户') : '登录 / 注册' }}</span></button></DialogTrigger>
    <DialogTrigger as-child><button type="button" class="mobile-account-trigger" :class="{ buyer: role === 'buyer' }" :aria-label="`打开${role === 'buyer' ? '买手' : '顾客'}功能与身份切换`" aria-controls="mobile-account-menu" @click="rememberTrigger"><span class="mobile-account-avatar"><UmIcon :name="role === 'buyer' ? 'bag' : 'user'" /><i v-if="userStore.isLoggedIn" /></span><span class="mobile-account-label">{{ role === 'buyer' ? '买手' : '顾客' }}<UmIcon name="chevron" /></span></button></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="modal-overlay account-menu-overlay" />
      <DialogContent as="section" class="dialog account-menu-dialog" aria-label="账户功能与身份切换" @close-auto-focus="restoreTrigger">
        <DialogTitle class="sr-only">账户功能与身份切换</DialogTitle><DialogDescription class="sr-only">查看账户资料、切换视角，以及打开订单、钱包等常用功能。</DialogDescription>
        <DialogClose as-child><button type="button" class="dialog-close" aria-label="关闭对话框"><UmIcon name="close" /></button></DialogClose>
        <div id="mobile-account-menu">
        <div class="menu-profile"><span class="menu-profile-avatar" :class="{ buyer: role === 'buyer' }"><UmIcon :name="role === 'buyer' ? 'bag' : 'user'" /></span><div><span class="eyebrow">{{ role === 'buyer' ? 'CURATE YOUR WORLD' : 'YOUR EVERYDAY FINDS' }}</span><h2 :title="userStore.displayName">{{ userStore.isLoggedIn ? userStore.displayName : '欢迎来到 Umaomao' }}</h2><p>{{ userStore.currentUser?.accountInfoUnavailable ? '账户资料暂未更新' : userStore.isLoggedIn ? (role === 'buyer' ? '买手视角 · 精选好物，分享生活' : '顾客视角 · 发现你的心仪好物') : '登录后，管理订单与切换买手身份' }}</p></div></div>
        <div class="menu-role-choices" role="group" aria-label="选择顾客或买手身份"><button v-for="item in [{ id: 'customer' as const, name: '顾客', icon: 'user', note: '选购与收藏' }, { id: 'buyer' as const, name: '买手', icon: 'bag', note: '商品与订单' }]" :key="item.id" type="button" :class="{ active: role === item.id }" :aria-pressed="role === item.id" @click="switchRole(item.id)"><span class="menu-role-avatar"><UmIcon :name="item.icon" /></span><span><b>{{ item.name }}</b><small>{{ item.note }}</small></span><UmIcon v-if="role === item.id" name="check" class="role-check" /></button></div>
        <div v-if="userStore.isLoggedIn" class="menu-account-summary"><span>{{ role === 'buyer' ? '买手工作台' : '可用余额' }}<b>{{ role === 'buyer' ? '好物，由你精选' : walletStore.loading ? '正在加载…' : `${balance} USDT` }}</b><small v-if="role !== 'buyer' && (walletError || (!walletStore.loading && !walletStore.account))">暂不可用，前往钱包重试</small></span><button type="button" @click="go(role === 'buyer' ? '/buyer/products/create' : '/wallet')">{{ role === 'buyer' ? '发布商品' : '查看钱包' }}<UmIcon name="plus" /></button></div>
        <div v-else class="menu-account-login"><button type="button" class="primary" @click="go('/auth/login')">登录账户</button><button type="button" class="outline" @click="go('/auth/register')">注册</button></div>
        <nav class="menu-links" aria-label="账户快捷入口"><button v-for="item in links" :key="item.to" type="button" @click="go(item.to)"><span><UmIcon :name="item.icon" /></span>{{ item.label }}</button></nav>
        <button type="button" class="menu-center-link" @click="go(role === 'buyer' ? '/buyer/dashboard' : '/profile')">{{ role === 'buyer' ? '进入买手中心' : '进入个人中心' }}<UmIcon name="arrow" /></button>
        <div class="menu-account-footer"><button type="button" @click="go('/im')"><UmIcon name="chat" />联系支持<small v-if="notify.imUnreadCount" class="unread">{{ notify.imUnreadCount > 99 ? '99+' : notify.imUnreadCount }}</small></button><button v-if="userStore.isLoggedIn" type="button" aria-label="查看平台通知" @click="go('/notifications')"><UmIcon name="bell" />通知<small v-if="notify.notificationUnreadCount" class="unread">{{ notify.notificationUnreadCount > 99 ? '99+' : notify.notificationUnreadCount }}</small></button><button v-if="userStore.isLoggedIn" type="button" @click="logout"><UmIcon name="logout" />退出登录</button><span v-else>好物，无界。</span></div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.account-menu-dialog { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:171; }
.account-menu-overlay { z-index:170; }
.account-trigger { white-space:nowrap; }
.menu-profile > div { min-width:0; }
.menu-profile h2 { overflow-wrap:anywhere; }
.menu-account-summary small { display:block; font-size:10px; }
.menu-account-summary button { white-space:nowrap; }
.unread { display:grid; place-items:center; min-width:15px; height:15px; padding:0 3px; border-radius:4px; background:var(--green); color:var(--on-primary,#fff); font-size:9px; }
.account-menu-overlay[data-state="open"] { animation:accountFadeIn .2s; } .account-menu-overlay[data-state="closed"] { animation:accountFadeOut .2s; }
.account-menu-dialog[data-state="open"] { animation:accountIn .3s cubic-bezier(.22,1,.36,1); } .account-menu-dialog[data-state="closed"] { animation:accountOut .16s; }
@keyframes accountFadeIn { from { opacity:0; } to { opacity:1; } } @keyframes accountFadeOut { from { opacity:1; } to { opacity:0; } }
@keyframes accountIn { from { opacity:0; transform:translate(-50%,calc(-50% + 18px)) scale(.97); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } } @keyframes accountOut { from { opacity:1; transform:translate(-50%,-50%) scale(1); } to { opacity:0; transform:translate(-50%,calc(-50% + 8px)) scale(.985); } }
@media (max-width:700px) { .account-menu-dialog { top:24px; left:auto; right:24px; transform:none; } }
@media (prefers-reduced-motion:reduce) { .account-menu-overlay[data-state],.account-menu-dialog[data-state] { animation:none; } }
</style>
