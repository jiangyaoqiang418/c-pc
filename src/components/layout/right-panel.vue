<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { avatarUrl } from '@shared/utils/image';
import VipBadge from '@/components/common/vip-badge.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { formatAmount } from '@shared';
import * as realOrderApi from '@/service/api/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();
const walletError = ref(false);
const walletGuard = createLatestRequestGuard();
async function loadWallet() {
  const isCurrent = walletGuard.begin();
  walletError.value = false;
  const id = userStore.currentUser?.id;
  if (!id) return;
  try { await walletStore.fetchWallet(id); } catch { if (isCurrent()) walletError.value = true; }
}
onMounted(loadWallet);
watch(() => userStore.currentUser?.id, loadWallet);
onBeforeUnmount(walletGuard.invalidate);

const isLoggedIn = computed(() => userStore.isLoggedIn);
const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => (user.value ? avatarUrl(user.value.id) : ''));
const isBuyerActive = computed(() => userStore.isBuyerActive);

const orderCounts = ref<Record<string, number>>({});
const orderCountsLoaded = ref(false);
const orderCountsError = ref('');
const orderCountsUserId = ref('');
const orderCountsGuard = createLatestRequestGuard();

async function loadOrders() {
  const isCurrent = orderCountsGuard.begin();
  if (!user.value || isBuyerActive.value) {
    orderCounts.value = {};
    orderCountsLoaded.value = false;
    orderCountsError.value = '';
    orderCountsUserId.value = '';
    return;
  }
  const userId = String(user.value.id);
  if (orderCountsUserId.value !== userId) {
    orderCounts.value = {};
    orderCountsLoaded.value = false;
  }
  orderCountsError.value = '';
  try {
    const next = await realOrderApi.countMyOrdersByStatus({ signal: isCurrent.signal });
    if (!isCurrent() || String(user.value?.id) !== userId || isBuyerActive.value) return;
    orderCounts.value = next;
    orderCountsLoaded.value = true;
    orderCountsUserId.value = userId;
  } catch {
    if (!isCurrent()) return;
    if (orderCountsUserId.value !== userId) {
      orderCounts.value = {};
      orderCountsLoaded.value = false;
    }
    orderCountsError.value = '订单统计加载失败';
  }
}

onMounted(loadOrders);
onBeforeUnmount(orderCountsGuard.invalidate);
watch([() => userStore.currentUser?.id, () => userStore.isBuyerActive], loadOrders);

