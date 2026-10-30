<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { enums, formatAmount, formatPoints } from '@shared';
import * as vipApi from '@/service/api/vip';
import * as realAuthApi from '@/service/api/auth';
import * as realOrderApi from '@/service/api/order';
import * as realWalletApi from '@/service/api/wallet';
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
const profileRequestGuard = createLatestRequestGuard(() => `${String(userStore.currentUser?.id)}:${userStore.sessionVersion}`);
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
    vipApi.fetchMyVipStatus(uid, { signal: isCurrent.signal, showError: false, audience: userStore.currentAudience }),
    realWalletApi.fetchWalletOverview(uid, { signal: isCurrent.signal, showError: false }),
    userStore.isBuyerActive
      ? realOrderApi.countMySoldOrdersByStatus({ signal: isCurrent.signal, showError: false })
      : realOrderApi.countMyOrdersByStatus({ signal: isCurrent.signal, showError: false })
  ]);
  if (!isCurrent() || version !== profileLoadVersion) return;
  if (vip.status === 'fulfilled') vipStatus.value = vip.value;
  if (assets.status === 'fulfilled') totalAssets.value = { total: assets.value.total ?? undefined, account: assets.value.account };
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
watch([() => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
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
  const requestedSession = userStore.sessionVersion;
  if (requestedUserId === undefined) return;
  const operation = ++profileWriteVersion;
  savingProfile.value = true;
  try {
    await realAuthApi.updateProfile({
      nickname: editForm.nickname.trim(),
      phone: editForm.phone?.trim() || undefined,
      avatar: editForm.avatar?.trim() || undefined
    });
    if (operation !== profileWriteVersion || userStore.sessionVersion !== requestedSession || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
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
      Message.warning(saved ? '资料已保存，但最新资料读取失败，请重新加载' : '会员资料读取失败，请稍后重试');
    }
  } finally {
    if (operation === profileWriteVersion) refreshingProfile.value = false;
  }
}

interface QuickEntry {
  key: string;
  label: string;
  icon: string;
  path: string;
  disabled?: boolean;
  phase?: number;
}

const quickEntries = computed<QuickEntry[]>(() => [
  { key: 'orders', label: '我的订单', icon: 'box', path: '/order' },
  { key: 'favorites', label: '我的收藏', icon: 'heart', path: '/favorites' },
  { key: 'im', label: '消息中心', icon: 'chat', path: '/im' },
  { key: 'notifications', label: '站内通知', icon: 'bell', path: '/notifications' },
  { key: 'wallet', label: '我的钱包', icon: 'wallet', path: '/wallet' },
  { key: 'finance', label: '小金库', icon: 'wallet', path: '/finance' },
  { key: 'kyc', label: '实名认证', icon: 'shield', path: '/kyc' },
  { key: 'vip', label: 'VIP 特权', icon: 'star', path: '/vip' },
  { key: 'address', label: '收货地址', icon: 'pin', path: '/address' },
  { key: 'pay-password', label: '账户安全', icon: 'shield', path: '/profile/pay-password' },
  ...(userStore.needsLoginPassword
    ? [{ key: 'login-password', label: '设置登录密码', icon: 'shield', path: '/profile/login-password' }]
    : []),
  { key: 'purchase', label: '我的求购', icon: 'search', path: '/purchase' },
  { key: 'aftersale', label: '我的售后', icon: 'return', path: '/aftersale' },
  { key: 'review', label: '我的评价', icon: 'star', path: '/review' },
  { key: 'points', label: '我的积分', icon: 'sun', path: '/points' },
  { key: 'buyer-apply', label: '成为买手', icon: 'user', path: '/buyer/apply' },
  ...(user.value?.isBuyer ? [{ key: 'buyer', label: '买手中心', icon: 'bag', path: '/buyer/dashboard' }] : [])
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


const groupDefinitions = [
  { key: 'shopping', label: '订单与购物', icon: 'box', summary: '订单 · 售后 · 评价 · 求购 · 收藏', keys: ['orders', 'aftersale', 'review', 'purchase', 'favorites'] },
  { key: 'wallet', label: '钱包资产', icon: 'wallet', summary: '钱包余额 · 小金库', keys: ['wallet', 'finance'] },
  { key: 'membership', label: '会员权益', icon: 'star', summary: 'VIP 特权 · 积分成长', keys: ['vip', 'points'] },
  { key: 'settings', label: '账户设置', icon: 'shield', summary: '收货地址 · 实名认证 · 账户安全', keys: ['address', 'kyc', 'pay-password', 'login-password'] },
  { key: 'messages', label: '消息通知', icon: 'chat', summary: '会话消息 · 平台通知', keys: ['im', 'notifications'] },
  { key: 'buyer', label: '买手服务', icon: 'bag', summary: '入驻申请 · 买手工作台', keys: ['buyer-apply', 'buyer'] }
];
const entryGroups = computed(() => groupDefinitions.map(group => ({
  ...group, entries: group.keys.flatMap(key => quickEntries.value.filter(entry => entry.key === key))
})));
const media = window.matchMedia('(max-width: 760px)');
const servicesLayout = ref<'mobile' | 'desktop'>(media.matches ? 'mobile' : 'desktop');
const servicePreferences = reactive<Record<'mobile' | 'desktop', Record<string, boolean>>>({ mobile: {}, desktop: {} });
for (const layout of ['mobile', 'desktop'] as const) {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(`um.profileServices.${layout}`) || '{}') || {}; } catch { /* 使用原型默认展开状态。 */ }
  for (const group of groupDefinitions) {
    servicePreferences[layout][group.key] = typeof saved[group.key] === 'boolean'
      ? saved[group.key] as boolean : layout === 'desktop' || ['shopping', 'wallet'].includes(group.key);
  }
}
const openGroups = computed(() => servicePreferences[servicesLayout.value]);
const allGroupsOpen = computed(() => groupDefinitions.every(group => openGroups.value[group.key]));
function persistGroups() {
  try { localStorage.setItem(`um.profileServices.${servicesLayout.value}`, JSON.stringify(openGroups.value)); } catch { /* 存储不可用时保留本次会话。 */ }
}
function toggleGroup(key: string) { openGroups.value[key] = !openGroups.value[key]; persistGroups(); }
function toggleAllGroups() {
  const expanded = !allGroupsOpen.value;
  groupDefinitions.forEach(group => { openGroups.value[group.key] = expanded; });
  persistGroups();
}
function updateServicesLayout(event: MediaQueryListEvent) { servicesLayout.value = event.matches ? 'mobile' : 'desktop'; }
onMounted(() => media.addEventListener('change', updateServicesLayout));
onBeforeUnmount(() => media.removeEventListener('change', updateServicesLayout));
const orderIcons: Record<string, string> = { pending: 'wallet', shipping: 'box', receiving: 'truck', done: 'check', aftersale: 'return' };
function logout() { userStore.logout(); void router.push('/'); Message.success('已退出登录'); }
const avatarFailed = ref(false);
watch(() => user.value?.avatar, () => { avatarFailed.value = false; });
</script>

<template>
  <div class="profile-page" :aria-busy="loading">
    <template v-if="user">
      <div v-if="loadError" class="status-banner profile-notice" role="alert"><UmIcon name="return" /><span>{{ loadError }}</span><button class="outline" :disabled="loading" @click="loadProfile">重新加载</button></div>
      <section class="profile-hero">
        <span class="avatar large"><img v-if="user.avatar && !avatarFailed" :src="user.avatar" :alt="user.nickname" @error="avatarFailed = true" /><template v-else>{{ user.nickname.slice(0, 1) }}</template></span>
        <div><h1 :title="user.nickname">{{ user.nickname }}</h1></div>
        <button class="gold" :disabled="savingProfile" @click="openEditProfile">编辑资料<UmIcon name="arrow" /></button>
      </section>
      <div class="profile-account-meta"><span>{{ user.email ?? '未绑定邮箱' }}</span><span v-if="registeredDate">注册于 {{ registeredDate }}</span><span v-if="kycMeta">{{ kycMeta.label }}</span><span v-if="user.isBuyer">已是买手</span><span v-if="vipStatus && vipStatus.nextThreshold !== undefined">距离下一等级还差 {{ formatPoints(vipStatus.pointsToNext, '—') }} 积分</span></div>
      <div v-if="user.accountInfoUnavailable || profileRefreshError" class="status-banner profile-notice" role="status"><UmIcon name="shield" /><span>{{ profileRefreshError ? '资料已保存，当前显示的资料尚未刷新。' : '积分或等级资料未更新，已有值仅供参考。' }}</span><button class="outline" :disabled="refreshingProfile" @click="refreshSavedProfile(profileRefreshError)">重新加载</button></div>
      <section class="paper"><div class="section-heading"><h2>{{ userStore.isBuyerActive ? '卖出订单概况' : '我的订单' }}</h2><button @click="router.push('/order')">查看全部 →</button></div><div class="order-shortcuts"><button v-for="o in orderTabsMeta" :key="o.tab" @click="router.push({ path: '/order', query: { tab: o.tab } })"><UmIcon :name="orderIcons[o.tab]" /><span>{{ o.label }}</span><Skeleton v-if="loading && o.count === undefined" class="profile-count-loading" /><b v-else>{{ o.count ?? '—' }}</b></button></div></section>
      <section class="profile-assets" aria-label="账户资产与权益">
        <button @click="router.push('/wallet')"><span>我的可用余额</span><Skeleton v-if="loading && !totalAssets" class="profile-asset-loading" /><b v-else>{{ totalAssets?.account ? formatAmount(totalAssets.account.available) : '—' }} <small>USDT</small></b><UmIcon name="arrow" /></button>
        <button @click="router.push('/vip')"><span>会员等级</span><b>{{ user.vipLevel ?? '—' }}</b><UmIcon name="arrow" /></button>
        <button @click="router.push('/points')"><span>我的积分</span><b>{{ user.points === undefined ? '—' : formatPoints(user.points) }}</b><UmIcon name="arrow" /></button>
      </section>
      <section class="profile-services" aria-labelledby="profile-services-title">
        <div class="profile-services-heading"><div><h2 id="profile-services-title">我的服务</h2><p>按需展开，轻松找到所需服务</p></div><button class="services-toggle-all" @click="toggleAllGroups"><UmIcon :name="allGroupsOpen ? 'minus' : 'plus'" />{{ allGroupsOpen ? '全部收起' : '全部展开' }}</button></div>
        <div class="services-columns"><section v-for="group in entryGroups" :key="group.key" class="service-category" :class="{ 'is-open': openGroups[group.key] }">
          <h3><button :id="'service-toggle-' + group.key" class="service-category-toggle" :aria-expanded="openGroups[group.key]" :aria-controls="'service-panel-' + group.key" @click="toggleGroup(group.key)"><span class="service-category-symbol"><UmIcon :name="group.icon" /></span><span class="service-category-copy"><span class="service-category-title">{{ group.label }}<small>{{ group.entries.length }} 项</small></span><span class="service-category-summary">{{ group.summary }}</span></span><span class="service-category-state" aria-hidden="true">{{ openGroups[group.key] ? '收起' : '展开' }}<UmIcon name="chevron" /></span></button></h3>
          <div :id="'service-panel-' + group.key" class="service-category-panel" role="region" :aria-labelledby="'service-toggle-' + group.key" :aria-hidden="!openGroups[group.key]" :inert="!openGroups[group.key]"><div class="service-category-clip"><div class="service-category-links"><RouterLink v-for="entry in group.entries" :key="entry.key" :to="entry.path"><UmIcon :name="entry.icon" /><span>{{ entry.label }}</span><UmIcon name="chevron" /></RouterLink></div></div></div>
        </section></div>
      </section>
      <button class="text-link" @click="logout"><UmIcon name="logout" />退出登录</button>
    </template>
    <AModal v-model:visible="editVisible" title="编辑资料" :width="560" :ok-loading="savingProfile" :on-before-ok="() => { void saveProfile(); return false; }"><div class="edit-fields"><div class="field"><Label for="profile-nickname">昵称 <span aria-hidden="true">*</span></Label><Input id="profile-nickname" v-model="editForm.nickname" :disabled="savingProfile" maxlength="64" placeholder="请输入昵称" autocomplete="nickname" /></div><div class="field"><Label for="profile-phone">手机号</Label><Input id="profile-phone" v-model="editForm.phone" :disabled="savingProfile" maxlength="32" placeholder="请输入手机号" autocomplete="tel" /></div><div class="field"><Label for="profile-avatar">头像地址</Label><Input id="profile-avatar" v-model="editForm.avatar" :disabled="savingProfile" maxlength="512" placeholder="请输入头像图片 URL" /></div></div></AModal>
  </div>
</template>

<style scoped>
.profile-page { padding-bottom:48px; }
.profile-hero .avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
.profile-hero>div { min-width:0; }
.profile-hero h1 { overflow-wrap:anywhere; }
.profile-account-meta { display:flex; flex-wrap:wrap; gap:8px 18px; margin:-8px 0 22px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
.profile-notice { margin-bottom:22px; }
.profile-notice>span { flex:1; }
.profile-count-loading { width:24px; height:18px; }
.profile-asset-loading { width:130px; height:30px; margin-top:12px; }
.profile-assets b { overflow-wrap:anywhere; }
.edit-fields { display:grid; }
</style>
