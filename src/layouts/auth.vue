<script setup lang="ts">
import DefaultLayout from '@/layouts/default.vue';
import heroImage from '@/assets/images/umaomao-hero.png';
</script>

<template>
  <DefaultLayout>
    <section class="auth-shell">
      <aside class="auth-story" :style="{ backgroundImage: `url(${heroImage})` }" aria-label="欢迎来到 Umaomao">
        <span>WELCOME TO UMAOMAO</span>
        <h1>把世界的好物，<br />带进你的生活。</h1>
        <p>每一次相遇，都值得期待。</p>
      </aside>
      <div class="auth-form"><RouterView /></div>
    </section>
  </DefaultLayout>
</template>

<style scoped>
.auth-shell { display:grid; grid-template-columns:51.3% 48.7%; max-width:1050px; margin:32px auto 0; border:1px solid var(--yb-hairline); border-radius:8px; overflow:hidden; background:var(--yb-paper); }
.auth-story { min-height:520px; padding:44px 34px; background-position:center; background-size:cover; color:white; }
.auth-story>span { font-size:10px; letter-spacing:1.8px; opacity:.7; }
.auth-story h1 { font-size:32px; line-height:1.65; font-weight:650; margin:20px 0 12px; }
.auth-story p { font-size:14px; opacity:.8; margin:0; }
.auth-form { min-width:0; padding:40px 42px; }
.auth-form :deep(.title) { text-align:left; font-size:24px; margin-bottom:24px; }
.auth-form :deep(.hint) { text-align:left; margin-top:-12px; margin-bottom:24px; }
.auth-form :deep(input) { height:50px; }
.auth-form :deep(.um-field) { margin-bottom:22px; gap:10px; }
@media(max-width:900px) { .auth-shell { grid-template-columns:1fr; max-width:560px; margin-top:16px; }.auth-story { display:none; }.auth-form { padding:32px; } }
</style>
