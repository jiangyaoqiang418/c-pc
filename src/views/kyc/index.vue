<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { enums } from '@shared';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const loading = ref(false);

const status = computed<Api.User.KycStatus>(() => userStore.currentUser?.kycStatus || 'none');
const meta = computed(() => enums.KYC_STATUS_META[status.value]);
const statusView = computed(() => {
  if (status.value === 'approved') {
    return {
      icon: 'lucide:badge-check',
      title: '您已通过 KYC 实名认证',
      description: '当前认证状态来自登录用户信息接口。'
    };
  }
  if (status.value === 'pending') {
    return {
      icon: 'lucide:clock-3',
      title: '您的认证正在审核中',
      description: '审核进度以平台返回的最新状态为准。'
    };
  }
  if (status.value === 'rejected') {
    return {
      icon: 'lucide:circle-x',
      title: '您的认证未通过审核',
      description: '当前接口未返回审核意见和重新提交入口。'
    };
  }
  if (status.value === 'expired') {
    return {
      icon: 'lucide:calendar-x-2',
      title: 'KYC 认证已过期',
      description: '当前接口未提供重新认证入口。'
    };
  }
  return {
    icon: 'lucide:user-round-search',
    title: '尚未提交 KYC 认证',
    description: '完成认证后可使用需要实名校验的功能；买手身份以平台审核结果为准。'
  };
});

async function load() {
  loading.value = true;
  try {
    await userStore.init();
    await userStore.refreshCurrentUser();
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="kyc-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <a-card class="status-card" :body-style="{ padding: '32px' }" :bordered="false">
        <div class="status-head">
          <div class="status-icon" :data-status="status">
            <Icon :icon="statusView.icon" width="32" />
          </div>
          <div>
            <a-tag :color="meta.color" size="large">{{ meta.label }}</a-tag>
            <h1 class="status-title">{{ statusView.title }}</h1>
            <p class="status-sub">{{ statusView.description }}</p>
          </div>
        </div>

        <a-divider />

        <a-descriptions
          :column="2"
          :data="[
            { label: '当前账号', value: userStore.currentUser?.nickname || userStore.currentUser?.email || '—' },
            { label: '手机号', value: userStore.currentUser?.phone || '—' },
            { label: '账号身份', value: userStore.currentUser?.isBuyer ? '买手' : '顾客' },
            { label: '状态来源', value: '当前用户信息接口' }
          ]"
        />

        <template v-if="status !== 'approved' && status !== 'pending'">
          <a-divider />
          <a-alert
            :type="status === 'rejected' ? 'error' : 'info'"
            title="KYC 资料提交、证件上传、人脸验证和短信验证接口暂未提供，当前页面不会生成模拟认证结果。"
          />
          <div class="actions">
            <a-button type="primary" disabled>提交认证</a-button>
          </div>
        </template>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.kyc-page {
  padding-top: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.status-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.status-head {
  display: flex;
  gap: 16px;
  align-items: center;
}
.status-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4e5969;
  background: #f2f3f5;
  flex-shrink: 0;
}
.status-icon[data-status='approved'] {
  color: #00b42a;
  background: #e8ffea;
}
.status-icon[data-status='pending'] {
  color: #ff7d00;
  background: #fff7e8;
}
.status-icon[data-status='rejected'] {
  color: #f53f3f;
  background: #ffece8;
}
.status-title {
  font-size: 18px;
  margin: 8px 0 4px;
}
.status-sub {
  margin: 0;
  color: #86909c;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
