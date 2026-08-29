<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatAmount, formatRate } from '@shared';

interface Props {
  product: Api.RealFinance.FinanceProductVO;
  availableBalance?: string;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'subscribe', amount: string): void }>();

const amount = ref<number>();
amount.value = Number(props.product.minAmount) || 100;

const annualRate = computed(() => {
  const parsed = Number(props.product.annualRate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});
const lockDays = computed(() => {
  const parsed = Number(props.product.lockDays);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
});
const normalizedAmount = computed(() => Number.isFinite(amount.value) ? Number(amount.value) : 0);
const expectedInterest = computed(() => (
  normalizedAmount.value * (annualRate.value ?? 0) * (lockDays.value ?? 0) / 365
).toFixed(8));
const maturityDate = computed(() => lockDays.value === undefined
  ? '—'
  : new Date(Date.now() + lockDays.value * 86400_000).toLocaleDateString());

const min = computed(() => {
  const parsed = Number(props.product.minAmount);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});
const max = computed(() => {
  if (props.product.maxAmount === undefined || props.product.maxAmount === null) return undefined;
  const parsed = Number(props.product.maxAmount);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
});
const balance = computed(() => {
  if (props.availableBalance === undefined || props.availableBalance === null || props.availableBalance === '') return 0;
  const parsed = Number(props.availableBalance);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});

const errMsg = computed(() => {
  if (amount.value === undefined || !Number.isFinite(amount.value)) return '请输入投入金额';
  if (lockDays.value === undefined) return '产品锁定期限无效，暂不可申购';
  if (annualRate.value === undefined) return '产品年化利率无效，暂不可申购';
  if (min.value === undefined) return '产品起投金额无效，暂不可申购';
  if (normalizedAmount.value < min.value) return `最少投入 ${min.value} U`;
  if (max.value !== undefined && normalizedAmount.value > max.value) return `单笔最高 ${max.value} U`;
  if (balance.value === undefined) return '钱包余额无效，暂不可申购';
  if (normalizedAmount.value > balance.value) return `可用余额 U ${formatAmount(props.availableBalance || '0')} 不足`;
  return '';
});

const canSubmit = computed(() => !errMsg.value && normalizedAmount.value > 0);

function submit() {
  if (!canSubmit.value || props.submitting) return;
  emit('subscribe', normalizedAmount.value.toFixed(2));
}

watch(
  () => props.product.id,
  () => {
    amount.value = Number(props.product.minAmount) || 100;
  }
);
</script>

<template>
  <a-card class="preview-card" :body-style="{ padding: '20px 24px' }" :bordered="false">
    <div class="card-title">利息预估</div>
    <div class="input-row">
      <span class="lbl">投链上充值额</span>
      <a-input-number v-model="amount" :min="0" :precision="2" size="large" class="amount-input" />
      <span class="suffix">U</span>
    </div>
    <div v-if="errMsg" class="err">{{ errMsg }}</div>

    <a-divider />

    <div class="result-row">
      <div class="lbl">综合年化利率</div>
      <div class="val rate">
        {{ formatRate(annualRate) }}
        <span class="bonus">以申购时后端返回的年化与锁定天数计算</span>
      </div>
    </div>
    <div class="result-row">
      <div class="lbl">锁定天数</div>
      <div class="val">{{ lockDays ?? '—' }} 天</div>
    </div>
    <div class="result-row">
      <div class="lbl">预计到期日</div>
      <div class="val">{{ maturityDate }}</div>
    </div>
    <div class="result-row highlight">
      <div class="lbl">预计利息</div>
      <div class="val interest">+ U {{ formatAmount(expectedInterest) }}</div>
    </div>

    <a-button
      type="primary"
      long
      size="large"
      :disabled="!canSubmit"
      :loading="props.submitting"
      class="submit-btn"
      @click="submit"
    >
      立即订阅 U {{ formatAmount(amount) }}
    </a-button>

    <div class="hint">提前赎回以订单详情返回的可到账利息和违约费为准。</div>
  </a-card>
</template>

<style scoped>
.preview-card {
  background: linear-gradient(135deg, #f3f7ff 0%, #fff 60%);
  border-radius: var(--bw-card-radius);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid var(--bw-brand-primary);
}
.input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.lbl {
  font-size: 12px;
  color: #86909c;
}
.amount-input {
  flex: 1;
}
.suffix {
  font-size: 14px;
  color: #4e5969;
  font-weight: 600;
}
.err {
  color: #f53f3f;
  font-size: 12px;
  margin-bottom: 4px;
}
.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}
.result-row.highlight {
  background: #fff7e6;
  padding: 8px 12px;
  border-radius: 4px;
  margin: 6px -12px;
}
.val {
  font-weight: 600;
  color: #1d2129;
  font-family: ui-monospace, monospace;
}
.val.rate {
  color: #00A88A;
  text-align: right;
}
.bonus {
  display: block;
  font-size: 11px;
  color: #86909c;
  font-weight: 400;
  font-family: inherit;
  margin-top: 2px;
}
.val.interest {
  color: #00A88A;
  font-size: 18px;
}
.submit-btn {
  margin-top: 16px;
}
.hint {
  margin-top: 10px;
  font-size: 11px;
  color: #86909c;
  text-align: center;
}
</style>
