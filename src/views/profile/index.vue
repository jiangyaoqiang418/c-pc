<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { cmsApi, enums, formatAmount, formatPoints } from '@shared';
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
const announcements = ref<Api.Cms.Announcement[]>([]);
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
  if (!user.value?.registeredAt) return '—';
  const date = new Date(user.value.registeredAt);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
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
    announcements.value = [];
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
  announcements.value = [];
  const [vip, assets, counts, anns] = await Promise.allSettled([
    vipApi.fetchMyVipStatus(uid, { signal: isCurrent.signal, showError: false }),
    realWalletApi.fetchWalletOverview(uid, { signal: isCurrent.signal, showError: false }),
    userStore.isBuyerActive
      ? realOrderApi.countMySoldOrdersByStatus({ signal: isCurrent.signal, showError: false })
      : realOrderApi.countMyOrdersByStatus({ signal: isCurrent.signal, showError: false }),
    cmsApi.fetchAnnouncements({ size: 3 })
  ]);
  if (!isCurrent() || version !== profileLoadVersion) return;
  if (vip.status === 'fulfilled') vipStatus.value = vip.value;
  if (assets.status === 'fulfilled') totalAssets.value = { total: assets.value.total, account: assets.value.account };
  if (counts.status === 'fulfilled') orderCounts.value = counts.value;
  if (anns.status === 'fulfilled') announcements.value = anns.value.records.slice(0, 3);
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
</script>

