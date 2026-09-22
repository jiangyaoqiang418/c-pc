<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchPayPasswordStatus, resetPayPassword, setPayPassword, updatePayPassword, type PayPasswordStatus } from '@/service/api/pay-password';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';

type Mode = 'set' | 'update' | 'reset';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const status = ref<PayPasswordStatus>();
const mode = ref<Mode>('set');
const statusLoading = ref(true);
const submitting = ref(false);
const loadError = ref('');
const formError = ref('');
const form = reactive({ loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
let operationVersion = 0;

const valid = computed(() => /^\d{6}$/.test(form.payPassword) && form.payPassword === form.confirmPayPassword
  && (mode.value === 'update' ? /^\d{6}$/.test(form.oldPayPassword) : !!form.loginPassword));

onMounted(() => void load());
onBeforeUnmount(() => { operationVersion += 1; });

function requestedMode(hasSet: boolean): Mode {
  if (!hasSet) return 'set';
  return route.query.mode === 'reset' ? 'reset' : 'update';
}

function businessRedirect() {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?!\/)/.test(target) && !target.startsWith('/auth/')
    && !target.startsWith('/profile/login-password') && target !== route.path ? target : '';
}

function loginPasswordRedirect(targetMode: 'set' | 'reset') {
  const params = new URLSearchParams({ mode: targetMode });
  const target = businessRedirect();
  if (target) params.set('redirect', target);
  return router.push({
    path: '/profile/login-password',
    query: { redirect: `/profile/pay-password?${params.toString()}` }
  });
}

async function ensureLoginPassword(targetMode: Mode) {
  if (targetMode === 'update') return true;
  if (userStore.currentUser?.loginPasswordSet === undefined) {
    try {
      await userStore.refreshCurrentUser({ deferAccount: true });
    } catch {
      Message.error('登录密码状态读取失败，请稍后重试');
      return false;
    }
  }
  if (userStore.currentUser?.loginPasswordSet === false) {
    await loginPasswordRedirect(targetMode);
    return false;
  }
  if (userStore.currentUser?.loginPasswordSet !== true) {
    Message.error('未取得登录密码状态，请重新进入后再试');
    return false;
  }
  return true;
}

async function load() {
  const operation = ++operationVersion;
  const requestedUserId = userStore.currentUser?.id;
  statusLoading.value = true;
  loadError.value = '';
  try {
    const nextStatus = await fetchPayPasswordStatus();
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    status.value = nextStatus;
    mode.value = requestedMode(nextStatus.hasSet);
    const allowed = await ensureLoginPassword(mode.value);
    if (!allowed && operation === operationVersion && router.currentRoute.value.path === route.path) {
      loadError.value = '登录密码状态未确认，暂不能设置或重置支付密码。';
    }
  } catch (error) {
    if (operation === operationVersion) loadError.value = error instanceof Error ? error.message : '支付密码状态读取失败';
  } finally {
    if (operation === operationVersion) statusLoading.value = false;
  }
}

async function handleModeChange(value: string | number | boolean) {
  if (value !== 'update' && value !== 'reset') return;
  mode.value = value;
  formError.value = '';
  Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
  if (value === 'reset' && !(await ensureLoginPassword('reset'))
    && router.currentRoute.value.path === route.path) mode.value = 'update';
}

async function submit() {
  if (!valid.value || submitting.value) return;
  if (!(await ensureLoginPassword(mode.value))) return;
  const requestedUserId = userStore.currentUser?.id;
  const submittedMode = mode.value;
  const operation = ++operationVersion;
  submitting.value = true;
  formError.value = '';
  try {
    if (submittedMode === 'set') {
      await setPayPassword({ loginPassword: form.loginPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    } else if (submittedMode === 'reset') {
      await resetPayPassword({ loginPassword: form.loginPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    } else {
      await updatePayPassword({ oldPayPassword: form.oldPayPassword, payPassword: form.payPassword, confirmPayPassword: form.confirmPayPassword });
    }
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
    Message.success(submittedMode === 'set' ? '支付密码设置成功' : submittedMode === 'reset' ? '支付密码重置成功' : '支付密码修改成功');
    submitting.value = false;
    await load();
    const redirect = businessRedirect();
    if (redirect) await router.replace(redirect);
  } catch (error) {
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    if (error instanceof RequestError && error.code === '-316' && submittedMode !== 'update') {
      Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
      Message.warning(error.message);
      await loginPasswordRedirect(submittedMode);
    } else {
      formError.value = error instanceof Error ? error.message : '保存失败，请稍后重试';
    }
  } finally {
    if (operation === operationVersion) submitting.value = false;
  }
}
</script>

<template>
  <div class="shop-container security-page">
    <a-card title="支付密码" class="card">
      <a-spin :loading="statusLoading" class="content">
        <a-alert v-if="loadError" type="error" :closable="false" class="alert">
          {{ loadError }}
          <template #action><a-button size="mini" @click="load">重新读取</a-button></template>
        </a-alert>
        <template v-if="!statusLoading && !loadError && status">
          <a-alert v-if="status.locked" type="warning">支付密码已锁定，可使用平台登录密码重置。</a-alert>
          <a-radio-group v-if="status.hasSet" :model-value="mode" type="button" class="modes" @change="handleModeChange">
            <a-radio value="update">修改密码</a-radio>
            <a-radio value="reset">忘记密码</a-radio>
          </a-radio-group>
          <a-alert v-if="formError" type="error" :closable="false" class="alert">{{ formError }}</a-alert>
          <a-form :model="form" layout="vertical" @submit-success="submit">
            <a-form-item v-if="mode !== 'update'" label="平台登录密码" required>
              <a-input-password v-model="form.loginPassword" autocomplete="current-password" />
            </a-form-item>
            <a-form-item v-else label="原支付密码" required>
              <a-input-password v-model="form.oldPayPassword" :max-length="6" />
            </a-form-item>
            <a-form-item label="新支付密码" required>
              <a-input-password v-model="form.payPassword" :max-length="6" placeholder="6位数字，支持0开头" />
            </a-form-item>
            <a-form-item label="确认支付密码" required>
              <a-input-password v-model="form.confirmPayPassword" :max-length="6" />
            </a-form-item>
            <a-button type="primary" html-type="submit" :disabled="!valid" :loading="submitting">保存</a-button>
          </a-form>
        </template>
      </a-spin>
    </a-card>
  </div>
</template>

<style scoped>
.security-page { padding-top: 24px; }
.card { max-width: 560px; margin: auto; }
.content { display: block; min-height: 240px; }
.modes { margin: 16px 0; }
.alert { margin-bottom: 16px; }
</style>
