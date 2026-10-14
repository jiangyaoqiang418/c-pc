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
import PasswordInput from '@/components/common/password-input.vue';
import UmIcon from '@/components/common/um-icon.vue';

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
  <section class="auth-form paper login-page" :aria-busy="submitting">
    <h1>登录账户</h1>
    <form novalidate @submit.prevent="submit" @keydown.enter="event => { if (event.isComposing || event.keyCode === 229) event.preventDefault(); }">
      <div class="field">
        <Label for="login-email">邮箱</Label>
        <Input id="login-email" ref="emailInput" v-model="form.email" type="email" autocomplete="username" inputmode="email" placeholder="name@example.com" :aria-describedby="oauthConflictMessage ? 'oauth-conflict' : undefined" />
      </div>
      <div class="field">
        <Label for="login-password">密码</Label>
        <PasswordInput id="login-password" v-model="form.password" :max-length="64" autocomplete="current-password" placeholder="请输入 6–64 位密码" />
      </div>
      <p v-if="oauthConflictMessage" id="oauth-conflict" class="error-text auth-error" role="alert">{{ oauthConflictMessage }}</p>
      <Button type="submit" class="primary full auth-submit" :disabled="submitting">
        {{ submitting ? '正在登录' : '登录' }}
        <UmIcon :name="submitting ? 'clock' : 'arrow'" :class="{ 'auth-loading': submitting }" />
      </Button>
    </form>
    <OAuthLoginOptions :disabled="submitting" :busy-provider="oauthProvider" @login="submitOAuth" />
    <p class="center auth-return">还没有账号？<button type="button" class="text-link" @click="goRegister">立即注册</button></p>
  </section>
</template>

<style scoped src="./auth-form.css"></style>
