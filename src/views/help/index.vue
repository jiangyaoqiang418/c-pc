<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores';
import AgreementViewer from '@/components/cms/agreement-viewer.vue';
import PublicContentBody from '@/components/cms/public-content-body.vue';
import EmptyState from '@/components/common/empty-state.vue';
import UmIcon from '@/components/common/um-icon.vue';
import BusinessPagination from '@/components/common/business-pagination.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchHelpPage, fetchHelpDetail, contentReadMessage } from '@/service/api/content';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const AGREEMENTS: { kind: Api.RealContent.AgreementKind; label: string }[] = [
  { kind: 'user', label: '用户协议' },
  { kind: 'privacy', label: '隐私政策' },
  { kind: 'service', label: '服务协议' },
  { kind: 'kyc', label: 'KYC 政策' },
  { kind: 'aml', label: 'AML 政策' }
];
const agreementVisible = ref(false);
const agreementKind = ref<Api.RealContent.AgreementKind>('user');
// 已有入口编码原样透传；其余参考主题待正式发布清单或主题字典确认后开放。
const TOPICS: { label: string; value?: string }[] = [
  { label: '购物指南' }, { label: '支付说明', value: 'pay' },
  { label: '配送与售后', value: 'delivery' }, { label: '退款流程', value: 'return' },
  { label: '求购指南' }, { label: '钱包支付' }, { label: '买手入驻', value: 'buyer' }
];
const rows = ref<Api.RealContent.PublicContentVO[]>([]);
const loading = ref(false);
const loadError = ref('');
const current = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const topic = ref('');
const activeId = ref<string>();
const detail = ref<Api.RealContent.PublicContentVO>();
const detailLoading = ref(false);
const detailError = ref('');
const listGuard = createLatestRequestGuard();
const detailGuard = createLatestRequestGuard();

function openAgreement(kind: Api.RealContent.AgreementKind) {
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
  openAgreement(raw as Api.RealContent.AgreementKind);
  const query = { ...route.query };
  delete query.agreement;
  void router.replace({ query });
}

function scalar(value: unknown) { return typeof value === 'string' ? value : ''; }

function closeArticle() {
  detailGuard.invalidate();
  activeId.value = undefined;
  detail.value = undefined;
  detailLoading.value = false;
  detailError.value = '';
}

