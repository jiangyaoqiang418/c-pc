<script setup lang="ts">

import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();


</script>

<template>

  <div class="announcement-page"><header><span class="eyebrow">UMAOMAO NOTICES</span><h1>公告中心</h1></header><section class="paper"><EmptyState icon="lucide:bell" title="公告暂不可用" description="公告内容尚未开放，不展示示例或模拟消息。" action-text="返回首页" @action="router.push('/')" /></section></div>

</template>

<style scoped>

.announcement-page { padding-bottom:32px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.announcement-page h1 { font-size:30px; font-weight:650; margin:6px 0 24px; }.paper { background:var(--yb-surface); border:1px solid var(--yb-hairline); border-radius:20px; min-height:400px; display:flex; align-items:center; justify-content:center; padding:32px; }

</style>
