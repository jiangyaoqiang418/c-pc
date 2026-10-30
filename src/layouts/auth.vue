<script setup lang="ts">
import DefaultLayout from '@/layouts/default.vue';
import authCat from '@/assets/images/brand/umaomao-cat-logo.svg';
</script>

<template>
  <DefaultLayout>
    <div class="auth-layout">
      <section class="auth-art" aria-label="欢迎来到 Umaomao">
        <img :src="authCat" alt="Umaomao 好物生活" style="object-fit:contain" />
        <div>

          <h1>把世界的好物，<br />带进你的生活。</h1>

        </div>
      </section>
      <RouterView />
    </div>
  </DefaultLayout>
</template>
