<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BusinessDialog from '@/components/common/business-dialog.vue';
import { useUserStore } from '@/stores/user';
import { createReviewComment, createReviewReport, deleteReviewComment, fetchReviewComments, isReviewWriteRejected } from '@/service/api/review';
import { Modal } from '@/lib/feedback';
import { createLatestRequestGuard } from '@/utils/latest-request';
import { formatDateValue } from '@/utils/date-range';

const props = defineProps<{ review?: Api.RealReview.ReviewDTO; mode: 'comments' | 'report' }>();
const emit = defineEmits<{ close: [] }>();
const user = useUserStore();
const route = useRoute();
const router = useRouter();
const rows = ref<Api.RealReview.Comment[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const sending = ref(false);
const error = ref('');
const notice = ref('');
const content = ref('');
const reason = ref('');
const parent = ref<Api.RealReview.Comment>();
const reporting = ref(false);
const target = ref<Api.RealReview.Comment>();
const uncertain = ref(new Set<string>());
const unknown = computed(() => !!props.review && uncertain.value.has(String(props.review.reviewId)));
const context = () => `${user.currentUser?.id}:${user.sessionVersion}:${props.review?.reviewId}`;
const reads = createLatestRequestGuard(context);
let version = 0;
let deleteConfirmation: ReturnType<typeof Modal.confirm> | undefined;

function closeDeleteConfirmation() { deleteConfirmation?.close(); deleteConfirmation = undefined; }
function canDelete(row: Api.RealReview.Comment) {
  return !!props.review && user.isLoggedIn && !user.initializing && !sending.value && !loading.value
    && row.canDelete === true && rows.value.some(item => item.id === row.id && item.canDelete === true);
}
function requestDelete(row: Api.RealReview.Comment) {
  if (!canDelete(row)) return;
  closeDeleteConfirmation();
  const owner = context(), openedVersion = version;
  deleteConfirmation = Modal.confirm({
    title: '删除评论', content: '确认删除这条评论？已有回复会保留。', okText: '删除',
    okButtonProps: { status: 'danger' },
    onBeforeOk: async () => {
      if (owner !== context() || openedVersion !== version || !canDelete(row)) return;
      const current = ++version;
      const valid = () => current === version && owner === context();
      sending.value = true; error.value = ''; notice.value = '';
      try {
        const id = await deleteReviewComment(row.id);
        if (!valid()) return;
        if (id !== row.id) throw new Error('未收到对应评论的删除结果');
        if (parent.value?.id === row.id) parent.value = undefined;
        if (target.value?.id === row.id) { target.value = undefined; reporting.value = false; reason.value = ''; }
        notice.value = '评论已删除';
        await load();
        if (valid() && !error.value && page.value > 1 && !rows.value.length) {
          await load(Math.max(1, Math.ceil(total.value / 20)));
        }
      } catch (e) {
        if (!valid()) return;
        error.value = e instanceof Error ? e.message : '删除失败';
        if (!isReviewWriteRejected(e)) error.value += '；删除结果待核实，请刷新评论确认，勿重复操作。';
      } finally { if (valid()) sending.value = false; }
    },
    onClose: () => { deleteConfirmation = undefined; }
  });
}

function login() { void router.push({ path: '/auth/login', query: { redirect: route.fullPath } }); }
async function load(next = page.value) {
  if (!props.review) return;
  const current = reads.begin(); loading.value = true; error.value = ''; rows.value = [];
  try {
    const result = await fetchReviewComments(props.review.reviewId, next, current.signal);
    if (!current()) return;
    rows.value = result.records; total.value = result.total; page.value = next;
  } catch (e) { if (current()) { error.value = e instanceof Error ? e.message : '评论读取失败'; total.value = 0; } }
  finally { if (current()) loading.value = false; }
}
function report(comment?: Api.RealReview.Comment) {
  if (sending.value) return;
  target.value = comment; reason.value = ''; reporting.value = true; error.value = ''; notice.value = '';
}
async function submit() {
  if (!props.review || sending.value || !user.isLoggedIn || user.initializing) return;
  const value = (reporting.value ? reason.value : content.value).trim();
  if (!value || value.length > (reporting.value ? 500 : 1000) || (!reporting.value && unknown.value)) return;
  const current = ++version, owner = context(), reviewId = props.review.reviewId, isReport = reporting.value;
  const valid = () => current === version && owner === context();
  sending.value = true; error.value = ''; notice.value = '';
  try {
    const id = isReport ? await createReviewReport({ reviewId, commentId: target.value?.id, reason: value })
      : await createReviewComment({ reviewId, parentId: parent.value?.id, content: value });
    if (!valid()) return;
    if (typeof id !== 'string' || !id) throw new Error('未收到可核对的提交编号');
    if (isReport) { notice.value = '举报已提交'; reason.value = ''; reporting.value = false; }
    else { notice.value = '评论已提交'; content.value = ''; parent.value = undefined; }
    await load();
  } catch (e) {
    if (!valid()) return;
    error.value = e instanceof Error ? e.message : '提交失败';
    const rejected = isReviewWriteRejected(e);
    if (!isReport && !rejected) {
      uncertain.value.add(String(reviewId));
      error.value += '；提交结果待核实，请先刷新评论，勿重复发送。';
    }
  } finally { if (valid()) sending.value = false; }
}
watch([() => props.review?.reviewId, () => props.mode], () => {
  closeDeleteConfirmation();
  version++; reads.invalidate(); rows.value = []; total.value = 0; page.value = 1; content.value = ''; reason.value = '';
  parent.value = undefined; target.value = undefined; error.value = ''; notice.value = ''; sending.value = false;
  reporting.value = props.mode === 'report';
  if (props.review) void load();
}, { immediate: true, flush: 'sync' });
watch([() => user.sessionVersion, () => user.currentUser?.id], () => {
  closeDeleteConfirmation();
  version++; reads.invalidate(); uncertain.value.clear(); content.value = ''; reason.value = ''; rows.value = []; emit('close');
}, { flush: 'sync' });
onBeforeUnmount(() => { closeDeleteConfirmation(); version++; reads.invalidate(); });
</script>

<template>
  <BusinessDialog :visible="!!review" title="评价评论与举报" :width="680" :footer="false" :closable="!sending" :mask-closable="!sending" :esc-to-close="!sending" @update:visible="value => { if (!value) emit('close'); }">
    <div class="discussion">
      <p class="review-context">{{ review?.content }}</p>
      <div class="discussion-actions"><button class="outline" type="button" :disabled="sending" @click="reporting = false">评论</button><button class="text-link" type="button" :disabled="sending" @click="report()">举报评价</button><button class="text-link" type="button" :disabled="loading || sending" @click="load()">刷新评论</button></div>
      <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">正在读取评论…</p>
      <ol v-else class="comment-list">
        <li v-for="row in rows" :key="row.id"><div><strong>{{ row.authorName || '用户' }}</strong> <time>{{ formatDateValue(row.createdAt, true) }}</time></div><small v-if="row.parentId">{{ rows.some(item => item.id === row.parentId) ? '回复评论' : '回复评论（原评论不在当前页或已不可见）' }}</small><p>{{ row.content }}</p><div class="discussion-actions"><button type="button" class="text-link" :disabled="sending || unknown" @click="parent = row; reporting = false">回复</button><button type="button" class="text-link" :disabled="sending" @click="report(row)">举报评论</button><button v-if="user.isLoggedIn && row.canDelete === true" type="button" class="text-link" :disabled="sending || loading || user.initializing" @click="requestDelete(row)">删除评论</button></div></li>
      </ol>
      <p v-if="!loading && !error && !rows.length">暂无评论</p>
      <div class="discussion-actions"><button class="outline" type="button" :disabled="page <= 1 || loading || sending" @click="load(page - 1)">上一页</button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</span><button class="outline" type="button" :disabled="page * 20 >= total || loading || sending" @click="load(page + 1)">下一页</button></div>
      <p v-if="!user.isLoggedIn"><button type="button" class="text-link" @click="login">登录后发表评论或举报</button></p>
      <form v-else @submit.prevent="submit">
        <fieldset :disabled="sending || user.initializing">
          <template v-if="reporting"><label for="discussion-reason">{{ target ? '举报评论' : '举报评价' }}的原因（仅审核人员可见）</label><textarea id="discussion-reason" v-model="reason" maxlength="500" rows="3" required /><small>{{ reason.length }}/500</small></template>
          <template v-else><label for="discussion-content">{{ parent ? '回复 ' + parent.authorName : '发表评论' }}</label><button v-if="parent" type="button" class="text-link" @click="parent = undefined">取消回复</button><textarea id="discussion-content" v-model="content" :disabled="unknown" maxlength="1000" rows="3" required /><small>{{ content.length }}/1000</small><p v-if="unknown">上次评论提交结果待核实。<button type="button" class="text-link" @click="uncertain.delete(String(review?.reviewId))">我已核对评论列表，继续编辑</button></p></template>
          <button class="primary" type="submit" :disabled="sending || (!reporting && unknown) || !(reporting ? reason : content).trim()">{{ sending ? '提交中…' : reporting ? '提交举报' : '提交评论' }}</button>
        </fieldset>
      </form>
    </div>
  </BusinessDialog>
</template>

<style scoped>
.discussion { display:grid; gap:14px; }
.review-context,.comment-list p { white-space:pre-wrap; overflow-wrap:anywhere; }
.review-context { max-height:120px; overflow:auto; color:var(--muted); }
.comment-list { list-style:none; margin:0; padding:0; max-height:35dvh; overflow:auto; }
.comment-list li { border-bottom:1px solid var(--line); padding:12px 0; }
.comment-list time,.comment-list small { color:var(--muted); font-size:12px; }
.discussion-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.discussion button { min-height:44px; }
.discussion fieldset { display:grid; gap:8px; padding:0; border:0; }
.discussion textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px; background:var(--paper); color:var(--ink); }
.discussion button:focus-visible,.discussion textarea:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
</style>
