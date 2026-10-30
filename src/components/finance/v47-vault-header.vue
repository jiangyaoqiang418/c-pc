<script setup lang="ts">
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';

defineProps<{ section: 'products' | 'holdings'; holdingCount?: number }>();
const router = useRouter();
</script>

<template>
  <div class="vault-heading"><div><h1>小金库</h1></div><button class="outline" @click="router.push('/finance/my-lockups')"><UmIcon name="clock" />我的锁仓</button></div>
  <nav class="vault-tabs" aria-label="小金库导航"><button :class="{ active: section === 'products' }" :aria-current="section === 'products' ? 'page' : undefined" @click="router.push('/finance')">锁仓产品</button><button :class="{ active: section === 'holdings' }" :aria-current="section === 'holdings' ? 'page' : undefined" @click="router.push('/finance/my-lockups')">我的锁仓 <span v-if="holdingCount !== undefined">{{ holdingCount }}</span></button></nav>
</template>
