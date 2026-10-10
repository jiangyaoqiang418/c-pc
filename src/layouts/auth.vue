<script setup lang="ts">
import { BRAND } from '@shared';
import BrandLogo from '@/components/layout/brand-logo.vue';
import ThemePicker from '@/components/layout/theme-picker.vue';
</script>

<template>
  <div class="layout-auth">
    <header class="auth-header"><BrandLogo /><ThemePicker /></header>
    <main class="auth-card"><RouterView /></main>
    <footer class="auth-footer">{{ BRAND.copyright }}<RouterLink to="/help">帮助中心</RouterLink></footer>
  </div>
</template>

<style scoped>
.layout-auth { min-height: 100vh; background: radial-gradient(ellipse at 12% 20%, color-mix(in srgb, var(--yb-primary) 7%, transparent), transparent 45%), radial-gradient(ellipse at 85% 80%, color-mix(in srgb, var(--yb-gold) 10%, transparent), transparent 40%), var(--yb-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 112px 32px 80px; }
.auth-header { position: absolute; top: 32px; left: 48px; right: 48px; display: flex; align-items: center; justify-content: space-between; }
.auth-card { width: 480px; max-width: 100%; padding: 40px 48px; border: 1px solid var(--yb-hairline); border-radius: 12px; background: var(--yb-surface); box-shadow: 0 16px 64px rgb(24 60 50 / .06); }
.auth-footer { display: flex; gap: 24px; margin-top: 28px; font-size: 12px; color: var(--yb-muted); }
.auth-footer a:hover { color: var(--yb-primary); }
@media (max-width: 700px) { .auth-header { left: 24px; right: 24px; } .auth-card { padding: 32px 24px; } }
</style>
