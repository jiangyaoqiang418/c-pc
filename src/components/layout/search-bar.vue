<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();
const route = useRoute();
const kw = ref('');
const composing = ref(false);
watch([() => route.name, () => route.query.keyword], ([name, value], previous) => {
  // 钱包、求购等页面也使用 keyword，不能把它们的筛选值当成商品搜索。
  if (name === 'product-list') kw.value = typeof value === 'string' ? value : '';
  else if (!previous || name !== previous[0]) kw.value = '';
}, { immediate: true });

function submit() {
  if (composing.value) return;
  const query = kw.value.trim();
  kw.value = query;
  router.push({ name: 'product-list', query: { keyword: query || undefined } });
}

function onSearchKeydown(event: KeyboardEvent) {
  event.preventDefault();
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  submit();
}
</script>

<template>
  <div class="search-wrap">
    <form class="search-bar search-box" @submit.prevent="submit">
      <UmIcon name="search" class="search-leading" />
      <input
        v-model="kw"
        class="search-input"
        placeholder="搜索商品、品牌"
        aria-label="搜索商品"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown.enter="onSearchKeydown"
      />
      <button type="submit" class="search-btn" aria-label="搜索">
        <span>搜索</span>
        <UmIcon name="search" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.search-wrap { width:100%; min-width:0; }
.search-wrap .search-bar.search-box:focus-within { border-color:var(--green); }
.search-bar .search-input:focus-visible { outline:none; }
.search-bar .search-btn:focus-visible { outline:2px solid var(--green); outline-offset:-2px; }
</style>
