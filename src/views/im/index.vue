<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';

const router = useRouter();
const userStore = useUserStore();

type ConvKind = 'group' | 'cs' | 'presale';
const activeTab = ref<ConvKind>('group');

const conversations = ref<Api.RealNotify.ImConversationVO[]>([]);
const selectedConversationId = ref<string | number>();
const messages = ref<Api.RealNotify.ImMessageVO[]>([]);
const loading = ref(false);
const scrollRef = ref<HTMLDivElement>();

function hasBizType(conversation: Api.RealNotify.ImConversationVO, type: string) {
  return String(conversation.bizType || '').toUpperCase() === type;
}

const groups = computed(() => conversations.value.filter(conversation => hasBizType(conversation, 'ORDER')));
const csSessions = computed(() => conversations.value.filter(conversation => {
  const type = String(conversation.bizType || '').toUpperCase();
  return type === 'CUSTOMER_SERVICE' || type === 'CS';
}));
const presaleSessions = computed(() => conversations.value.filter(conversation => hasBizType(conversation, 'PRESALE')));
const selectedConversation = computed(() => conversations.value.find(conversation => conversation.id === selectedConversationId.value));

async function loadConversations() {
  loading.value = true;
  try {
    conversations.value = (await notifyApi.fetchConversations({ pageNo: 1, pageSize: 100 })).records || [];
    await selectFirstConversation();
  } catch {
    conversations.value = [];
    selectedConversationId.value = undefined;
    messages.value = [];
  } finally {
    loading.value = false;
  }
}

async function selectFirstConversation() {
  const candidates = activeTab.value === 'group' ? groups.value : activeTab.value === 'cs' ? csSessions.value : presaleSessions.value;
  if (candidates.length && !candidates.some(conversation => conversation.id === selectedConversationId.value)) {
    await selectConversation(candidates[0]);
  }
}

async function selectConversation(conversation: Api.RealNotify.ImConversationVO) {
  selectedConversationId.value = conversation.id;
  loading.value = true;
  try {
    messages.value = (await notifyApi.fetchConversationMessages({ conversationId: conversation.id, pageNo: 1, pageSize: 100 })).records || [];
    await nextTick();
    scrollToBottom();
  } catch {
    messages.value = [];
  } finally {
    loading.value = false;
  }
}

function scrollToBottom() {
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  }
}

onMounted(() => {
  loadConversations();
});

watch(activeTab, async tab => {
  messages.value = [];
  if (tab === 'group' || tab === 'cs' || tab === 'presale') await selectFirstConversation();
});

const sideOf = (message: Api.RealNotify.ImMessageVO): 'left' | 'right' | 'center' => {
  if (!message.senderId || String(message.msgType || '').toUpperCase() === 'SYSTEM') return 'center';
  return String(message.senderId) === String(userStore.currentUser?.id) ? 'right' : 'left';
};

function getSenderName(message: Api.RealNotify.ImMessageVO): string {
  if (String(message.senderId) === String(userStore.currentUser?.id)) return '我';
  const role = String(message.senderRole || '').toUpperCase();
  return role === 'SELLER' ? '买手' : role === 'ADMIN' ? '平台客服' : role === 'CUSTOMER' ? '顾客' : '系统';
}

async function onSend(payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }) {
  if (!selectedConversation.value) return;
  try {
    await notifyApi.sendConversationMessage({
      conversationId: selectedConversation.value.id,
      msgType: payload.type === 'image' ? 'IMAGE' : 'TEXT',
      content: payload.content,
      mediaUrl: payload.mediaUrl
    });
    messages.value = (await notifyApi.fetchConversationMessages({
      conversationId: selectedConversation.value.id,
      pageNo: 1,
      pageSize: 100
    })).records || [];
    await nextTick();
    scrollToBottom();
  } catch {
    // 请求层已展示后端错误信息，不回退为本地 Mock 消息。
  }
}

function lastPreview(conversation: Api.RealNotify.ImConversationVO): string {
  return conversation.lastMessagePreview || '暂无消息';
}

