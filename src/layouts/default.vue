<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { BRAND } from '@shared';
import { useCartStore } from '@/stores';
import SearchBar from '@/components/layout/search-bar.vue';
import UtilityBar from '@/components/layout/utility-bar.vue';
import UserAvatarButton from '@/components/layout/user-avatar-button.vue';

const router = useRouter();
const cart = useCartStore();
const cartCount = computed(() => cart.count);
</script>

<template>
  <div class="layout-default">
    <UtilityBar />

    <header class="header">
      <div class="header-inner">
        <div class="logo" role="link" tabindex="0" @click="router.push('/')" @keydown.enter="router.push('/')">
          <div class="logo-mark">油宝</div>
          <div class="logo-text">
            <div class="logo-name">{{ BRAND.name }}</div>
            <div class="logo-tag">全球</div>
          </div>
        </div>
        <div class="search-wrap">
          <SearchBar class="search" />
        </div>
        <div class="header-actions">
          <button class="cart-cta" @click="router.push('/cart')">
            <Icon icon="lucide:shopping-cart" width="18" />
            <span>购物车</span>
            <span v-if="cartCount > 0" class="cart-badge">{{ cartCount > 99 ? '99+' : cartCount }}</span>
          </button>
          <UserAvatarButton />
        </div>
      </div>
    </header>

    <main class="main-container">
      <RouterView />
    </main>

    <footer class="footer">
      <div class="footer-inner">
        <div class="links">
          <RouterLink to="/">关于平台</RouterLink>
          <RouterLink to="/help">帮助中心</RouterLink>
          <RouterLink :to="{ path: '/help', query: { agreement: 'user' } }">用户协议</RouterLink>
          <RouterLink :to="{ path: '/help', query: { agreement: 'privacy' } }">隐私政策</RouterLink>
          <RouterLink :to="{ path: '/help', query: { agreement: 'aml' } }">AML 政策</RouterLink>
          <RouterLink to="/help">联系客服</RouterLink>
        </div>
        <div class="copyright">{{ BRAND.copyright }}</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.layout-default {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ========== Header ========== */
.header {
  background: var(--yb-surface);
  border-bottom: 1px solid var(--yb-hairline);
  position: sticky;
  top: 0;
  z-index: 50;
  height: 88px;
}
.header-inner {
  height: 100%;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px 0 20px;
  display: grid;
  grid-template-columns: 200px 1fr 280px;
  align-items: center;
  gap: 24px;
  box-sizing: border-box;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}
.logo:focus-visible {
  outline: 2px solid var(--yb-brand-primary, #165dff);
  outline-offset: 4px;
  border-radius: 4px;
}
.search-wrap {
  display: flex;
  justify-content: center;
}
.logo-mark {
  width: 44px;
  height: 44px;
  background: var(--yb-brand-pink);
  color: #fff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 8px rgba(250, 36, 60, 0.20);
}
.logo-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.logo-name {
  font-weight: 800;
  font-size: 22px;
  color: var(--yb-ink);
  letter-spacing: -0.01em;
  line-height: 1;
}
.logo-tag {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  background: var(--yb-champagne);
  color: var(--yb-gold);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
}
.search {
  width: 100%;
  max-width: 640px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: flex-end;
}
.cart-cta {
  position: relative;
  min-width: 140px;
  height: 44px;
  padding: 0 24px;
  background: var(--yb-brand-pink);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(250, 36, 60, 0.24);
}
.cart-cta:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(250, 36, 60, 0.32);
}
.cart-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ========== Main container (full-width, centered) ========== */
.main-container {
  flex: 1;
  min-height: calc(100vh - 120px);
  background: var(--yb-bg);
  padding: 20px 24px;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

/* ========== Footer ========== */
.footer {
  background: var(--yb-surface);
  border-top: 1px solid var(--yb-hairline);
}
.footer-inner {
  padding: 20px 24px;
  text-align: center;
}
.links {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 8px;
}
.links a {
  color: var(--yb-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.links a:hover { color: var(--yb-ink); }
.copyright {
  color: var(--yb-faint);
  font-size: 11px;
}
</style>
