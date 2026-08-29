<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cmsApi } from '@shared';

const router = useRouter();

const announcements = ref<Api.Cms.Announcement[]>([]);
const closed = ref(false);
const activeIdx = ref(0);
let disposed = false;
let rotationTimer: ReturnType<typeof setInterval> | undefined;

const colorMap: Record<Api.Cms.AnnouncementType, string> = {
  system: '#165DFF',
  maintenance: '#FF7D00',
  campaign: '#F53F3F',
  risk: '#86909C'
};

const current = computed(() => announcements.value[activeIdx.value]);

onMounted(async () => {
  if (sessionStorage.getItem('bw-shop-ann-closed-today') === new Date().toDateString()) {
    closed.value = true;
    return;
  }
  const res = await cmsApi.fetchAnnouncements({ size: 5, audience: 'customer' });
  if (disposed) return;
  announcements.value = res.records.filter(a => a.pinned).slice(0, 3);
  if (!announcements.value.length) {
    announcements.value = res.records.slice(0, 2);
  }
  if (announcements.value.length > 1) {
    rotationTimer = setInterval(() => {
      activeIdx.value = (activeIdx.value + 1) % announcements.value.length;
    }, 5000);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  if (rotationTimer) clearInterval(rotationTimer);
  rotationTimer = undefined;
});

function close() {
  closed.value = true;
  sessionStorage.setItem('bw-shop-ann-closed-today', new Date().toDateString());
}
</script>

<template>
  <div v-if="!closed && current" class="ann-bar" :style="{ background: colorMap[current.type] }">
    <div class="bar-inner" @click="router.push('/announcement')">
      <span class="prefix">📣 平台公告</span>
      <span class="title">{{ current.title }}</span>
      <span class="summary">{{ current.summary }}</span>
      <button class="close" @click.stop="close">✕</button>
    </div>
  </div>
</template>

<style scoped>
.ann-bar {
  color: #fff;
  padding: 6px 0;
  font-size: 12px;
}
.bar-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.prefix {
  font-weight: 600;
}
.title {
  font-weight: 500;
}
.summary {
  opacity: 0.85;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.close {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 0 6px;
  font-size: 13px;
  opacity: 0.7;
}
.close:hover {
  opacity: 1;
}
</style>
