<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function go(name: string) {
  router.push({ name });
}
</script>

<template>
  <div class="utility-bar">
    <div class="ub-inner">
      <div class="ub-left">
        <span class="ub-region">中国大陆</span>
        <span class="ub-sep">·</span>
        <span class="ub-welcome">欢迎来到油宝</span>
      </div>
      <div class="ub-right">
        <a class="ub-link" @click="go('order-list')">我的订单</a>
        <span class="ub-sep">·</span>
        <a class="ub-link" @click="go('favorites')">收藏夹</a>
        <span class="ub-sep">·</span>
        <a class="ub-link" @click="go('help')">帮助中心</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.utility-bar {
  height: 32px;
  background: var(--yb-bg);
  border-bottom: 1px solid var(--yb-hairline);
  font-size: 12px;
  color: var(--yb-muted);
}
.ub-inner {
  height: 100%;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}
.ub-left, .ub-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ub-region {
  font-weight: 600;
  color: var(--yb-ink-2);
}
.ub-welcome {
  color: var(--yb-muted);
}
.ub-sep {
  color: var(--yb-hairline-2);
}
.ub-link {
  cursor: pointer;
  color: var(--yb-muted);
  transition: color 0.15s;
}
.ub-link:hover {
  color: var(--yb-ink);
}
</style>
