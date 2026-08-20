<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { cmsApi } from '@shared';
import AgreementViewer from '@/components/cms/agreement-viewer.vue';
import EmptyState from '@/components/common/empty-state.vue';

interface CategoryDef {
  key: Api.Cms.HelpCategory | 'all';
  label: string;
  emoji: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'all', label: '全部', emoji: '📚' },
  { key: 'guide', label: '入门指南', emoji: '🎯' },
  { key: 'order', label: '订单相关', emoji: '📦' },
  { key: 'wallet', label: '钱包/资金', emoji: '💰' },
  { key: 'kyc', label: 'KYC 认证', emoji: '🪪' },
  { key: 'aftersale', label: '售后服务', emoji: '🔧' },
  { key: 'other', label: '其他', emoji: '❓' }
];

const AGREEMENTS: { kind: Api.Cms.AgreementKind; label: string }[] = [
  { kind: 'user', label: '用户协议' },
  { kind: 'privacy', label: '隐私政策' },
  { kind: 'service', label: '服务协议' },
  { kind: 'kyc', label: 'KYC 政策' },
  { kind: 'aml', label: 'AML 政策' }
];

const activeCat = ref<CategoryDef['key']>('all');
const list = ref<Api.Cms.HelpArticle[]>([]);
const loading = ref(false);
const keyword = ref('');
const expandedId = ref<number>();

const agreementVisible = ref(false);
const agreementKind = ref<Api.Cms.AgreementKind>('user');

async function load() {
  loading.value = true;
  try {
    const r = await cmsApi.fetchHelpArticles({
      category: activeCat.value === 'all' ? undefined : activeCat.value,
      keyword: keyword.value || undefined,
      size: 30
    });
    list.value = r.records;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(activeCat, load);

async function expand(a: Api.Cms.HelpArticle) {
  expandedId.value = expandedId.value === a.id ? undefined : a.id;
  if (expandedId.value) {
    // 增加 viewsCount（mock）
    await cmsApi.fetchHelpArticleDetail(a.id);
  }
}

function openAgreement(kind: Api.Cms.AgreementKind) {
  agreementKind.value = kind;
  agreementVisible.value = true;
}
</script>

<template>
  <div class="help-page shop-container">
    <h1 class="page-title">帮助中心</h1>

    <div class="layout">
      <aside class="side">
        <div class="side-section">
          <div class="side-title">分类</div>
          <div
            v-for="c in CATEGORIES"
            :key="c.key"
            class="cat-row"
            :class="{ active: activeCat === c.key }"
            @click="activeCat = c.key"
          >
            <span class="emoji">{{ c.emoji }}</span>
            <span>{{ c.label }}</span>
          </div>
        </div>

        <div class="side-section">
          <div class="side-title">用户协议</div>
          <a
            v-for="a in AGREEMENTS"
            :key="a.kind"
            class="agreement-link"
            @click="openAgreement(a.kind)"
          >
            📄 {{ a.label }}
          </a>
        </div>
      </aside>

      <section class="content">
        <a-input-search
          v-model="keyword"
          placeholder="搜索帮助文章..."
          search-button
          class="search"
          @search="load"
          @press-enter="load"
        />

        <a-spin :loading="loading" style="width: 100%">
          <template v-if="list.length">
            <div
              v-for="a in list"
              :key="a.id"
              class="article-card"
              :class="{ expanded: expandedId === a.id }"
            >
              <div class="article-head" @click="expand(a)">
                <div class="head-left">
                  <span class="cat-emoji">{{ CATEGORIES.find(c => c.key === a.category)?.emoji || '📄' }}</span>
                  <div>
                    <div class="title">{{ a.title }}</div>
                    <div class="meta">
                      {{ a.viewsCount.toLocaleString() }} 浏览 · {{ a.helpful }} 有用
                    </div>
                  </div>
                </div>
                <span class="arrow">{{ expandedId === a.id ? '▲' : '▼' }}</span>
              </div>
              <div v-if="expandedId === a.id" class="article-body">
                <pre class="body-text">{{ a.body }}</pre>
                <div class="article-footer">
                  这篇文章对您有帮助吗？
                  <a-link disabled>👍 有用（暂未开放）</a-link>
                  <a-link disabled>👎 没帮助（暂未开放）</a-link>
                </div>
              </div>
            </div>
          </template>
          <EmptyState v-else title="暂无相关文章" />
        </a-spin>
      </section>
    </div>

    <AgreementViewer v-model:visible="agreementVisible" :kind="agreementKind" />
  </div>
</template>

<style scoped>
.help-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.side-section {
  background: #fff;
  border-radius: var(--bw-card-radius);
  padding: 12px 0;
}
.side-title {
  font-size: 12px;
  color: #86909c;
  padding: 0 16px;
  margin-bottom: 8px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #4e5969;
  transition: all 0.15s;
}
.cat-row:hover {
  background: #f3f7ff;
}
.cat-row.active {
  background: #f3f7ff;
  color: var(--bw-brand-primary);
  border-right: 3px solid var(--bw-brand-primary);
}
.emoji {
  font-size: 16px;
}
.agreement-link {
  display: block;
  padding: 8px 16px;
  font-size: 12px;
  color: #4e5969;
  cursor: pointer;
}
.agreement-link:hover {
  color: var(--bw-brand-primary);
  background: #f3f7ff;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search {
  margin-bottom: 4px;
}
.article-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  border: 1px solid #f2f3f5;
  overflow: hidden;
  transition: all 0.15s;
}
.article-card.expanded {
  border-color: var(--bw-brand-primary);
}
.article-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  cursor: pointer;
}
.head-left {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cat-emoji {
  font-size: 22px;
}
.title {
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
}
.meta {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
.arrow {
  color: #c9cdd4;
  font-size: 11px;
}
.article-body {
  padding: 0 20px 16px;
  border-top: 1px dashed #f2f3f5;
}
.body-text {
  font-size: 13px;
  color: #4e5969;
  line-height: 1.7;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  margin: 12px 0;
}
.article-footer {
  padding-top: 8px;
  border-top: 1px dashed #f2f3f5;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #86909c;
}
</style>
