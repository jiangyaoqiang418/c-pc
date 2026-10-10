<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed } from 'vue';
import { enums, formatAmount } from '@shared';
import { formatDateValue, parseDateValue } from '@/utils/date-range';

interface Props {
  txn: Api.RealWallet.DisplayLedger;
  compact?: boolean;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'detail', txn: Api.RealWallet.DisplayLedger): void }>();

const isIn = computed(() => props.txn.direction === 'in');
const typeLabel = computed(() => {
  if (props.txn.testData) return '测试模拟到账';
  if ('bizTypeText' in props.txn && props.txn.bizTypeText) return props.txn.bizTypeText;
  return enums.TXN_TYPE_META[props.txn.type]?.label || props.txn.type;
});

const desc = computed(() => {
  const t = props.txn;
  if (t.remark) return t.remark;
  if (t.refId) return `关联业务 · ${t.refId}`;
  return t.userName || '—';
});

const relativeTime = computed(() => {
  const timestamp = parseDateValue(props.txn.createdAt);
  if (timestamp === undefined) return '—';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateValue(props.txn.createdAt, true);
});


</script>

<template>
  <button type="button" class="txn-row" :class="{ compact }" :aria-label="`${typeLabel}，${isIn ? '收入' : '支出'} U ${formatAmount(txn.amount)}，查看交易详情`" @click="$emit('detail', txn)">
    <span class="dir" :class="{ inbound: isIn, outbound: !isIn }"><Icon :icon="isIn ? 'lucide:arrow-down-left' : 'lucide:arrow-up-right'" width="18" /></span>
    <span class="middle"><span class="type-line">{{ typeLabel }}</span><span class="desc" :title="desc">{{ desc }}</span><span v-if="!compact" class="meta"><span v-if="txn.bucketFrom">{{ enums.BUCKET_META[txn.bucketFrom]?.label || '未知账户' }}</span><span v-if="txn.bucketFrom && txn.bucketTo"> → </span><span v-if="txn.bucketTo">{{ enums.BUCKET_META[txn.bucketTo]?.label || '未知账户' }}</span><span v-if="txn.chainTxHash" class="hash"> · {{ txn.chainTxHash.slice(0, 10) }}…</span></span></span>
    <span class="right"><span class="amount" :class="{ inbound: isIn, outbound: !isIn }">{{ isIn ? '+' : '−' }} U {{ formatAmount(txn.amount) }}</span><span class="time">{{ compact ? relativeTime : formatDateValue(txn.createdAt) }}</span></span><Icon icon="lucide:chevron-right" width="16" class="row-arrow" />
  </button>
</template>

<style scoped>
.txn-row { display:grid; grid-template-columns:36px minmax(0,1fr) auto 16px; align-items:center; gap:16px; width:100%; border:0; border-bottom:1px solid var(--yb-hairline); padding:20px 12px; text-align:left; background:transparent; cursor:pointer; transition:background .15s; }.txn-row:last-child { border-bottom:0; }.txn-row:hover { background:var(--yb-primary-soft); }.txn-row:focus-visible { outline:2px solid var(--yb-brand-primary); outline-offset:-2px; }.txn-row.compact { padding:16px 0; }.dir { display:grid; place-items:center; width:36px; height:36px; border-radius:6px; background:var(--yb-fill); }.dir.inbound { color:var(--yb-success); }.dir.outbound { color:var(--yb-danger); }.middle { min-width:0; }.type-line { display:block; font-size:14px; font-weight:600; color:var(--yb-ink); }.desc { display:block; margin-top:5px; font-size:13px; color:var(--yb-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.meta { display:block; font-size:12px; color:var(--yb-muted); margin-top:6px; }.hash { font-family:var(--yb-font-mono); }.right { text-align:right; }.amount { display:block; font-size:17px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }.amount.inbound { color:var(--yb-success); }.amount.outbound { color:var(--yb-danger); }.time { display:block; color:var(--yb-muted); font-size:12px; margin-top:6px; }.row-arrow { color:var(--yb-muted); }@media(max-width:700px) { .txn-row { grid-template-columns:30px minmax(0,1fr) auto; gap:10px; padding:16px 0; }.dir { width:30px; height:30px; }.row-arrow { display:none; }.time { max-width:130px; }.amount { font-size:15px; } }@media(prefers-reduced-motion:reduce) { .txn-row { transition:none; } }
</style>
