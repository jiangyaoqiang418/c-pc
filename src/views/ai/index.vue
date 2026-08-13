<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { aiApi } from '@shared';
import type { AiSearchResult } from '@shared/api/ai';
import AiSuggestionGrid from '@/components/ai/ai-suggestion-grid.vue';

const router = useRouter();

interface BotMsg {
  role: 'bot';
  fullText: string;
  streamText: string;
  suggestions?: AiSearchResult;
  showSuggestions: boolean;
  done: boolean;
}
interface UserMsg {
  role: 'user';
  text: string;
}
interface LoadingMsg {
  role: 'loading';
}
type ChatMsg = BotMsg | UserMsg | LoadingMsg;

const PRESETS = ['iPhone 16 Pro', '北海道直邮草莓', '海蓝宝石原石', '日本电饭煲', 'LV 经典款', '法国红酒'];

const messages = ref<ChatMsg[]>([
  {
    role: 'bot',
    fullText: '你好，我是油宝 AI 智能导购。想找什么直接告诉我，我会为你在全球买手网络里匹配最合适的商品。找不到的还可以帮你发起求购，24 小时全球买手接单。',
    streamText: '',
    showSuggestions: false,
    done: false
  }
]);
const input = ref('');
const scrollRef = ref<HTMLElement>();
const errorMessage = ref('');
const failedQuery = ref('');
let streamTimers: number[] = [];

function scheduleStream(msg: BotMsg, onDone?: () => void) {
  const chars = [...msg.fullText];
  let i = 0;
  const step = () => {
    if (i >= chars.length) {
      msg.done = true;
      onDone?.();
      return;
    }
    const batch = Math.max(1, Math.min(3, chars.length - i));
    msg.streamText += chars.slice(i, i + batch).join('');
    i += batch;
    scrollBottom();
    const timer = window.setTimeout(step, 18);
    streamTimers.push(timer);
  };
  step();
}

// 首屏 Bot 引导即刻打完（模拟流式）
scheduleStream(messages.value[0] as BotMsg, () => {
  const m = messages.value[0] as BotMsg;
  m.showSuggestions = false;
});

async function scrollBottom() {
  await nextTick();
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  }
}

onBeforeUnmount(() => {
  streamTimers.forEach(t => window.clearTimeout(t));
  streamTimers = [];
});

async function send(text?: string) {
  const t = (text || input.value).trim();
  if (!t) return;
  errorMessage.value = '';
  failedQuery.value = '';
  input.value = '';
  messages.value.push({ role: 'user', text: t });
  messages.value.push({ role: 'loading' });
  scrollBottom();

  try {
    const result = await aiApi.aiSearchMock(t);
    const loadingIdx = messages.value.findIndex(m => m.role === 'loading');
    if (loadingIdx !== -1) messages.value.splice(loadingIdx, 1);

    const replyText = result.suggestions.length
      ? `已为你匹配到 ${result.suggestions.length} 件相关商品，看看有没有心仪的。`
      : '暂时没找到完全匹配的商品。要不要发起一个求购？全球买手会在 24 小时内响应。';

    const botMsg: BotMsg = {
      role: 'bot',
      fullText: replyText,
      streamText: '',
      suggestions: result,
      showSuggestions: false,
      done: false
    };
    messages.value.push(botMsg);
    scheduleStream(botMsg, () => {
      botMsg.showSuggestions = true;
      scrollBottom();
    });
  } catch {
    const loadingIdx = messages.value.findIndex(m => m.role === 'loading');
    if (loadingIdx !== -1) messages.value.splice(loadingIdx, 1);
    errorMessage.value = 'AI 导购暂时不可用，请稍后重试。';
    failedQuery.value = t;
    scrollBottom();
  }
}

function inducePurchaseFrom(query: string) {
  router.push({ name: 'purchase-create', query: { productHint: query } });
}

function isBot(m: ChatMsg): m is BotMsg { return m.role === 'bot'; }
function isUser(m: ChatMsg): m is UserMsg { return m.role === 'user'; }
</script>

