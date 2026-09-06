<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const form = reactive({ email: '', password: '' });
const submitting = ref(false);
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
</script>

<template>
  <div class="login-page">
    <h2 class="title">登录</h2>
    <p class="hint">使用平台账号和邮箱密码登录。</p>

    <a-form :model="form" layout="vertical" @submit-success="submit">
      <a-form-item label="邮箱">
        <a-input v-model="form.email" placeholder="请输入注册邮箱" size="large" />
      </a-form-item>
      <a-form-item label="密码">
        <a-input-password v-model="form.password" placeholder="请输入登录密码" size="large" />
      </a-form-item>
      <a-button type="primary" long :loading="submitting" size="large" @click="submit">登 录</a-button>
    </a-form>

    <div class="bottom">
      还没有账号？
      <a-link role="link" tabindex="0" @click="goRegister" @keydown.enter="goRegister" @keydown.space.prevent="goRegister">立即注册</a-link>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  text-align: left;
}
.title {
  font-size: 22px;
  margin: 0 0 6px;
  color: #1d2129;
}
.hint {
  color: #86909c;
  font-size: 12px;
  margin-bottom: 20px;
}
.bottom {
  margin-top: 24px;
  font-size: 13px;
  color: #4e5969;
  text-align: center;
}
</style>
