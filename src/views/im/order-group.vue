<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { imApi } from '@shared';
import { findUserById } from '@shared/mock/data/users';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import OrderGroupHeader from '@/components/im/order-group-header.vue';
import RiskFlagBanner from '@/components/im/risk-flag-banner.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const orderCode = computed(() => String(route.params.orderCode));
const group = ref<Api.Im.OrderGroup>();
const messages = ref<Api.Im.Message[]>([]);
const loading = ref(false);
const sending = ref(false);
const scrollRef = ref<HTMLDivElement>();

async function load() {
  loading.value = true;
  try {
    group.value = await imApi.fetchOrderGroupByOrderCode(orderCode.value);
    if (group.value) {
      messages.value = await imApi.fetchMessages(group.value.id);
      await nextTick();
      scrollToBottom();
    }
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

const sideOf = (msg: Api.Im.Message): 'left' | 'right' | 'center' => {
  if (['system', 'system-banner', 'risk-warning', 'risk-intercept', 'order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(msg.type)) return 'center';
  return msg.senderId === userStore.currentUser?.id ? 'right' : 'left';
};

const riskCount = computed(() => messages.value.filter(m => m.type === 'risk-warning' || m.type === 'risk-intercept').length);

const disableInput = computed(() => {
  if (!group.value) return true;
  return ['ARCHIVED', 'DISSOLVED', 'ARCHIVING'].includes(group.value.orderGroupStatus);
});

const disableText = computed(() => {
  if (!group.value) return '';
  if (group.value.orderGroupStatus === 'ARCHIVED') return '本群已归档，仅可查看历史消息';
  if (group.value.orderGroupStatus === 'DISSOLVED') return '本群已解散';
  if (group.value.orderGroupStatus === 'ARCHIVING') return '本群归档中';
  return '';
});

async function onSend(payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }) {
  if (!group.value || !userStore.currentUser) return;
  sending.value = true;
  try {
    const newMsg = await imApi.sendMessageMock({
      conversationId: group.value.id,
      senderId: userStore.currentUser.id,
      type: payload.type,
      content: payload.content,
      mediaUrl: payload.mediaUrl
    });
    messages.value.push(newMsg);
    await nextTick();
    scrollToBottom();

    // 模拟自动回复（仅 customer 发出时）
    if (userStore.currentUser.id === group.value.customerId && payload.type === 'text') {
      setTimeout(async () => {
        if (!group.value) return;
        const shopperUser = findUserById(group.value.shopperId);
        const replyTexts = ['好的，我看下', '收到，稍后回复', '我这边核实一下', '没问题，按您要求处理'];
        const reply = replyTexts[Math.floor(messages.value.length % replyTexts.length)];
        const r = await imApi.sendMessageMock({
          conversationId: group.value.id,
          senderId: group.value.shopperId,
          type: 'text',
          content: reply
        });
        // hack: 改 senderRole 为 shopper（sendMessageMock 默认按发送方推断）
        r.senderRole = 'shopper';
        r.senderName = shopperUser?.nickname || '买手';
        messages.value.push(r);
        await nextTick();
        scrollToBottom();
      }, 1500);
    }
  } finally {
    sending.value = false;
  }
}

function getSenderName(msg: Api.Im.Message): string {
  if (msg.senderId === userStore.currentUser?.id) return '我';
  const u = findUserById(msg.senderId);
  return u?.nickname || msg.senderName || '系统';
}

void sending;
</script>

<template>
  <div class="im-group-page shop-container">
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="group">
        <a-card class="chat-card" :body-style="{ padding: 0 }" :bordered="false">
          <OrderGroupHeader :group="group" />

          <RiskFlagBanner :count="riskCount" />

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

      <EmptyState v-else-if="!loading" title="三方群不存在" action-text="返回订单列表" @action="router.push('/order')" />
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
.messages {
  flex: 1;
  padding: 16px 20px;
  background: #f7f8fa;
}
.empty-msg {
  text-align: center;
  color: #86909c;
  padding: 40px 0;
  font-size: 13px;
}
</style>
