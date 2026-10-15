<script setup lang="ts">

import { useRouter } from 'vue-router';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();


</script>

<template>

  <section class="paper chat-panel ai-page"><div class="section-heading"><div><h2 aria-level="1">好物选购助手</h2><small>AI 导购尚未开放</small></div><UmIcon name="headset" /></div><div class="chat-messages"><EmptyState icon="lucide:sparkles" title="AI 导购暂不可用" description="你可以通过商品搜索查找在售商品。" action-text="浏览全部商品" @action="router.push('/product/list')" /></div><div class="chat-compose"><input disabled aria-label="消息内容，AI 导购尚未开放" placeholder="AI 导购尚未开放" /><button type="button" class="primary" disabled>发送<UmIcon name="arrow" /></button></div></section>

</template>

<style scoped>
.ai-page .chat-messages { min-height:300px; display:grid; place-items:center; }
.chat-compose > input { min-width:0; flex:1; }
</style>
