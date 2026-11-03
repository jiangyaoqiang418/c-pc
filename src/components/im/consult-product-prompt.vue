<script setup lang="ts">
import ProductSourceBadge from '@/components/common/product-source-badge.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useUserStore } from '@/stores';
import { fetchProductDetail } from '@/service/api/product';
import { sendConversationMessage } from '@/service/api/notify';
import { createClientMessageId, sameBusinessId } from '@/utils/im';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { setImageFallback } from '@/utils/image-placeholder';

const props = defineProps<{ productId: string; conversation: Api.RealNotify.ImConversationVO; disabled?: boolean }>();
const emit = defineEmits<{ sent: [message: Api.RealNotify.ImMessageVO]; busy: [value: boolean] }>();
const user = useUserStore();
const product = ref<Api.RealProduct.Record>();
const loading = ref(false);
const sending = ref(false);
const sent = ref(false);
const error = ref('');
const context = computed(() => JSON.stringify([props.productId, props.conversation.id, props.conversation.sellerId, props.conversation.myRole, user.currentUser?.id, user.sessionVersion]));
const guard = createLatestRequestGuard(() => context.value);
let clientMsgId = createClientMessageId();
let disposed = false;
let writeVersion = 0;
const canSend = computed(() => !!product.value && props.conversation.type === 'ORDER_GROUP' && props.conversation.myRole === 'CUSTOMER'
  && sameBusinessId(product.value.sellerId, props.conversation.sellerId) && !sameBusinessId(product.value.sellerId, user.currentUser?.id));
async function load() {
  const current = guard.begin();
  loading.value = true;
  product.value = undefined;
  error.value = '';
  try {
    if (!/^\d+$/.test(props.productId)) throw new Error('咨询商品信息无效');
    const next = await fetchProductDetail(props.productId, { signal: current.signal, showError: false });
    if (!current()) return;
    if (!sameBusinessId(next.id, props.productId) || !sameBusinessId(next.sellerId, props.conversation.sellerId)) throw new Error('该商品不属于当前咨询买手');
    product.value = next;
  } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : '商品读取失败，请重试'; }
  finally { if (current()) loading.value = false; }
}
async function send() {
  if (!canSend.value || loading.value || sending.value || sent.value || props.disabled) return;
  const expected = context.value;
  const operation = ++writeVersion;
  const isCurrent = () => !disposed && context.value === expected && writeVersion === operation;
  sending.value = true;
  error.value = '';
  emit('busy', true);
  try {
    // 未确认结果时沿用此键重试，不重复生成消息或传客户端商品标题/金额。
    const message = await sendConversationMessage({ conversationId: props.conversation.id, msgType: 'PRODUCT_CARD', productId: props.productId, clientMsgId }, { showError: false });
    if (!isCurrent()) return;
    if (!sameBusinessId(message.conversationId, props.conversation.id) || message.msgType !== 'PRODUCT_CARD') throw new Error('商品消息返回异常，请核对聊天记录后重试');
    sent.value = true;
    emit('sent', message);
  } catch (cause) {
    if (isCurrent()) error.value = cause instanceof Error ? cause.message : '发送结果未确认，请使用此按钮重试';
  } finally {
    if (isCurrent()) { sending.value = false; emit('busy', false); }
  }
}
watch(context, () => {
  writeVersion += 1; guard.invalidate(); clientMsgId = createClientMessageId(); sending.value = false; sent.value = false; emit('busy', false); void load();
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { disposed = true; writeVersion += 1; guard.invalidate(); emit('busy', false); });
</script>

<template>
  <section class="consult-product" aria-label="正在咨询的商品" :aria-busy="loading || sending">
    <img v-if="product?.images[0]?.url" :src="product.images[0].url" :alt="product.title" @error="setImageFallback" />
    <div class="consult-product-copy"><strong><ProductSourceBadge :source="product?.source" />{{ product?.title || '正在咨询的商品' }}</strong><p v-if="loading" role="status">正在读取商品…</p><p v-if="error" role="alert">{{ error }}<button v-if="!product && !loading" type="button" class="text-link" @click="load">重新读取</button></p><p v-else>将商品卡片发给当前买手，方便说明需求。</p></div>
    <button v-if="canSend" type="button" class="outline" :disabled="disabled || loading || sending || sent" @click="send">{{ sent ? '商品已发送' : sending ? '正在发送…' : '发送此商品' }}</button>
  </section>
</template>

<style scoped>
.consult-product { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 16px; border-top:1px solid var(--line); background:var(--paper); }
img { width:48px; height:48px; object-fit:contain; border-radius:6px; background:var(--soft); }.consult-product-copy { flex:1; min-width:160px; }strong { display:block; color:var(--ink); font-size:13px; overflow-wrap:anywhere; }p { margin:4px 0 0; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }button { min-height:44px; }p button { margin-left:8px; }
</style>
