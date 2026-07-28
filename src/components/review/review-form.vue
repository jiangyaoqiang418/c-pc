<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import ReviewStars from '@/components/common/review-stars.vue';

interface FormState {
  score: number;
  content: string;
  tags: string[];
  photoUrls: string[];
}

interface Props {
  initial?: Partial<FormState>;
  submitting?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'submit', f: FormState): void }>();

const PRESET_TAGS = ['发货快', '描述相符', '正品保证', '包装精美', '服务好', '会回购'];
const MAX_PHOTOS = 4;

const form = reactive<FormState>({
  score: props.initial?.score ?? 5,
  content: props.initial?.content ?? '',
  tags: props.initial?.tags ?? [],
  photoUrls: props.initial?.photoUrls ?? []
});

const uploading = ref(false);

function toggleTag(t: string) {
  const idx = form.tags.indexOf(t);
  if (idx >= 0) form.tags.splice(idx, 1);
  else {
    if (form.tags.length >= 3) {
      Message.warning('最多选择 3 个标签');
      return;
    }
    form.tags.push(t);
  }
}

async function addPhoto() {
  if (form.photoUrls.length >= MAX_PHOTOS) return;
  uploading.value = true;
  try {
    await new Promise(r => setTimeout(r, 600));
    form.photoUrls.push(`https://picsum.photos/seed/rv-${Date.now()}-${form.photoUrls.length}/240/240`);
  } finally {
    uploading.value = false;
  }
}

function removePhoto(idx: number) {
  form.photoUrls.splice(idx, 1);
}

const canSubmit = computed(() => form.content.trim().length >= 5 && form.score > 0);

const scoreLabel = computed(() => {
  if (form.score >= 4) return '👍 好评';
  if (form.score === 3) return '🙂 中评';
  return '👎 差评';
});

function submit() {
  if (!canSubmit.value) {
    Message.warning('请完善评分与文字（≥ 5 字）');
    return;
  }
  emit('submit', { ...form });
}
</script>

<template>
  <a-card class="review-form" :body-style="{ padding: '24px 28px' }" :bordered="false">
    <div class="row">
      <span class="lbl">综合评分</span>
      <ReviewStars v-model:score="form.score" mode="input" size="lg" />
      <span class="score-label">{{ scoreLabel }}</span>
    </div>

    <div class="row">
      <span class="lbl">推荐标签</span>
      <div class="tags">
        <a-tag
          v-for="t in PRESET_TAGS"
          :key="t"
          :checked="form.tags.includes(t)"
          checkable
          @check="() => toggleTag(t)"
        >
          {{ t }}
        </a-tag>
      </div>
      <span class="hint">最多 3 个</span>
    </div>

    <div class="row col">
      <span class="lbl">评价内容</span>
      <a-textarea
        v-model="form.content"
        :max-length="500"
        show-word-limit
        placeholder="说说商品如何，至少 5 字"
        :rows="4"
      />
    </div>

    <div class="row col">
      <span class="lbl">图片（可选，最多 {{ MAX_PHOTOS }} 张）</span>
      <div class="photos">
        <div v-for="(u, i) in form.photoUrls" :key="u" class="photo-item">
          <img :src="u" :alt="'photo-' + i" />
          <button class="remove" @click="removePhoto(i)">✕</button>
        </div>
        <button
          v-if="form.photoUrls.length < MAX_PHOTOS"
          class="add"
          :disabled="uploading"
          @click="addPhoto"
        >
          {{ uploading ? '上传中…' : '+ 上传' }}
        </button>
      </div>
    </div>

    <div class="actions">
      <a-button type="primary" size="large" :disabled="!canSubmit" :loading="submitting" @click="submit">
        提交评价
      </a-button>
    </div>
  </a-card>
</template>

<style scoped>
.review-form {
  background: #fff;
  border-radius: var(--bw-card-radius);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.row.col {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.lbl {
  width: 88px;
  color: #4e5969;
  font-size: 13px;
}
.score-label {
  font-size: 14px;
  font-weight: 500;
  color: #4e5969;
  margin-left: 12px;
}
.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hint {
  color: #86909c;
  font-size: 12px;
  margin-left: 8px;
}
.photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
}
.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.remove {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 10px;
}
.add {
  width: 80px;
  height: 80px;
  background: #f7f8fa;
  border: 1px dashed #c9cdd4;
  border-radius: 4px;
  color: #86909c;
  cursor: pointer;
  font-size: 12px;
}
.add:hover {
  border-color: var(--bw-brand-primary);
  color: var(--bw-brand-primary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
