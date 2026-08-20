<script setup lang="ts">
import { computed } from 'vue';
import { Message } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import { enums, formatAmount, shortAddress } from '@shared';

interface Props {
  visible: boolean;
  txn?: Api.Wallet.Txn;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const isIn = computed(() => props.txn?.direction === 'in');
const typeLabel = computed(() => {
  if (!props.txn) return '';
  return props.txn.testData ? '测试模拟到账' : enums.TXN_TYPE_META[props.txn.type]?.label || props.txn.type;
});

function copy(text?: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => Message.success('已复制'));
}
</script>

<template>
  <a-drawer
    :visible="visible"
    title="交易详情"
    :width="480"
    :footer="false"
    @update:visible="(v) => $emit('update:visible', v)"
  >
    <template v-if="txn">
      <div class="head">
        <div class="type-badge">{{ typeLabel }}</div>
        <div class="amount" :class="{ inbound: isIn, outbound: !isIn }">
          <span class="sign">{{ isIn ? '+' : '−' }}</span>
          <span class="num-unit">U</span>
          <span class="num">{{ formatAmount(txn.amount) }}</span>
        </div>
        <div class="balance">
          余额变化后 <span class="yb-mono">U {{ formatAmount(txn.balanceAfter) }}</span>
        </div>
      </div>

      <div class="detail-list">
        <div class="dl-row"><span class="k">流水编号</span><span class="v yb-mono">#{{ txn.id }}</span></div>
        <div class="dl-row"><span class="k">类型</span><span class="v">{{ typeLabel }}</span></div>
        <div class="dl-row"><span class="k">方向</span><span class="v">{{ isIn ? '收入' : '支出' }}</span></div>
        <div class="dl-row"><span class="k">出账桶</span><span class="v">{{ txn.bucketFrom || '—' }}</span></div>
        <div class="dl-row"><span class="k">入账桶</span><span class="v">{{ txn.bucketTo || '—' }}</span></div>
        <div class="dl-row"><span class="k">操作人</span><span class="v">{{ txn.operator || '系统' }}</span></div>
        <div class="dl-row"><span class="k">备注</span><span class="v">{{ txn.remark || '—' }}</span></div>
        <div class="dl-row"><span class="k">时间</span><span class="v yb-mono">{{ new Date(txn.createdAt).toLocaleString() }}</span></div>
      </div>

      <div v-if="txn.refType || txn.refId" class="ref-block">
        <div class="block-eyebrow">RELATED</div>
        <div class="dl-row"><span class="k">类型</span><span class="v">{{ txn.refType || '—' }}</span></div>
        <div class="dl-row"><span class="k">引用 ID</span><span class="v yb-mono">{{ txn.refId || '—' }}</span></div>
      </div>

      <div v-if="txn.chainTxHash || txn.fromAddress || txn.toAddress" class="chain-block">
        <div class="block-eyebrow">ON-CHAIN</div>
        <div v-if="txn.chainTxHash" class="chain-row">
          <span class="k">交易哈希</span>
          <span class="v yb-mono" :title="txn.chainTxHash">{{ shortAddress(txn.chainTxHash, 10, 8) }}</span>
          <button class="copy-btn" type="button" title="复制交易哈希" aria-label="复制交易哈希" @click="copy(txn.chainTxHash)"><Icon icon="lucide:copy" width="12" /></button>
        </div>
        <div v-if="txn.fromAddress" class="chain-row">
          <span class="k">来源地址</span>
          <span class="v yb-mono">{{ shortAddress(txn.fromAddress) }}</span>
          <button class="copy-btn" type="button" title="复制来源地址" aria-label="复制来源地址" @click="copy(txn.fromAddress)"><Icon icon="lucide:copy" width="12" /></button>
        </div>
        <div v-if="txn.toAddress" class="chain-row">
          <span class="k">目标地址</span>
          <span class="v yb-mono">{{ shortAddress(txn.toAddress) }}</span>
          <button class="copy-btn" type="button" title="复制目标地址" aria-label="复制目标地址" @click="copy(txn.toAddress)"><Icon icon="lucide:copy" width="12" /></button>
        </div>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped>
.head {
  text-align: center;
  padding: 24px 0 28px;
  border-bottom: 1px solid var(--yb-hairline);
  margin-bottom: 20px;
}
.type-badge {
  display: inline-block;
  padding: 4px 12px;
  background: var(--yb-bg);
  color: var(--yb-muted);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  margin-bottom: 16px;
}
.amount {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--yb-font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--yb-ink);
  margin-bottom: 8px;
}
.amount .sign {
  font-size: 26px;
  font-weight: 600;
}
.amount .num-unit {
  font-size: 18px;
  font-weight: 600;
  color: var(--yb-muted);
  margin-left: 2px;
}
.amount .num {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.amount.inbound { color: var(--yb-success); }
.amount.inbound .num-unit { color: var(--yb-success); opacity: 0.7; }
.amount.outbound { color: var(--yb-danger); }
.amount.outbound .num-unit { color: var(--yb-danger); opacity: 0.7; }
.balance {
  font-size: 12px;
  color: var(--yb-muted);
}

.detail-list,
.ref-block,
.chain-block {
  padding: 8px 0;
}
.ref-block,
.chain-block {
  border-top: 1px solid var(--yb-hairline);
  margin-top: 20px;
  padding-top: 20px;
}
.block-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 8px;
}
.dl-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--yb-hairline);
  font-size: 13px;
}
.dl-row:last-child {
  border-bottom: none;
}
.k {
  color: var(--yb-muted);
}
.v {
  color: var(--yb-ink);
  font-weight: 500;
  max-width: 60%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chain-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 13px;
}
.chain-row .k {
  width: 80px;
  color: var(--yb-muted);
}
.chain-row .v {
  flex: 1;
  color: var(--yb-ink);
  text-align: left;
}
.copy-btn {
  background: transparent;
  border: 1px solid var(--yb-hairline);
  color: var(--yb-muted);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
}
.copy-btn:hover {
  border-color: var(--yb-ink);
  color: var(--yb-ink);
}
.copy-btn:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
}
</style>
