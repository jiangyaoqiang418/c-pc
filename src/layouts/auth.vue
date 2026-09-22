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
  background-color: #f8f8f8;
  background-image: url('../assets/images/bg-login-commerce-red.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
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
  color: #c91820;
}
.logo:focus-visible {
  outline: 2px solid #c91820;
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
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}
.auth-footer {
  position: absolute;
  bottom: 24px;
  color: rgba(70, 70, 70, 0.72);
  font-size: 12px;
}
</style>
