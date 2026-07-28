<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BRAND } from '@shared';

const router = useRouter();
const route = useRoute();

const currentStep = computed(() => (route.name === 'checkout-success' ? 2 : 0));
</script>

<template>
  <div class="layout-checkout">
    <header class="header">
      <div class="header-inner">
        <div class="logo" @click="router.push('/')">
          <span class="logo-mark">油宝</span>
          <span class="logo-name">{{ BRAND.name }}</span>
          <span class="divider">·</span>
          <span class="phase-label">订单结算</span>
        </div>
        <div class="steps">
          <a-steps :current="currentStep" size="small" line-less>
            <a-step description="确认信息">收货 + 支付</a-step>
            <a-step description="完成">支付成功</a-step>
          </a-steps>
        </div>
      </div>
    </header>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout-checkout {
  min-height: 100vh;
  background: #f7f8fa;
}
.header {
  background: #fff;
  border-bottom: 1px solid #f2f3f5;
}
.header-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.logo-mark {
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  background: var(--bw-brand-primary);
  color: #fff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 1px;
}
.logo-name {
  font-weight: 700;
  color: #1d2129;
  font-size: 16px;
}
.divider {
  color: #c9cdd4;
  font-size: 14px;
}
.phase-label {
  color: #4e5969;
  font-size: 14px;
}
.steps {
  width: 320px;
}
.main {
  padding: 32px 16px;
}
</style>
