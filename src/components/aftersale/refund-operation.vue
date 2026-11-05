<script setup lang="ts">
import { vRequiredFeedback } from '@/directives/required-feedback';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useUserStore } from '@/stores';
import { Message, Modal } from '@/lib/feedback';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import LogisticsCarrierFields from '@/components/common/logistics-carrier-fields.vue';
import { exactTransactionAmount } from '@/components/wallet/decimal-amount';
import * as refundApi from '@/service/api/refund';
import { refundCapabilities, refundActionAllowed, refundTypes, refundTypeLabel, markRefundOperationUncertain, refundOperationUncertain, clearRefundOperationUncertain } from '@/utils/refund';
import { sameBusinessId } from '@/utils/im';
import { isDefinitiveRejection } from '@/service/request/type';
import { getAccessToken } from '@/service/request/token';

const props = defineProps<{ refund: Api.RealRefund.RefundDTO; disabled?: boolean }>();
const emit = defineEmits<{ changed: []; busy: [value: boolean] }>();
const user = useUserStore();
const caps = computed(() => refundCapabilities(props.refund, user.currentUser?.id));
const selected = ref<Api.RealRefund.RefundType>('REFUND_ONLY');
const amount = ref('');
const source = ref<'WALLET' | 'DEPOSIT'>('WALLET');
const password = ref('');
const remark = ref('');
const trackingNo = ref('');
const carrierCode = ref('');
const carrierName = ref('');
const shippingValid = ref(false);
const submitting = ref(false);
const confirming = ref(false);
const uncertain = ref(false);
let version = 0;
let confirmation: ReturnType<typeof Modal.confirm> | undefined;
const shippingAction = computed<Api.RealRefund.RefundAction | undefined>(() => caps.value.returnShip ? 'RETURN_SHIP' : caps.value.exchangeShip ? 'EXCHANGE_SHIP' : undefined);
const blocked = computed(() => !!props.disabled || submitting.value || confirming.value || uncertain.value);
const operationKey = () => JSON.stringify([String(user.currentUser?.id), user.sessionVersion, String(props.refund.refundId)]);

function invalidate() {
  version += 1; confirmation?.close(); confirming.value = false; submitting.value = false; password.value = ''; emit('busy', false);
}
watch([() => props.refund.refundId, () => props.refund.status, () => props.refund.refundType, () => props.refund.preferredType, () => user.currentUser?.id, () => user.sessionVersion], () => {
  invalidate(); uncertain.value = refundOperationUncertain(operationKey(), props.refund, user.currentUser?.id); selected.value = refundTypes.some(item => item.value === (props.refund.preferredType || props.refund.refundType))
    ? (props.refund.preferredType || props.refund.refundType) as Api.RealRefund.RefundType : 'REFUND_ONLY';
  amount.value = ''; remark.value = ''; trackingNo.value = ''; carrierCode.value = ''; carrierName.value = '';
}, { immediate: true });
onBeforeUnmount(invalidate);

function operate(action: Api.RealRefund.RefundAction) {
  const userId = user.currentUser?.id;
  if (blocked.value || userId === undefined || !refundActionAllowed(props.refund, userId, action)) return;
  const params: Api.RealRefund.RefundOperateParams = { refundId: props.refund.refundId, action, remark: remark.value.trim() || undefined };
  if ((params.remark?.length || 0) > 512) return Message.warning('处理说明最多 512 字');
  if (action === 'SELECT') {
    params.refundType = selected.value;
    if (caps.value.seller && selected.value === 'COMPENSATION') {
      const parsed = exactTransactionAmount(amount.value);
      if (parsed.value === undefined) return Message.warning(parsed.error);
      if (!password.value) return Message.warning('请输入支付密码');
      params.compensationAmount = parsed.value; params.compensationSource = source.value;
    }
  }
  if (action === 'RETURN_SHIP' || action === 'EXCHANGE_SHIP') {
    if (!shippingValid.value) return Message.warning('请填写运单号并确认物流公司');
    params.trackingNo = trackingNo.value.trim(); params.carrierCode = carrierCode.value; params.carrierName = carrierName.value.trim() || undefined;
  }
  const requestedSession = user.sessionVersion;
  const token = getAccessToken();
  const expectedStatus = props.refund.status;
  const expectedType = props.refund.refundType;
  const expectedPreferredType = props.refund.preferredType;
  const pendingKey = operationKey();
  const operation = ++version;
  const current = () => operation === version && user.sessionVersion === requestedSession && token === getAccessToken()
    && sameBusinessId(user.currentUser?.id, userId) && sameBusinessId(props.refund.refundId, params.refundId);
  confirming.value = true; emit('busy', true);
  confirmation = Modal.confirm({
    title: action === 'SELECT' ? caps.value.buyer ? '更新期望处理方式？' : '确认执行售后方案？' : '确认提交本次售后操作？',
    content: action === 'SELECT' ? caps.value.buyer ? `期望方式：${refundTypeLabel(selected.value)}。本次只更新期望，不直接执行或扣款。`
      : selected.value === 'COMPENSATION' ? `额外赔偿 ${params.compensationAmount} USDT，将从${source.value === 'WALLET' ? '可用余额' : '押金'}支付。提交后进入支付中，以最终结果为准。`
        : `处理方案：${refundTypeLabel(selected.value)}。开始处理后不能修改方案。` : '请核对本次物流信息或已收到的商品，提交后将进入下一处理步骤。',
    onCancel() { if (current()) { confirming.value = false; password.value = ''; emit('busy', false); } },
    async onOk() {
      if (!current()) return;
      submitting.value = true;
      let sent = false;
      try {
        const latest = await refundApi.fetchRefundDetail(params.refundId);
        if (!current()) return;
        if (!sameBusinessId(latest.refundId, params.refundId) || !sameBusinessId(latest.orderId, props.refund.orderId)
          || latest.status !== expectedStatus || latest.refundType !== expectedType || latest.preferredType !== expectedPreferredType || !refundActionAllowed(latest, userId, action)) {
          Message.warning('售后状态或操作资格已变化，请刷新后重新确认'); emit('changed'); return;
        }
        sent = true;
        // 发出前保留标记，卸载或切换身份后迟到的未知结果也不能让同单重复提交。
        markRefundOperationUncertain(pendingKey, latest, action);
        await refundApi.operateRefund({ ...params, ...(params.compensationSource ? { payPassword: password.value } : {}) });
        clearRefundOperationUncertain(pendingKey);
        if (!current()) return;
        Message.success(action === 'SELECT' && caps.value.buyer ? '期望处理方式已更新' : '操作已提交，请核对最新处理进度');
        emit('changed');
      } catch (error) {
        if (sent && isDefinitiveRejection(error)) clearRefundOperationUncertain(pendingKey);
        if (!current()) return;
        uncertain.value = sent && !isDefinitiveRejection(error);
        Message.warning(uncertain.value ? '提交结果尚未确认，请刷新核对，暂不重复操作' : error instanceof Error ? error.message : '操作未成功，请刷新后重试');
        emit('changed');
      } finally {
        if (current()) { submitting.value = false; confirming.value = false; password.value = ''; emit('busy', false); }
      }
    }
  });
}
</script>

