<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { formatAmount, imApi } from '@shared';
import { findUserById } from '@shared/mock/data/users';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import OrderGroupHeader from '@/components/im/order-group-header.vue';
import RiskFlagBanner from '@/components/im/risk-flag-banner.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const router = useRouter();
const userStore = useUserStore();

type ConvKind = 'group' | 'cs' | 'presale';
const activeTab = ref<ConvKind>('group');

const groups = ref<Api.Im.OrderGroup[]>([]);
const csSession = ref<Api.Im.PlatformCsSession>();
const selectedGroupId = ref<number>();
const messages = ref<Api.Im.Message[]>([]);
const loading = ref(false);
const scrollRef = ref<HTMLDivElement>();

async function loadGroups() {
  if (!userStore.currentUser) return;
  groups.value = await imApi.fetchMyOrderGroups(userStore.currentUser.id);
  if (groups.value.length && selectedGroupId.value == null) {
    selectGroup(groups.value[0]);
  }
}

async function loadCs() {
  if (!userStore.currentUser) return;
  csSession.value = await imApi.fetchPlatformCsConversation(userStore.currentUser.id);
  if (csSession.value) {
    messages.value = await imApi.fetchMessages(csSession.value.id);
    await nextTick();
    scrollToBottom();
  }
}

const presaleSessions = ref<Api.Im.PresaleSession[]>([]);
async function loadPresales() {
  if (!userStore.currentUser) return;
  presaleSessions.value = await imApi.fetchPresaleConversations(userStore.currentUser.id);
}

async function selectGroup(g: Api.Im.OrderGroup) {
  selectedGroupId.value = g.id;
  loading.value = true;
  try {
    messages.value = await imApi.fetchMessages(g.id);
    await nextTick();
    scrollToBottom();
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
  loadGroups();
});

watch(activeTab, async tab => {
  messages.value = [];
  if (tab === 'group') {
    await loadGroups();
  } else if (tab === 'cs') {
    await loadCs();
  } else if (tab === 'presale') {
    await loadPresales();
  }
});

const selectedGroup = computed(() => groups.value.find(g => g.id === selectedGroupId.value));

const sideOf = (msg: Api.Im.Message): 'left' | 'right' | 'center' => {
  if (['system', 'system-banner', 'risk-warning', 'risk-intercept', 'order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(msg.type)) return 'center';
  return msg.senderId === userStore.currentUser?.id ? 'right' : 'left';
};

function getSenderName(msg: Api.Im.Message): string {
  if (msg.senderId === userStore.currentUser?.id) return '我';
  const u = findUserById(msg.senderId);
  return u?.nickname || msg.senderName || '系统';
}

const riskCount = computed(() => messages.value.filter(m => m.type === 'risk-warning' || m.type === 'risk-intercept').length);

async function onSend(payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }) {
  if (!userStore.currentUser) return;
  const convId = activeTab.value === 'group' ? selectedGroup.value?.id : csSession.value?.id;
  if (!convId) return;
  const newMsg = await imApi.sendMessageMock({
    conversationId: convId,
    senderId: userStore.currentUser.id,
    type: payload.type,
    content: payload.content,
    mediaUrl: payload.mediaUrl
  });
  messages.value.push(newMsg);
  await nextTick();
  scrollToBottom();
}

function lastPreview(g: Api.Im.OrderGroup): string {
  if (g.lastMessagePreview) return g.lastMessagePreview;
  return `${g.productTitle.slice(0, 18)}...`;
}

function previewTime(g: Api.Im.OrderGroup): string {
  return new Date(g.lastMessageAt || g.createdAt).toLocaleDateString();
}

function openOrderGroup() {
  if (selectedGroup.value) {
    router.push({ name: 'im-order-group', params: { orderCode: selectedGroup.value.orderId } });
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
                  :class="{ active: selectedGroupId === g.id }"
                  @click="selectGroup(g)"
                >
                  <div class="avatar group">{{ g.productTitle.slice(0, 1) }}</div>
                  <div class="info">
                    <div class="conv-name">{{ g.productTitle }}</div>
                    <div class="conv-meta">
                      <span class="preview">{{ lastPreview(g) }}</span>
                    </div>
                    <div class="conv-time">U {{ formatAmount(g.orderAmount) }} · {{ previewTime(g) }}</div>
                  </div>
                </div>
              </div>
              <EmptyState v-else title="暂无三方群" description="完成订单付款后自动创建" />
            </a-tab-pane>
            <a-tab-pane key="cs" title="平台客服">
              <div class="cs-block">
                <div v-if="csSession" class="cs-info">
                  <div class="avatar cs">客</div>
                  <div>
                    <div class="conv-name">油宝在线客服</div>
                    <div class="conv-meta">{{ csSession.skillGroup || '通用客服' }} · 平均 2 分钟内响应</div>
                  </div>
                </div>
                <EmptyState v-else title="暂无客服会话" />
              </div>
            </a-tab-pane>
            <a-tab-pane key="presale" :title="`售前 (${presaleSessions.length})`">
              <div v-if="presaleSessions.length" class="presale-list chat-scroll">
                <div v-for="s in presaleSessions" :key="s.id" class="conv-row">
                  <div class="avatar group" style="background: #ff7d00">售</div>
                  <div class="info">
                    <div class="conv-name">{{ s.productTitle }}</div>
                    <div class="conv-meta">
                      <span class="preview">买手 {{ s.shopperName }}</span>
                    </div>
                    <div class="conv-time">
                      {{ s.mergedToGroupId ? '已并入三方群' : '咨询中' }} ·
                      {{ new Date(s.createdAt).toLocaleDateString() }}
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
          <a-spin :loading="loading" style="width: 100%; height: 100%">
            <template v-if="activeTab === 'group' && selectedGroup">
              <OrderGroupHeader :group="selectedGroup" />
              <RiskFlagBanner :count="riskCount" />
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
              <div class="pane-actions">
                <a-link @click="openOrderGroup">独立窗口打开 ›</a-link>
              </div>
              <MessageInput @send="onSend" />
            </template>

            <template v-else-if="activeTab === 'cs' && csSession">
              <div class="cs-header">
                <div class="avatar cs">客</div>
                <div>
                  <div class="cs-title">油宝平台客服</div>
                  <div class="cs-sub">7×24 在线 · 通用客服</div>
                </div>
              </div>
              <div ref="scrollRef" class="messages chat-scroll">
                <MessageBubble
                  v-for="m in messages"
                  :key="m.id"
                  :msg="m"
                  :side="sideOf(m)"
                  :sender-name="getSenderName(m)"
                />
                <div v-if="!messages.length" class="empty-msg">向客服发送您的问题</div>
              </div>
              <MessageInput @send="onSend" />
            </template>

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
}
.sidebar-tabs {
  flex: 1;
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
  padding: 16px 20px;
  overflow-y: auto;
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
