<script setup lang="ts">
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AftersaleEvidenceUploader from './aftersale-evidence-uploader.vue';
import type { EvidenceVisualFixture } from '@/visual/types';

defineProps<{
  reason: string;
  evidenceImages: string[];
  eligible: boolean;
  submitting?: boolean;
  confirmationOpen?: boolean;
  submitDisabledReason: string;
  evidenceContext: string;
  evidenceVisualFixture?: EvidenceVisualFixture;
}>();
const emit = defineEmits<{
  'update:reason': [value: string];
  'update:evidenceImages': [value: string[]];
  uploading: [value: boolean];
  cancel: [];
  submit: [];
}>();
</script>

<template>
  <section class="field"><Label for="refund-reason" class="section-title">退款原因 <span aria-hidden="true">*</span></Label><Textarea id="refund-reason" :model-value="reason" @update:model-value="emit('update:reason', String($event))" :disabled="!eligible || submitting || confirmationOpen" :aria-describedby="!eligible ? 'refund-unavailable' : undefined" maxlength="512" rows="2" placeholder="请说明退款原因，我们会认真处理" required /></section>
  <section class="field"><h2 class="section-title">凭证图片 · 最多 6 张</h2><AftersaleEvidenceUploader :key="evidenceContext" :model-value="evidenceImages" @update:model-value="emit('update:evidenceImages', $event)" :max="6" :disabled="!eligible || submitting || confirmationOpen" :visual-fixture="evidenceVisualFixture" @uploading="emit('uploading', $event)" /></section>
  <footer class="button-row actions"><button type="button" class="outline" :disabled="submitting || confirmationOpen" @click="emit('cancel')">取消</button><TooltipProvider><Tooltip><TooltipTrigger as-child><span :tabindex="submitDisabledReason ? 0 : undefined"><button type="button" class="primary" :disabled="!!submitDisabledReason" @click="emit('submit')">{{ submitting ? '提交中…' : '提交仅退款申请' }}</button></span></TooltipTrigger><TooltipContent v-if="submitDisabledReason">{{ submitDisabledReason }}</TooltipContent></Tooltip></TooltipProvider></footer>
</template>

<style scoped>
.section-title { display:flex; gap:8px; align-items:center; font-size:16px; line-height:1.55; font-weight:500; }
h2.section-title { font-weight:500!important; line-height:1.55!important; }
:deep(#refund-reason:not(:focus-visible)) { box-shadow:none; }
.actions { justify-content:flex-end; }.actions > span { flex:1; }.actions > span button { width:100%; }
</style>
