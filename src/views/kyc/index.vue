<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { enums, kycApi } from '@shared';
import KycStepCard from '@/components/kyc/kyc-step-card.vue';
import IdCardUploader from '@/components/kyc/id-card-uploader.vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

const status = ref<Api.User.KycStatus>('none');
const submission = ref<Api.Kyc.Submission>();
const loading = ref(false);
const submitting = ref(false);

const form = reactive({
  realName: '',
  idNumber: '',
  idCardFront: '',
  idCardBack: '',
  faceImage: '',
  phone: '',
  smsCode: ''
});

const sentSms = ref(false);
const smsCountdown = ref(0);
let smsTimer: ReturnType<typeof setInterval>;

const currentStep = ref(0);
const STEP_DEFS = [
  { title: '身份证正面', desc: '清晰拍摄含人像面的身份证' },
  { title: '身份证反面', desc: '清晰拍摄含国徽面的身份证' },
  { title: '人脸采集', desc: '正对镜头，原型模式自动通过' },
  { title: '手机号验证', desc: '接收短信验证码（任意 6 位通过）' }
];

const meta = computed(() => enums.KYC_STATUS_META[status.value]);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const r = await kycApi.fetchMyKycStatus(userStore.currentUser.id);
    status.value = r.status;
    submission.value = r.submission;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function sendSms() {
  if (!form.phone || form.phone.length < 11) {
    Message.warning('请输入正确的手机号');
    return;
  }
  sentSms.value = true;
  smsCountdown.value = 60;
  smsTimer = setInterval(() => {
    smsCountdown.value -= 1;
    if (smsCountdown.value <= 0) clearInterval(smsTimer);
  }, 1000);
  Message.success('验证码已发送（原型模式）');
}

const stepCompletion = computed(() => [
  !!form.idCardFront,
  !!form.idCardBack,
  !!form.faceImage,
  !!form.phone && form.smsCode.length === 6
]);

function canNext(): boolean {
  return stepCompletion.value[currentStep.value];
}

function next() {
  if (!canNext()) {
    Message.warning('请完成当前步骤');
    return;
  }
  if (currentStep.value < STEP_DEFS.length - 1) currentStep.value += 1;
}

function prev() {
  if (currentStep.value > 0) currentStep.value -= 1;
}

async function submit() {
  if (!userStore.currentUser) return;
  if (!form.realName || !form.idNumber) {
    Message.warning('请填写姓名与身份证号');
    return;
  }
  if (stepCompletion.value.some(c => !c)) {
    Message.warning('请完成全部步骤');
    return;
  }
  submitting.value = true;
  try {
    const r = await kycApi.submitKycMock({
      userId: userStore.currentUser.id,
      idCardFront: form.idCardFront,
      idCardBack: form.idCardBack,
      faceImage: form.faceImage,
      phone: form.phone,
      realName: form.realName,
      idNumber: form.idNumber
    });
    if (r.ok) {
      Message.success('KYC 认证已提交，请等待审核');
      await load();
    }
  } finally {
    submitting.value = false;
  }
}

function maskIdNum(num: string): string {
  if (!num) return '—';
  if (num.length <= 8) return num;
  return num.slice(0, 4) + '****' + num.slice(-4);
}

function fallbackFromUser(code: string): string {
  const u = userStore.currentUser;
  if (!u) return '—';
  if (code === 'realName') return u.nickname.slice(0, 1) + '*'.repeat(Math.max(1, u.nickname.length - 1));
  if (code === 'phone') {
    const p = u.phone;
    if (!p) return '—';
    return p.slice(0, 3) + '****' + p.slice(-4);
  }
  if (code === 'idNumber') {
    const seed = (u.id * 137 + 31).toString().padStart(4, '0').slice(-4);
    return `3101${'*'.repeat(10)}${seed}`;
  }
  return '—';
}

function maskedField(code: string): string {
  const f = submission.value?.fields.find(x => x.fieldCode === code);
  if (!f) return status.value === 'approved' ? fallbackFromUser(code) : '—';
  const val = String(f.value);
  if (code === 'idNumber') return maskIdNum(val);
  if (code === 'realName' && val.length > 1) return val.slice(0, 1) + '*'.repeat(val.length - 1);
  return val;
}

const fallbackAuditor = computed(() => (status.value === 'approved' ? '系统预置(原型演示)' : '—'));
const fallbackSubmittedAt = computed(() => {
  if (submission.value?.submittedAt) return new Date(submission.value.submittedAt).toLocaleString();
  const u = userStore.currentUser;
  if (status.value === 'approved' && u?.registeredAt) {
    const d = new Date(u.registeredAt);
    d.setDate(d.getDate() + 3);
    return d.toLocaleString();
  }
  return '—';
});
</script>

