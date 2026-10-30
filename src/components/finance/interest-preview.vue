<script setup lang="ts">
import DialogActions from '@/components/common/dialog-actions.vue';
import UmIcon from '@/components/common/um-icon.vue';
import V47VaultDialog from './v47-vault-dialog.vue';
import { computed, ref, watch } from 'vue';
import { formatFinanceAmount as formatAmount, formatFinanceRate as formatRate, knownFinanceDecimal, simpleFinanceInterest } from './v47-interest-math';
import { sumPaymentAmounts } from '@/utils/checkout';
import { useUserStore } from '@/stores';
import { financeSubscriptionIssue } from '@/service/api/finance';

interface Props {
  product: Api.RealFinance.FinanceProductVO;
  availableBalance?: string;
  submitting?: boolean;
  disabledReason?: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'subscribe', amount: string): void }>();
const userStore = useUserStore();
const initialAmount = () => knownFinanceDecimal(props.product.minAmount) ?? String(props.product.minAmount);
const amount = ref(initialAmount());
const confirmVisible = ref(false);
const acknowledged = ref(false);
const normalizedAmount = computed(() => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.value.trim());
  return match ? `${match[1].replace(/^0+(?=\d)/, '')}.${(match[2] || '').padEnd(2, '0')}` : undefined;
});
function compareDecimal(left: string | number, right: string | number) {
  const values = [left, right].map(knownFinanceDecimal);
  if (values.some(value => value === undefined)) return undefined;
  const parts = values.map(value => value!.split('.'));
  const scale = Math.max(...parts.map(([, fraction = '']) => fraction.length));
  const units = parts.map(([integer, fraction = '']) => BigInt(integer + fraction.padEnd(scale, '0')));
  return units[0] < units[1] ? -1 : units[0] > units[1] ? 1 : 0;
}
const annualRate = computed(() => knownFinanceDecimal(props.product.annualRate));
const lockDays = computed(() => Number.isSafeInteger(props.product.lockDays) && props.product.lockDays > 0 ? props.product.lockDays : undefined);
const min = computed(() => compareDecimal(props.product.minAmount, 0) !== undefined ? props.product.minAmount : undefined);
const max = computed(() => props.product.maxAmount === undefined || props.product.maxAmount === null ? undefined : props.product.maxAmount);
const balance = computed(() => props.availableBalance !== undefined && compareDecimal(props.availableBalance, 0) !== undefined ? props.availableBalance : undefined);
// The preview uses exact received decimals; the service remains authoritative for settlement.
const expectedInterest = computed(() => normalizedAmount.value === undefined || annualRate.value === undefined || lockDays.value === undefined
  ? undefined : simpleFinanceInterest(normalizedAmount.value, annualRate.value, lockDays.value));
const dailyEstimate = computed(() => normalizedAmount.value === undefined || annualRate.value === undefined
  ? undefined : simpleFinanceInterest(normalizedAmount.value, annualRate.value, 1));
const estimatedTotal = computed(() => expectedInterest.value === undefined || normalizedAmount.value === undefined
  ? undefined : sumPaymentAmounts([normalizedAmount.value, expectedInterest.value]));
