<script setup lang="ts">

import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();


</script>

<template>

  <div class="ai-page"><header class="page-heading"><span class="eyebrow">FIND YOUR INSPIRATION</span><h1>AI 智能导购</h1></header><section class="paper"><EmptyState icon="lucide:sparkles" title="AI 导购暂不可用" description="智能导购尚未开放，请通过商品搜索查找真实在售商品。" action-text="返回首页" @action="router.push('/')" /></section></div>

</template>

<style scoped>

.ai-page { padding-bottom:32px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.ai-page h1 { font-size:30px; font-weight:650; margin:6px 0 24px; }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:8px; min-height:400px; display:flex; align-items:center; justify-content:center; padding:32px; }

</style>
