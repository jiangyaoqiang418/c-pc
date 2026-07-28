<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';

const router = useRouter();

const form = reactive({ email: '', nickname: '', password: '', confirm: '' });
const submitting = ref(false);

async function submit() {
  if (!form.email || !form.nickname || !form.password) {
    Message.warning('请完善信息');
    return;
  }
  if (form.password !== form.confirm) {
    Message.error('两次密码不一致');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    submitting.value = false;
    Message.warning('原型阶段不支持新建用户，请使用登录页的演示账号一键登录');
    router.push('/auth/login');
  }, 600);
}
</script>

<template>
  <div class="register-page">
    <h2 class="title">注册</h2>
    <p class="hint">原型阶段不接受新用户。请前往登录页选择演示账号体验。</p>

    <a-form :model="form" layout="vertical" @submit-success="submit">
      <a-form-item label="邮箱">
        <a-input v-model="form.email" size="large" />
      </a-form-item>
      <a-form-item label="昵称">
        <a-input v-model="form.nickname" size="large" />
      </a-form-item>
      <a-form-item label="密码">
        <a-input-password v-model="form.password" size="large" />
      </a-form-item>
      <a-form-item label="确认密码">
        <a-input-password v-model="form.confirm" size="large" />
      </a-form-item>
      <a-button type="primary" long :loading="submitting" size="large" @click="submit">
        注 册
      </a-button>
    </a-form>

    <div class="bottom">
      已有账号？
      <a-link @click="router.push('/auth/login')">返回登录</a-link>
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
