<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AgreementViewer from '@/components/cms/agreement-viewer.vue';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';

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

  <div class="help-page">
    <header class="page-heading compact help-heading"><h1>帮助中心</h1><button type="button" class="text-link" @click="router.push('/im')"><UmIcon name="headset" />联系客服</button></header>
    <div class="help-layout"><aside class="paper"><h3>协议与政策</h3><button v-for="a in AGREEMENTS" :key="a.kind" type="button" @click="openAgreement(a.kind)">{{ a.label }}<UmIcon name="chevron" /></button></aside>
      <section class="paper"><EmptyState icon="lucide:book-open" title="帮助文章暂不可用" description="在线帮助内容尚未开放，你仍可通过消息中心联系支持。" action-text="返回首页" @action="router.push('/')" /></section>
    </div>
    <AgreementViewer v-model:visible="agreementVisible" :kind="agreementKind" />
  </div>

</template>

<style scoped>
.help-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.help-layout > section { min-height:300px; display:grid; place-items:center; }
@media (max-width:700px) {
  .help-heading { align-items:flex-start; }
  :root[data-ui-theme="web3-meme"] .help-layout > aside { margin-left:-12px; margin-right:-12px; padding-left:16px; padding-right:16px; }
}
</style>
