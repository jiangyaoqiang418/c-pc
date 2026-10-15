<script setup lang="ts">
import { useId } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
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
      <label class="payment-option" :class="{ active: modelValue === 'balance' }">
        <input type="radio" :name="groupId" value="balance" :checked="modelValue === 'balance'" @change="emit('update:modelValue', 'balance')" />
        <UmIcon name="wallet" /><span><b>站内余额支付</b><small>使用平台钱包可用余额</small></span>
      </label>
      <label v-if="walletEnabled && chains.length" class="payment-option" :class="{ active: modelValue === 'wallet' }">
        <input type="radio" :name="groupId" value="wallet" :checked="modelValue === 'wallet'" @change="emit('update:modelValue', 'wallet')" />
        <UmIcon name="globe" /><span><b>USDT 钱包直付</b><small>连接钱包，在链上确认转账</small></span>
      </label>
    </fieldset>
    <div v-if="walletEnabled && modelValue === 'wallet'" class="field chain-field">
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
fieldset { border:0; padding:0; }.payment-options:disabled label { opacity:.55; cursor:not-allowed; }.chain-field { max-width:420px; }.chain-field p { font-size:13px; color:var(--muted); }.balance-meta { margin-top:14px; font-size:13px; color:var(--muted); }
</style>
