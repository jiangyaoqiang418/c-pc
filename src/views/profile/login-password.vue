<script setup lang="ts">
import UmIcon from '@/components/common/um-icon.vue';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import PasswordInput from '@/components/common/password-input.vue';
import { Input } from '@/components/ui/input';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@/lib/feedback';
import { useRoute, useRouter } from 'vue-router';
import { setLoginPassword } from '@/service/api/auth';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const form = reactive({ email: '', password: '', confirmPassword: '' });
const loading = ref(true);
const submitting = ref(false);
const saved = ref(false);
const loadError = ref('');
const formError = ref('');
const emailError = ref('');
let operationVersion = 0;

const needsEmail = computed(() => userStore.currentUser?.email === null);
const currentEmail = computed(() => userStore.currentUser?.email);
const redirect = computed(() => {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?!\/)/.test(target) && !target.startsWith('/auth/')
    && target.split(/[?#]/, 1)[0] !== route.path ? target : '/profile';
});
const canSubmit = computed(() => userStore.currentUser?.loginPasswordSet === false && !saved.value
  && form.password.length >= 6 && form.password.length <= 64
  && form.password === form.confirmPassword
  && (!needsEmail.value || /^[^\s@]+@[^\s@]+$/.test(form.email.trim())));

onMounted(() => void loadState());
onBeforeUnmount(() => { operationVersion += 1; form.password = ''; form.confirmPassword = ''; });
watch(() => userStore.currentUser?.id, (next, previous) => {
  if (String(next) === String(previous)) return;
  operationVersion += 1;
  submitting.value = false;
  saved.value = false;
  Object.assign(form, { email: '', password: '', confirmPassword: '' });
  void loadState();
});

async function loadState(afterSave = false) {
  const operation = ++operationVersion;
  loading.value = true;
  loadError.value = '';
  try {
    await userStore.refreshCurrentUser({ deferAccount: true });
    if (operation !== operationVersion) return;
    if (userStore.currentUser?.loginPasswordSet === true) {
      if (afterSave) Message.success('登录密码设置成功');
      else Message.info('当前账号已设置登录密码');
      await router.replace(redirect.value);
    } else if (userStore.currentUser?.loginPasswordSet !== false) {
      loadError.value = '未取得登录密码状态，请重新读取。';
    }
  } catch {
    if (operation === operationVersion) {
      loadError.value = afterSave
        ? '密码已保存，但最新账号状态读取失败，请重新读取。'
        : '账号状态读取失败，请稍后重试。';
    }
  } finally {
    if (operation === operationVersion) loading.value = false;
  }
}

function validate() {
  formError.value = '';
  emailError.value = '';
  if (needsEmail.value && !form.email.trim()) emailError.value = '请输入作为登录账号的邮箱';
  else if (needsEmail.value && !/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) emailError.value = '请输入正确的邮箱地址';
  if (!form.password) formError.value = '请输入登录密码';
  else if (form.password.length < 6 || form.password.length > 64) formError.value = '密码长度应为 6–64 位';
  else if (form.password !== form.confirmPassword) formError.value = '两次输入的密码不一致';
  return !formError.value && !emailError.value;
}

async function submit() {
  if (submitting.value || saved.value || !validate()) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined || userStore.currentUser?.loginPasswordSet !== false) return;
  const operation = ++operationVersion;
  submitting.value = true;
  formError.value = '';
  emailError.value = '';
  try {
    await setLoginPassword({
      password: form.password,
      confirmPassword: form.confirmPassword,
      ...(needsEmail.value ? { email: form.email.trim() } : {})
    });
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    saved.value = true;
    form.password = '';
    form.confirmPassword = '';
    submitting.value = false;
    await loadState(true);
  } catch (error) {
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    const message = error instanceof Error ? error.message : '设置失败，请稍后重试';
    if (error instanceof RequestError && message.includes('已设置过登录密码')) {
      saved.value = true;
      Message.warning(message);
      submitting.value = false;
      await loadState();
    } else if (message.includes('邮箱')) {
      emailError.value = message;
    } else {
      formError.value = message;
    }
  } finally {
    if (operation === operationVersion) submitting.value = false;
  }
}


</script>

<template>
  <div class="security-page"><section class="paper narrow" :aria-busy="loading">
    <h1>设置登录密码</h1><p>设置后可使用邮箱和该密码登录，当前第三方登录方式仍可继续使用。</p>
    <div v-if="loadError" class="status-banner security-notice" :role="saved ? 'status' : 'alert'"><UmIcon name="shield" /><span>{{ loadError }}</span><button type="button" class="outline" :disabled="loading || submitting" @click="loadState(saved)">重新读取</button></div>
    <div v-if="loading" class="security-skeletons"><Skeleton class="h-10" /><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
    <template v-else-if="!loadError && userStore.needsLoginPassword">
      <form novalidate @submit.prevent="submit" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div v-if="needsEmail" class="field"><Label for="set-login-email">登录邮箱 <span aria-hidden="true">*</span></Label><Input id="set-login-email" v-model="form.email" :disabled="submitting || saved" autocomplete="email" placeholder="请输入邮箱" :aria-invalid="!!emailError" aria-describedby="login-email-help" required /><p id="login-email-help" class="security-hint" :class="{ 'error-text': emailError }">{{ emailError || '该邮箱将作为你的登录账号，本期不校验邮箱验证码。' }}</p></div>
        <div v-else class="field"><Label for="set-login-email">登录邮箱</Label><Input id="set-login-email" :model-value="currentEmail || ''" readonly /></div>
        <div class="field"><Label for="set-login-password">新密码 <span aria-hidden="true">*</span></Label><PasswordInput id="set-login-password" v-model="form.password" :disabled="submitting || saved" autocomplete="new-password" placeholder="请输入登录密码" :aria-invalid="!!formError" aria-describedby="login-password-help" required /><p id="login-password-help" class="security-hint" :class="{ 'error-text': formError }">{{ formError || '长度 6–64 位，不限字符类型。' }}</p></div>
        <div class="field"><Label for="set-login-confirm">确认新密码 <span aria-hidden="true">*</span></Label><PasswordInput id="set-login-confirm" v-model="form.confirmPassword" :disabled="submitting || saved" autocomplete="new-password" placeholder="请再次输入" required /></div>
        <button type="submit" class="primary full" :disabled="!canSubmit || submitting">{{ submitting ? '保存中…' : '确认设置' }}</button>
      </form>
    </template>
    <button class="text-link full security-link" :disabled="submitting" @click="router.push('/profile/pay-password')">设置支付密码 →</button>
    <button class="text-link full security-link" :disabled="submitting" @click="router.push('/profile')">返回个人中心</button>
  </section></div>
</template>

<style scoped src="./v47-security.css"></style>
