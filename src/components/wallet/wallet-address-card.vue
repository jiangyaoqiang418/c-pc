<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Button } from '@/components/ui/button';
import { computed } from 'vue';
import { Message } from '@/lib/feedback';

interface Props {
  wallet: Api.Wallet.ChainWallet;
}
const props = defineProps<Props>();

const qrUrl = computed(
  () => `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(props.wallet.address)}`
);

const chainTokenLabel = computed(() => {
  const m: Record<string, string> = { TRON: 'USDT-TRC20', ETH: 'USDT-ERC20', BSC: 'USDT-BEP20' };
  return m[props.wallet.chain] || props.wallet.chain;
});

const chainColor = computed(() => {
  const m: Record<string, string> = { TRON: 'red', ETH: 'arcoblue', BSC: 'gold' };
  return m[props.wallet.chain] || 'gray';
});

function copy() {
  navigator.clipboard.writeText(props.wallet.address).then(() => Message.success('地址已复制')).catch(() => Message.warning('复制失败，请手动选择并复制地址'));
}


</script>

<template>
  <section class="addr-card">
    <header class="head"><span class="token" :class="chainColor">{{ chainTokenLabel }}</span><span class="name">{{ wallet.name }}</span></header>
    <div class="body"><img :src="qrUrl" :alt="wallet.chain + ' 收款地址二维码'" class="qr" /><div class="info"><div class="lbl">收款地址</div><div class="addr">{{ wallet.address }}</div><Button size="sm" variant="outline" @click="copy"><Icon icon="lucide:copy" width="15" />复制地址</Button></div></div>
    <div class="warn"><Icon icon="lucide:triangle-alert" width="17" /><p>请仅向此地址转入 <strong>{{ chainTokenLabel }}</strong>，转错币种或链将丢失，平台不承担损失。</p></div>
  </section>
</template>

<style scoped>
.addr-card { padding:24px; border:1px solid var(--yb-hairline); border-radius:10px; background:var(--yb-paper); }.head { display:flex; align-items:center; gap:12px; margin-bottom:22px; }.token { padding:4px 9px; border-radius:4px; background:var(--yb-fill); color:var(--yb-muted); font-size:12px; font-weight:600; }.token.red { color:#ad453e; background:#fcecea; }.token.arcoblue { color:#315a96; background:#edf3fc; }.token.gold { color:#9a5709; background:#fff3df; }.name { font-size:14px; color:var(--yb-muted); }.body { display:flex; align-items:center; gap:24px; }.qr { width:120px; height:120px; border:1px solid var(--yb-hairline); border-radius:6px; flex-shrink:0; }.info { min-width:0; flex:1; }.lbl { color:var(--yb-muted); font-size:13px; margin-bottom:10px; }.addr { font-family:var(--yb-font-mono); font-size:14px; overflow-wrap:anywhere; background:var(--yb-fill); padding:12px 16px; border-radius:6px; margin-bottom:14px; }.warn { display:flex; align-items:start; gap:10px; margin-top:24px; padding:14px 16px; border-radius:6px; background:#fff7e6; color:#9a5709; font-size:13px; line-height:1.8; }.warn p { margin:0; }.warn svg { flex-shrink:0; margin-top:4px; }@media(max-width:700px) { .body { flex-direction:column; align-items:start; } }
</style>
