<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Icon } from '@iconify/vue';
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

  <div class="help-page">
    <header class="page-heading"><div><span class="eyebrow">HERE TO HELP</span><h1>帮助中心</h1></div><Button variant="outline" @click="router.push('/im')"><Icon icon="lucide:headset" width="17" />联系客服</Button></header>
    <div class="help-layout"><aside class="paper"><h2>协议与政策</h2><p>保留现有协议入口，内容以正式发布版本为准。</p><Button v-for="a in AGREEMENTS" :key="a.kind" type="button" variant="ghost" class="agreement-link" @click="openAgreement(a.kind)"><Icon icon="lucide:file-text" width="17" />{{ a.label }}<Icon icon="lucide:arrow-up-right" width="15" /></Button></aside>
      <section class="paper"><EmptyState icon="lucide:book-open" title="帮助文章暂不可用" description="在线帮助内容尚未开放，你仍可通过消息中心联系支持。" action-text="返回首页" @action="router.push('/')" /></section>
    </div>
    <AgreementViewer v-model:visible="agreementVisible" :kind="agreementKind" />
  </div>

</template>

<style scoped>

.help-page { padding-bottom:32px; }.page-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:24px; }.eyebrow { font-size:12px; color:var(--yb-gold); letter-spacing:.12em; }.page-heading h1 { font-size:30px; font-weight:650; margin:6px 0 0; }.help-layout { display:grid; grid-template-columns:220px minmax(0,1fr); gap:24px; align-items:start; }.paper { padding:24px; border:1px solid var(--yb-hairline); border-radius:8px; background:var(--yb-surface); }.help-layout aside { position:sticky; top:170px; }.paper h2 { font-size:17px; font-weight:600; margin:0 0 10px; }.paper>p { font-size:13px; color:var(--yb-muted); margin:0 0 20px; line-height:1.7; }.agreement-link { width:100%; justify-content:flex-start; padding:12px; margin-bottom:4px; height:auto; }.agreement-link>svg:last-child { margin-left:auto; color:var(--yb-muted); }.help-layout>section { min-height:420px; display:flex; align-items:center; justify-content:center; }

</style>
