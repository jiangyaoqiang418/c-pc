<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@/lib/feedback';
import { useUserStore } from '@/stores';
import OAuthLoginOptions from '@/components/auth/oauth-login-options.vue';
import { RequestError } from '@/service/request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PasswordInput from '@/components/common/password-input.vue';
import { Icon } from '@iconify/vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const form = reactive({ email: '', password: '' });
const emailInput = ref<{ focus: () => void }>();
const submitting = ref(false);
const oauthProvider = ref<Api.RealAuth.OAuthProvider>();
const oauthConflictMessage = ref('');
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const redirect = computed(() => {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?!\/)/.test(target) && !target.startsWith('/auth/') ? target : '/';
});

function goRegister() {
  router.push({ path: '/auth/register', query: { redirect: redirect.value } });
}

async function submit() {
  if (submitting.value) return;
  if (!form.email || !form.password) {
    Message.warning('请输入邮箱与密码');
    return;
  }
  submitting.value = true;
  try {
    await userStore.loginWithPassword(form);
    if (disposed) return;
    Message.success(`欢迎回来，${userStore.displayName}`);
    router.push(redirect.value);
  } catch (error) {
    if (!disposed) Message.error(error instanceof Error ? error.message : '登录失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
}

async function submitOAuth(params: Api.RealAuth.OAuthLoginParams) {
  if (submitting.value) return;
  oauthConflictMessage.value = '';
  submitting.value = true;
  oauthProvider.value = params.provider;
  try {
    const result = await userStore.loginWithOAuth(params);
    if (disposed) return;
    Message.success(`欢迎回来，${userStore.displayName}`);
    if (result.loginPasswordSet === false) Message.info('账号已登录，可前往个人中心设置登录密码');
    else if (result.newUser || !result.payPasswordSet) Message.info('账号已登录，请在进行资金操作前完善安全设置');
    router.push(redirect.value);
  } catch (error) {
    if (!disposed && error instanceof RequestError && error.code === '-317') {
      oauthConflictMessage.value = error.message;
      Message.error(error.message);
      await nextTick();
      emailInput.value?.focus();
    } else if (!disposed) {
      Message.error(error instanceof Error ? error.message : '第三方登录失败，请稍后重试');
    }
  } finally {
    submitting.value = false;
    oauthProvider.value = undefined;
  }
}
</script>

<template>
  <div class="login-page">
    <h2 class="title">登录</h2>
    <p class="hint">使用平台账号和邮箱密码登录。</p>

    <Alert v-if="oauthConflictMessage" class="oauth-conflict"><AlertDescription>{{ oauthConflictMessage }}</AlertDescription></Alert>

    <form novalidate @submit.prevent="submit" @keydown.enter="event => { if (event.isComposing || event.keyCode === 229) event.preventDefault(); }">
      <div class="um-field"><Label for="login-email">邮箱</Label><Input id="login-email" ref="emailInput" v-model="form.email" autocomplete="username" inputmode="email" placeholder="请输入注册邮箱" /></div>
      <div class="um-field"><Label for="login-password">密码</Label><PasswordInput id="login-password" v-model="form.password" autocomplete="current-password" placeholder="请输入登录密码" /></div>
      <Button type="submit" size="lg" class="w-full" :disabled="submitting"><Icon v-if="submitting" icon="lucide:loader-circle" class="animate-spin" />{{ submitting ? '正在登录' : '登录' }}</Button>
    </form>

    <OAuthLoginOptions :disabled="submitting" :busy-provider="oauthProvider" @login="submitOAuth" />

    <div class="bottom">
      还没有账号？
      <button type="button" class="auth-link" @click="goRegister">立即注册</button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  text-align: left;
}
.title {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--yb-ink);
  text-align: center;
}
.hint {
  color: var(--yb-muted);
  font-size: 13px;
  margin-bottom: 28px;
  text-align: center;
}
.oauth-conflict {
  margin-bottom: 16px;
}
.bottom {
  margin-top: 24px;
  font-size: 13px;
  color: var(--yb-ink-2);
  text-align: center;
}
.auth-link { border: 0; background: none; color: var(--yb-primary); font: inherit; padding: 0 4px; }
</style>
