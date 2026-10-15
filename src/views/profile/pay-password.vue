<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import PasswordInput from '@/components/common/password-input.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
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
onBeforeUnmount(() => { operationVersion += 1; Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' }); });
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  operationVersion += 1;
  submitting.value = false;
  status.value = undefined;
  Object.assign(form, { loginPassword: '', oldPayPassword: '', payPassword: '', confirmPayPassword: '' });
  void load();
});

function requestedMode(hasSet: boolean): Mode {
  if (!hasSet) return 'set';
  return route.query.mode === 'reset' ? 'reset' : 'update';
}

function businessRedirect() {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?!\/)/.test(target) && !target.startsWith('/auth/')
    && !target.startsWith('/profile/login-password') && target.split(/[?#]/, 1)[0] !== route.path ? target : '';
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
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const submittedMode = mode.value;
  const operation = ++operationVersion;
  submitting.value = true;
  formError.value = '';
  try {
    if (!(await ensureLoginPassword(submittedMode))) return;
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)
      || mode.value !== submittedMode || !valid.value) return;
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
  <div class="security-page"><section class="paper narrow" :aria-busy="statusLoading">
    <h1>支付密码</h1><p>用于付款和确认收货。支付密码为 6 位数字，请勿与登录密码混淆。</p>
    <div v-if="loadError" class="status-banner security-notice" role="alert"><UmIcon name="shield" /><span>{{ loadError }}</span><button type="button" class="outline" :disabled="statusLoading || submitting" @click="load">重新读取</button></div>
    <div v-if="statusLoading" class="security-skeletons"><Skeleton class="h-10" /><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
    <template v-else-if="!loadError && status">
      <div v-if="status.locked" class="status-banner security-notice" role="status"><UmIcon name="shield" /><span>支付密码已锁定，可使用平台登录密码重置。</span></div>
      <div v-if="status.hasSet" class="tabs security-modes" role="group" aria-label="支付密码操作"><button :class="{ active: mode === 'update' }" :aria-pressed="mode === 'update'" :disabled="submitting" @click="handleModeChange('update')">修改密码</button><button :class="{ active: mode === 'reset' }" :aria-pressed="mode === 'reset'" :disabled="submitting" @click="handleModeChange('reset')">忘记密码</button></div>
      <p v-if="formError" class="error-text" role="alert">{{ formError }}</p>
      <form novalidate @submit.prevent="submit" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div v-if="mode !== 'update'" class="field"><Label for="security-login-password">平台登录密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-login-password" v-model="form.loginPassword" :disabled="submitting" autocomplete="current-password" placeholder="请输入平台登录密码" required /></div>
        <div v-else class="field"><Label for="security-old-pay-password">原支付密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-old-pay-password" v-model="form.oldPayPassword" :disabled="submitting" :max-length="6" placeholder="请输入原支付密码" required /></div>
        <div class="field"><Label for="security-new-pay-password">新支付密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-new-pay-password" v-model="form.payPassword" :disabled="submitting" :max-length="6" placeholder="6 位数字，支持 0 开头" required /></div>
        <div class="field"><Label for="security-confirm-pay-password">确认新密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-confirm-pay-password" v-model="form.confirmPayPassword" :disabled="submitting" :max-length="6" placeholder="请再次输入新支付密码" required /></div>
        <button type="submit" class="primary full" :disabled="!valid || submitting">{{ submitting ? '保存中…' : mode === 'set' ? '确认设置' : mode === 'reset' ? '确认重置' : '确认修改' }}</button>
      </form>
    </template>
    <button class="text-link full security-link" :disabled="submitting" @click="router.push('/profile/login-password')">设置登录密码 →</button>
    <button class="text-link full security-link" :disabled="submitting" @click="router.push('/profile')">返回个人中心</button>
  </section></div>
</template>

<style scoped src="./v47-security.css"></style>
