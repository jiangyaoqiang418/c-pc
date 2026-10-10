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
  points: 'lucide:gift', buyer: 'lucide:store'
};
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
    <header class="page-heading"><span class="eyebrow">YOUR ACCOUNT</span><h1>个人中心</h1></header>
    <div v-if="user" class="layout" :aria-busy="loading">
      <Alert v-if="loadError" variant="destructive" class="load-error notice"><AlertDescription>{{ loadError }}</AlertDescription><Button variant="outline" size="sm" :disabled="loading" @click="loadProfile">重新加载</Button></Alert>
      <section class="left">
        <article class="user-card"><div class="user-head"><div class="avatar"><img v-if="user.avatar && !avatarFailed" :src="user.avatar" :alt="user.nickname" @error="avatarFailed = true" /><span v-else>{{ user.nickname.slice(0, 1) }}</span></div><div class="info"><div class="name-row"><h2 class="name" :title="user.nickname">{{ user.nickname }}</h2><VipBadge :level="user.vipLevel" /><span v-if="kycMeta" class="status" :class="kycMeta.color">KYC：{{ kycMeta.label }}</span><span v-if="user.isBuyer" class="status orange">已是买手</span></div><div class="meta"><span>{{ user.email ?? '未绑定邮箱' }}</span><span>积分 {{ user.points === undefined ? '—' : formatPoints(user.points) }}</span><span v-if="registeredDate">注册于 {{ registeredDate }}</span></div><Button variant="link" size="sm" class="edit-profile" :disabled="savingProfile" @click="openEditProfile">编辑资料<Icon icon="lucide:arrow-up-right" width="14" /></Button>
          <Alert v-if="user.accountInfoUnavailable" class="notice"><AlertDescription>积分或等级资料未更新，已有值仅供参考。</AlertDescription><Button variant="outline" size="sm" :disabled="refreshingProfile" @click="refreshSavedProfile(false)">重试会员资料</Button></Alert>
          <Alert v-if="profileRefreshError" class="notice"><AlertDescription>资料已保存，当前显示的资料尚未刷新。</AlertDescription><Button variant="outline" size="sm" :disabled="refreshingProfile" @click="refreshSavedProfile()">重新读取</Button></Alert>
          <div v-if="vipStatus?.nextThreshold" class="vip-progress"><small>距离下一等级还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 积分</small><Progress v-if="vipProgressPercent !== undefined" :model-value="vipProgressPercent" aria-label="VIP 积分进度" class="h-1.5" /></div>
        </div></div></article>
        <article class="panel"><header class="card-head"><h2>{{ userStore.isBuyerActive ? '卖出订单概况' : '买入订单概况' }}</h2><RouterLink to="/order" class="view-all">查看全部 <Icon icon="lucide:arrow-up-right" width="15" /></RouterLink></header><div class="order-stats"><button v-for="o in orderTabsMeta" :key="o.label" type="button" class="stat" @click="router.push({ path: '/order', query: { tab: o.tab } })"><Skeleton v-if="loading && o.count === undefined" class="stat-loading" /><strong v-else>{{ o.count ?? '—' }}</strong><span>{{ o.label }}</span></button></div></article>
        <article class="panel"><h2>账户服务</h2><div class="quick-grid"><button v-for="q in quickEntries" :key="q.key" type="button" class="quick-cell" @click="q.go()"><span class="entry-icon"><Icon :icon="entryIcons[q.key] || 'lucide:arrow-up-right'" width="23" /></span><span>{{ q.label }}</span><Icon icon="lucide:chevron-right" width="15" class="entry-arrow" /></button></div></article>
      </section>
      <aside class="right"><article class="asset-card"><span class="eyebrow">WALLET OVERVIEW</span><h2>我的资产</h2><Skeleton v-if="loading && !totalAssets" class="asset-loading" /><strong v-else class="asset-amount">{{ totalAssets ? `U ${formatAmount(totalAssets.total)}` : '读取失败' }}</strong><dl v-if="totalAssets"><div><dt>可用余额</dt><dd>U {{ formatAmount(totalAssets.account?.available) }}</dd></div><div><dt>理财锁仓</dt><dd>U {{ formatAmount(totalAssets.account?.lockedFinance) }}</dd></div></dl><Button class="asset-btn" @click="router.push('/wallet')">进入钱包<Icon icon="lucide:arrow-right" width="16" /></Button></article></aside>
    </div>
    <AModal v-model:visible="editVisible" title="编辑资料" :width="560" :ok-loading="savingProfile" :on-before-ok="() => { void saveProfile(); return false; }"><div class="edit-fields"><div><Label for="profile-nickname">昵称 <span aria-hidden="true">*</span></Label><Input id="profile-nickname" v-model="editForm.nickname" :disabled="savingProfile" maxlength="64" placeholder="请输入昵称" autocomplete="nickname" /></div><div><Label for="profile-phone">手机号</Label><Input id="profile-phone" v-model="editForm.phone" :disabled="savingProfile" maxlength="32" placeholder="请输入手机号" autocomplete="tel" /></div><div><Label for="profile-avatar">头像地址</Label><Input id="profile-avatar" v-model="editForm.avatar" :disabled="savingProfile" maxlength="512" placeholder="请输入头像图片 URL" /></div></div></AModal>
  </div>