function orderCount(status: string) {
  if (!orderCountsLoaded.value) return undefined;
  const parsed = Number(orderCounts.value[status]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

const pendingPay = computed(() => orderCount('PENDING_PAYMENT'));
function sumOrderCounts(...statuses: string[]) {
  if (!orderCountsLoaded.value) return undefined;
  const counts = statuses.map(status => orderCount(status));
  return counts.some(count => count === undefined)
    ? undefined
    : counts.filter((count): count is number => count !== undefined)
      .reduce((sum, count) => sum + count, 0);
}

const pendingShip = computed(() => sumOrderCounts('PROCURING', 'PROCURED'));
const pendingReceive = computed(() => sumOrderCounts('IN_TRANSIT', 'AFTERSALE_CONFIRM'));

/** 顾客面板功能项 */
const customerLinks = [
  { key: 'wallet', label: '我的钱包', icon: 'lucide:wallet', path: '/wallet' },
  { key: 'purchase', label: '我的求购', icon: 'lucide:search', path: '/purchase' },
  { key: 'aftersale', label: '我的售后', icon: 'lucide:wrench', path: '/aftersale' },
  { key: 'review', label: '我的评价', icon: 'lucide:star', path: '/review' },
  { key: 'address', label: '地址管理', icon: 'lucide:map-pin', path: '/address' },
  { key: 'kyc', label: 'KYC 认证', icon: 'lucide:badge-check', path: '/kyc' }
];

/** 买手面板功能项（切换后展示） */
const buyerLinks = [
  { key: 'dashboard', label: '仪表盘', icon: 'lucide:layout-dashboard', path: '/buyer/dashboard' },
  { key: 'products', label: '商品管理', icon: 'lucide:package', path: '/buyer/products' },
  { key: 'buyer-orders', label: '买手订单', icon: 'lucide:clipboard-list', path: '/buyer/orders' },
  { key: 'buyer-aftersales', label: '售后查看', icon: 'lucide:rotate-ccw', path: '/buyer/aftersales' },
  { key: 'claim', label: '求购接单', icon: 'lucide:hand-coins', path: '/purchase' },
  { key: 'deposit', label: '押金管理', icon: 'lucide:lock', path: '/buyer/deposit' },
  { key: 'buyer-wallet', label: '买手钱包', icon: 'lucide:wallet', path: '/buyer/wallet' }
];

function goLogin() { router.push({ name: 'login' }); }
function goRegister() { router.push({ name: 'register' }); }
function go(path: string) { router.push(path); }
function goProfile() { router.push({ name: 'profile' }); }
</script>

<template>
  <aside class="right-panel">
    <!-- 未登录 -->
    <div v-if="!isLoggedIn" class="user-card">
      <div class="welcome-row">
        <div>
          <div class="welcome-title">欢迎来到 Umaomao</div>
          <div class="welcome-sub">发现好物，安心选购</div>
        </div>
      </div>
      <div class="auth-actions">
        <Button class="flex-1" @click="goLogin">登录</Button>
        <Button variant="outline" class="flex-1" @click="goRegister">注册</Button>
      </div>
    </div>

    <!-- 已登录 -->
    <template v-else>
      <!-- 用户卡：头像 + 身份切换 -->
      <div class="user-card logged">
        <div class="user-row" role="button" tabindex="0" :aria-label="`打开个人中心：${user!.nickname}`" @click="goProfile" @keydown.enter="goProfile" @keydown.space.prevent="goProfile">
          <img :src="userAvatar" :alt="user!.nickname" class="avatar" />
          <div class="user-info">
            <div class="user-name">
              <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="account-name">{{ user!.nickname }}</span></TooltipTrigger><TooltipContent>{{ user!.nickname }}</TooltipContent></Tooltip></TooltipProvider>
              <VipBadge :level="user!.vipLevel" size="sm" />
            </div>
            <div class="user-sub">
              <Icon icon="lucide:coins" width="11" />
              <span class="yb-mono">{{ user!.points ?? '—' }}</span> 积分
              <span v-if="user!.accountInfoUnavailable">（未更新）</span>
            </div>
          </div>
        </div>
        <AudienceSegment v-if="user?.isBuyer" />
        <button class="account-balance" @click="go('/wallet')"><span>钱包可用余额</span><strong>{{ walletError || !walletStore.account ? '—' : formatAmount(walletStore.account.available) }} <small>USDT</small></strong><Icon icon="lucide:chevron-right" width="14" /></button>
      </div>

      <!-- 身份面板动态切换 -->
      <transition name="fade-slide" mode="out-in">
        <div v-if="!isBuyerActive" key="customer" class="mode-panel">
          <!-- 我的订单（唯一入口） -->
          <div
            class="orders-card"
            role="button"
            tabindex="0"
            aria-label="查看我的订单"
            @click="go('/order')"
            @keydown.enter.self="go('/order')"
            @keydown.space.prevent.self="go('/order')"
          >
            <div class="orders-head">
              <Icon icon="lucide:package" width="14" />
              <span class="orders-title">我的订单</span>
              <Icon icon="lucide:chevron-right" width="14" class="orders-arrow" />
            </div>
            <div class="orders-stats">
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: (pendingPay || 0) > 0 }">{{ pendingPay ?? '—' }}</div>
                <div class="stat-lbl">待付款</div>
              </div>
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: (pendingShip || 0) > 0 }">{{ pendingShip ?? '—' }}</div>
                <div class="stat-lbl">待发货</div>
              </div>
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: (pendingReceive || 0) > 0 }">{{ pendingReceive ?? '—' }}</div>
                <div class="stat-lbl">待收货</div>
              </div>
            </div>
            <button v-if="orderCountsError" class="orders-retry" @click.stop="loadOrders">{{ orderCountsError }}，重新加载</button>
          </div>

          <!-- 顾客快捷功能 -->
          <div class="panel-block links-block">
            <div class="mini-grid">
              <div
                v-for="l in customerLinks"
                :key="l.key"
                class="mini-cell"
                role="button"
                tabindex="0"
                :aria-label="l.label"
                @click="go(l.path)"
                @keydown.enter="go(l.path)"
                @keydown.space.prevent="go(l.path)"
              >
                <div class="mini-icon-wrap"><Icon :icon="l.icon" width="16" /></div>
                <div class="mini-label">{{ l.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-else key="buyer" class="mode-panel">
          <!-- 买手面板 -->
          <Button variant="ghost" class="buyer-workspace-link" @click="go('/buyer/dashboard')"><Icon icon="lucide:store" width="16" />买手工作台<Icon icon="lucide:chevron-right" width="14" class="workspace-arrow" /></Button>
          <div class="panel-block links-block">
            <div class="mini-grid">
              <div
                v-for="l in buyerLinks"
                :key="l.key"
                class="mini-cell buyer-cell"
                role="button"
                tabindex="0"
                :aria-label="l.label"
                @click="go(l.path)"
                @keydown.enter="go(l.path)"
                @keydown.space.prevent="go(l.path)"
              >
                <div class="mini-icon-wrap"><Icon :icon="l.icon" width="16" /></div>
                <div class="mini-label">{{ l.label }}</div>
              </div>
            </div>
          </div>
        </div>
      </transition>
      <Button variant="ghost" class="center-link" @click="goProfile">进入个人中心<Icon icon="lucide:chevron-right" width="14" /></Button>
    </template>
    <RouterLink to="/purchase/hall" class="wish-teaser"><span>YOUR NEXT FIND</span><strong>想要什么好物？</strong><small>让买手帮你找到心头好</small><Icon icon="lucide:arrow-up-right" width="20" /></RouterLink>
  </aside>
</template>

<style scoped>
.right-panel .user-card.logged { background: var(--yb-paper); border: 0; border-radius: 6px 6px 0 0; padding: 16px; gap: 10px; }
.right-panel .mode-panel { gap: 0; }
.right-panel .orders-card { background: var(--yb-paper); border: 0; border-radius: 0; padding: 16px 18px; }
.right-panel .orders-card:hover { transform: none; box-shadow: none; }
.right-panel .orders-head { display: none; }
.right-panel .orders-stats { border-top: 1px solid var(--yb-hairline); padding-top: 16px; }
.right-panel .stat-num { font-family: var(--yb-font-body); font-size: 19px; }
.right-panel .links-block { background: var(--yb-paper); border: 0; border-radius: 0; padding: 0 10px 12px; }
.right-panel .mini-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
.right-panel .mini-cell { padding: 4px 0; gap: 3px; }
.right-panel .mini-icon-wrap { width: 24px; height: 24px; background: transparent; }
.right-panel .mini-label { font-size: 11px; line-height: 1.4; }
.right-panel .center-link { width: 100%; background: var(--yb-paper); color: var(--yb-muted); font-size: 12px; border-radius: 0 0 6px 6px; margin-top: -12px; }
.buyer-workspace-link { justify-content: flex-start; background: var(--yb-paper); border-radius: 0; padding-inline: 16px; font-size: 13px; }
.workspace-arrow { margin-left: auto; }
.account-balance { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; text-align: left; line-height: 1.4; }
.account-balance > span { font-size: 12px; color: var(--yb-muted); }
.account-balance > strong { grid-row: 2; font-size: 20px; font-weight: 650; }
.account-balance > strong small { font-size: 11px; font-weight: 400; }
.account-balance > svg { grid-column: 2; grid-row: 1 / 3; color: var(--yb-muted); }
.wish-teaser { position: relative; display: grid; gap: 4px; padding: 14px 16px; border-radius: 6px; background: var(--yb-primary-soft); color: var(--yb-ink); line-height: 1.4; }
.wish-teaser > span { font-size: 9px; letter-spacing: 1.8px; color: var(--yb-muted); }
.wish-teaser > strong { font-size: 16px; font-weight: 600; }
.wish-teaser > small { font-size: 12px; color: var(--yb-muted); }
.wish-teaser > svg { position: absolute; right: 18px; top: 30px; }
.right-panel {
  width: 280px;
  flex-shrink: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* User card */
.user-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.user-card.logged {
  background: linear-gradient(135deg, var(--yb-champagne) 0%, var(--yb-surface) 100%);
}
.welcome-row { display: flex; align-items: center; gap: 10px; }
.welcome-title { font-size: 16px; font-weight: 600; color: var(--yb-ink); letter-spacing: -0.01em; }
.welcome-sub { font-size: 13px; color: var(--yb-muted); margin-top: 4px; }
.auth-actions { display: flex; gap: 10px; }

.user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 6px;
  margin: -6px;
  border-radius: 10px;
  transition: background 0.15s;
}
.user-row:hover {
  background: rgba(32, 56, 46, 0.04);
}
.user-row:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: 2px;
}
.avatar {
  width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid var(--yb-surface);
  box-shadow: var(--yb-shadow-1);
}
.user-info { min-width: 0; flex: 1; }
.account-name { min-width: 0; max-width: 116px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.user-name {
  display: flex; align-items: center; gap: 6px;
  font-size: 15px; font-weight: 600; color: var(--yb-ink); line-height: 1.4;
}
.user-sub {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; color: var(--yb-muted); margin-top: 4px; line-height: 1.4;
}

/* Mode panel transitions */
.mode-panel { display: flex; flex-direction: column; gap: 12px; }
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: opacity 180ms var(--um-ease), transform 180ms var(--um-ease);
}
.fade-slide-enter-from { opacity: 0; transform: translateY(3px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-3px); }

/* 我的订单卡 */
.orders-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.orders-card:hover {
  border-color: var(--yb-ink);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(32, 56, 46, 0.06);
}
.orders-card:focus-visible,
.mini-cell:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: 2px;
}
.orders-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--yb-ink);
  margin-bottom: 12px;
}
.orders-title { flex: 1; font-size: 15px; font-weight: 600; }
.orders-arrow { color: var(--yb-muted); }
.orders-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.stat { text-align: center; }
.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.stat-num.hl { color: var(--yb-danger); }
.stat-lbl {
  font-size: 12px;
  color: var(--yb-muted);
  margin-top: 4px;
}
.orders-retry {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--yb-danger);
  font-size: 11px;
  cursor: pointer;
}

/* Mini grid */
.panel-block {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 12px;
  padding: 14px;
}
.links-block { padding: 10px; }
.mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.mini-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.mini-cell:hover { background: var(--yb-bg); }
.mini-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--yb-bg);
  color: var(--yb-ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mini-cell:hover .mini-icon-wrap { background: var(--yb-champagne); color: var(--yb-gold); }
.mini-label {
  font-size: 12px;
  color: var(--yb-muted);
  text-align: center;
  letter-spacing: -0.01em;
}
.buyer-cell .mini-icon-wrap {
  background: var(--yb-champagne);
  color: var(--yb-gold);
}

@media (prefers-reduced-motion: reduce) {
  .fade-slide-enter-active, .fade-slide-leave-active, .user-row, .orders-card, .mini-cell { transition: none; }
  .fade-slide-enter-from, .fade-slide-leave-to, .orders-card:hover { transform: none; }
}
</style>
