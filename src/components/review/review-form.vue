<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import ReviewStars from '@/components/common/review-stars.vue';
import { uploadFile } from '@/service/api/product';

interface FormState {
  productScore: number;
  sellerScore: number;
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
const MAX_PHOTOS = 9;

const form = reactive<FormState>({
  productScore: props.initial?.productScore ?? 5,
  sellerScore: props.initial?.sellerScore ?? 5,
  content: props.initial?.content ?? '',
  tags: props.initial?.tags ?? [],
  photoUrls: props.initial?.photoUrls ?? []
});

const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
let uploadVersion = 0;

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

function choosePhoto() {
  if (!uploading.value && form.photoUrls.length < MAX_PHOTOS) fileInputRef.value?.click();
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    Message.warning('请选择图片文件');
    return;
  }
  const operation = ++uploadVersion;
  uploading.value = true;
  try {
    const uploaded = await uploadFile(file, 'REVIEW');
    if (operation !== uploadVersion) return;
    if (!uploaded.url) throw new Error('上传结果缺少图片地址');
    form.photoUrls.push(uploaded.url);
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '评价图片上传失败');
  } finally {
    if (operation === uploadVersion) uploading.value = false;
  }
}

onBeforeUnmount(() => {
  uploadVersion += 1;
});

function removePhoto(idx: number) {
  form.photoUrls.splice(idx, 1);
}

const canSubmit = computed(() => form.productScore > 0 && form.sellerScore > 0 && form.content.length <= 1000);

const scoreLabel = computed(() => {
  if (form.productScore >= 4) return '👍 好评';
  if (form.productScore === 3) return '🙂 中评';
  return '👎 差评';
});

function submit() {
  if (!canSubmit.value) {
      Message.warning('请完善商品和买手服务评分，评价内容不能超过 1000 字');
    return;
  }
  emit('submit', { ...form });
}
</script>

<template>
  <a-card class="review-form" :body-style="{ padding: '24px 28px' }" :bordered="false">
    <div class="row">
      <span class="lbl">商品评分</span>
      <ReviewStars v-model:score="form.productScore" mode="input" size="lg" />
      <span class="score-label">{{ scoreLabel }}</span>
    </div>

    <div class="row">
      <span class="lbl">买手服务</span>
      <ReviewStars v-model:score="form.sellerScore" mode="input" size="lg" />
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
        :max-length="1000"
        show-word-limit
        placeholder="说说商品如何（选填，最多 1000 字）"
        :rows="4"
      />
    </div>

    <div class="row col">
      <span class="lbl">图片（可选，最多 {{ MAX_PHOTOS }} 张）</span>
      <input ref="fileInputRef" class="file-input" type="file" accept="image/*" @change="onPhotoSelected" />
      <div class="photos">
        <div v-for="(u, i) in form.photoUrls" :key="u" class="photo-item">
          <img :src="u" :alt="`评价图片 ${i + 1}`" />
          <button class="remove" type="button" :aria-label="`删除评价图片 ${i + 1}`" :title="`删除评价图片 ${i + 1}`" @click="removePhoto(i)">✕</button>
        </div>
        <button
          v-if="form.photoUrls.length < MAX_PHOTOS"
          class="add"
          type="button"
          aria-label="上传评价图片"
          :disabled="uploading"
          @click="choosePhoto"
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
.file-input { display: none; }
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
.remove:focus-visible,
.add:focus-visible {
  outline: 2px solid var(--bw-brand-primary);
  outline-offset: 2px;
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