<template>
  <div class="kyc-page shop-container">
    <a-spin :loading="loading">
      <!-- 情况 A：已通过 -->
      <a-card v-if="status === 'approved'" class="status-card" :body-style="{ padding: '32px' }" :bordered="false">
        <div class="status-head success">
          <div class="big-icon">✅</div>
          <div>
            <a-tag :color="meta.color" size="large">{{ meta.label }}</a-tag>
            <h2 class="status-title">您已完成 KYC 实名认证</h2>
            <p class="status-sub">
              有效期至 {{ submission?.expiresAt ? new Date(submission.expiresAt).toLocaleDateString() : '永久' }}
            </p>
          </div>
        </div>
        <a-divider />
        <a-descriptions :column="2" :data="[
          { label: '姓名', value: maskedField('realName') },
          { label: '身份证号', value: maskedField('idNumber') },
          { label: '手机号', value: maskedField('phone') },
          { label: '受众类型', value: userStore.currentUser?.isBuyer ? '买手' : '顾客' },
          { label: '提交时间', value: fallbackSubmittedAt },
          { label: '审核人', value: submission?.auditor || fallbackAuditor }
        ]" />
      </a-card>

      <!-- 情况 C：审核中 -->
      <a-card v-else-if="status === 'pending'" class="status-card" :body-style="{ padding: '32px' }" :bordered="false">
        <div class="status-head pending">
          <div class="big-icon">⏳</div>
          <div>
            <a-tag :color="meta.color" size="large">{{ meta.label }}</a-tag>
            <h2 class="status-title">您的认证正在审核中</h2>
            <p class="status-sub">
              已提交于 {{ submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—' }} · 预计 3 个工作日内出结果
            </p>
          </div>
        </div>
        <a-divider />
        <a-descriptions v-if="submission" :column="2" :data="[
          { label: '姓名', value: maskedField('realName') },
          { label: '身份证号', value: maskedField('idNumber') },
          { label: '手机号', value: maskedField('phone') },
          { label: '受众类型', value: submission?.audience === 'buyer' ? '买手' : '顾客' }
        ]" />
      </a-card>

      <!-- 情况 B：未提交 / 拒绝 / 过期 -->
      <template v-else>
        <a-alert
          v-if="status === 'rejected'"
          type="error"
          class="status-alert"
          :title="`KYC 审核未通过：${submission?.auditOpinion || '请补全资料后重新提交'}`"
        />
        <a-alert v-else-if="status === 'expired'" type="warning" class="status-alert" title="KYC 已过期，请重新提交认证" />
        <a-alert
          v-else
          type="info"
          class="status-alert"
          title="完成 KYC 认证后可使用平台全部功能（转出 / 大额交易 / 申请成为买手）"
        />

        <div class="steps-bar">
          <a-steps :current="currentStep + 1" line-less small>
            <a-step v-for="(s, i) in STEP_DEFS" :key="s.title" :title="s.title" :description="stepCompletion[i] ? '已完成' : ''" />
          </a-steps>
        </div>

        <KycStepCard
          v-if="currentStep === 0"
          :index="1"
          :total="STEP_DEFS.length"
          :title="STEP_DEFS[0].title"
          :description="STEP_DEFS[0].desc"
          :active="true"
          :done="stepCompletion[0]"
        >
          <div class="step-content">
            <IdCardUploader v-model="form.idCardFront" side="front" />
            <a-form :model="form" layout="vertical" class="meta-form">
              <a-form-item label="姓名">
                <a-input v-model="form.realName" placeholder="请输入身份证上姓名" />
              </a-form-item>
              <a-form-item label="身份证号">
                <a-input v-model="form.idNumber" placeholder="请输入 18 位身份证号" />
              </a-form-item>
            </a-form>
          </div>
        </KycStepCard>

        <KycStepCard
          v-else-if="currentStep === 1"
          :index="2"
          :total="STEP_DEFS.length"
          :title="STEP_DEFS[1].title"
          :description="STEP_DEFS[1].desc"
          :active="true"
          :done="stepCompletion[1]"
        >
          <IdCardUploader v-model="form.idCardBack" side="back" />
        </KycStepCard>

        <KycStepCard
          v-else-if="currentStep === 2"
          :index="3"
          :total="STEP_DEFS.length"
          :title="STEP_DEFS[2].title"
          :description="STEP_DEFS[2].desc"
          :active="true"
          :done="stepCompletion[2]"
        >
          <IdCardUploader v-model="form.faceImage" side="face" />
        </KycStepCard>

        <KycStepCard
          v-else-if="currentStep === 3"
          :index="4"
          :total="STEP_DEFS.length"
          :title="STEP_DEFS[3].title"
          :description="STEP_DEFS[3].desc"
          :active="true"
          :done="stepCompletion[3]"
        >
          <a-form :model="form" layout="vertical" class="meta-form">
            <a-form-item label="手机号">
              <a-input-group compact>
                <a-input v-model="form.phone" placeholder="请输入 11 位手机号" style="width: 240px" />
                <a-button :disabled="sentSms && smsCountdown > 0" @click="sendSms">
                  {{ sentSms && smsCountdown > 0 ? `${smsCountdown}s` : '发送验证码' }}
                </a-button>
              </a-input-group>
            </a-form-item>
            <a-form-item label="验证码">
              <a-input v-model="form.smsCode" placeholder="任意 6 位数字（原型模式）" style="width: 240px" max-length="6" />
            </a-form-item>
          </a-form>
        </KycStepCard>

        <div class="step-actions">
          <a-button :disabled="currentStep === 0" @click="prev">上一步</a-button>
          <a-button v-if="currentStep < STEP_DEFS.length - 1" type="primary" @click="next">下一步</a-button>
          <a-button v-else type="primary" :loading="submitting" @click="submit">提交认证</a-button>
        </div>
      </template>
    </a-spin>
  </div>
</template>

<style scoped>
.kyc-page {
  padding-top: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.status-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.status-head {
  display: flex;
  gap: 16px;
  align-items: center;
}
.big-icon {
  font-size: 48px;
}
.status-title {
  font-size: 18px;
  margin: 6px 0 4px;
}
.status-sub {
  margin: 0;
  color: #86909c;
  font-size: 12px;
}
.status-alert {
  margin-bottom: 16px;
}
.steps-bar {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 16px 24px;
  margin-bottom: 16px;
}
.step-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.meta-form {
  flex: 1;
}
.step-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
