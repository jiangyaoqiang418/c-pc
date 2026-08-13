<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { reviewApi } from '@shared';
import ReviewCard from '@/components/review/review-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const activeKey = ref<'sent' | 'received'>('sent');
const list = ref<Api.Review.ReviewRecord[]>([]);
const loading = ref(false);

const isBuyer = computed(() => !!userStore.currentUser?.isBuyer);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const params: { fromUserId?: number; toUserId?: number; size: number } = { size: 30 };
    if (activeKey.value === 'sent') params.fromUserId = userStore.currentUser.id;
    else params.toUserId = userStore.currentUser.id;
    const r = await reviewApi.fetchMyReviews(params);
    list.value = r.records;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(activeKey, load);
</script>

<template>
  <div class="review-list-page shop-container">
    <h1 class="page-title">我的评价</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeKey" lazy-load>
        <a-tab-pane key="sent" title="我发出的" />
        <a-tab-pane v-if="isBuyer" key="received" title="我收到的（买手）" />
      </a-tabs>
    </a-card>

    <div class="list-wrap">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="list.length">
          <ReviewCard v-for="r in list" :key="r.id" :review="r" />
        </template>
        <EmptyState
          v-else
          title="暂无评价"
          :description="activeKey === 'sent' ? '完成订单后可以评价买手' : '买手身份接单后会收到顾客评价'"
        />
      </a-spin>
    </div>
  </div>
</template>

<style scoped>
.review-list-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.list-wrap {
  margin-top: 16px;
}
</style>
