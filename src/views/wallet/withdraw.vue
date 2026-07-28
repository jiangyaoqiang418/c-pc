<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount, walletApi } from '@shared';
import { useUserStore, useWalletStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();
const walletStore = useWalletStore();

const form = reactive<{
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
  amount: number;
  payPwd: string;
  agreed: boolean;
}>({ chain: 'TRON', toAddress: '', amount: 0, payPwd: '', agreed: false });

const submitting = ref(false);
const modalOpen = ref(false);

const chainOptions: { value: 'TRON' | 'ETH' | 'BSC'; label: string }[] = [
  { value: 'TRON', label: 'TRC20（USDT-TRON）' },
  { value: 'ETH', label: 'ERC20（USDT-ETH）' },
  { value: 'BSC', label: 'BEP20（USDT-BSC）' }
];

const available = computed(() => Number(walletStore.account?.available || 0));
const fee = computed(() => {
  const a = Number(form.amount) || 0;
  return Number((a * 0.005 + 2).toFixed(2));
});
const totalDeduct = computed(() => Number(form.amount) + fee.value);
const netAmount = computed(() => Math.max(0, Number(form.amount) - fee.value));

const errMsg = computed(() => {
  if (form.amount <= 0) return '请输入转出金额';
  if (form.amount < 10) return '单笔最小转出 10 U';
  if (!form.toAddress) return '请输入目标地址';
  if (form.toAddress.length < 26) return '地址格式不合法';
  if (totalDeduct.value > available.value) return '可用余额不足以支付金额 + 手续费';
  return '';
});

const canSubmit = computed(() => !errMsg.value && form.agreed && form.payPwd.length >= 1);

async function loadAll() {
  if (!userStore.currentUser) return;
  await walletStore.fetchWallet(userStore.currentUser.id);
}
onMounted(loadAll);

function fillAll() {
  form.amount = Math.max(0, available.value - 2);
}

function openConfirm() {
  if (!canSubmit.value) {
    Message.warning(errMsg.value || '请完善表单');
    return;
  }
  modalOpen.value = true;
}

async function confirm() {
  if (!userStore.currentUser) return;
  submitting.value = true;
  try {
    const r = await walletApi.withdrawMock({
      userId: userStore.currentUser.id,
      amount: form.amount.toFixed(2),
      chain: form.chain,
      toAddress: form.toAddress
    });
    if (r.ok) {
      Message.success(`转出成功，已扣除 U ${formatAmount(totalDeduct.value.toFixed(2))}`);
      await walletStore.refetch();
      modalOpen.value = false;
      router.push({ name: 'wallet-history', query: { type: 'WITHDRAW_OUT' } });
    } else {
      Message.error(r.message || '转出失败');
    }
  } finally {
    submitting.value = false;
  }
}

const kycTipNeeded = computed(() => userStore.currentUser && userStore.currentUser.kycStatus !== 'approved');
</script>

<template>
  <div class="withdraw-page shop-container">
    <h1 class="page-title">钱包转出</h1>
    <p class="hint">将平台可用余额提取到链上 USDT 钱包。每笔费用 = 燃料费 2 U + 服务费 0.5%。</p>

    <a-alert v-if="kycTipNeeded" type="warning" closable class="kyc-alert">
      您尚未完成 KYC 认证，原型环境下单笔转出 ≤ 100 U；正式环境会拦截。
      <template #action>
        <a-button size="mini" @click="router.push('/kyc')">前往 KYC</a-button>
      </template>
    </a-alert>

    <a-card class="form-card" :body-style="{ padding: '24px 32px' }" :bordered="false">
      <div class="balance-row">
        <span class="balance-label">可用余额</span>
        <span class="balance-amount">U {{ formatAmount(available.toFixed(2)) }}</span>
      </div>

      <a-divider />

      <a-form :model="form" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="选择链 / 币种">
              <a-select v-model="form.chain" size="large">
                <a-option v-for="o in chainOptions" :key="o.value" :value="o.value">{{ o.label }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="转出金额 (USDT)">
              <a-input-number v-model="form.amount" :min="0" :max="available" :precision="2" size="large">
                <template #suffix>U</template>
                <template #append>
                  <a-button size="mini" type="text" @click="fillAll">全部</a-button>
                </template>
              </a-input-number>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="目标地址">
          <a-input v-model="form.toAddress" placeholder="请输入 TRC20 / ERC20 / BEP20 USDT 地址" size="large" />
        </a-form-item>

        <a-card class="fee-card" :body-style="{ padding: '12px 16px' }" :bordered="false">
          <a-descriptions :column="2" layout="inline-horizontal" :data="[
            { label: '燃料费', value: 'U ' + formatAmount('2.00') },
            { label: '服务费 (0.5%)', value: 'U ' + formatAmount((form.amount * 0.005).toFixed(2)) },
            { label: '总费用', value: 'U ' + formatAmount(fee.toFixed(2)) },
            { label: '实际到账', value: 'U ' + formatAmount(netAmount.toFixed(2)) }
          ]" />
        </a-card>

        <a-form-item label="支付密码（原型阶段任意值）" class="pwd-form-item">
          <a-input-password v-model="form.payPwd" size="large" placeholder="请输入支付密码" />
        </a-form-item>

        <a-form-item>
          <a-checkbox v-model="form.agreed">
            我已确认目标地址正确，知晓转出不可撤销，遵守 AML 政策
          </a-checkbox>
        </a-form-item>

        <div v-if="errMsg" class="err">{{ errMsg }}</div>

        <a-button type="primary" size="large" long :disabled="!canSubmit" @click="openConfirm">
          提交转出请求
        </a-button>
      </a-form>
    </a-card>

    <a-modal v-model:visible="modalOpen" title="二次确认转出" :ok-loading="submitting" ok-text="确认转出" @ok="confirm">
      <div class="warn">⚠️ 转出到链上后不可撤销，请仔细核对信息。</div>
      <a-descriptions :column="1" :data="[
        { label: '链 / 币种', value: form.chain },
        { label: '转出金额', value: 'U ' + formatAmount(form.amount.toFixed(2)) },
        { label: '手续费', value: 'U ' + formatAmount(fee.toFixed(2)) },
        { label: '总扣除', value: 'U ' + formatAmount(totalDeduct.toFixed(2)) },
        { label: '实际到账', value: 'U ' + formatAmount(netAmount.toFixed(2)) },
        { label: '目标地址', value: form.toAddress }
      ]" />
    </a-modal>
  </div>
</template>

<style scoped>
.withdraw-page {
  padding-top: 16px;
  max-width: 880px;
  margin: 0 auto;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
}
.hint {
  color: #86909c;
  font-size: 13px;
  margin: 0 0 16px;
}
.kyc-alert {
  margin-bottom: 16px;
}
.form-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.balance-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.balance-label {
  color: #4e5969;
}
.balance-amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--bw-brand-primary);
  font-family: ui-monospace, monospace;
}
.fee-card {
  background: #f7faff;
  margin: 8px 0 16px;
}
.pwd-form-item {
  margin-top: 8px;
}
.err {
  color: #f53f3f;
  font-size: 12px;
  margin-bottom: 8px;
}
.warn {
  background: #fff7e6;
  color: #ff7d00;
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 4px;
  border-left: 3px solid #ff7d00;
  margin-bottom: 12px;
}
</style>
