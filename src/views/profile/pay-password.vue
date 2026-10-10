<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import PasswordInput from '@/components/common/password-input.vue';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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
  <div class="shop-container security-page"><section class="card" :aria-busy="statusLoading">
    <nav class="bread" aria-label="面包屑"><RouterLink to="/profile">个人中心</RouterLink><span>/</span><span>账户安全</span></nav><span class="eyebrow">PAYMENT SECURITY</span><h1>支付密码</h1>
    <Alert v-if="loadError" variant="destructive" class="notice"><AlertDescription>{{ loadError }}</AlertDescription><Button type="button" variant="outline" size="sm" @click="load">重新读取</Button></Alert>
    <div v-if="statusLoading" class="skeletons"><Skeleton class="h-10" /><Skeleton class="h-16" /><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
    <template v-else-if="!loadError && status">
      <Alert v-if="status.locked" class="notice"><AlertDescription>支付密码已锁定，可使用平台登录密码重置。</AlertDescription></Alert>
      <Tabs v-if="status.hasSet" :model-value="mode" class="modes" @update:model-value="handleModeChange"><TabsList><TabsTrigger value="update" :disabled="submitting">修改密码</TabsTrigger><TabsTrigger value="reset" :disabled="submitting">忘记密码</TabsTrigger></TabsList></Tabs>
      <Alert v-if="formError" variant="destructive" class="notice"><AlertDescription>{{ formError }}</AlertDescription></Alert>
      <form novalidate @submit.prevent="submit" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div v-if="mode !== 'update'" class="field"><Label for="security-login-password">平台登录密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-login-password" v-model="form.loginPassword" :disabled="submitting" autocomplete="current-password" placeholder="请输入平台登录密码" required /></div>
        <div v-else class="field"><Label for="security-old-pay-password">原支付密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-old-pay-password" v-model="form.oldPayPassword" :disabled="submitting" :max-length="6" placeholder="请输入原支付密码" required /></div>
        <div class="field"><Label for="security-new-pay-password">新支付密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-new-pay-password" v-model="form.payPassword" :disabled="submitting" :max-length="6" placeholder="6 位数字，支持 0 开头" required /><small class="hint">支付密码用于付款和确认收货，请勿与登录密码混淆。</small></div>
        <div class="field"><Label for="security-confirm-pay-password">确认支付密码 <span aria-hidden="true">*</span></Label><PasswordInput id="security-confirm-pay-password" v-model="form.confirmPayPassword" :disabled="submitting" :max-length="6" placeholder="请再次输入新支付密码" required /></div>
        <footer class="actions"><Button type="submit" :disabled="!valid || submitting">{{ submitting ? '保存中…' : '保存' }}</Button></footer>
      </form>
    </template>
  </section></div>
</template>

<style scoped>
.security-page { padding-top:36px; padding-bottom:48px; }.card { max-width:670px; margin:auto; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; padding:32px; }.bread { display:flex; align-items:center; gap:12px; color:var(--yb-muted); font-size:13px; margin-bottom:26px; }.bread a:hover { color:var(--yb-brand-primary); }.eyebrow { color:var(--yb-gold); letter-spacing:2px; font-size:11px; }h1 { margin:6px 0 24px; font-size:24px; font-weight:650; }.description { margin:0 0 24px; color:var(--yb-muted); font-size:14px; line-height:1.8; }.notice { display:grid; gap:12px; margin-bottom:20px; }form { display:grid; gap:24px; }.field { display:grid; gap:10px; }.field label span { color:var(--destructive); }.hint { margin:0; font-size:12px; line-height:1.6; color:var(--yb-muted); }.field-error { color:var(--destructive); }.actions { display:flex; justify-content:flex-end; gap:16px; margin-top:4px; }.modes { margin-bottom:24px; }.modes :deep(button) { min-width:120px; }.skeletons { display:grid; gap:24px; padding:12px 0; }@media(max-width:700px) { .card { padding:24px; } }
</style>
