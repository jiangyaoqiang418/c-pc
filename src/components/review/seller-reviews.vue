<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { fetchSellerReviews } from '@/service/api/review';
import { formatDateValue } from '@/utils/date-range';
import { setImageFallback } from '@/utils/image-placeholder';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ImagePreview from '@/components/common/image-preview.vue';

const props = defineProps<{ sellerId: string | number }>();
const open = ref(false);
const rows = ref<Api.RealReview.SellerReview[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const images = ref<string[]>([]);
const imageIndex = ref(0);
const preview = ref(false);
let abort: AbortController | undefined;
let version = 0;
async function load() {
  abort?.abort(); abort = new AbortController();
  const current = ++version;
  loading.value = true; error.value = ''; rows.value = [];
  try {
    const result = await fetchSellerReviews(props.sellerId, page.value, abort.signal);
    if (current === version) { rows.value = result.records; total.value = result.total; }
  } catch { if (current === version) error.value = '买手评价读取失败，请重试'; }
  finally { if (current === version) loading.value = false; }
}
watch([open, () => props.sellerId], () => { version++; abort?.abort(); page.value = 1; total.value = 0; rows.value = []; preview.value = false; if (open.value) void load(); });
function turn(delta: number) { page.value += delta; void load(); }
onBeforeUnmount(() => { version++; abort?.abort(); });
</script>

<template>
  <button type="button" class="text-link" @click="open = true">查看买手全部评价</button>
  <Dialog v-model:open="open"><DialogContent class="max-w-2xl"><DialogHeader><DialogTitle>买手评价</DialogTitle><DialogDescription>已发布的成交评价，包含商城商品与求购成交。</DialogDescription></DialogHeader><div class="seller-reviews" :aria-busy="loading"><p v-if="loading" role="status">正在读取评价…</p><p v-else-if="error" role="alert">{{ error }} <button type="button" class="text-link" @click="load">重试</button></p><p v-else-if="!rows.length">暂无已发布评价</p><article v-for="row in rows" :key="row.reviewId"><header><b>{{ row.authorName || '顾客' }}</b><time>{{ formatDateValue(row.createdAt) }}</time></header><p class="muted">{{ row.productId ? '商城商品评价' : '求购成交评价' }} · {{ row.productTitle }}</p><p>商品 {{ row.productScore }}/5 · 买手服务 {{ row.sellerScore }}/5</p><p class="content">{{ row.content || '未填写评价内容' }}</p><div class="photos"><button v-for="(url,index) in row.images" :key="url" type="button" :aria-label="`查看评价图片 ${index+1}`" @click="images = row.images; imageIndex = index; preview = true"><img :src="url" alt="评价图片" @error="setImageFallback" /></button></div><p v-if="row.replyContent" class="reply">买手回复：{{ row.replyContent }}</p></article></div><div class="pager"><button type="button" class="text-link" :disabled="loading || page <= 1" @click="turn(-1)">上一页</button><span>第 {{ page }} 页 · 共 {{ total }} 条</span><button type="button" class="text-link" :disabled="loading || page * 10 >= total" @click="turn(1)">下一页</button></div></DialogContent></Dialog>
  <ImagePreview v-model="preview" :images="images" :start-index="imageIndex" />
</template>

<style scoped>
.seller-reviews{max-height:65vh;overflow:auto;min-height:120px}.seller-reviews article{padding:18px 0;border-bottom:1px solid var(--line);display:grid;gap:10px}.seller-reviews header,.pager{display:flex;gap:12px;justify-content:space-between;align-items:center}.seller-reviews time,.muted,.pager{font-size:12px;color:var(--muted)}.content{white-space:pre-wrap;overflow-wrap:anywhere}.photos{display:flex;gap:8px;flex-wrap:wrap}.photos img{width:70px;height:70px;object-fit:cover;border-radius:6px}.reply{padding:12px;background:var(--bg);border-radius:8px}.pager{padding-top:12px}
</style>