function previewTime(conversation: Api.RealNotify.ImConversationVO): string {
  if (!conversation.lastMessageAt) return '—';
  const raw = conversation.lastMessageAt;
  const date = new Date(typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function openOrderGroup() {
  if (selectedConversation.value?.bizId) {
    router.push({ name: 'im-order-group', params: { orderCode: selectedConversation.value.bizId } });
  }
}
</script>

<template>
  <div class="im-page shop-container">
    <h1 class="page-title">消息中心</h1>

    <a-card class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
      <div class="layout">
        <!-- 左侧 -->
        <aside class="sidebar">
          <a-tabs v-model:active-key="activeTab" class="sidebar-tabs">
            <a-tab-pane key="group" :title="`三方群 (${groups.length})`">
              <div v-if="groups.length" class="conv-list chat-scroll">
                <div
                  v-for="g in groups"
                  :key="g.id"
                  class="conv-row"
                  :class="{ active: selectedConversationId === g.id }"
                  @click="selectConversation(g)"
                >
                  <div class="avatar group">{{ (g.title || '订').slice(0, 1) }}</div>
                  <div class="info">
                    <div class="conv-name">{{ g.title || `订单会话 ${g.bizId || ''}` }}</div>
                    <div class="conv-meta">
                      <span class="preview">{{ lastPreview(g) }}</span>
                    </div>
                    <div class="conv-time">订单 {{ g.bizId || '—' }} · {{ previewTime(g) }}</div>
                  </div>
                </div>
              </div>
              <EmptyState v-else title="暂无三方群" description="完成订单付款后自动创建" />
            </a-tab-pane>
            <a-tab-pane key="cs" title="平台客服">
              <div class="cs-block">
                <div v-for="session in csSessions" :key="session.id" class="cs-info conv-row" @click="selectConversation(session)">
                  <div class="avatar cs">客</div>
                  <div>
                    <div class="conv-name">{{ session.title || '油宝在线客服' }}</div>
                    <div class="conv-meta">{{ lastPreview(session) }}</div>
                  </div>
                </div>
                <EmptyState v-if="!csSessions.length" title="暂无客服会话" />
              </div>
            </a-tab-pane>
            <a-tab-pane key="presale" :title="`售前 (${presaleSessions.length})`">
              <div v-if="presaleSessions.length" class="presale-list chat-scroll">
                <div v-for="s in presaleSessions" :key="s.id" class="conv-row" :class="{ active: selectedConversationId === s.id }" @click="selectConversation(s)">
                  <div class="avatar group" style="background: #ff7d00">售</div>
                  <div class="info">
                    <div class="conv-name">{{ s.title || `售前会话 ${s.bizId || ''}` }}</div>
                    <div class="conv-meta">
                      <span class="preview">{{ lastPreview(s) }}</span>
                    </div>
                    <div class="conv-time">
                      咨询中 · {{ previewTime(s) }}
                    </div>
                  </div>
                </div>
              </div>
              <EmptyState v-else title="暂无售前会话" description="商品详情页「咨询买手」可发起售前对话" />
            </a-tab-pane>
          </a-tabs>
        </aside>

        <!-- 右侧 chat -->
        <section class="chat-pane">
          <a-spin class="chat-spin" :loading="loading">
            <div v-if="selectedConversation" class="conversation">
              <div class="conversation-header">
                <div>
                  <div class="cs-title">{{ selectedConversation.title || '会话' }}</div>
                  <div class="cs-sub">{{ selectedConversation.bizType || '—' }} · 业务 ID {{ selectedConversation.bizId || '—' }}</div>
                </div>
                <a-link v-if="activeTab === 'group' && selectedConversation.bizId" @click="openOrderGroup">独立窗口打开 ›</a-link>
              </div>
              <div ref="scrollRef" class="messages chat-scroll">
                <MessageBubble
                  v-for="m in messages"
                  :key="m.id"
                  :msg="m"
                  :side="sideOf(m)"
                  :sender-name="getSenderName(m)"
                />
                <div v-if="!messages.length" class="empty-msg">该群暂无消息</div>
              </div>
              <MessageInput @send="onSend" />
            </div>

            <div v-else class="placeholder">
              <EmptyState title="请选择左侧会话" description="点击三方群或客服开始聊天" />
            </div>
          </a-spin>
        </section>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.im-page {
  padding-top: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.chat-card {
  background: #fff;
  border-radius: var(--bw-card-radius);
  overflow: hidden;
}
.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: calc(100vh - 200px);
  min-height: 600px;
}
.sidebar {
  background: #fafbfc;
  border-right: 1px solid #f2f3f5;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sidebar-tabs {
  flex: 1;
  min-height: 0;
}
.sidebar-tabs :deep(.arco-tabs-content) {
  height: calc(100% - 46px);
}
.sidebar-tabs :deep(.arco-tabs-content-list) {
  height: 100%;
}
.sidebar-tabs :deep(.arco-tabs-pane) {
  height: 100%;
}
.conv-list {
  overflow-y: auto;
  height: 100%;
}
.conv-row {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f7f8fa;
  transition: background 0.15s;
}
.conv-row:hover {
  background: #f3f7ff;
}
.conv-row.active {
  background: #f3f7ff;
  border-left: 3px solid var(--bw-brand-primary);
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.avatar.group {
  background: #165dff;
}
.avatar.cs {
  background: #00b42a;
}
.info {
  flex: 1;
  min-width: 0;
}
.conv-name {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-meta {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
}
.preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-time {
  font-size: 10px;
  color: #c9cdd4;
  margin-top: 2px;
}
.cs-block {
  padding: 16px;
}
.cs-info {
  display: flex;
  gap: 10px;
  align-items: center;
}
.chat-pane {
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  min-width: 0;
  min-height: 0;
}
.chat-spin {
  flex: 1;
  min-height: 0;
}
.chat-spin :deep(.arco-spin) {
  height: 100%;
  min-height: 0;
}
.conversation {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.conversation-header {
  background: #fff;
  padding: 14px 20px;
  border-bottom: 1px solid #f2f3f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.cs-header {
  background: #fff;
  padding: 14px 20px;
  border-bottom: 1px solid #f2f3f5;
  display: flex;
  gap: 12px;
  align-items: center;
}
.cs-title {
  font-weight: 600;
  font-size: 14px;
}
.cs-sub {
  font-size: 12px;
  color: #86909c;
}
.messages {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.conversation :deep(.input-area) {
  flex-shrink: 0;
}
.empty-msg {
  text-align: center;
  color: #86909c;
  padding: 40px 0;
  font-size: 13px;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.pane-actions {
  padding: 6px 16px;
  text-align: right;
  background: #fff;
  border-top: 1px solid #f7f8fa;
  font-size: 12px;
}
</style>
