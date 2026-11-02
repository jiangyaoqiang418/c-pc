<script setup lang="ts">
defineProps<{ card: Api.Ai.HumanHandoffCard; route?: Api.RealNotify.SupportRoute; loggedIn: boolean; applying: boolean }>();
defineEmits<{ confirm: [reason?: string]; login: [] }>();
</script>

<template>
  <section class="human-handoff" aria-label="转人工确认">
    <p>需要人工客服协助时，请点击确认。</p>
    <button type="button" class="outline" :aria-busy="applying" :disabled="applying || (loggedIn && (!route || route.interveneStatus !== 'NONE' || !route.aiEnabled))" @click="loggedIn ? $emit('confirm', card.data.reason) : $emit('login')">
      {{ applying ? '正在申请…' : !loggedIn ? '登录后确认转人工' : route?.interveneStatus === 'REQUESTED' ? '正在等待人工客服' : route?.interveneStatus === 'HANDLING' ? '人工客服接待中' : card.data.label }}
    </button>
  </section>
</template>

<style scoped>
.human-handoff { margin:12px 0; padding:12px 16px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); }
.human-handoff p { margin:0 0 8px; }
.human-handoff button { color:var(--yb-brand-primary); border-color:var(--line); }
</style>
