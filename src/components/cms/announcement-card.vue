<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { formatDateValue } from '@/utils/date-range';

defineProps<{ announcement: Api.RealContent.PublicContentVO }>();
defineEmits<{ open: [announcement: Api.RealContent.PublicContentVO] }>();
</script>

<template>
  <article class="notice-item">
    <UmIcon name="bell" />
    <div><h3><span v-if="announcement.pinned" class="announcement-pinned">置顶</span>{{ announcement.title }}</h3><small>{{ formatDateValue(announcement.publishedAt ?? undefined, true) }} · 版本 {{ announcement.contentVersion }}</small></div>
    <button type="button" :aria-label="'查看公告：' + announcement.title" @click="$emit('open', announcement)">查看 →</button>
  </article>
</template>

<style scoped>
.notice-item > div { min-width:0; flex:1; overflow-wrap:anywhere; }
.notice-item > button { flex-shrink:0; }
.announcement-pinned { display:inline-block; margin-right:8px; color:var(--green); font-size:12px; }
</style>
