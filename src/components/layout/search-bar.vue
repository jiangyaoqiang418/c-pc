<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useRoute, useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';
import { useUserStore } from '@/stores/user';
import { fetchSearchPromotions, fetchSearchHot, fetchSearchSuggestions, trackSearch, normalizeSearchHistory, searchHistoryKey } from '@/service/api/search';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { uploadAiImage } from '@/service/api/ai';
import { Message } from '@/lib/feedback';

const router = useRouter();
const route = useRoute();
const kw = ref('');
const imageInput = ref<HTMLInputElement>();
const imageUploading = ref(false);
let imageVersion = 0; let imageAbort = new AbortController();
async function imageSearch(event: Event) {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; target.value = '';
  if (!file || imageUploading.value) return;
  if (!user.isLoggedIn) { void router.push({path:'/auth/login',query:{redirect:route.fullPath}}); return; }
  const version = ++imageVersion; imageUploading.value = true;
  try { const image = await uploadAiImage(file, imageAbort.signal); if (version === imageVersion) { close(); void router.push({name:'product-list',query:{imageFileId:image.id,hint:kw.value.trim() || undefined}}); } }
  catch(e) { if (version === imageVersion) Message.error(e instanceof Error ? e.message : '识图上传失败，请重试'); }
  finally { if (version === imageVersion) imageUploading.value = false; }
}

const composing = ref(false);
const user = useUserStore();
watch(() => user.sessionVersion, () => { imageVersion++; imageAbort.abort(); imageAbort = new AbortController(); imageUploading.value = false; });
const panelId = useId();
const wrap = ref<HTMLElement>();
const opened = ref(false);
const promotions = ref<Api.RealSearch.Keyword[]>([]);
const hot = ref<Api.RealSearch.Keyword[]>([]);
const suggestions = ref<Api.RealSearch.Keyword[]>([]);
const history = ref<string[]>([]);
const suggestionError = ref('');
const publicError = ref('');
const historyError = ref('');
const suggesting = ref(false);
const publicLoading = ref(false);
const defaultKeyword = computed(() => promotions.value[0]?.keyword || '');
const historyKey = computed(() => searchHistoryKey(user.currentUser?.id));
const suggestionGuard = createLatestRequestGuard(() => user.sessionVersion);
const publicGuard = createLatestRequestGuard(() => user.sessionVersion);
let timer: ReturnType<typeof setTimeout> | undefined;

function readHistory() {
  history.value = []; historyError.value = '';
  try { history.value = normalizeSearchHistory(JSON.parse(localStorage.getItem(historyKey.value) || '[]')); }
  catch { historyError.value = '搜索历史暂时无法读取'; }
}
function saveHistory(rows: string[]) {
  history.value = normalizeSearchHistory(rows);
  try { localStorage.setItem(historyKey.value, JSON.stringify(history.value)); historyError.value = ''; }
  catch { historyError.value = '搜索历史未能保存，本次搜索仍可使用'; }
}
watch([historyKey, () => user.sessionVersion], () => {
  opened.value = false; readHistory(); cancelSuggestions(); publicGuard.invalidate(); publicLoading.value = false;
}, { immediate: true, flush: 'sync' });
function cancelSuggestions() {
  if (timer) clearTimeout(timer);
  suggestionGuard.invalidate(); suggestions.value = []; suggestionError.value = ''; suggesting.value = false;
}
async function loadPublic() {
  const current = publicGuard.begin(); publicLoading.value = true; publicError.value = '';
  const results = await Promise.allSettled([fetchSearchPromotions(current.signal), fetchSearchHot(current.signal)]);
  if (!current()) return;
  promotions.value = results[0].status === 'fulfilled' ? results[0].value : [];
  hot.value = results[1].status === 'fulfilled' ? results[1].value : [];
  if (results.some(result => result.status === 'rejected')) publicError.value = '部分推荐词读取失败，可重试或直接搜索';
  publicLoading.value = false;
}
function focus() {
  if (opened.value) return;
  opened.value = true; readHistory(); void loadPublic(); scheduleSuggestions();
}
function scheduleSuggestions() {
  cancelSuggestions();
  const value = kw.value.trim();
  if (!opened.value || composing.value || !value || value.length > 50) return;
  suggesting.value = true;
  const current = suggestionGuard.begin();
  timer = setTimeout(async () => {
    try { const rows = await fetchSearchSuggestions(value, current.signal); if (current()) suggestions.value = rows; }
    catch { if (current()) suggestionError.value = '联想读取失败，可直接搜索或重试'; }
    finally { if (current()) suggesting.value = false; }
  }, 250);
}
watch([kw, composing], scheduleSuggestions);
function close() { opened.value = false; cancelSuggestions(); }
function focusout(event: FocusEvent) { if (!wrap.value?.contains(event.relatedTarget as Node | null)) close(); }
async function focusFirst() {
  focus(); await nextTick(); wrap.value?.querySelector<HTMLButtonElement>('[data-search-choice]')?.focus();
}
onBeforeUnmount(() => { imageVersion++; imageAbort.abort(); cancelSuggestions(); publicGuard.invalidate(); });
onMounted(() => { void loadPublic(); });
watch([() => route.name, () => route.query.keyword], ([name, value], previous) => {
  close();
  // 钱包、求购等页面也使用 keyword，不能把它们的筛选值当成商品搜索。
  if (name === 'product-list') kw.value = typeof value === 'string' ? value : '';
  else if (!previous || name !== previous[0]) kw.value = '';
}, { immediate: true });

