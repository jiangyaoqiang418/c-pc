<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { AiSearchResult } from '@shared/api/ai';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

interface Props {
  result?: AiSearchResult;
  loading?: boolean;
}
const props = defineProps<Props>();

const router = useRouter();

function inducePurchase() {
  if (!props.result) return;
  router.push({
    name: 'purchase-create',
    query: { productHint: props.result.query }
  });
}
</script>

<template>
  <div class="ai-suggestion">
    <div v-if="loading" class="loading">
      <div class="spinner">⏳</div>
      <div class="loading-text">AI 思考中…为您智选商品</div>
    </div>

    <template v-else-if="result">
      <div v-if="result.inducePurchase" class="induce">
        <div class="induce-left">
          <div class="induce-emoji">💡</div>
          <div>
            <div class="induce-title">{{ result.inducePurchaseHint }}</div>
            <div class="induce-sub">让全球买手为您代购，平台 USDT 担保 24h 接单</div>
          </div>
        </div>
        <a-button type="primary" @click="inducePurchase">一键发起求购 ›</a-button>
      </div>

      <template v-if="result.suggestions.length">
        <p>以下为演示推荐；点击卡片按商品名称搜索真实在售商品，不直接进入演示商品详情。</p>
        <div class="grid">
          <ProductCard v-for="p in result.suggestions" :key="p.id" :product="p" demo />
        </div>
      </template>

      <EmptyState v-else
        title="没有找到匹配商品"
        description="试试更具体的关键词，或发起求购"
        action-text="发起求购"
        @action="inducePurchase"
      />
    </template>
  </div>
</template>

<style scoped>
.ai-suggestion {
  width: 100%;
}
.loading {
  text-align: center;
  padding: 64px 0;
  color: #86909c;
}
.spinner {
  font-size: 40px;
  animation: spin 1.5s linear infinite;
  display: inline-block;
}
.loading-text {
  font-size: 13px;
  margin-top: 12px;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.induce {
  background: linear-gradient(135deg, #fff7e6 0%, #f5e8ff 100%);
  border-radius: 12px;
  padding: 20px 28px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.induce-left {
  display: flex;
  gap: 16px;
  align-items: center;
}
.induce-emoji {
  font-size: 36px;
}
.induce-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}
.induce-sub {
  font-size: 12px;
  color: #4e5969;
  margin-top: 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
</style>
