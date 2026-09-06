<script setup lang="ts">
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();
</script>

<template>
  <div class="announcement-page shop-container">
    <h1 class="page-title">公告中心</h1>
    <EmptyState
      title="暂不可用"
      action-text="返回首页"
      @action="router.push('/')"
    />
  </div>
</template>

<style scoped>
.announcement-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
</style>
