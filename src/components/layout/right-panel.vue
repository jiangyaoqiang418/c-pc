<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { avatarUrl } from '@shared/utils/image';
import VipBadge from '@/components/common/vip-badge.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import { useUserStore } from '@/stores';
import * as realOrderApi from '@/service/api/order';

const router = useRouter();
const userStore = useUserStore();

const isLoggedIn = computed(() => userStore.isLoggedIn);
const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => (user.value ? avatarUrl(user.value.id) : ''));
const isBuyerActive = computed(() => userStore.isBuyerActive);

const orderCounts = ref<Record<string, number>>({});

async function loadOrders() {
  if (!user.value || isBuyerActive.value) {
    orderCounts.value = {};
    return;
  }
  try {
    orderCounts.value = await realOrderApi.countMyOrdersByStatus();
  } catch {
    orderCounts.value = {};
  }
}

onMounted(loadOrders);
watch([() => userStore.currentUser?.id, () => userStore.isBuyerActive], loadOrders);

function orderCount(status: string) {
  return Number(orderCounts.value[status] || 0);
}

const pendingPay = computed(() => orderCount('PENDING_PAYMENT'));
const pendingShip = computed(() =>
  orderCount('PROCURING') + orderCount('PROCURED')
);
const pendingReceive = computed(() =>
  orderCount('IN_TRANSIT') + orderCount('AFTERSALE_CONFIRM')
);

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
          <div class="welcome-title">欢迎来油宝</div>
          <div class="welcome-sub">Web3 USDT 跨境代购</div>
        </div>
      </div>
      <div class="auth-actions">
        <button class="btn primary" @click="goLogin">登录</button>
        <button class="btn ghost" @click="goRegister">注册</button>
      </div>
    </div>

    <!-- 已登录 -->
    <template v-else>
      <!-- 用户卡：头像 + 身份切换 -->
      <div class="user-card logged">
        <div class="user-row" role="button" tabindex="0" @click="goProfile" @keyup.enter="goProfile">
          <img :src="userAvatar" :alt="user!.nickname" class="avatar" />
          <div class="user-info">
            <div class="user-name">
              <span>{{ user!.nickname }}</span>
              <VipBadge :level="user!.vipLevel" size="sm" />
            </div>
            <div class="user-sub">
              <Icon icon="lucide:coins" width="11" />
              <span class="yb-mono">{{ user!.points }}</span> 积分
            </div>
          </div>
        </div>
        <AudienceSegment v-if="user?.isBuyer" />
      </div>

      <!-- 身份面板动态切换 -->
      <transition name="fade-slide" mode="out-in">
        <div v-if="!isBuyerActive" key="customer" class="mode-panel">
          <!-- 我的订单（唯一入口） -->
          <div class="orders-card" @click="go('/order')">
            <div class="orders-head">
              <Icon icon="lucide:package" width="14" />
              <span class="orders-title">我的订单</span>
              <Icon icon="lucide:chevron-right" width="14" class="orders-arrow" />
            </div>
            <div class="orders-stats">
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: pendingPay > 0 }">{{ pendingPay }}</div>
                <div class="stat-lbl">待付款</div>
              </div>
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: pendingShip > 0 }">{{ pendingShip }}</div>
                <div class="stat-lbl">待发货</div>
              </div>
              <div class="stat">
                <div class="stat-num yb-mono" :class="{ hl: pendingReceive > 0 }">{{ pendingReceive }}</div>
                <div class="stat-lbl">待收货</div>
              </div>
            </div>
          </div>

          <!-- 顾客快捷功能 -->
          <div class="panel-block links-block">
            <div class="mini-grid">
              <div
                v-for="l in customerLinks"
                :key="l.key"
                class="mini-cell"
                @click="go(l.path)"
              >
                <div class="mini-icon-wrap"><Icon :icon="l.icon" width="16" /></div>
                <div class="mini-label">{{ l.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-else key="buyer" class="mode-panel">
          <!-- 买手面板 -->
          <div class="panel-block buyer-hero">
            <div class="buyer-eyebrow">BUYER MODE</div>
            <div class="buyer-title">买手工作台</div>
            <div class="buyer-sub">接单 · 上货 · 结算 · 押金</div>
          </div>
          <div class="panel-block links-block">
            <div class="mini-grid">
              <div
                v-for="l in buyerLinks"
                :key="l.key"
                class="mini-cell buyer-cell"
                @click="go(l.path)"
              >
                <div class="mini-icon-wrap"><Icon :icon="l.icon" width="16" /></div>
                <div class="mini-label">{{ l.label }}</div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </template>
  </aside>
</template>

<style scoped>
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
.welcome-title { font-size: 13px; font-weight: 700; color: var(--yb-ink); letter-spacing: -0.01em; }
.welcome-sub { font-size: 10px; color: var(--yb-muted); margin-top: 2px; }
.auth-actions { display: flex; gap: 6px; }
.btn {
  flex: 1;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.btn.primary { background: var(--yb-brand-pink); color: #fff; }
.btn.primary:hover { background: var(--yb-brand-pink-2); }
.btn.ghost { background: transparent; color: var(--yb-ink); border-color: var(--yb-hairline-2); }
.btn.ghost:hover { border-color: var(--yb-ink); }

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
  background: rgba(15, 17, 26, 0.04);
}
.user-row:focus-visible {
  outline: 2px solid var(--yb-brand-pink);
  outline-offset: 2px;
}
.avatar {
  width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid var(--yb-surface);
  box-shadow: var(--yb-shadow-1);
}
.user-info { min-width: 0; }
.user-name {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: var(--yb-ink);
}
.user-sub {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; color: var(--yb-muted); margin-top: 3px;
}

/* Mode panel transitions */
.mode-panel { display: flex; flex-direction: column; gap: 12px; }
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from { opacity: 0; transform: translateY(6px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-6px); }

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
  box-shadow: 0 6px 16px rgba(15, 17, 26, 0.06);
}
.orders-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--yb-ink);
  margin-bottom: 12px;
}
.orders-title { flex: 1; font-size: 13px; font-weight: 700; }
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
  font-size: 10px;
  color: var(--yb-muted);
  margin-top: 4px;
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
  font-size: 10px;
  color: var(--yb-muted);
  text-align: center;
  letter-spacing: -0.01em;
}
.buyer-cell .mini-icon-wrap {
  background: var(--yb-champagne);
  color: var(--yb-gold);
}

/* Buyer hero */
.buyer-hero {
  background: linear-gradient(135deg, var(--yb-brand-pink) 0%, #C81736 100%);
  color: #fff;
  border-color: transparent;
}
.buyer-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 6px;
}
.buyer-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}
.buyer-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
