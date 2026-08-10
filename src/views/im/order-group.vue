<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import * as notifyApi from '@/service/api/notify';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const orderCode = computed(() => String(route.params.orderCode));
const conversation = ref<Api.RealNotify.ImConversationVO>();
const messages = ref<Api.RealNotify.ImMessageVO[]>([]);
const loading = ref(false);
const sending = ref(false);
const scrollRef = ref<HTMLDivElement>();

async function load() {
  loading.value = true;
  try {
    conversation.value = await notifyApi.fetchOrderConversation(orderCode.value);
    if (conversation.value) {
      messages.value = (await notifyApi.fetchConversationMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 100 })).records || [];
      await nextTick();
      scrollToBottom();
    }
  } catch {
    conversation.value = undefined;
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

onMounted(load);
watch(() => route.params.orderCode, load);

const sideOf = (message: Api.RealNotify.ImMessageVO): 'left' | 'right' | 'center' => {
  if (!message.senderId || String(message.msgType || '').toUpperCase() === 'SYSTEM') return 'center';
  return String(message.senderId) === String(userStore.currentUser?.id) ? 'right' : 'left';
};

const disableInput = computed(() => {
  return !conversation.value;
});

const disableText = computed(() => {
  return conversation.value ? '' : '当前订单没有可用会话';
});

async function onSend(payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }) {
  if (!conversation.value) return;
  sending.value = true;
  try {
    try {
      await notifyApi.sendConversationMessage({
        conversationId: conversation.value.id,
        msgType: payload.type === 'image' ? 'IMAGE' : 'TEXT',
        content: payload.content,
        mediaUrl: payload.mediaUrl
      });
      messages.value = (await notifyApi.fetchConversationMessages({
        conversationId: conversation.value.id,
        pageNo: 1,
        pageSize: 100
      })).records || [];
      await nextTick();
      scrollToBottom();
    } catch {
      // 请求层已展示后端错误信息，不回退为本地 Mock 消息。
    }
  } finally {
    sending.value = false;
  }
}

function getSenderName(message: Api.RealNotify.ImMessageVO): string {
  if (String(message.senderId) === String(userStore.currentUser?.id)) return '我';
  const role = String(message.senderRole || '').toUpperCase();
  return role === 'SELLER' ? '买手' : role === 'ADMIN' ? '平台客服' : role === 'CUSTOMER' ? '顾客' : '系统';
}
</script>

<template>
  <div class="im-group-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="conversation">
        <a-card class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
          <div class="conversation-header">
            <div class="conversation-title">{{ conversation.title || '订单会话' }}</div>
            <div class="conversation-sub">订单 ID {{ conversation.bizId || orderCode }} · {{ conversation.myRole || '—' }}</div>
          </div>

          <div ref="scrollRef" class="messages chat-scroll">
            <MessageBubble
              v-for="m in messages"
              :key="m.id"
              :msg="m"
              :side="sideOf(m)"
              :sender-name="getSenderName(m)"
            />
            <div v-if="!messages.length" class="empty-msg">该群暂无消息，开始聊天吧 👋</div>
          </div>

          <MessageInput :disabled="disableInput" :disabled-text="disableText" @send="onSend" />
        </a-card>
      </template>

      <EmptyState v-else-if="!loading" title="订单会话不存在" action-text="返回订单列表" @action="router.push('/order')" />
    </a-spin>
  </div>
</template>

<style scoped>
.im-group-page {
  padding-top: 16px;
}
.chat-card {
  background: #f7f8fa;
  border-radius: var(--bw-card-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 200px);
  min-height: 560px;
}
.conversation-header {
  background: #fff;
  padding: 16px 20px;
  border-bottom: 1px solid #f2f3f5;
}
.conversation-title {
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}
.conversation-sub {
  color: #86909c;
  font-size: 12px;
  margin-top: 4px;
}
.messages {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  background: #f7f8fa;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.chat-card :deep(.input-area) {
  flex-shrink: 0;
}
.empty-msg {
  text-align: center;
  color: #86909c;
  padding: 40px 0;
  font-size: 13px;
}
</style>