function submit(keyword?: string) {
  if (composing.value) return;
  const query = (keyword ?? kw.value).trim() || defaultKeyword.value;
  if (!query || query.length > 50) return;
  kw.value = query;
  saveHistory([query, ...history.value]);
  void trackSearch(query).catch(() => { /* 打点失败不阻断商品查询。 */ });
  close();
  router.push({ name: 'product-list', query: { keyword: query || undefined } });
}

function onSearchKeydown(event: KeyboardEvent) {
  event.preventDefault();
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  submit();
}
</script>

<template>
  <div ref="wrap" class="search-wrap" @focusout="focusout" @keydown.esc="close">
    <form class="search-bar search-box" @submit.prevent="submit()">
      <UmIcon name="search" class="search-leading" />
      <input
        v-model="kw"
        class="search-input"
        :placeholder="defaultKeyword || '搜索商品'"
        aria-label="搜索商品"
        maxlength="50"
        autocomplete="off"
        :aria-expanded="opened"
        :aria-controls="panelId"
        @focus="focus"
        @keydown.down.prevent="focusFirst"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown.enter="onSearchKeydown"
      />
      <input ref="imageInput" type="file" hidden accept="image/jpeg,image/png,image/webp" @change="imageSearch" />
      <button type="button" class="image-search-button" :disabled="imageUploading" :aria-busy="imageUploading" aria-label="上传图片搜索商品" :title="imageUploading ? '正在上传图片…' : '以图搜索商品'" @click="user.isLoggedIn ? imageInput?.click() : router.push({path:'/auth/login',query:{redirect:route.fullPath}})"><Icon :icon="imageUploading ? 'lucide:loader-circle' : 'lucide:camera'" :class="{ 'animate-spin motion-reduce:animate-none': imageUploading }" aria-hidden="true" /></button>
      <button type="submit" class="search-btn" aria-label="搜索">
        <span>搜索</span>
        <UmIcon name="search" />
      </button>
    </form>
    <div v-if="opened" :id="panelId" class="search-panel" aria-label="搜索建议">
      <template v-if="kw.trim()">
        <p v-if="suggesting" role="status">正在读取联想…</p>
        <p v-else-if="suggestionError" role="alert">{{ suggestionError }} <button type="button" @click="scheduleSuggestions">重试</button></p>
        <p v-else-if="!suggestions.length">暂无联想，可直接搜索</p>
        <button v-for="item in suggestions" :key="item.keyword + ':' + item.productId" data-search-choice type="button" class="suggestion" @click="submit(item.keyword)">{{ item.keyword }}</button>
      </template>
      <template v-else>
        <p v-if="publicLoading" role="status">正在读取推荐词…</p>
        <p v-if="publicError" role="alert">{{ publicError }} <button type="button" @click="loadPublic">重试</button></p>
        <section><h3>运营推荐</h3><div class="search-choices"><button v-for="item in promotions" :key="item.keyword + ':' + item.productId" data-search-choice type="button" @click="submit(item.keyword)">{{ item.keyword }}</button><span v-if="!publicLoading && !promotions.length">暂无推荐</span></div></section>
        <section><h3>今日热搜 <small>UTC 当日</small></h3><div class="search-choices"><button v-for="(item, index) in hot" :key="item.keyword + ':' + item.productId" data-search-choice type="button" @click="submit(item.keyword)">{{ index + 1 }}. {{ item.keyword }}</button><span v-if="!publicLoading && !hot.length">暂无热搜</span></div></section>
        <section><h3>搜索历史 <button v-if="history.length" type="button" @click="saveHistory([])">清空</button></h3><p v-if="historyError" role="status">{{ historyError }}</p><div class="search-choices"><span v-for="item in history" :key="item" class="history-choice"><button data-search-choice type="button" @click="submit(item)">{{ item }}</button><button type="button" :aria-label="'删除搜索历史：' + item" @click="saveHistory(history.filter(value => value !== item))">×</button></span><span v-if="!history.length">暂无搜索历史</span></div></section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.search-wrap { position:relative; width:100%; min-width:0; }
.search-bar .image-search-button { display:grid; place-items:center; flex-shrink:0; width:42px; min-width:42px; padding:0; }
.search-wrap .search-bar > .image-search-button { margin-right:16px !important; background:transparent !important; color:var(--muted) !important; border:0; box-shadow:none; transition:color .15s; }
.search-wrap .search-bar > .image-search-button:hover:not(:disabled),.search-wrap .search-bar > .image-search-button:focus-visible { color:var(--green) !important; }
.search-bar .image-search-button > svg { display:block; width:24px; height:24px; }
.search-bar .image-search-button:focus-visible { outline:2px solid var(--green); outline-offset:-2px; }
.search-panel { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:60; max-height:65dvh; overflow:auto; padding:16px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); box-shadow:var(--shadow); font-size:14px; }
.search-panel section + section { margin-top:16px; }
.search-panel h3 { display:flex; align-items:center; gap:8px; margin:0 0 8px; font-size:14px; }
.search-panel h3 > button { margin-left:auto; }
.search-panel small,.search-choices > span:not(.history-choice) { color:var(--muted); }
.search-choices { display:flex; flex-wrap:wrap; gap:8px; }
.search-choices button,.suggestion { min-height:44px; padding:8px 10px; text-align:left; border-radius:4px; }
.search-choices > button,.history-choice { border:1px solid var(--line); border-radius:4px; }
.suggestion { display:block; width:100%; }
.search-panel button:hover { background:var(--line); }
.search-panel button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.search-wrap .search-bar.search-box:focus-within { border-color:var(--green); }
.search-bar .search-input:focus-visible { outline:none; }
.search-bar .search-btn:focus-visible { outline:2px solid var(--green); outline-offset:-2px; }
</style>
