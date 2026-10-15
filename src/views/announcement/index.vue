<script setup lang="ts">

import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';

const router = useRouter();


</script>

<template>

  <div class="announcement-page"><header class="page-heading compact"><h1>公告中心</h1></header><section class="paper"><EmptyState icon="lucide:bell" title="公告暂不可用" description="公告内容尚未开放，请稍后查看。" action-text="返回首页" @action="router.push('/')" /></section></div>

</template>

<style scoped>
.announcement-page > .paper { min-height:300px; display:grid; place-items:center; }
</style>
