<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import PasswordInput from '@/components/common/password-input.vue';
import { Input } from '@/components/ui/input';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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
    && target !== route.path ? target : '/profile';
});
const canSubmit = computed(() => userStore.currentUser?.loginPasswordSet === false && !saved.value
  && form.password.length >= 6 && form.password.length <= 64
  && form.password === form.confirmPassword
  && (!needsEmail.value || /^[^\s@]+@[^\s@]+$/.test(form.email.trim())));

onMounted(() => void loadState());
onBeforeUnmount(() => { operationVersion += 1; });

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
    await loadState(true);
  } catch (error) {
    if (operation !== operationVersion || String(userStore.currentUser?.id) !== String(requestedUserId)) return;
    const message = error instanceof Error ? error.message : '设置失败，请稍后重试';
    if (error instanceof RequestError && message.includes('已设置过登录密码')) {
      saved.value = true;
      Message.warning(message);
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
  <div class="shop-container security-page"><section class="card" :aria-busy="loading">
    <nav class="bread" aria-label="面包屑"><RouterLink to="/profile">个人中心</RouterLink><span>/</span><span>账户安全</span></nav><span class="eyebrow">ACCOUNT SECURITY</span><h1>设置登录密码</h1>
    <Alert v-if="loadError" :variant="saved ? 'default' : 'destructive'" class="notice"><AlertDescription>{{ loadError }}</AlertDescription><Button type="button" variant="outline" size="sm" @click="loadState(saved)">重新读取</Button></Alert>
    <div v-if="loading" class="skeletons"><Skeleton class="h-10" /><Skeleton class="h-16" /><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
    <template v-else-if="!loadError && userStore.needsLoginPassword">
      <p class="description">设置后可使用邮箱和该密码登录，当前第三方登录方式仍可继续使用。</p>
      <form novalidate @submit.prevent="submit" @keydown.enter="(event: KeyboardEvent) => { if (event.isComposing) event.preventDefault(); }">
        <div v-if="needsEmail" class="field"><Label for="set-login-email">登录邮箱 <span aria-hidden="true">*</span></Label><Input id="set-login-email" v-model="form.email" :disabled="submitting || saved" autocomplete="email" placeholder="请输入邮箱" :aria-invalid="!!emailError" aria-describedby="login-email-help" required /><p id="login-email-help" class="hint" :class="{ 'field-error': emailError }">{{ emailError || '该邮箱将作为你的登录账号，本期不校验邮箱验证码。' }}</p></div>
        <div v-else class="field"><Label for="set-login-email">登录邮箱</Label><Input id="set-login-email" :model-value="currentEmail || ''" readonly /></div>
        <div class="field"><Label for="set-login-password">登录密码 <span aria-hidden="true">*</span></Label><PasswordInput id="set-login-password" v-model="form.password" :disabled="submitting || saved" autocomplete="new-password" placeholder="请输入登录密码" :aria-invalid="!!formError" aria-describedby="login-password-help" required /><p id="login-password-help" class="hint" :class="{ 'field-error': formError }">{{ formError || '长度 6–64 位，不限字符类型。' }}</p></div>
        <div class="field"><Label for="set-login-confirm">确认登录密码 <span aria-hidden="true">*</span></Label><PasswordInput id="set-login-confirm" v-model="form.confirmPassword" :disabled="submitting || saved" autocomplete="new-password" placeholder="请再次输入" required /></div>
        <footer class="actions"><Button type="button" variant="outline" :disabled="submitting" @click="router.push('/profile')">取消</Button><Button type="submit" :disabled="!canSubmit || submitting">{{ submitting ? '保存中…' : '保存' }}</Button></footer>
      </form>
    </template>
  </section></div>
</template>

<style scoped>
.security-page { padding-top:36px; padding-bottom:48px; }.card { max-width:670px; margin:auto; background:var(--yb-paper); border:1px solid var(--yb-hairline); border-radius:10px; padding:32px; }.bread { display:flex; align-items:center; gap:12px; color:var(--yb-muted); font-size:13px; margin-bottom:26px; }.bread a:hover { color:var(--yb-brand-primary); }.eyebrow { color:var(--yb-gold); letter-spacing:2px; font-size:11px; }h1 { margin:6px 0 24px; font-size:24px; font-weight:650; }.description { margin:0 0 24px; color:var(--yb-muted); font-size:14px; line-height:1.8; }.notice { display:grid; gap:12px; margin-bottom:20px; }form { display:grid; gap:24px; }.field { display:grid; gap:10px; }.field label span { color:var(--destructive); }.hint { margin:0; font-size:12px; line-height:1.6; color:var(--yb-muted); }.field-error { color:var(--destructive); }.actions { display:flex; justify-content:flex-end; gap:16px; margin-top:4px; }.modes { margin-bottom:24px; }.modes :deep(button) { min-width:120px; }.skeletons { display:grid; gap:24px; padding:12px 0; }@media(max-width:700px) { .card { padding:24px; } }
</style>
