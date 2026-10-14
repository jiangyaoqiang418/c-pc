<script setup lang="ts">
import DefaultLayout from '@/layouts/default.vue';
import authCat from '@/assets/images/v47/umaomao-meme-cat.svg';
</script>

<template>
  <DefaultLayout>
    <div class="auth-layout">
      <section class="auth-art" aria-label="欢迎来到 Umaomao">
        <img :src="authCat" alt="Umaomao 好物生活" />
        <div>
          <span class="eyebrow">WELCOME TO UMAOMAO</span>
          <h1>把世界的好物，<br />带进你的生活。</h1>
          <p>每一次相遇，都值得期待。</p>
        </div>
      </section>
      <RouterView />
    </div>
  </DefaultLayout>
</template>
