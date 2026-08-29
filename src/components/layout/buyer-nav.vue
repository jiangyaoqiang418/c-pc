<script setup lang="ts">
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

interface BuyerNavItem {
  name: string;
  label: string;
  path: string;
  emoji: string;
}

const items: BuyerNavItem[] = [
  { name: 'buyer-dashboard', label: '仪表盘', path: '/buyer/dashboard', emoji: '📊' },
  { name: 'buyer-products', label: '商品管理', path: '/buyer/products', emoji: '📦' },
  { name: 'buyer-category-applications', label: '分类申请', path: '/buyer/categories/apply', emoji: '🗂️' },
  { name: 'buyer-flash-sales', label: '秒杀报名', path: '/buyer/flash-sales', emoji: '⚡' },
  { name: 'buyer-claimable', label: '求购接单', path: '/buyer/claimable', emoji: '🙋' },
  { name: 'buyer-orders', label: '买手订单', path: '/buyer/orders', emoji: '📋' },
  { name: 'buyer-deposit', label: '押金管理', path: '/buyer/deposit', emoji: '🔒' },
  { name: 'buyer-wallet', label: '买手钱包', path: '/buyer/wallet', emoji: '💼' }
];

function isActive(item: BuyerNavItem): boolean {
  return route.name === item.name || route.path === item.path;
}

function go(item: BuyerNavItem) {
  router.push(item.path);
}

function exitBuyer() {
  userStore.setAudience('customer');
  Message.info('已切回顾客视角');
  router.push('/');
}
</script>

<template>
  <div class="buyer-nav">
    <div class="nav-inner">
      <div class="left-items">
        <span class="prefix">🏪 买手模式</span>
        <div
          v-for="item in items"
          :key="item.name"
          class="nav-item"
          :class="{ active: isActive(item) }"
          role="link"
          tabindex="0"
          :aria-current="isActive(item) ? 'page' : undefined"
          @click="go(item)"
          @keydown.enter="go(item)"
          @keydown.space.prevent="go(item)"
        >
          <span class="emoji">{{ item.emoji }}</span>
          <span>{{ item.label }}</span>
        </div>
      </div>
      <button class="exit-btn" @click="exitBuyer">退出买手模式 ›</button>
    </div>
  </div>
</template>

<style scoped>
.buyer-nav {
  background: linear-gradient(90deg, #fff7e6 0%, #fff 100%);
  border-bottom: 1px solid #ffd591;
  position: sticky;
  top: 60px;
  z-index: 40;
}
.nav-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.left-items {
  display: flex;
  align-items: center;
  gap: 4px;
}
.prefix {
  background: #ff7d00;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-right: 12px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  transition: all 0.15s;
}
.nav-item:hover {
  background: rgba(255, 125, 0, 0.1);
  color: #ff7d00;
}
.nav-item.active {
  background: #ff7d00;
  color: #fff;
}
.nav-item:focus-visible {
  outline: 2px solid #ff7d00;
  outline-offset: 2px;
}
.emoji {
  font-size: 14px;
}
.exit-btn {
  background: transparent;
  border: 1px solid #ff7d00;
  color: #ff7d00;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.exit-btn:hover {
  background: #ff7d00;
  color: #fff;
}
</style>