async function load() {
  const isCurrent = listGuard.begin();
  closeArticle();
  rows.value = [];
  total.value = 0;
  loading.value = true;
  loadError.value = '';
  try {
    const page = await fetchHelpPage({ current: current.value, size: pageSize.value, keyword: scalar(route.query.keyword), topic: topic.value, signal: isCurrent.signal });
    if (!isCurrent()) return;
    pageSize.value = page.size;
    const maxPage = Math.max(1, Math.ceil(page.total / page.size));
    if (current.value > maxPage) {
      await router.replace({ query: { ...route.query, page: maxPage > 1 ? String(maxPage) : undefined } });
      return;
    }
    rows.value = page.records;
    total.value = page.total;
  } catch (error) {
    if (isCurrent()) loadError.value = contentReadMessage(error, '帮助内容加载失败，请稍后重试');
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

async function openArticle(row: Api.RealContent.PublicContentVO, retry = false) {
  if (!retry && activeId.value === String(row.id)) { closeArticle(); return; }
  const isCurrent = detailGuard.begin();
  activeId.value = String(row.id);
  detail.value = undefined;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const next = await fetchHelpDetail(row.id, { signal: isCurrent.signal });
    if (isCurrent()) detail.value = next;
  } catch (error) {
    if (isCurrent()) detailError.value = contentReadMessage(error, '帮助正文加载失败，请稍后重试');
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
}

function search() {
  const query = { ...route.query, keyword: keyword.value.trim() || undefined, page: undefined };
  if (scalar(route.query.keyword) === keyword.value.trim() && current.value === 1) void load();
  else void router.push({ query });
}

function selectTopic(value: string) {
  if (value === topic.value && current.value === 1) { closeArticle(); return; }
  void router.push({ query: { ...route.query, topic: value || undefined, page: undefined } });
}

function changePage(page: number) { void router.push({ query: { ...route.query, page: page > 1 ? String(page) : undefined } }); }

watch(() => route.query.agreement, openAgreementFromQuery, { immediate: true });
watch([() => route.query.keyword, () => route.query.topic, () => route.query.page, () => userStore.currentUser?.id, () => userStore.sessionVersion], () => {
  keyword.value = scalar(route.query.keyword);
  topic.value = scalar(route.query.topic);
  const page = Number(scalar(route.query.page));
  current.value = Number.isSafeInteger(page) && page > 0 ? page : 1;
  void load();
}, { immediate: true });

onBeforeUnmount(() => { listGuard.invalidate(); detailGuard.invalidate(); });

</script>

<template>

  <div class="help-page">
    <header class="page-heading compact help-heading"><h1>帮助中心</h1><button type="button" class="text-link" @click="router.push('/im')"><UmIcon name="headset" />联系客服</button></header>
    <div class="help-layout"><aside class="paper"><h3>帮助主题</h3><button type="button" :class="{ active: !topic }" :aria-pressed="!topic" @click="selectTopic('')">全部帮助<UmIcon name="chevron" /></button><button v-for="item in TOPICS" :key="item.label" type="button" :disabled="!item.value" :title="item.value ? undefined : '该帮助主题尚未开放'" :class="{ active: !!item.value && topic === item.value }" :aria-pressed="!!item.value && topic === item.value" @click="item.value && selectTopic(item.value)">{{ item.label }}<UmIcon name="chevron" /></button><h3>协议与政策</h3><button v-for="a in AGREEMENTS" :key="a.kind" type="button" @click="openAgreement(a.kind)">{{ a.label }}<UmIcon name="chevron" /></button></aside>
      <section class="help-content" :aria-busy="loading">
        <form class="help-search" role="search" @submit.prevent="search"><input v-model="keyword" class="table-search" type="search" maxlength="100" placeholder="搜索帮助标题" aria-label="搜索帮助标题" /><button type="submit" class="outline" :disabled="loading">搜索</button></form>
        <div v-if="loading" class="paper" role="status" aria-label="正在读取帮助"><Skeleton v-for="n in 3" :key="n" class="help-skeleton" /></div>
        <div v-else-if="loadError" class="paper"><EmptyState icon="lucide:book-open" :title="loadError" action-text="重新加载" @action="load" /></div>
        <template v-else-if="rows.length"><article v-for="row in rows" :key="row.id" class="faq"><button type="button" :aria-expanded="activeId === String(row.id)" :aria-controls="'help-' + row.id" @click="openArticle(row)"><span>{{ row.title }}</span><UmIcon :name="activeId === String(row.id) ? 'minus' : 'plus'" /></button><div v-if="activeId === String(row.id)" :id="'help-' + row.id"><div v-if="detailLoading" role="status" aria-label="正在读取帮助正文"><Skeleton class="help-skeleton" /><Skeleton class="help-skeleton" /></div><PublicContentBody v-else-if="detail" :content="detail" /><div v-else-if="detailError" class="content-error" role="alert"><p>{{ detailError }}</p><button type="button" class="outline" @click="openArticle(row, true)">重新读取</button></div></div></article></template>
        <div v-else class="paper"><EmptyState icon="lucide:book-open" :title="keyword || topic ? '没有找到相关帮助' : '帮助文章暂未发布'" description="你仍可通过消息中心联系支持。" :action-text="keyword || topic ? '查看全部帮助' : '联系客服'" @action="keyword || topic ? router.push({ path: '/help' }) : router.push('/im')" /></div>
        <BusinessPagination v-if="total > pageSize && !loading && !loadError" :total="total" :current="current" :page-size="pageSize" @change="changePage" />
      </section>
    </div>
    <AgreementViewer v-model:visible="agreementVisible" :kind="agreementKind" />
  </div>

</template>

<style scoped>
.help-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.help-content { min-width:0; min-height:300px; }
.help-search { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.help-search input { width:100%; min-width:0; flex:1; }
.help-search button { flex-shrink:0; }
.help-skeleton { height:28px; border-radius:8px; margin:12px 0; }
.content-error { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.content-error p { margin:0; color:var(--yb-danger); }
.help-layout > aside h3:not(:first-child) { margin-top:24px; }
@media (max-width:700px) {
  .help-heading { align-items:flex-start; }
  :root[data-ui-theme="web3-meme"] .help-layout > aside { margin-left:-12px; margin-right:-12px; padding-left:16px; padding-right:16px; }
}
</style>
