<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';

const router = useRouter();
const route = useRoute();
const kw = ref('');
const composing = ref(false);
watch([() => route.name, () => route.query.keyword], ([name, value], previous) => {
  // 钱包、求购等页面也使用 keyword，不能把它们的筛选值当成商品搜索。
  if (name === 'product-list') kw.value = typeof value === 'string' ? value : '';
  else if (!previous || name !== previous[0]) kw.value = '';
}, { immediate: true });

const HOT_WORDS = ['平板电脑', '爆款耳机', 'iPhone 16', 'MacBook', '女装'];

function submit(q?: string) {
  const query = (q || kw.value).trim();
  if (!query) return;
  kw.value = query;
  router.push({ name: 'product-list', query: { keyword: query } });
}

function onSearchKeydown(event: KeyboardEvent) {
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  submit();
}
</script>

<template>
  <div class="search-wrap">
    <div class="search-box">
      <input
        v-model="kw"
        class="search-input"
        placeholder="搜索商品 / 品牌 / 买手"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown.enter="onSearchKeydown"
      />
      <button type="button" class="search-btn" @click="submit()">
        <Icon icon="lucide:search" width="16" />
        <span>搜索</span>
      </button>
    </div>
    <div class="hot-words">
      <span
        v-for="w in HOT_WORDS"
        :key="w"
        class="hot-word"
        role="button"
        tabindex="0"
        :aria-label="`搜索${w}`"
        @click="submit(w)"
        @keydown.enter="submit(w)"
        @keydown.space.prevent="submit(w)"
      >
        {{ w }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.search-wrap {
  flex: 1;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-box {
  display: flex;
  align-items: stretch;
  height: 40px;
  border: 2px solid var(--yb-ink);
  border-radius: 999px;
  background: var(--yb-surface);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-box:focus-within {
  border-color: var(--yb-primary);
  box-shadow: 0 0 0 4px rgba(91, 92, 231, 0.12);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 0 20px;
  font-size: 14px;
  background: transparent;
  color: var(--yb-ink);
  font-family: var(--yb-font-body);
}
.search-input::placeholder {
  color: var(--yb-faint);
}

.search-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 24px;
  background: var(--yb-brand-pink);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s;
}
.search-btn:hover {
  background: var(--yb-brand-pink-2);
}

.hot-words {
  display: flex;
  gap: 12px;
  padding: 0 20px;
  height: 16px;
  overflow: hidden;
}
.hot-word {
  font-size: 11px;
  color: var(--yb-gold);
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
}
.hot-word:hover {
  color: var(--yb-primary);
}
.hot-word:focus-visible {
  outline: 2px solid var(--yb-brand-pink);
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
