<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Icon } from '@iconify/vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AmountInput from '@/components/common/amount-input.vue';
import { computed, ref, watch } from 'vue';
import { formatAmount, formatRate } from '@shared';
import { financeSubscriptionIssue } from '@/service/api/finance';

interface Props {
  product: Api.RealFinance.FinanceProductVO;
  availableBalance?: string;
  submitting?: boolean;
  disabledReason?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'subscribe', amount: string): void }>();

const amount = ref<number>();
amount.value = Number(props.product.minAmount) || 100;

const annualRate = computed(() => {
  if (props.product.annualRate === undefined || props.product.annualRate === null || String(props.product.annualRate).trim() === '') return undefined;
  const parsed = Number(props.product.annualRate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});
const lockDays = computed(() => {
  const parsed = Number(props.product.lockDays);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
});
const normalizedAmount = computed(() => Number.isFinite(amount.value) ? Number(amount.value) : 0);
const expectedInterest = computed(() => {
  if (amount.value === undefined || !Number.isFinite(amount.value) || amount.value < 0
    || annualRate.value === undefined || lockDays.value === undefined) return undefined;
  return (amount.value * annualRate.value * lockDays.value / 365).toFixed(8);
});
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
  if (props.availableBalance === undefined || props.availableBalance === null || props.availableBalance === '') return undefined;
  const parsed = Number(props.availableBalance);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
});

const errMsg = computed(() => {
  if (props.disabledReason) return props.disabledReason;
  const statusIssue = financeSubscriptionIssue(props.product);
  if (statusIssue) return statusIssue;
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


function useMaximum() {
  if (props.submitting || balance.value === undefined) return;
  amount.value = Math.floor(Math.min(balance.value, max.value ?? balance.value) * 100) / 100;
}
const dailyEstimate = computed(() => expectedInterest.value === undefined || lockDays.value === undefined
  ? undefined : (Number(expectedInterest.value) / lockDays.value).toFixed(8));
const estimatedTotal = computed(() => expectedInterest.value === undefined || amount.value === undefined || !Number.isFinite(amount.value)
  ? undefined : (amount.value + Number(expectedInterest.value)).toFixed(8));

</script>

<template>

  <section class="preview-card">
    <span class="eyebrow">PLAN YOUR LOCKUP</span><h2>预览这笔锁仓</h2>
    <label for="finance-subscribe-amount">锁仓金额 <span>USDT</span></label>
    <div class="amount-row"><AmountInput id="finance-subscribe-amount" v-model="amount" :min="0" :precision="2" :disabled="submitting" placeholder="0.00" /><Button type="button" variant="ghost" :disabled="submitting || balance === undefined" @click="useMaximum">最大</Button></div>
    <p class="balance-hint">可用 {{ formatAmount(availableBalance) }} USDT · 最低 {{ min === undefined ? '—' : formatAmount(min) }} USDT</p>
    <p v-if="errMsg" class="error" role="alert">{{ errMsg }}</p>
    <div class="estimate"><small>预计到期利息</small><strong>{{ expectedInterest === undefined ? '待确认' : '+ ' + formatAmount(expectedInterest) }} <span>USDT</span></strong><small>参考年化 {{ formatRate(annualRate) }} · {{ lockDays ?? '—' }} 天</small></div>
    <dl class="breakdown"><div><dt>每日理论利息</dt><dd>{{ formatAmount(dailyEstimate) }} USDT</dd></div><div><dt>预计到期日</dt><dd>{{ maturityDate }}</dd></div><div><dt>预计到期本息</dt><dd>{{ formatAmount(estimatedTotal) }} USDT</dd></div></dl>
    <p class="formula">本金 × 年化 ÷ 365 × 天数<br>测算仅作参考，以申购时确认的参数为准。</p>
    <TooltipProvider :delay-duration="250"><Tooltip><TooltipTrigger as-child><span class="submit-wrap" :tabindex="!canSubmit || submitting ? 0 : undefined"><Button type="button" class="full" :disabled="!canSubmit || submitting" @click="submit"><Icon v-if="submitting" icon="lucide:loader-circle" class="animate-spin" width="16" />{{ submitting ? '正在处理…' : '确认锁仓' }}<Icon v-if="!submitting" icon="lucide:arrow-right" width="16" /></Button></span></TooltipTrigger><TooltipContent v-if="!canSubmit || submitting" class="max-w-80">{{ submitting ? '正在处理本次申购，请勿重复提交' : errMsg }}</TooltipContent></Tooltip></TooltipProvider>
    <p class="hint">需要支付密码确认。提前赎回以订单最新返回的可到账利息和违约费为准。</p>
  </section>

</template>

<style scoped>

.preview-card { background:var(--yb-surface); padding:28px; border:1px solid var(--yb-hairline); border-radius:20px; }.eyebrow { font-size:12px; letter-spacing:.12em; color:var(--yb-gold); }.preview-card h2 { font-size:22px; font-weight:600; margin:6px 0 24px; }.preview-card>label { display:flex; justify-content:space-between; font-size:14px; margin-bottom:8px; }.preview-card>label span { color:var(--yb-muted); font-size:12px; }.amount-row { display:flex; align-items:center; gap:8px; }.amount-row>input { min-width:0; }.balance-hint,.hint,.formula { font-size:12px; color:var(--yb-muted); line-height:1.7; }.balance-hint { margin:8px 0 14px; }.error { font-size:13px; color:var(--yb-danger); line-height:1.7; margin:12px 0; overflow-wrap:anywhere; }.estimate { display:flex; flex-direction:column; gap:7px; padding:20px; border-radius:14px; background:var(--yb-primary-soft); margin:20px 0; }.estimate>small { font-size:12px; color:var(--yb-muted); }.estimate strong { font-size:26px; font-weight:500; font-family:var(--yb-font-mono); color:var(--yb-brand-primary); }.estimate strong span { font-size:12px; }.breakdown { margin:0; font-size:13px; }.breakdown>div { display:flex; justify-content:space-between; align-items:baseline; gap:14px; padding:8px 0; }.breakdown dt { color:var(--yb-muted); }.breakdown dd { margin:0; font-family:var(--yb-font-mono); font-size:12px; text-align:right; }.formula { padding-top:16px; border-top:1px solid var(--yb-hairline); margin:16px 0; }.full,.submit-wrap { width:100%; }.submit-wrap { display:block; }.hint { margin:14px 0 0; }

</style>