</template>

<style scoped>
.profile-page { padding-top:32px; padding-bottom:48px; }.page-heading { margin-bottom:24px; }.eyebrow { color:var(--yb-gold); font-size:11px; letter-spacing:2px; }h1 { margin:5px 0 0; font-size:28px; font-weight:650; }.layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:24px; }.load-error { grid-column:1/-1; }.left,.right { min-width:0; display:flex; flex-direction:column; gap:22px; }.user-card,.panel,.asset-card { padding:28px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-paper); }.user-card { background:linear-gradient(120deg,var(--yb-primary-soft),var(--yb-paper) 70%); }.user-head { display:flex; gap:22px; }.avatar { display:grid; place-items:center; flex-shrink:0; width:76px; height:76px; border-radius:50%; overflow:hidden; background:var(--yb-brand-primary); color:var(--yb-paper); font-size:28px; font-weight:600; }.avatar img { width:100%; height:100%; object-fit:cover; }.info { flex:1; min-width:0; }.name-row { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px; }.name { max-width:280px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:23px; font-weight:600; margin:0; }.meta { display:flex; flex-wrap:wrap; gap:6px 16px; color:var(--yb-muted); font-size:13px; overflow-wrap:anywhere; }.edit-profile { padding-left:0; margin:8px 0; }.vip-progress { display:grid; gap:10px; margin-top:8px; max-width:370px; }.vip-progress small { font-size:12px; color:var(--yb-muted); }.vip-progress strong { color:var(--yb-brand-primary); margin:0 4px; }.panel h2,.asset-card h2 { font-size:18px; font-weight:600; margin:0 0 22px; }.card-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:20px; }.card-head h2 { margin:0; }.view-all { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--yb-brand-primary); }.order-stats { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }.stat { display:grid; justify-items:center; gap:8px; padding:16px 6px; border:0; border-radius:6px; background:transparent; cursor:pointer; transition:background .15s; }.stat:hover { background:var(--yb-primary-soft); }.stat strong { font-size:25px; font-weight:600; }.stat span { font-size:13px; color:var(--yb-muted); }.stat-loading { width:36px; height:32px; }.stat:focus-visible,.quick-cell:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:3px; }.quick-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.quick-cell { display:flex; align-items:center; gap:12px; padding:15px 12px; border:1px solid var(--yb-hairline); border-radius:6px; background:var(--yb-paper); text-align:left; font-size:13px; cursor:pointer; transition:transform .2s,border-color .2s,background .2s; }.quick-cell:hover { transform:translateY(-2px); border-color:var(--yb-hairline-2); background:var(--yb-primary-soft); }.entry-icon { display:grid; place-items:center; color:var(--yb-brand-primary); }.entry-arrow { margin-left:auto; color:var(--yb-muted); }.asset-card { position:sticky; top:24px; background:var(--yb-primary-soft); }.asset-card h2 { margin:8px 0 24px; }.asset-amount { display:block; font-size:30px; font-weight:650; color:var(--yb-brand-primary); overflow-wrap:anywhere; }.asset-loading { width:180px; height:40px; }dl { margin:24px 0; display:grid; gap:14px; }dl>div { display:flex; justify-content:space-between; align-items:center; gap:12px; }dt { font-size:13px; color:var(--yb-muted); }dd { margin:0; font-size:14px; font-weight:500; }.asset-btn { margin-top:14px; width:100%; }.status { border-radius:4px; padding:3px 8px; background:var(--yb-fill); color:var(--yb-muted); font-size:12px; }.status.orange { background:#fff3df; color:#9a5709; }.status.green { background:#e9f3eb; color:#326b43; }.status.red { background:#fcecea; color:#ad453e; }.notice { margin:12px 0; display:grid; gap:12px; }.edit-fields,.edit-fields>div { display:grid; gap:10px; }.edit-fields { gap:22px; }.edit-fields label span { color:var(--destructive); }@media(max-width:1050px) { .layout { grid-template-columns:minmax(0,1fr) 290px; }.quick-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.user-card,.panel,.asset-card { padding:22px; } }@media(max-width:800px) { .layout { grid-template-columns:1fr; }.quick-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.user-head { flex-wrap:wrap; } }@media(prefers-reduced-motion:reduce) { .quick-cell,.stat { transition:none; }.quick-cell:hover { transform:none; } }
</style>
