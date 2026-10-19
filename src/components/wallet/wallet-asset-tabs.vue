<script setup lang="ts">
defineProps<{ modelValue: 'USDT' | 'USDC'; disabled?: boolean }>();
defineEmits<{ (event: 'update:modelValue', asset: 'USDT' | 'USDC'): void }>();
</script>

<template>
  <div class="wallet-asset-tabs" role="group" aria-label="选择钱包资产">
    <button v-for="asset in ['USDT', 'USDC'] as const" :key="asset" type="button" :class="{ active: modelValue === asset }" :aria-pressed="modelValue === asset" :disabled="disabled" @click="$emit('update:modelValue', asset)">
      <span class="coin-icon" :class="{ usdt: asset === 'USDT' }" aria-hidden="true">{{ asset === 'USDT' ? '₮' : '$' }}</span>{{ asset }}
    </button>
  </div>
</template>

<style scoped>
.wallet-asset-tabs { display:flex; flex-wrap:wrap; gap:8px; }
.wallet-asset-tabs button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:42px; padding:8px 18px; border:1px solid var(--line,var(--yb-hairline)); border-radius:8px; background:var(--paper,var(--yb-paper)); color:var(--muted,var(--yb-muted)); font-weight:600; }
.wallet-asset-tabs button.active { border-color:var(--green,var(--yb-success)); color:var(--green,var(--yb-success)); background:var(--soft,var(--yb-bg)); }
.wallet-asset-tabs button:focus-visible { outline:2px solid var(--focus-ring,var(--green,var(--yb-success))); outline-offset:3px; }
.wallet-asset-tabs button:disabled { opacity:.55; cursor:not-allowed; }
.coin-icon { display:grid; place-items:center; width:22px; height:22px; border-radius:50%; background:#2775ca; color:#fff; font-size:15px; }
.coin-icon.usdt { background:#26a17b; }
</style>
