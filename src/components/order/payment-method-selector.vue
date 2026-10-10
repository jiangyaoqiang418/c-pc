<script setup lang="ts">
import { useId } from 'vue';
import { Icon } from '@iconify/vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WalletPayChain } from '@/service/api/wallet-pay';

const props = withDefaults(defineProps<{
  modelValue: 'balance' | 'wallet';
  selectedChain: string;
  chains: WalletPayChain[];
  walletEnabled: boolean;
  chainAvailable: (chain: WalletPayChain) => boolean;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{
  'update:modelValue': [value: 'balance' | 'wallet'];
  'update:selectedChain': [value: string];
}>();
const groupId = useId();
</script>

<template>
  <div class="payment-selector">
    <fieldset :disabled="disabled" class="payment-options">
      <legend class="sr-only">选择支付方式</legend>
      <label class="payment-option" :class="{ selected: modelValue === 'balance' }">
        <input type="radio" :name="groupId" value="balance" :checked="modelValue === 'balance'" @change="emit('update:modelValue', 'balance')" />
        <Icon icon="lucide:wallet" width="20" /><span><strong>站内余额支付</strong><small>使用平台钱包可用余额</small></span>
      </label>
      <label v-if="walletEnabled && chains.length" class="payment-option" :class="{ selected: modelValue === 'wallet' }">
        <input type="radio" :name="groupId" value="wallet" :checked="modelValue === 'wallet'" @change="emit('update:modelValue', 'wallet')" />
        <Icon icon="lucide:link" width="20" /><span><strong>USDT 钱包直付</strong><small>连接钱包，在链上确认转账</small></span>
      </label>
    </fieldset>
    <div v-if="walletEnabled && modelValue === 'wallet'" class="chain-field">
      <label :for="`${groupId}-chain`">支付网络</label>
      <Select :model-value="selectedChain" :disabled="disabled" @update:model-value="value => emit('update:selectedChain', String(value))">
        <SelectTrigger :id="`${groupId}-chain`"><SelectValue placeholder="请选择支付链" /></SelectTrigger>
        <SelectContent><SelectItem v-for="chain in chains" :key="chain.chain" :value="chain.chain" :disabled="!props.chainAvailable(chain)">{{ chain.label || chain.chain }} · {{ chain.network }}{{ chain.minAmount ? `（最低 U ${chain.minAmount}）` : '' }}{{ !chain.enabled ? ' · 暂不可用' : '' }}</SelectItem></SelectContent>
      </Select>
      <p>订单创建后以服务端金额为准；正式转账需少量 ETH、BNB 或 TRX 支付链上手续费。</p>
    </div>
    <div v-else class="balance-meta"><slot name="balance" /></div>
  </div>
</template>

<style scoped>
.payment-options { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; border: 0; }
.payment-option { display: flex; align-items: center; gap: 10px; min-width: 240px; flex: 1; padding: 16px; border: 1px solid var(--yb-hairline); border-radius: 8px; background: var(--yb-surface); cursor: pointer; transition: border-color 150ms, background 150ms; }
.payment-option:hover, .payment-option.selected { border-color: var(--yb-primary); background: var(--yb-primary-soft); }
.payment-options:disabled .payment-option { opacity: .55; cursor: not-allowed; }
.payment-option input { accent-color: var(--yb-primary); width: 16px; height: 16px; margin: 0; }
.payment-option strong { display: block; font-size: 14px; font-weight: 600; }
.payment-option small { display: block; margin-top: 3px; font-size: 12px; color: var(--yb-muted); }
.chain-field { display: grid; gap: 8px; max-width: 420px; margin-top: 16px; }
.chain-field label { font-size: 14px; font-weight: 500; }
.chain-field p { margin: 0; font-size: 12px; color: var(--yb-muted); }
.balance-meta { margin-top: 14px; font-size: 13px; color: var(--yb-muted); }
@media (prefers-reduced-motion: reduce) { .payment-option { transition: none; } }
</style>
