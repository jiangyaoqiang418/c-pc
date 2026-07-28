<script setup lang="ts">
import { computed } from 'vue';
import { enums, formatAmount } from '@shared';

interface Props {
  txn: Api.Wallet.Txn;
  compact?: boolean;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'detail', txn: Api.Wallet.Txn): void }>();

const isIn = computed(() => props.txn.direction === 'in');
const typeLabel = computed(() => enums.TXN_TYPE_META[props.txn.type]?.label || props.txn.type);

const desc = computed(() => {
  const t = props.txn;
  if (t.remark) return t.remark;
  if (t.refType && t.refId) return `${t.refType.toUpperCase()} · ${t.refId}`;
  return t.userName || '—';
});

const relativeTime = computed(() => {
  const diff = Date.now() - new Date(props.txn.createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(props.txn.createdAt).toLocaleDateString();
});
</script>

<template>
  <div class="txn-row" :class="{ compact }" @click="$emit('detail', txn)">
    <div class="dir" :class="{ inbound: isIn, outbound: !isIn }">
      <span class="arrow">{{ isIn ? '↑' : '↓' }}</span>
    </div>
    <div class="middle">
      <div class="type-line">
        <span class="type">{{ typeLabel }}</span>
      </div>
      <div class="desc">{{ desc }}</div>
      <div v-if="!compact" class="meta">
        <span v-if="txn.bucketFrom">{{ txn.bucketFrom }}</span>
        <span v-if="txn.bucketFrom && txn.bucketTo"> → </span>
        <span v-if="txn.bucketTo">{{ txn.bucketTo }}</span>
        <span v-if="txn.chainTxHash" class="hash">· {{ txn.chainTxHash.slice(0, 10) }}…</span>
      </div>
    </div>
    <div class="right">
      <div class="amount" :class="{ inbound: isIn, outbound: !isIn }">
        <span class="sign">{{ isIn ? '+' : '−' }}</span>
        <span class="num">U {{ formatAmount(txn.amount) }}</span>
      </div>
      <div class="time">{{ compact ? relativeTime : new Date(txn.createdAt).toLocaleString() }}</div>
    </div>
  </div>
</template>

<style scoped>
.txn-row {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--yb-hairline);
  cursor: pointer;
  transition: background 0.15s;
}
.txn-row:last-child {
  border-bottom: none;
}
.txn-row:hover {
  background: var(--yb-bg);
}
.txn-row.compact {
  padding: 12px 0;
}

.dir {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--yb-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--yb-muted);
  font-family: var(--yb-font-mono);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}
.dir.inbound {
  color: var(--yb-success);
}
.dir.outbound {
  color: var(--yb-danger);
}

.type-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.type {
  font-size: 13px;
  font-weight: 600;
  color: var(--yb-ink);
  letter-spacing: -0.005em;
}
.desc {
  font-size: 12px;
  color: var(--yb-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.meta {
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 3px;
}
.hash {
  font-family: var(--yb-font-mono);
}

.right {
  text-align: right;
}
.amount {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  font-family: var(--yb-font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--yb-ink);
}
.amount.inbound { color: var(--yb-success); }
.amount.outbound { color: var(--yb-danger); }
.amount .sign { font-weight: 600; }
.amount .num { font-variant-numeric: tabular-nums; }

.time {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 3px;
}
</style>
