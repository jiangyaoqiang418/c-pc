<script setup lang="ts">

import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import EmptyState from '@/components/common/empty-state.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import AnnouncementCard from '@/components/cms/announcement-card.vue';
import PublicContentBody from '@/components/cms/public-content-body.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAnnouncementsPage, fetchAnnouncementDetail, contentReadMessage } from '@/service/api/content';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const rows = ref<Api.RealContent.PublicContentVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const detailOpen = ref(false);
const detailTitle = ref('公告详情');
const detailId = ref<Api.RealContent.Id>();
const detail = ref<Api.RealContent.PublicContentVO>();
const detailLoading = ref(false);
const detailError = ref('');
const listGuard = createLatestRequestGuard();
const detailGuard = createLatestRequestGuard();

function scalar(value: unknown) { return typeof value === 'string' ? value : ''; }

async function load() {
  const isCurrent = listGuard.begin();
  loading.value = true;
  loadError.value = '';
  rows.value = [];
  total.value = 0;
  try {
    const page = await fetchAnnouncementsPage({ current: current.value, size: pageSize.value, keyword: scalar(route.query.keyword), signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = page.size;
    const maxPage = Math.max(1, Math.ceil(page.total / page.size));
    if (current.value > maxPage) {
      await router.replace({ query: { ...route.query, page: maxPage > 1 ? String(maxPage) : undefined } });
      return;
    }
    rows.value = page.records;
    total.value = page.total;
  } catch (error) {
    if (isCurrent()) loadError.value = contentReadMessage(error, '公告加载失败，请稍后重试');
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function loadDetail() {
  if (detailId.value === undefined || !detailOpen.value) return;
  const isCurrent = detailGuard.begin();
  detailLoading.value = true;
  detailError.value = '';
  detail.value = undefined;
  try {
    const next = await fetchAnnouncementDetail(detailId.value, { signal: isCurrent.signal });
    if (isCurrent() && detailOpen.value) { detail.value = next; detailTitle.value = next.title; }
  } catch (error) {
    if (isCurrent()) detailError.value = contentReadMessage(error, '公告正文加载失败，请稍后重试');
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
}

function openDetail(row: Api.RealContent.PublicContentVO) {
  detailId.value = row.id;
  detailTitle.value = row.title;
  detailOpen.value = true;
  void loadDetail();
}

function search() {
  if (scalar(route.query.keyword) === keyword.value.trim() && current.value === 1) void load();
  else void router.push({ query: { ...route.query, keyword: keyword.value.trim() || undefined, page: undefined } });
}

function changePage(page: number) { void router.push({ query: { ...route.query, page: page > 1 ? String(page) : undefined } }); }

watch(() => [route.query.keyword, route.query.page, userStore.currentUser?.id, userStore.sessionVersion], () => {
  detailGuard.invalidate();
  detailOpen.value = false;
  detail.value = undefined;
  detailId.value = undefined;
  keyword.value = scalar(route.query.keyword);
  const page = Number(scalar(route.query.page));
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  void load();
}, { immediate: true });
watch(detailOpen, value => {
  if (!value) { detailGuard.invalidate(); detail.value = undefined; detailLoading.value = false; detailError.value = ''; }
});
onBeforeUnmount(() => { listGuard.invalidate(); detailGuard.invalidate(); });
</script>

<template>

  <div class="announcement-page"><header class="page-heading compact"><h1>公告中心</h1></header><form class="announcement-search" role="search" @submit.prevent="search"><input v-model="keyword" class="table-search" type="search" maxlength="100" placeholder="搜索公告标题" aria-label="搜索公告标题" /><button type="submit" class="outline" :disabled="loading">搜索</button></form><section class="paper" :aria-busy="loading"><div v-if="loading" role="status" aria-label="正在读取公告"><Skeleton v-for="n in 3" :key="n" class="announcement-skeleton" /></div><EmptyState v-else-if="loadError" icon="lucide:bell" :title="loadError" action-text="重新加载" @action="load" /><template v-else-if="rows.length"><AnnouncementCard v-for="row in rows" :key="row.id" :announcement="row" @open="openDetail" /></template><EmptyState v-else icon="lucide:bell" :title="keyword ? '没有找到相关公告' : '公告暂未发布'" :description="keyword ? '换个关键词试试。' : '正式公告发布后将在这里展示。'" :action-text="keyword ? '查看全部公告' : '返回首页'" @action="router.push(keyword ? '/announcement' : '/')" /></section><BusinessPagination v-if="total > pageSize && !loading && !loadError" :total="total" :current="current" :page-size="pageSize" @change="changePage" /><AModal v-model:visible="detailOpen" :title="detailTitle" :width="760" :footer="false"><div v-if="detailLoading" role="status" aria-label="正在读取公告正文"><Skeleton v-for="n in 4" :key="n" class="announcement-skeleton" /></div><PublicContentBody v-else-if="detail" :content="detail" /><EmptyState v-else-if="detailError" icon="lucide:bell" :title="detailError" action-text="重新读取" @action="loadDetail" /></AModal></div>

</template>

<style scoped>
.announcement-page > .paper { min-height:300px; }
.announcement-search { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.announcement-search input { min-width:0; flex:1; max-width:480px; }
.announcement-search button { flex-shrink:0; }
.announcement-skeleton { height:28px; margin:12px 0; border-radius:8px; }
</style>