const maturityDate = computed(() => lockDays.value === undefined ? '—' : new Date(Date.now() + lockDays.value * 86400_000).toLocaleDateString());
const errMsg = computed(() => {
  if (props.disabledReason) return props.disabledReason;
  const statusIssue = financeSubscriptionIssue(props.product);
  if (statusIssue) return statusIssue;
  if (normalizedAmount.value === undefined || compareDecimal(normalizedAmount.value, 0) !== 1) return '请输入有效金额，最多 2 位小数';
  if (lockDays.value === undefined) return '产品锁定期限无效，暂不可申购';
  if (annualRate.value === undefined) return '产品年化利率无效，暂不可申购';
  if (min.value === undefined) return '产品起投金额无效，暂不可申购';
  if (compareDecimal(normalizedAmount.value, min.value) === -1) return `最低锁仓 ${formatAmount(min.value)} USDT`;
  if (max.value !== undefined && compareDecimal(max.value, 0) !== 1) return '产品单笔上限未确认，暂不可申购';
  if (max.value !== undefined && compareDecimal(normalizedAmount.value, max.value) === 1) return `单笔最高 ${formatAmount(max.value)} USDT`;
  if (balance.value === undefined) return '钱包余额尚未确认，暂不可申购';
  if (compareDecimal(normalizedAmount.value, balance.value) === 1) return `可用余额 ${formatAmount(balance.value)} USDT 不足`;
  if (expectedInterest.value === undefined) return '测算金额超出当前支持范围，请调整后重试';
  return '';
});
const canSubmit = computed(() => !errMsg.value);
function openConfirm() {
  if (!canSubmit.value || props.submitting) return;
  acknowledged.value = false;
  confirmVisible.value = true;
}
function submit() {
  if (!canSubmit.value || props.submitting || !acknowledged.value || normalizedAmount.value === undefined) return;
  const principal = normalizedAmount.value;
  confirmVisible.value = false;
  emit('subscribe', principal);
}
function useMaximum() {
  if (props.submitting || balance.value === undefined) return;
  const maximum = max.value !== undefined && compareDecimal(max.value, balance.value) === -1 ? String(max.value) : balance.value;
  const normalized = knownFinanceDecimal(maximum);
  if (normalized === undefined) return;
  const [integer, fraction = ''] = normalized.split('.');
  amount.value = `${integer}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
watch([() => props.product.id, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => { amount.value = initialAmount(); confirmVisible.value = false; acknowledged.value = false; });
// 确认期间金额变化必须重新勾选，不能沿用上一笔本金的确认。
watch(normalizedAmount, () => { confirmVisible.value = false; acknowledged.value = false; }, { flush: 'sync' });
watch([annualRate, lockDays, min, max], () => { confirmVisible.value = false; acknowledged.value = false; });
</script>

<template>
  <section class="vault-calculator">
    <span class="eyebrow">PLAN YOUR LOCKUP</span><h2>预览这笔锁仓</h2>
    <label for="finance-subscribe-amount">锁仓金额 <span>USDT</span></label>
    <div class="vault-amount-input"><input id="finance-subscribe-amount" v-model="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" :disabled="submitting" maxlength="40" /><button :disabled="submitting || balance === undefined" @click="useMaximum">最大</button></div>
    <small class="vault-balance-hint">可用 {{ formatAmount(availableBalance) }} USDT · 最低 {{ formatAmount(min) }} USDT</small>
    <div class="vault-presets"><button v-for="value in [100, 500, 1000]" :key="value" :disabled="submitting" @click="amount = String(value)">{{ value }}</button></div>
    <p v-if="errMsg" class="vault-error" role="alert">{{ errMsg }}</p>
    <div class="vault-estimate"><span>预计到期利息</span><strong>{{ expectedInterest === undefined ? '待确认' : '+ ' + formatAmount(expectedInterest, { decimals: 4 }) }} <small>USDT</small></strong><small>参考年化 {{ formatRate(annualRate) }} · {{ lockDays ?? '—' }} 天</small></div>
    <dl class="vault-breakdown"><div><dt>每日预估利息</dt><dd>+ {{ formatAmount(dailyEstimate, { decimals: 8 }) }}</dd></div><div><dt>预计到期日</dt><dd>{{ maturityDate }}</dd></div><div><dt>预计到期本息</dt><dd>{{ formatAmount(estimatedTotal, { decimals: 4 }) }} USDT</dd></div></dl>
    <p class="vault-formula">本金 × 年化 ÷ 365 × 天数<br />测算仅作参考，以申购时确认的参数为准。</p>
    <button class="primary full" :disabled="!canSubmit || submitting" @click="openConfirm">{{ submitting ? '正在处理…' : '确认锁仓' }}<UmIcon v-if="!submitting" name="arrow" /></button>
    <V47VaultDialog v-model:visible="confirmVisible" title="确认这笔锁仓" :description="product.name + ' · USDT'" eyebrow="REVIEW YOUR LOCKUP" :busy="submitting">
      <div class="vault-confirm-amount"><small>锁仓本金</small><strong>{{ formatAmount(normalizedAmount, { decimals: 4 }) }} <span>USDT</span></strong></div>
      <dl class="vault-breakdown"><div><dt>参考年化</dt><dd>{{ formatRate(annualRate) }}</dd></div><div><dt>锁仓期限</dt><dd>{{ lockDays }} 天</dd></div><div><dt>到期日期</dt><dd>{{ maturityDate }}</dd></div><div><dt>预计利息</dt><dd class="positive">+ {{ formatAmount(expectedInterest, { decimals: 8 }) }}</dd></div></dl>
      <p class="vault-confirm-note">每日计息不等于每日到账；本金与利息由系统结算。确认后需输入支付密码，实际收益以锁仓订单为准。</p>
      <label class="vault-ack"><input v-model="acknowledged" type="checkbox" :disabled="submitting" /><span>我已核对锁仓期限与计息规则</span></label>
      <p v-if="errMsg" class="vault-error" role="alert">{{ errMsg }}</p>
      <DialogActions><button class="primary" :disabled="!acknowledged || !canSubmit || submitting" @click="submit">确认锁仓</button></DialogActions>
    </V47VaultDialog>
  </section>
</template>

<style scoped>
.vault-calculator { min-width:0; }
.vault-error { overflow-wrap:anywhere; }
.vault-amount-input input { min-width:0; }
</style>
