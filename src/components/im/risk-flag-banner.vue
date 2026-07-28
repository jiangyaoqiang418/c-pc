<script setup lang="ts">
interface Props {
  count: number;
}
defineProps<Props>();
</script>

<template>
  <div v-if="count > 0" class="risk-banner">
    <span class="icon">⚠️</span>
    <span class="text">
      本群存在 <strong>{{ count }}</strong> 条风险消息，平台已介入监管。请勿私下交易，所有付款必须经由平台担保完成。
    </span>
    <a-link disabled class="link">查看风控规则 · Phase 4</a-link>
  </div>
</template>

<style scoped>
.risk-banner {
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-left: 4px solid #ff7d00;
  padding: 10px 16px;
  color: #4e5969;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 4px;
  margin: 8px 16px;
}
.icon {
  font-size: 18px;
}
.text {
  flex: 1;
}
.text strong {
  color: #ff7d00;
}
.link {
  font-size: 12px;
}
</style>
