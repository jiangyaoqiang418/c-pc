<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@shared';
import { formatDateValue } from '@/utils/date-range';

interface Props {
  caseRecord: Api.Order.AftersaleCase;
}
const props = defineProps<Props>();

const VERDICT_META: Record<Api.Order.AftersaleVerdict, { label: string; color: string; bg: string; tone: string }> = {
  shopper_fault: { label: '买手责任', color: '#f53f3f', bg: '#ffece8', tone: '已判定买手承担主要责任，押金扣罚 + 全额退款' },
  customer_fault: { label: '顾客责任', color: '#ff7d00', bg: '#fff7e6', tone: '已判定顾客需自行承担，平台不强制退款' },
  both_fault: { label: '双方责任', color: '#722ed1', bg: '#f5e8ff', tone: '平台判定双方均有责任，按比例分摊' },
  force_majeure: { label: '不可抗力', color: '#86909c', bg: '#f7f8fa', tone: '平台判定为不可抗力（疫情/物流/政策），全额退款由平台垫付' }
};

const meta = computed(() => (props.caseRecord.verdict ? VERDICT_META[props.caseRecord.verdict] : undefined));
</script>

<template>
  <div v-if="meta && caseRecord.verdict" class="verdict-card" :style="{ background: meta.bg }">
    <div class="head">
      <span class="title">⚖️ 平台仲裁结果</span>
      <span class="badge" :style="{ background: meta.color }">{{ meta.label }}</span>
    </div>
    <div class="tone">{{ meta.tone }}</div>
    <a-descriptions :column="2" :data="[
      { label: '仲裁员', value: caseRecord.arbitrator || '—' },
      { label: '退款金额', value: caseRecord.refundAmount ? 'U ' + formatAmount(caseRecord.refundAmount) : '—' },
      { label: '押金扣罚', value: caseRecord.depositDeductAmount ? 'U ' + formatAmount(caseRecord.depositDeductAmount) : '—' },
      { label: '结案时间', value: formatDateValue(caseRecord.closedAt) }
    ]" />
    <div v-if="caseRecord.verdictNote" class="note">
      <span class="lbl">仲裁说明：</span>{{ caseRecord.verdictNote }}
    </div>
  </div>
</template>

<style scoped>
.verdict-card {
  padding: 16px 20px;
  border-radius: 8px;
  border-left: 4px solid #722ed1;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}
.badge {
  color: #fff;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.tone {
  font-size: 13px;
  color: #4e5969;
  margin-bottom: 12px;
}
.note {
  margin-top: 12px;
  font-size: 12px;
  color: #4e5969;
}
.lbl {
  font-weight: 600;
}
</style>
