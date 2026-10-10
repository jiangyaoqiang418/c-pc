<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { enums, formatAmount, formatPoints } from '@shared';
import * as vipApi from '@/service/api/vip';
import * as realAuthApi from '@/service/api/auth';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
import VipBadge from '@/components/common/vip-badge.vue';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();

const vipStatus = ref<Api.RealVip.Status>();
const totalAssets = ref<{ total?: string; account?: Api.RealWallet.Account }>();
const orderCounts = ref<Record<string, number>>();
const loading = ref(false);
const loadError = ref('');
const editVisible = ref(false);
const savingProfile = ref(false);
const profileRefreshError = ref(false);
const refreshingProfile = ref(false);
let profileLoadVersion = 0;
let profileWriteVersion = 0;
const profileRequestGuard = createLatestRequestGuard();
const editForm = reactive<Api.RealAuth.ProfileUpdateParams>({
  nickname: '',
  phone: '',
  avatar: ''
});

const user = computed(() => userStore.currentUser);
const kycMeta = computed(() => (user.value ? enums.KYC_STATUS_META[user.value.kycStatus] : undefined));
const registeredDate = computed(() => {
  if (!user.value?.registeredAt) return '';
  const date = new Date(user.value.registeredAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
});

async function loadProfile() {
  const uid = user.value?.id;
  if (!uid) {
    profileRequestGuard.invalidate();
    profileLoadVersion += 1;
    loading.value = false;
    vipStatus.value = undefined;
    totalAssets.value = undefined;
    orderCounts.value = undefined;
    loadError.value = '';
    return;
  }
  const isCurrent = profileRequestGuard.begin();
  const version = ++profileLoadVersion;
  loading.value = true;
  loadError.value = '';
  vipStatus.value = undefined;
  totalAssets.value = undefined;
  orderCounts.value = undefined;
  const [vip, assets, counts] = await Promise.allSettled([
    vipApi.fetchMyVipStatus(uid, { signal: isCurrent.signal, showError: false }),
    realWalletApi.fetchWalletOverview(uid, { signal: isCurrent.signal, showError: false }),
    userStore.isBuyerActive
      ? realOrderApi.countMySoldOrdersByStatus({ signal: isCurrent.signal, showError: false })
      : realOrderApi.countMyOrdersByStatus({ signal: isCurrent.signal, showError: false })
  ]);
  if (!isCurrent() || version !== profileLoadVersion) return;
  if (vip.status === 'fulfilled') vipStatus.value = vip.value;
  if (assets.status === 'fulfilled') totalAssets.value = { total: assets.value.total, account: assets.value.account };
  if (counts.status === 'fulfilled') orderCounts.value = counts.value;
  if ([vip, assets, counts].some(result => result.status === 'rejected')) {
    loadError.value = '部分账户数据加载失败，请稍后重试。';
  }
  if (isCurrent()) loading.value = false;
}

onMounted(loadProfile);
onBeforeUnmount(() => {
  profileRequestGuard.invalidate();
  profileLoadVersion += 1;
  profileWriteVersion += 1;
});
watch(() => userStore.currentUser?.id, () => {
  profileWriteVersion += 1;
  savingProfile.value = false;
  refreshingProfile.value = false;
  profileRefreshError.value = false;
  editVisible.value = false;
  profileRequestGuard.invalidate();
  void loadProfile();
});
watch(() => userStore.currentAudience, loadProfile);

function openEditProfile() {
  if (!user.value || savingProfile.value) return;
  editForm.nickname = user.value.nickname;
  editForm.phone = user.value.phone || '';
  editForm.avatar = user.value.avatar || '';
  editVisible.value = true;
}

async function saveProfile() {
  if (savingProfile.value) return;
  if (!editForm.nickname?.trim()) {
    Message.warning('请输入昵称');
    return;
  }
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const operation = ++profileWriteVersion;
  savingProfile.value = true;
  try {
    await realAuthApi.updateProfile({
      nickname: editForm.nickname.trim(),
      phone: editForm.phone?.trim() || undefined,
      avatar: editForm.avatar?.trim() || undefined
    });
    if (operation !== profileWriteVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    editVisible.value = false;
    Message.success('资料已更新');
    await refreshSavedProfile();
  } catch {
    // 请求层已展示错误，保留弹窗与当前表单供用户修正后重试。
  } finally {
    if (operation === profileWriteVersion) savingProfile.value = false;
  }
}

async function refreshSavedProfile(saved = true) {
  if (refreshingProfile.value) return;
  const operation = profileWriteVersion;
  refreshingProfile.value = true;
  try {
    await userStore.refreshCurrentUser();
    if (operation === profileWriteVersion) profileRefreshError.value = false;
  } catch {
    if (operation === profileWriteVersion) {
      if (saved) profileRefreshError.value = true;
      Message.warning(saved ? '资料已保存，但最新资料读取失败，请重新读取' : '会员资料读取失败，请稍后重试');
    }
  } finally {
    if (operation === profileWriteVersion) refreshingProfile.value = false;
  }
}

interface QuickEntry {
  key: string;
  label: string;
  emoji: string;
  go: () => void;
  disabled?: boolean;
  phase?: number;
}

const quickEntries = computed<QuickEntry[]>(() => [
  { key: 'orders', label: '我的订单', emoji: '📦', go: () => router.push('/order') },
  { key: 'favorites', label: '我的收藏', emoji: '', go: () => router.push('/favorites') },
  { key: 'im', label: '消息中心', emoji: '', go: () => router.push('/im') },
  { key: 'notifications', label: '站内通知', emoji: '', go: () => router.push('/notifications') },
  { key: 'cart', label: '购物车', emoji: '🛒', go: () => router.push('/cart') },
  { key: 'wallet', label: '我的钱包', emoji: '💰', go: () => router.push('/wallet') },
  { key: 'finance', label: '小金库', emoji: '📈', go: () => router.push('/finance') },
  { key: 'kyc', label: 'KYC 认证', emoji: '🪪', go: () => router.push('/kyc') },
  { key: 'vip', label: 'VIP 特权', emoji: '👑', go: () => router.push('/vip') },
  { key: 'address', label: '地址管理', emoji: '📍', go: () => router.push('/address') },
  { key: 'pay-password', label: '支付密码', emoji: '🔐', go: () => router.push('/profile/pay-password') },
  ...(userStore.needsLoginPassword
    ? [{ key: 'login-password', label: '设置登录密码', emoji: '🔑', go: () => router.push('/profile/login-password') }]
    : []),
  { key: 'purchase', label: '我的求购', emoji: '🔍', go: () => router.push('/purchase') },
  { key: 'aftersale', label: '我的售后', emoji: '🔧', go: () => router.push('/aftersale') },
  { key: 'review', label: '我的评价', emoji: '⭐', go: () => router.push('/review') },
  { key: 'points', label: '我的积分', emoji: '🎯', go: () => router.push('/points') },
  {
    key: 'buyer',
    label: user.value?.isBuyer ? '买手中心' : '成为买手',
    emoji: '🤝',
    go: () => {
      if (user.value?.isBuyer) {
        router.push('/buyer/dashboard');
      } else {
        router.push('/buyer/apply');
      }
    }
  }
]);

function orderCount(...statuses: string[]) {
  if (!orderCounts.value) return undefined;
  const counts = statuses.map(status => orderCounts.value![status]);
  if (counts.some(count => !Number.isFinite(count) || count! < 0)) return undefined;
  return counts.reduce<number>((sum, count) => sum + count!, 0);
}

const orderTabsMeta = computed(() => [
  { label: '待付款', count: orderCount('PENDING_PAYMENT'), tab: 'pending' },
  { label: '待发货', count: orderCount('PROCURING', 'PROCURED'), tab: 'shipping' },
  { label: '待收货', count: orderCount('IN_TRANSIT', 'AFTERSALE_CONFIRM'), tab: 'receiving' },
  { label: '已完成', count: orderCount('COMPLETED', 'WARRANTY'), tab: 'done' },
  { label: '售后中', count: orderCount('IN_AFTERSALE'), tab: 'aftersale' }
]);


const entryIcons: Record<string, string> = {
  orders: 'lucide:package', cart: 'lucide:shopping-bag', wallet: 'lucide:wallet',
  finance: 'lucide:chart-no-axes-combined', kyc: 'lucide:badge-check', vip: 'lucide:crown',
  address: 'lucide:map-pin', 'pay-password': 'lucide:shield-check', 'login-password': 'lucide:key-round',
  purchase: 'lucide:search', aftersale: 'lucide:headset', review: 'lucide:message-square-text',
  points: 'lucide:gift', buyer: 'lucide:store', favorites: 'lucide:heart', im: 'lucide:message-circle', notifications: 'lucide:bell'
};
const groupDefinitions = [
  { key: 'shopping', label: '购物与订单', icon: 'lucide:shopping-bag', keys: ['orders', 'cart', 'aftersale', 'review', 'purchase', 'favorites'] },
  { key: 'assets', label: '钱包与资产', icon: 'lucide:wallet', keys: ['wallet', 'finance'] },
  { key: 'membership', label: '会员与权益', icon: 'lucide:crown', keys: ['vip', 'points'] },
  { key: 'security', label: '账户与安全', icon: 'lucide:shield-check', keys: ['address', 'kyc', 'pay-password', 'login-password'] },
  { key: 'messages', label: '消息通知', icon: 'lucide:bell', keys: ['im', 'notifications'] },
  { key: 'buyer', label: '买手服务', icon: 'lucide:store', keys: ['buyer'] }
];
const entryGroups = computed(() => groupDefinitions.map(group => ({
  ...group, entries: quickEntries.value.filter(entry => group.keys.includes(entry.key))
})));
const openGroups = ref<string[]>([]);
const allGroupsOpen = computed(() => openGroups.value.length === groupDefinitions.length);
function toggleGroup(key: string) {
  openGroups.value = openGroups.value.includes(key) ? openGroups.value.filter(value => value !== key) : [...openGroups.value, key];
}
function toggleAllGroups() {
  openGroups.value = allGroupsOpen.value ? [] : groupDefinitions.map(group => group.key);
}
const orderIcons: Record<string, string> = { pending: 'lucide:wallet', shipping: 'lucide:package', receiving: 'lucide:truck', done: 'lucide:circle-check', aftersale: 'lucide:headset' };
const avatarFailed = ref(false);
watch(() => user.value?.avatar, () => { avatarFailed.value = false; });
const vipProgressPercent = computed(() => {
  if (!vipStatus.value?.nextThreshold) return undefined;
  const value = vipStatus.value.points / vipStatus.value.nextThreshold * 100;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
});
</script>

<template>
  <div class="profile-page shop-container">
    <div v-if="user" class="layout" :aria-busy="loading">
      <Alert v-if="loadError" variant="destructive" class="load-error notice"><AlertDescription>{{ loadError }}</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="loadProfile">重新加载</Button></Alert>
      <article class="user-card">
        <div class="user-head">
          <div class="avatar"><img v-if="user.avatar && !avatarFailed" :src="user.avatar" :alt="user.nickname" @error="avatarFailed = true" /><span v-else>{{ user.nickname.slice(0, 1) }}</span></div>
          <div class="info">
            <div class="name-row"><h1 class="name" :title="user.nickname">{{ user.nickname }}</h1><VipBadge :level="user.vipLevel" /><span v-if="kycMeta" class="status" :class="kycMeta.color">KYC：{{ kycMeta.label }}</span><span v-if="user.isBuyer" class="status orange">已是买手</span></div>
            <div class="meta"><span>{{ user.email ?? '未绑定邮箱' }}</span><span v-if="registeredDate">注册于 {{ registeredDate }}</span></div>
            <div v-if="vipStatus?.nextThreshold" class="vip-progress"><small>距离下一等级还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 积分</small><Progress v-if="vipProgressPercent !== undefined" :model-value="vipProgressPercent" aria-label="VIP 积分进度" class="h-1" /></div>
          </div>
          <Button variant="outline" size="sm" class="edit-profile" :disabled="savingProfile" @click="openEditProfile"><Icon icon="lucide:pencil" width="14" />编辑资料</Button>
        </div>
        <Alert v-if="user.accountInfoUnavailable" class="notice"><AlertDescription>积分或等级资料未更新，已有值仅供参考。</AlertDescription><Button variant="outline" size="sm" :disabled="refreshingProfile" @click="refreshSavedProfile(false)">重试会员资料</Button></Alert>
        <Alert v-if="profileRefreshError" class="notice"><AlertDescription>资料已保存，当前显示的资料尚未刷新。</AlertDescription><Button variant="outline" size="sm" :disabled="refreshingProfile" @click="refreshSavedProfile()">重新读取</Button></Alert>
      </article>
      <article class="panel orders-panel">
        <header class="card-head"><h2>{{ userStore.isBuyerActive ? '卖出订单概况' : '我的订单' }}</h2><RouterLink to="/order" class="view-all">全部订单 <Icon icon="lucide:chevron-right" width="15" /></RouterLink></header>
        <div class="order-stats"><button v-for="o in orderTabsMeta" :key="o.tab" type="button" class="stat" @click="router.push({ path: '/order', query: { tab: o.tab } })"><Icon :icon="orderIcons[o.tab]" width="28" /><span>{{ o.label }}</span><Skeleton v-if="loading && o.count === undefined" class="stat-loading" /><strong v-else>{{ o.count ?? '—' }}</strong></button></div>
      </article>
      <section class="asset-grid" aria-label="账户资产与权益">
        <RouterLink to="/wallet" class="asset-card"><span class="asset-label"><Icon icon="lucide:wallet" width="19" />可用余额</span><Skeleton v-if="loading && !totalAssets" class="asset-loading" /><strong v-else>{{ totalAssets?.account ? formatAmount(totalAssets.account.available) : '—' }} <small>USDT</small></strong><span class="asset-link">管理钱包 <Icon icon="lucide:chevron-right" width="14" /></span></RouterLink>
        <RouterLink to="/vip" class="asset-card"><span class="asset-label"><Icon icon="lucide:crown" width="19" />会员等级</span><strong>{{ user.vipLevel ?? '—' }}</strong><span class="asset-link">查看专属权益 <Icon icon="lucide:chevron-right" width="14" /></span></RouterLink>
        <RouterLink to="/points" class="asset-card"><span class="asset-label"><Icon icon="lucide:gift" width="19" />我的积分</span><strong>{{ user.points === undefined ? '—' : formatPoints(user.points) }} <small>积分</small></strong><span class="asset-link">积分流水与申诉 <Icon icon="lucide:chevron-right" width="14" /></span></RouterLink>
      </section>
      <section class="services">
        <header class="card-head"><h2>账户服务</h2><Button variant="ghost" size="sm" @click="toggleAllGroups">{{ allGroupsOpen ? '收起全部' : '展开全部' }}<Icon :icon="allGroupsOpen ? 'lucide:chevrons-up' : 'lucide:chevrons-down'" width="15" /></Button></header>
        <div class="service-grid">
          <article v-for="group in entryGroups" :key="group.key" class="service-group">
            <button class="group-trigger" :aria-expanded="openGroups.includes(group.key)" :aria-controls="'service-' + group.key" @click="toggleGroup(group.key)"><span class="entry-icon"><Icon :icon="group.icon" width="22" /></span><span><strong>{{ group.label }}</strong><small>{{ group.entries.map(entry => entry.label).join(' · ') }}</small></span><Icon icon="lucide:chevron-down" width="17" class="entry-arrow" :class="{ expanded: openGroups.includes(group.key) }" /></button>
            <div v-if="openGroups.includes(group.key)" :id="'service-' + group.key" class="group-entries"><button v-for="entry in group.entries" :key="entry.key" @click="entry.go()"><Icon :icon="entryIcons[entry.key]" width="17" />{{ entry.label }}<Icon icon="lucide:chevron-right" width="14" /></button></div>
          </article>
        </div>
      </section>
    </div>
    <AModal v-model:visible="editVisible" title="编辑资料" :width="560" :ok-loading="savingProfile" :on-before-ok="() => { void saveProfile(); return false; }"><div class="edit-fields"><div><Label for="profile-nickname">昵称 <span aria-hidden="true">*</span></Label><Input id="profile-nickname" v-model="editForm.nickname" :disabled="savingProfile" maxlength="64" placeholder="请输入昵称" autocomplete="nickname" /></div><div><Label for="profile-phone">手机号</Label><Input id="profile-phone" v-model="editForm.phone" :disabled="savingProfile" maxlength="32" placeholder="请输入手机号" autocomplete="tel" /></div><div><Label for="profile-avatar">头像地址</Label><Input id="profile-avatar" v-model="editForm.avatar" :disabled="savingProfile" maxlength="512" placeholder="请输入头像图片 URL" /></div></div></AModal>
  </div>
</template>

<style scoped>
.profile-page { padding-bottom: 48px; }
.layout { display: grid; gap: 24px; }
.user-card { padding: 28px 32px; border-radius: 10px; background: var(--yb-brand-primary); color: var(--yb-paper); }
.user-head { display: flex; align-items: center; gap: 24px; }
.avatar { display: grid; place-items: center; flex-shrink: 0; width: 76px; height: 76px; border-radius: 50%; overflow: hidden; background: var(--yb-paper); color: var(--yb-brand-primary); font-size: 28px; font-weight: 600; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
.name { max-width: 360px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 25px; font-weight: 650; margin: 0; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--yb-paper); opacity: .72; font-size: 13px; overflow-wrap: anywhere; }
.edit-profile { flex-shrink: 0; border-color: var(--yb-apricot); color: var(--yb-ink); background: var(--yb-apricot); min-height:44px; padding-inline:24px; gap: 8px; }
.edit-profile:hover { background: var(--yb-gold); color: var(--yb-ink); }
.vip-progress { display: grid; gap: 7px; margin-top: 12px; max-width: 280px; }
.vip-progress small { font-size: 12px; opacity: .8; }
.vip-progress strong { color: var(--yb-accent); margin: 0 4px; }
.panel { padding: 28px 32px; border: 1px solid var(--yb-hairline); border-radius: 10px; background: var(--yb-paper); }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 22px; }
.card-head h2 { font-size: 24px; font-weight: 650; margin: 0; }
.card-head button { color: var(--yb-muted); font-size: 13px; gap: 6px; }
.view-all { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--yb-muted); }
.order-stats { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); }
.stat { display: grid; justify-items: center; gap: 8px; padding: 8px 6px; border-right: 1px solid var(--yb-hairline); background: transparent; cursor: pointer; transition: color .15s; color: var(--yb-muted); }
.stat:last-child { border-right: 0; }
.stat:hover { color: var(--yb-brand-primary); }
.stat strong { font-size: 16px; font-weight: 550; color: var(--yb-ink); line-height: 1.4; }
.stat span { font-size: 13px; }
.stat-loading { width: 30px; height: 30px; }
.asset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.asset-card { display: grid; gap: 14px; padding: 22px 26px; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-primary-soft); transition: border-color .15s; }
.asset-card:hover { border-color: var(--yb-gold); }
.asset-label { display: flex; align-items: center; gap: 9px; font-size: 14px; color: var(--yb-muted); }
.asset-label svg { color: var(--yb-gold); }
.asset-card strong { font-size: 28px; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.asset-card strong small { font-size: 12px; font-weight: 400; color: var(--yb-muted); }
.asset-link { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--yb-muted); }
.asset-loading { width: 160px; height: 38px; }
.service-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px 20px; }
.service-group { border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-paper); overflow: hidden; }
.group-trigger { width: 100%; display: flex; align-items: center; gap: 16px; padding: 20px 24px; text-align: left; transition: background .15s; }
.group-trigger:hover { background: var(--yb-primary-soft); }
.group-trigger strong { display: block; font-size: 16px; font-weight: 600; }
.group-trigger small { display: block; margin-top: 4px; color: var(--yb-muted); font-size: 12px; }
.entry-icon { display: grid; place-items: center; color: var(--yb-brand-primary); }
.entry-arrow { margin-left: auto; color: var(--yb-muted); transition: transform .2s; flex-shrink: 0; }
.entry-arrow.expanded { transform: rotate(180deg); }
.group-entries { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; padding: 12px 20px; border-top: 1px solid var(--yb-hairline); }
.group-entries button { display: flex; align-items: center; gap: 9px; padding: 10px 4px; font-size: 13px; text-align: left; }
.group-entries button svg:last-child { margin-left: auto; }
.group-entries button:hover { color: var(--yb-brand-primary); }
.stat:focus-visible,.group-trigger:focus-visible,.group-entries button:focus-visible,.asset-card:focus-visible { outline: 2px solid var(--yb-brand-primary); outline-offset: -3px; }
.status { border-radius: 4px; padding: 3px 8px; background: rgba(255,255,255,.12); color: var(--yb-paper); font-size: 12px; }
.status.orange { color: var(--yb-accent); }
.status.red { color: #ffd1ce; }
.notice { display: grid; gap: 12px; }
.user-card .notice { margin-top: 18px; }
.edit-fields,.edit-fields > div { display: grid; gap: 10px; }
.edit-fields { gap: 22px; }
.edit-fields label span { color: var(--destructive); }
@media(max-width: 800px) { .user-card,.panel { padding: 24px; } .user-head { flex-wrap: wrap; gap: 16px; } .asset-grid { grid-template-columns: 1fr; } .service-grid { grid-template-columns: 1fr; } }
@media(prefers-reduced-motion: reduce) { .entry-arrow,.stat,.asset-card,.group-trigger { transition: none; } }
</style>
