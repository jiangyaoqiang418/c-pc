<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import * as orderApi from '@/service/api/order';
import { getOrderCapabilities } from '@/utils/order';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatUsdt } from '@shared/utils/currency';
import { Message } from '@/lib/feedback';
import AmountInput from '@/components/common/amount-input.vue';

const props = defineProps<{ orderId: string | number; revision?: string; compact?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const user = useUserStore();
const router = useRouter();
const order = ref<Api.RealOrder.Record>();
const error = ref('');
const loading = ref(false);
const open = ref(false);
const amount = ref<number>();
const submitting = ref(false);
let active = true;
const guard = createLatestRequestGuard(() => `${props.orderId}:${user.currentUser?.id}:${user.sessionVersion}`);
const canEdit = computed(() => order.value && getOrderCapabilities(order.value, user.currentUser?.id).isSeller && order.value.status === 'PENDING_PAYMENT');
async function load() {
  const current = guard.begin();
  loading.value = true;
  error.value = '';
  try {
    const next = await orderApi.fetchOrderDetail(props.orderId, { signal: current.signal });
    if (String(next.id) !== String(props.orderId)) throw new Error('订单信息未能核对一致');
    if (current()) order.value = next;
  } catch { if (current()) { order.value = undefined; error.value = '订单信息加载失败'; } }
  finally { if (current()) loading.value = false; }
}
async function edit() {
  const id = props.orderId;
  await load();
  if (!active || String(props.orderId) !== String(id) || !canEdit.value || !order.value) return;
  amount.value = Number(order.value.totalAmount);
  open.value = true;
}
async function submit() {
  if (submitting.value || !canEdit.value || amount.value === undefined || !Number.isFinite(amount.value) || amount.value <= 0) return false;
  const id = props.orderId;
  const owner = user.currentUser?.id;
  const session = user.sessionVersion;
  const current = () => active && String(props.orderId) === String(id) && user.currentUser?.id === owner && user.sessionVersion === session;
  submitting.value = true;
  try {
    await load();
    if (!current() || !canEdit.value) return false;
    await orderApi.changeOrderPrice({ id, amount: amount.value });
    if (!current()) return false;
    open.value = false;
    Message.success('订单价格已修改');
    emit('changed');
  } catch { return false; }
  finally { if (current()) { submitting.value = false; await load(); } }
}
watch([() => props.orderId, () => props.revision, () => user.currentUser?.id, () => user.sessionVersion], () => {
  guard.invalidate(); order.value = undefined; open.value = false; submitting.value = false; void load();
}, { immediate: true });
onBeforeUnmount(() => { active = false; guard.invalidate(); });
</script>

<template>
  <section class="conversation-order-bar" :class="{ compact }" aria-label="当前订单" :aria-busy="loading">
    <button type="button" class="order-entry" @click="router.push({ name: 'order-detail', params: { id: String(orderId) } })"><strong :title="order?.productTitle">{{ order?.productTitle || '查看当前订单' }}</strong><span v-if="order" :title="order.code + ' · ' + formatUsdt(order.totalAmount)">{{ order.code }} · {{ formatUsdt(order.totalAmount) }}</span></button>
    <button v-if="canEdit" type="button" class="outline" :disabled="loading || submitting" @click="edit">修改价格</button>
    <button v-if="error" type="button" class="text-link" @click="load">{{ error }}，重试</button>
    <span v-else-if="loading" role="status">正在核对订单</span>
  </section>
  <a-modal v-model:visible="open" title="修改待付款订单价格" :closable="!submitting" :mask-closable="!submitting" :esc-to-close="!submitting" :ok-loading="submitting" :on-before-ok="submit" :on-before-cancel="() => !submitting"><label>订单金额（USDT）<AmountInput v-model="amount" placeholder="输入金额" :min="0.01" :precision="2" :disabled="submitting" /></label><p>请核对修改后的订单金额。</p></a-modal>
</template>

<style scoped>
.conversation-order-bar { display:flex; flex-shrink:0; gap:12px; align-items:center; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--line); background:var(--paper); }.order-entry { display:grid; gap:4px; flex:1; min-width:0; text-align:left; }.order-entry strong,.order-entry span { overflow-wrap:anywhere; }.order-entry span { font-size:12px; color:var(--muted); }.order-entry:focus-visible { outline:2px solid var(--green); outline-offset:4px; }
.conversation-order-bar.compact { flex:1; min-width:0; padding:0; border:0; background:transparent; gap:8px; }
.compact .order-entry { display:flex; align-items:center; gap:12px; }
.compact .order-entry strong { min-width:0; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; line-height:20px; }
.compact .order-entry span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; line-height:18px; }
.compact > .outline,.compact > .text-link { min-height:30px; padding:4px 8px; font-size:11px; }
.compact > [role="status"] { font-size:11px; color:var(--muted); }
@media(max-width:1100px) {
  .compact .order-entry { display:grid; gap:1px; }
  .compact .order-entry strong { max-width:100%; }
  .compact .order-entry span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
}
@media(max-width:700px) { .compact .order-entry strong { font-size:12px; }.compact .order-entry span { font-size:10px; } }
</style>
