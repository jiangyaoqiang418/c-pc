<script setup lang="ts">
import { useRouter } from 'vue-router';
import { BRAND } from '@shared';

const router = useRouter();
</script>

<template>
  <div class="layout-auth">
    <div class="logo" @click="router.push('/')">
      <span class="logo-mark">油宝</span>
      <span class="logo-name">{{ BRAND.name }}</span>
    </div>
    <div class="auth-card">
      <RouterView />
    </div>
    <div class="auth-footer">{{ BRAND.copyright }}</div>
  </div>
</template>

<style scoped>
.layout-auth {
  min-height: 100vh;
  background: linear-gradient(135deg, #165dff 0%, #722ed1 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  position: relative;
}
.logo {
  position: absolute;
  top: 24px;
  left: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #fff;
}
.logo-mark {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 1px;
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
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}
.auth-footer {
  position: absolute;
  bottom: 24px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
}
</style>