<template>
  <div class="ai-chat">
    <header class="chat-nav">
      <h1 class="chat-title">AI 智能导购</h1>
      <p class="chat-sub">用自然语言告诉我你想要什么，全球买手 24h 接单</p>
    </header>

    <div ref="scrollRef" class="chat-scroll">
      <div class="chat-list">
        <div v-for="(m, i) in messages" :key="i" class="msg-row" :class="m.role">
          <!-- Bot -->
          <template v-if="isBot(m)">
            <div class="bubble bot">
              <div class="bot-avatar">
                <Icon icon="lucide:sparkles" width="16" />
              </div>
              <div class="bubble-body">
                <div class="bubble-text">
                  {{ m.streamText }}<span v-if="!m.done" class="caret" />
                </div>
                <div v-if="m.showSuggestions && m.suggestions" class="bubble-suggestions">
                  <AiSuggestionGrid :result="m.suggestions" />
                  <button
                    v-if="!m.suggestions.suggestions.length"
                    class="induce-btn"
                    @click="inducePurchaseFrom(m.suggestions.query)"
                  >
                    发起求购 →
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- User -->
          <template v-else-if="isUser(m)">
            <div class="bubble user">
              <span>{{ m.text }}</span>
            </div>
          </template>

          <!-- Loading -->
          <template v-else>
            <div class="bubble bot loading">
              <div class="bot-avatar">
                <Icon icon="lucide:sparkles" width="16" />
              </div>
              <div class="dots">
                <span class="dot" />
                <span class="dot" />
                <span class="dot" />
              </div>
            </div>
          </template>
        </div>

        <!-- 首屏 preset chips -->
        <div v-if="messages.length === 1" class="presets">
          <div class="preset-label">试试这些：</div>
          <div class="preset-chips">
            <button
              v-for="p in PRESETS"
              :key="p"
              class="preset-chip"
              @click="send(p)"
            >
              {{ p }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <footer class="chat-input-bar">
      <div class="chat-input-inner">
        <div v-if="errorMessage" class="chat-error" role="status">
          {{ errorMessage }}
          <button type="button" @click="send(failedQuery)">重试</button>
        </div>
        <div class="input-wrap">
          <input
            v-model="input"
            class="chat-input"
            placeholder="有什么想要的，尽管说..."
            @keyup.enter="send()"
          />
          <button
            class="send-btn"
            :class="{ active: input.trim() }"
            :disabled="!input.trim()"
            @click="send()"
          >
            <Icon icon="lucide:send" width="16" />
          </button>
        </div>
        <div class="chat-tip">AI 为你从全球买手商品池匹配 · 找不到自动引导求购</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 128px);
  min-height: 0;
  max-width: 960px;
  margin: 0 auto;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  overflow: hidden;
}
.chat-nav {
  flex: 0 0 auto;
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--yb-hairline);
}
.chat-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  margin: 0;
}
.chat-sub {
  font-size: 12px;
  color: var(--yb-muted);
  margin: 4px 0 0;
}

/* Scroll area */
.chat-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
  background: var(--yb-bg);
}
.chat-scroll::-webkit-scrollbar { width: 6px; }
.chat-scroll::-webkit-scrollbar-thumb { background: var(--yb-hairline); border-radius: 3px; }

.chat-list {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
@media (max-width: 720px) {
  .ai-chat { height: calc(100vh - 120px); border-radius: 12px; }
  .chat-nav { padding: 16px; }
  .chat-list { padding: 16px; gap: 14px; }
  .bubble { max-width: 92%; }
}
.msg-row {
  display: flex;
}
.msg-row.user { justify-content: flex-end; }
.msg-row.bot, .msg-row.loading { justify-content: flex-start; }

.bubble {
  max-width: 82%;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.bubble.user {
  background: var(--yb-ink);
  color: #fff;
  padding: 12px 18px;
  border-radius: 18px;
  border-bottom-right-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
}
.bubble.bot { align-items: flex-start; }
.bot-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6B4EFF 0%, #4D80F0 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bubble-body {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  padding: 14px 18px;
  border-radius: 18px;
  border-bottom-left-radius: 4px;
  min-width: 0;
  flex: 1;
}
.bubble-text {
  font-size: 14px;
  color: var(--yb-ink);
  line-height: 1.6;
  word-break: break-word;
}
.caret {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--yb-ink);
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 60% { opacity: 1; }
  30%, 90% { opacity: 0; }
}

/* Loading dots */
.bubble.loading { align-items: center; }
.dots {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  padding: 14px 18px;
  border-radius: 18px;
  border-bottom-left-radius: 4px;
  display: flex;
  gap: 4px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--yb-muted);
  animation: dot-blink 1.4s infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-blink {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

/* Bubble suggestions (product grid) */
.bubble-suggestions {
  margin-top: 12px;
  animation: fade-in 0.3s ease;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.induce-btn {
  margin-top: 12px;
  padding: 10px 24px;
  background: var(--yb-brand-pink);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.induce-btn:hover {
  background: var(--yb-brand-pink-2);
}

/* Presets */
.presets {
  padding-left: 46px;
}
.preset-label {
  font-size: 12px;
  color: var(--yb-muted);
  margin-bottom: 10px;
}
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-chip {
  padding: 8px 16px;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 999px;
  font-size: 12px;
  color: var(--yb-ink);
  cursor: pointer;
  transition: all 0.15s;
}
.preset-chip:hover {
  border-color: var(--yb-ink);
  transform: translateY(-1px);
}

/* Input bar */
.chat-input-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex: 0 0 auto;
  background: var(--yb-surface);
  border-top: 1px solid var(--yb-hairline);
  padding: 16px 32px 20px;
}
.chat-input-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--yb-bg);
  border: 1px solid var(--yb-hairline);
  border-radius: 999px;
  padding: 6px 6px 6px 20px;
  transition: border-color 0.15s;
}
.input-wrap:focus-within {
  border-color: var(--yb-ink);
}
.chat-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  height: 40px;
  font-size: 14px;
  color: var(--yb-ink);
  font-family: inherit;
}
.chat-input::placeholder { color: var(--yb-faint); }
.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--yb-hairline-2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.15s;
}
.send-btn.active {
  background: var(--yb-brand-pink);
  cursor: pointer;
}
.send-btn.active:hover {
  transform: scale(1.05);
}
.chat-tip {
  font-size: 11px;
  color: var(--yb-faint);
  text-align: center;
}
.chat-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4380d;
  background: #fff2e8;
  font-size: 12px;
}
.chat-error button {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  color: #d4380d;
  background: transparent;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
@media (max-width: 720px) {
  .chat-input-bar { padding: 12px 16px 16px; }
  .presets { padding-left: 0; }
}
</style>
