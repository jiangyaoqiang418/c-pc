<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { MOCK_USERS, authApi } from '@shared';
import { useUserStore } from '@/stores';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const form = reactive({ email: '', password: '' });
const submitting = ref(false);
const redirect = (route.query.redirect as string) || '/';

async function submit() {
  if (!form.email || !form.password) {
    Message.warning('请输入邮箱与密码');
    return;
  }
  submitting.value = true;
  try {
    const result = await authApi.mockLogin(form);
    if ('error' in result) {
      Message.error(result.error);
      return;
    }
    await userStore.login(result.user.id);
    Message.success(`欢迎回来，${result.user.nickname}`);
    router.push(redirect);
  } finally {
    submitting.value = false;
  }
}

async function oneClick(userId: number) {
  submitting.value = true;
  try {
    await userStore.login(userId);
    Message.success('已登录演示账号');
    router.push(redirect);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <h2 class="title">登录</h2>
    <p class="hint">使用平台账号 + 邮箱密码登录，或选择演示账号一键登录。</p>

    <a-form :model="form" layout="vertical" @submit-success="submit">
      <a-form-item label="邮箱">
        <a-input v-model="form.email" placeholder="如 wangxiaomei@bw-shop.com" size="large" />
      </a-form-item>
      <a-form-item label="密码">
        <a-input-password v-model="form.password" placeholder="原型阶段，任意密码即可" size="large" />
      </a-form-item>
      <a-button type="primary" long :loading="submitting" size="large" @click="submit">登 录</a-button>
    </a-form>

    <a-divider>演示账号一键登录</a-divider>
    <div class="quick-list">
      <a-button v-for="u in MOCK_USERS" :key="u.userId" long size="small" @click="oneClick(u.userId)">
        <span class="quick-label">{{ u.label }}</span>
        <span class="quick-desc">{{ u.desc }}</span>
      </a-button>
    </div>

    <div class="bottom">
      还没有账号？
      <a-link @click="router.push('/auth/register')">立即注册</a-link>
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
.quick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.quick-list :deep(.arco-btn) {
  justify-content: space-between;
  padding: 0 12px;
}
.quick-label {
  font-weight: 500;
}
.quick-desc {
  color: #86909c;
  font-size: 12px;
}
.bottom {
  margin-top: 24px;
  font-size: 13px;
  color: #4e5969;
  text-align: center;
}
</style>
