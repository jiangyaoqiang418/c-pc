<script setup lang="ts">
import { useRouter } from 'vue-router';
import { BRAND } from '@shared';

const router = useRouter();
</script>

<template>
  <div class="layout-auth">
    <div class="logo" role="link" tabindex="0" @click="router.push('/')" @keydown.enter="router.push('/')" @keydown.space.prevent="router.push('/')">
      <img class="logo-mark" src="/favicon.svg" alt="油宝" />
      <span class="logo-name">{{ BRAND.name }}</span>
    </div>
    <div class="auth-card">
      <RouterView />
    </div>
    <div class="auth-footer">© 2026 {{ BRAND.name }}</div>
  </div>
</template>

<style scoped>
.layout-auth {
  min-height: 100vh;
  background-color: var(--yb-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  position: relative;
  isolation: isolate;
}
.layout-auth::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: url('../assets/images/bg-login-commerce-red.png') center / cover no-repeat;
  filter: hue-rotate(110deg) saturate(0.35);
  opacity: 0.7;
  pointer-events: none;
}
.logo {
  position: absolute;
  top: 24px;
  left: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--yb-brand-primary);
}
.logo:focus-visible {
  outline: 2px solid var(--yb-brand-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
.logo-mark {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: block;
  object-fit: contain;
}
.logo-name {
  font-weight: 700;
  font-size: 18px;
}
.auth-card {
  width: 480px;
  max-width: 100%;
  background: #fff;
  border-radius: 12px;
  padding: 40px 48px;
  box-shadow: var(--yb-shadow-2);
}
.auth-footer {
  position: absolute;
  bottom: 24px;
  color: var(--yb-muted);
  font-size: 12px;
}
</style>