<template>
  <section v-required-feedback v-if="caps.select || shippingAction || caps.returnReceive || caps.exchangeReceive || uncertain" class="refund-operation" aria-label="售后操作" :aria-busy="submitting">
    <h2>{{ caps.buyer ? '买家售后操作' : '买手售后处理' }}</h2>
    <p v-if="uncertain" role="alert">上次提交结果待核对，请刷新详情或稍后查看处理进度。<button type="button" class="outline" :disabled="disabled || submitting" @click="emit('changed')">核对最新状态</button></p>
    <template v-if="caps.select">
      <fieldset :disabled="blocked"><legend>{{ caps.buyer ? '期望处理方式' : '处理方案' }}</legend><label v-for="item in refundTypes" :key="item.value" class="type-choice"><input v-model="selected" type="radio" :value="item.value" :name="'refund-type-' + refund.refundId" />{{ item.label }}</label></fieldset>
      <p v-if="caps.buyer" class="muted">期望方式由买手或平台确认；更新期望不会直接退款、扣款或执行方案。</p>
      <div v-if="caps.seller && selected === 'COMPENSATION'" class="fields"><div><Label for="compensation-amount">额外赔偿金额（USDT）</Label><Input id="compensation-amount" v-model="amount" :disabled="blocked" inputmode="decimal" placeholder="大于 0，最多 8 位小数"  required /></div><div><Label for="compensation-source">资金来源</Label><select id="compensation-source" v-model="source" :disabled="blocked"><option value="WALLET">USDT 可用余额</option><option value="DEPOSIT">押金余额</option></select></div><div><Label for="compensation-password">支付密码</Label><Input id="compensation-password" v-model="password" :disabled="blocked" type="password" autocomplete="off"  required /></div></div>
    </template>
    <LogisticsCarrierFields v-if="shippingAction" v-model:tracking-no="trackingNo" v-model:carrier-code="carrierCode" v-model:carrier-name="carrierName" :context-key="String(refund.refundId) + ':' + shippingAction" :disabled="blocked" @valid="shippingValid = $event" />
    <div class="remark"><Label for="refund-process-remark">处理说明（选填）</Label><Textarea id="refund-process-remark" v-model="remark" :disabled="blocked" maxlength="512" :rows="3" /></div>
    <div class="button-row"><button v-if="caps.select" type="button" class="primary" :disabled="blocked" data-validate-required @click="operate('SELECT')">{{ submitting ? '正在提交…' : caps.buyer ? '更新期望方式' : '确认处理方案' }}</button><button v-if="shippingAction" type="button" class="primary" :disabled="blocked || !shippingValid" @click="operate(shippingAction)">提交{{ caps.returnShip ? '退货' : '换货' }}物流</button><button v-if="caps.returnReceive" type="button" class="primary" :disabled="blocked" @click="operate('RETURN_RECEIVE')">确认收到退货</button><button v-if="caps.exchangeReceive" type="button" class="primary" :disabled="blocked" @click="operate('EXCHANGE_RECEIVE')">确认收到换货</button></div>
  </section>
</template>

<style scoped>
.refund-operation { margin-top:24px; padding-top:20px; border-top:1px solid var(--line); }h2 { margin-bottom:16px; }fieldset { border:0; padding:0; margin:12px 0; }legend { margin-bottom:10px; }.type-choice { display:inline-flex; align-items:center; min-height:44px; gap:8px; margin-right:16px; }.fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:16px; margin:16px 0; }.fields>div,.remark { display:grid; gap:8px; }.remark { margin:16px 0; }select { min-height:44px; padding:8px; background:var(--paper); color:var(--ink); border:1px solid var(--line); border-radius:6px; }.muted { color:var(--muted); }.button-row { flex-wrap:wrap; }
</style>
