<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AgreementViewer from '@/components/cms/agreement-viewer.vue';
import EmptyState from '@/components/common/empty-state.vue';

const route = useRoute();
const router = useRouter();

const AGREEMENTS: { kind: Api.Cms.AgreementKind; label: string }[] = [
  { kind: 'user', label: '用户协议' },
  { kind: 'privacy', label: '隐私政策' },
  { kind: 'service', label: '服务协议' },
  { kind: 'kyc', label: 'KYC 政策' },
  { kind: 'aml', label: 'AML 政策' }
];
const agreementVisible = ref(false);
const agreementKind = ref<Api.Cms.AgreementKind>('user');

function openAgreement(kind: Api.Cms.AgreementKind) {
  agreementKind.value = kind;
  agreementVisible.value = true;
}

function openAgreementFromQuery() {
  const raw = Array.isArray(route.query.agreement) ? route.query.agreement[0] : route.query.agreement;
  if (!raw) return;
  if (!AGREEMENTS.some(item => item.kind === raw)) {
    void router.replace({ query: { ...route.query, agreement: undefined } });
    return;
  }
  openAgreement(raw as Api.Cms.AgreementKind);
  const query = { ...route.query };
  delete query.agreement;
  void router.replace({ query });
}

onMounted(openAgreementFromQuery);
watch(() => route.query.agreement, openAgreementFromQuery);
</script>

<template>
  <div class="help-page shop-container">
    <h1 class="page-title">帮助中心</h1>
    <EmptyState
      title="帮助文章暂不可用"
      action-text="返回首页"
      @action="router.push('/')"
    />
    <div class="agreements">
      <button v-for="a in AGREEMENTS" :key="a.kind" type="button" @click="openAgreement(a.kind)">
        📄 {{ a.label }}
      </button>
    </div>
    <AgreementViewer v-model:visible="agreementVisible" :kind="agreementKind" />
  </div>
</template>

<style scoped>
.help-page { padding-top: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.agreements { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
.agreements button { border: none; background: transparent; color: #4e5969; cursor: pointer; }
.agreements button:hover { color: var(--yb-brand-pink); }
</style>
