<script setup lang="ts">
import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();
</script>

<template>
  <div class="ai-page shop-container">
    <h1 class="page-title">AI 智能导购</h1>
    <EmptyState
      icon="lucide:sparkles"
      title="暂不可用"
      action-text="返回首页"
      @action="router.push('/')"
    />
  </div>
</template>

<style scoped>
.ai-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
</style>
