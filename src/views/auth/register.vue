<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { useUserStore } from '@/stores';
import { prepareRegistration } from '@/service/api/auth';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const form = reactive({ email: '', nickname: '', password: '', confirm: '' });
const submitting = ref(false);
let disposed = false;
onBeforeUnmount(() => { disposed = true; });

function goLogin() {
  router.push({ path: '/auth/login', query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {} });
}

async function submit() {
  if (submitting.value) return;
  const prepared = prepareRegistration(form);
  if (prepared.error) {
    Message.warning(prepared.error);
    return;
  }
  submitting.value = true;
  try {
    await userStore.register(prepared.params);
    if (disposed) return;
    Message.success('注册成功，请登录');
    goLogin();
  } catch {
    // 请求层已提示失败，离开页面后不触发旧页面导航。
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="register-page">
    <h2 class="title">注册</h2>
    <p class="hint">使用邮箱注册平台账号，注册后返回登录页完成登录。</p>

    <a-form :model="form" layout="vertical" @submit-success="submit">
      <a-form-item label="邮箱">
        <a-input v-model="form.email" placeholder="请输入邮箱，如 name@example.com" size="large" />
      </a-form-item>
      <a-form-item label="昵称">
        <a-input v-model="form.nickname" placeholder="请输入昵称" size="large" />
      </a-form-item>
      <a-form-item label="密码">
        <a-input-password v-model="form.password" placeholder="请输入 6-64 位密码" size="large" />
      </a-form-item>
      <a-form-item label="确认密码">
        <a-input-password v-model="form.confirm" placeholder="请再次输入密码" size="large" />
      </a-form-item>
      <a-button type="primary" long :loading="submitting" size="large" @click="submit">
        注 册
      </a-button>
    </a-form>

    <div class="bottom">
      已有账号？
      <a-link role="link" tabindex="0" @click="goLogin" @keydown.enter="goLogin" @keydown.space.prevent="goLogin">返回登录</a-link>
    </div>
  </div>
</template>

<style scoped>
.title {
  font-size: 22px;
  margin: 0 0 6px;
}
.hint {
  color: #86909c;
  font-size: 12px;
  margin-bottom: 16px;
}
.bottom {
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
  color: #4e5969;
}
</style>
