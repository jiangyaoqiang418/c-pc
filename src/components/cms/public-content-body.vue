<script setup lang="ts">
import { computed } from 'vue';
import RichTextContent from '@/components/common/rich-text-content.vue';
import { sanitizeRichText } from '@/utils/rich-text';
import { formatDateValue } from '@/utils/date-range';

const props = defineProps<{ content: Api.RealContent.PublicContentVO }>();
const body = computed(() => {
  const document = new DOMParser().parseFromString(sanitizeRichText(props.content.body || ''), 'text/html');
  document.querySelectorAll('a').forEach(link => {
    // 正式内容链接仅接受已审核的完整 HTTP(S)/邮件目标。
    if (!/^(https?:\/\/|mailto:)/i.test((link.getAttribute('href') || '').trim())) link.removeAttribute('href');
    if (link.getAttribute('target') === '_blank') link.setAttribute('rel', 'noopener noreferrer');
  });
  return document.body.innerHTML;
});
</script>

<template>
  <div class="public-content-body">
    <div class="content-version"><span>版本 {{ content.contentVersion }}</span><span>生效于 {{ formatDateValue(content.effectiveAt ?? undefined, true) }}</span><span>发布于 {{ formatDateValue(content.publishedAt ?? undefined, true) }}</span></div>
    <RichTextContent :content="body" />
  </div>
</template>

<style scoped>
.content-version { display:flex; flex-wrap:wrap; gap:12px; padding-bottom:16px; margin-bottom:20px; border-bottom:1px solid var(--line); font-size:12px; color:var(--muted); }
.content-version span:first-child { padding:4px 8px; border-radius:6px; background:var(--soft); }
</style>
