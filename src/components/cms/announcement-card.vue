<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  announcement: Api.Cms.Announcement;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'open', a: Api.Cms.Announcement): void }>();

const TYPE_META: Record<Api.Cms.AnnouncementType, { label: string; color: string; emoji: string }> = {
  system: { label: '系统', color: 'arcoblue', emoji: '🔔' },
  maintenance: { label: '维护', color: 'orange', emoji: '🛠' },
  campaign: { label: '活动', color: 'red', emoji: '🎉' },
  risk: { label: '风险', color: 'gray', emoji: '⚠️' }
};

const meta = computed(() => TYPE_META[props.announcement.type]);
</script>

<template>
  <div
    class="ann-card"
    :class="{ pinned: announcement.pinned }"
    role="button"
    tabindex="0"
    @click="$emit('open', announcement)"
    @keydown.enter="$emit('open', announcement)"
    @keydown.space.prevent="$emit('open', announcement)"
  >
    <div class="head">
      <span class="emoji">{{ meta.emoji }}</span>
      <a-tag :color="meta.color" size="small">{{ meta.label }}</a-tag>
      <a-tag v-if="announcement.pinned" color="red" size="small">置顶</a-tag>
      <span class="title">{{ announcement.title }}</span>
    </div>
    <div class="summary">{{ announcement.summary }}</div>
    <div class="meta">
      <span class="time">{{ new Date(announcement.publishAt || announcement.createdAt).toLocaleDateString() }}</span>
      <span class="dot">·</span>
      <span>{{ announcement.viewsCount.toLocaleString() }} 浏览</span>
      <span class="dot">·</span>
      <span>{{ announcement.createdBy }}</span>
    </div>
  </div>
</template>

<style scoped>
.ann-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px 20px;
  margin-bottom: 10px;
  cursor: pointer;
  border-left: 3px solid #f2f3f5;
  transition: all 0.15s;
}
.ann-card:hover {
  border-left-color: var(--bw-brand-primary);
  box-shadow: 0 4px 12px rgba(22, 93, 255, 0.08);
}
.ann-card:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: -2px;
}
.ann-card.pinned {
  border-left-color: #f53f3f;
  background: linear-gradient(90deg, #fff5f5 0%, #fff 30%);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.emoji {
  font-size: 16px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}
.summary {
  color: #4e5969;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 8px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.meta {
  font-size: 11px;
  color: #86909c;
  display: flex;
  gap: 4px;
  align-items: center;
}
.dot {
  opacity: 0.4;
}
</style>