<template>
  <div class="profile-page shop-container">
    <div v-if="user" class="layout">
      <a-alert v-if="loadError" type="error" :closable="false" class="load-error">
        {{ loadError }}
        <template #action><a-button size="mini" :loading="loading" @click="loadProfile">重新加载</a-button></template>
      </a-alert>
      <section class="left">
        <a-card class="user-card" :body-style="{ padding: '24px' }">
          <div class="user-head">
            <div class="avatar">{{ user.nickname.slice(0, 1) }}</div>
            <div class="info">
              <div class="name-row">
                <span class="name">{{ user.nickname }}</span>
                <VipBadge :level="user.vipLevel" />
                <a-tag v-if="kycMeta" :color="kycMeta.color" size="small">KYC：{{ kycMeta.label }}</a-tag>
                <a-tag v-if="user.isBuyer" color="orange" size="small">已是买手</a-tag>
              </div>
              <div class="meta">
                <span>{{ user.email }}</span>
                <span class="dot">·</span>
                <span>积分 {{ user.points === undefined ? '—' : formatPoints(user.points) }}</span>
                <span class="dot">·</span>
                <span>注册于 {{ registeredDate }}</span>
              </div>
              <a-button type="text" size="mini" class="edit-profile" @click="openEditProfile">编辑资料</a-button>
              <a-alert v-if="user.accountInfoUnavailable" type="warning">积分或等级资料未更新，已有值仅供参考。<template #action><a-button size="mini" :loading="refreshingProfile" @click="refreshSavedProfile(false)">重试会员资料</a-button></template></a-alert>
              <a-alert v-if="profileRefreshError" type="warning">资料已保存，当前显示的资料尚未刷新。<template #action><a-button size="mini" :loading="refreshingProfile" @click="refreshSavedProfile()">重新读取</a-button></template></a-alert>
              <div v-if="vipStatus?.nextThreshold" class="vip-progress">
                距离下一等级还差 <strong>{{ formatPoints(vipStatus.pointsToNext) }}</strong> 积分
                <a-progress
                  :percent="Math.min(100, (vipStatus.points / vipStatus.nextThreshold) * 100)"
                  size="mini"
                  color="#722ed1"
                  style="width: 220px"
                />
              </div>
            </div>
          </div>
        </a-card>

        <a-card class="order-stat-card" :body-style="{ padding: '20px 24px' }">
          <div class="card-head">
            <div class="card-title">{{ userStore.isBuyerActive ? '卖出订单概况' : '买入订单概况' }}</div>
            <a-link role="link" tabindex="0" @click="router.push('/order')" @keydown.enter="router.push('/order')" @keydown.space.prevent="router.push('/order')">查看全部 ›</a-link>
          </div>
          <div class="order-stats">
            <div v-for="o in orderTabsMeta" :key="o.label" class="stat" role="button" tabindex="0" @click="router.push({ path: '/order', query: { tab: o.tab } })" @keydown.enter="router.push({ path: '/order', query: { tab: o.tab } })" @keydown.space.prevent="router.push({ path: '/order', query: { tab: o.tab } })">
              <div class="stat-num">{{ o.count ?? (loading ? '读取中' : '—') }}</div>
              <div class="stat-label">{{ o.label }}</div>
            </div>
          </div>
        </a-card>

        <a-card class="quick-card" :body-style="{ padding: '20px 24px' }">
          <div class="card-title">快捷入口</div>
          <div class="quick-grid">
            <div
              v-for="q in quickEntries"
              :key="q.key"
              class="quick-cell"
              :class="{ disabled: q.phase }"
              role="button"
              tabindex="0"
              @click="q.go()"
              @keydown.enter="q.go()"
              @keydown.space.prevent="q.go()"
            >
              <span class="emoji">{{ q.emoji }}</span>
              <span class="label">{{ q.label }}</span>
              <span v-if="q.phase" class="phase-chip">P{{ q.phase }}</span>
            </div>
          </div>
        </a-card>
      </section>

      <aside class="right">
        <a-card class="asset-card" :body-style="{ padding: '20px 24px' }">
          <div class="card-title">我的资产</div>
          <div class="asset-amount">{{ totalAssets ? `U ${formatAmount(totalAssets.total)}` : loading ? '读取中' : '读取失败' }}</div>
          <div v-if="totalAssets" class="asset-sub">
            可用 U {{ formatAmount(totalAssets.account?.available) }}
            <br />
            锁仓 U {{ formatAmount(totalAssets.account?.lockedFinance) }}
          </div>
          <a-button long type="primary" class="asset-btn" @click="router.push('/wallet')">进入钱包 ›</a-button>
        </a-card>

        <a-card class="ann-card" :body-style="{ padding: '20px 24px' }">
          <div class="card-head">
            <div class="card-title">平台公告</div>
            <a-link role="link" tabindex="0" @click="router.push('/announcement')" @keydown.enter="router.push('/announcement')" @keydown.space.prevent="router.push('/announcement')">公告中心</a-link>
          </div>
          <div v-for="a in announcements" :key="a.id" class="ann-row">
            <div class="ann-title">📢 {{ a.title }}</div>
            <div class="ann-summary">{{ a.summary }}</div>
          </div>
        </a-card>
      </aside>
    </div>

    <a-modal v-model:visible="editVisible" title="编辑资料" :ok-loading="savingProfile" :on-before-ok="() => { void saveProfile(); return false; }">
      <a-form :model="editForm" layout="vertical">
        <a-form-item label="昵称" required>
          <a-input v-model="editForm.nickname" :max-length="64" show-word-limit placeholder="请输入昵称" />
        </a-form-item>
        <a-form-item label="手机号">
          <a-input v-model="editForm.phone" :max-length="32" placeholder="请输入手机号" />
        </a-form-item>
        <a-form-item label="头像地址">
          <a-input v-model="editForm.avatar" :max-length="512" placeholder="请输入头像图片 URL" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.profile-page {
  padding-top: 16px;
}
.load-error {
  grid-column: 1 / -1;
}
.layout {
  display: grid;
  grid-template-columns: 8fr 4fr;
  gap: 16px;
}
.left, .right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.user-card {
  background: linear-gradient(135deg, #f3f7ff 0%, #fff 60%);
  border-radius: var(--bw-card-radius);
}
.user-head {
  display: flex;
  gap: 16px;
}
.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bw-brand-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  flex-shrink: 0;
}
.info {
  flex: 1;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.name {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
}
.meta {
  color: #4e5969;
  font-size: 13px;
}
.edit-profile {
  margin-top: 8px;
  padding: 0;
}
.dot {
  margin: 0 8px;
  color: #c9cdd4;
}
.vip-progress {
  margin-top: 10px;
  color: #4e5969;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.order-stat-card,
.quick-card,
.asset-card,
.ann-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
  margin-bottom: 14px;
}
.card-head .card-title {
  margin: 0;
}
.order-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.stat {
  text-align: center;
  padding: 14px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.stat:hover {
  background: #f3f7ff;
}
.stat:focus-visible,
.quick-cell:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: -2px;
}
.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: #1d2129;
}
.stat-label {
  font-size: 12px;
  color: #86909c;
  margin-top: 4px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quick-cell {
  position: relative;
  text-align: center;
  padding: 16px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.quick-cell:hover {
  background: #f3f7ff;
}
.quick-cell.disabled {
  opacity: 0.7;
}
.quick-cell .emoji {
  font-size: 24px;
  display: block;
  margin-bottom: 4px;
}
.quick-cell .label {
  font-size: 12px;
  color: #4e5969;
}
.phase-chip {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #f7f8fa;
  color: #86909c;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
}
.asset-amount {
  font-size: 28px;
  font-weight: 700;
  color: #722ed1;
  font-family: ui-monospace, monospace;
}
.asset-sub {
  font-size: 12px;
  color: #4e5969;
  line-height: 1.6;
  margin-top: 4px;
}
.asset-btn {
  margin-top: 16px;
}
/* 兜底：Arco primary → 品牌粉（token 覆盖若未生效由此保底） */
.asset-btn.arco-btn-primary {
  background-color: var(--yb-brand-pink) !important;
  border-color: var(--yb-brand-pink) !important;
  color: #fff !important;
}
.asset-btn.arco-btn-primary:hover {
  background-color: var(--yb-brand-pink-2) !important;
  border-color: var(--yb-brand-pink-2) !important;
}
.ann-row {
  padding: 10px 0;
  border-bottom: 1px dashed #f2f3f5;
}
.ann-row:last-child {
  border-bottom: none;
}
.ann-title {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
}
.ann-summary {
  font-size: 12px;
  color: #86909c;
  margin-top: 4px;
}
</style>
