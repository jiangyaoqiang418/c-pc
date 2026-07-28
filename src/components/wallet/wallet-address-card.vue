<script setup lang="ts">
import { computed } from 'vue';
import { Message } from '@arco-design/web-vue';

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
  navigator.clipboard.writeText(props.wallet.address).then(() => Message.success('地址已复制'));
}
</script>

<template>
  <div class="addr-card">
    <div class="head">
      <a-tag :color="chainColor">{{ chainTokenLabel }}</a-tag>
      <span class="name">{{ wallet.name }}</span>
    </div>
    <div class="body">
      <img :src="qrUrl" :alt="wallet.chain + ' QR'" class="qr" />
      <div class="info">
        <div class="lbl">收款地址</div>
        <div class="addr">{{ wallet.address }}</div>
        <a-button size="small" type="outline" @click="copy">复制地址</a-button>
      </div>
    </div>
    <div class="warn">
      ⚠️ 请仅向此地址转入 <strong>{{ chainTokenLabel }}</strong>，转错币种或链将丢失，平台不承担损失。
    </div>
  </div>
</template>

<style scoped>
.addr-card {
  background: #fff;
  border: 1px solid #f2f3f5;
  border-radius: var(--bw-card-radius);
  padding: 16px 20px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.name {
  font-size: 13px;
  color: #4e5969;
}
.body {
  display: flex;
  gap: 16px;
  align-items: center;
}
.qr {
  width: 120px;
  height: 120px;
  border: 1px solid #f2f3f5;
  border-radius: 4px;
}
.info {
  flex: 1;
}
.lbl {
  font-size: 12px;
  color: #86909c;
  margin-bottom: 4px;
}
.addr {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: #1d2129;
  word-break: break-all;
  background: #f7f8fa;
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
}
.warn {
  margin-top: 12px;
  background: #fff7e6;
  border-left: 3px solid #ff7d00;
  color: #4e5969;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
}
</style>
