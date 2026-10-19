<script setup lang="ts">
import { computed } from 'vue';
import qrcode from './vendor/qrcode.js';
const props = defineProps<{ address: string; network: string; memo?: string; asset?: Api.RealWallet.Asset }>();
const svg = computed(() => {
  if (!props.address.trim()) return '';
  try {
    const code = qrcode(0, 'M');
    code.addData(props.address);
    code.make();
    return code.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  } catch { return ''; }
});
</script>

<template>
  <div v-if="svg" class="deposit-qr" role="img" :aria-label="network + ' ' + (asset || 'USDT') + ' 充值地址二维码' + (memo ? '，转账时还必须填写 Memo / Tag' : '')" v-html="svg" />
  <p v-else class="deposit-error">二维码生成失败，请复制下方地址并核对网络。</p>
</template>

<style scoped>
.deposit-qr :deep(svg) { width:100%; height:100%; display:block; }
</style>
