<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { cmsApi } from '@shared';
import AnnouncementCard from '@/components/cms/announcement-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const activeType = ref<Api.Cms.AnnouncementType | 'all'>('all');
const list = ref<Api.Cms.Announcement[]>([]);
const total = ref(0);
const current = ref(1);
const size = ref(15);
const loading = ref(false);
const drawerVisible = ref(false);
const drawerAnn = ref<Api.Cms.Announcement>();

const TYPES: { key: Api.Cms.AnnouncementType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'system', label: '系统' },
  { key: 'maintenance', label: '维护' },
  { key: 'campaign', label: '活动' },
  { key: 'risk', label: '风险提示' }
];

async function load() {
  loading.value = true;
  try {
    const r = await cmsApi.fetchAnnouncements({
      current: current.value,
      size: size.value,
      type: activeType.value === 'all' ? undefined : activeType.value,
      audience: 'customer'
    });
    list.value = r.records;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(activeType, () => {
  current.value = 1;
  load();
});

async function open(a: Api.Cms.Announcement) {
  drawerAnn.value = await cmsApi.fetchAnnouncementDetail(a.id);
  drawerVisible.value = true;
}
</script>

<template>
  <div class="announcement-page shop-container">
    <h1 class="page-title">公告中心</h1>

    <a-card :bordered="false" :body-style="{ padding: 0 }">
      <a-tabs v-model:active-key="activeType" lazy-load>
        <a-tab-pane v-for="t in TYPES" :key="t.key" :title="t.label" />
      </a-tabs>
    </a-card>

    <div class="list-wrap">
      <a-spin :loading="loading" style="width: 100%">
        <template v-if="list.length">
          <AnnouncementCard v-for="a in list" :key="a.id" :announcement="a" @open="open" />
        </template>
        <EmptyState v-else title="暂无公告" />

        <div v-if="total > size" class="pagination-bar">
          <a-pagination
            :total="total"
            :current="current"
            :page-size="size"
            show-total
            @change="(p: number) => { current = p; load(); }"
          />
        </div>
      </a-spin>
    </div>

    <a-drawer v-model:visible="drawerVisible" :title="drawerAnn?.title || '公告详情'" width="640" :footer="false">
      <template v-if="drawerAnn">
        <div class="drawer-meta">
          <a-tag>{{ drawerAnn.type }}</a-tag>
          <span class="time">{{ new Date(drawerAnn.publishAt || drawerAnn.createdAt).toLocaleString() }}</span>
          <span class="dot">·</span>
          <span>{{ drawerAnn.viewsCount.toLocaleString() }} 浏览</span>
        </div>
        <pre class="drawer-body">{{ drawerAnn.body }}</pre>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
.announcement-page {
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
.pagination-bar {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.drawer-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #86909c;
  padding-bottom: 12px;
  border-bottom: 1px dashed #f2f3f5;
  margin-bottom: 16px;
}
.drawer-body {
  font-size: 13px;
  line-height: 1.7;
  color: #1d2129;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  margin: 0;
}
.time {
  color: #4e5969;
}
.dot {
  opacity: 0.4;
}
</style>
