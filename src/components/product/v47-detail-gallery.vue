<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UmIcon from '@/components/common/um-icon.vue';
import V47DetailPreview from './v47-detail-preview.vue';
import { PRODUCT_IMAGE_PLACEHOLDER } from '@/utils/image-placeholder';

const props = defineProps<{ images: Api.Product.ProductMedia[]; title: string; favoriting?: boolean; saved?: boolean; favoriteError?: string }>();
const emit = defineEmits<{ favorite: []; share: [] }>();
const photo = ref(0);
const zoom = ref(false);
const failed = ref(new Set<string>());
const images = computed(() => props.images?.filter(image => image.type === 'image') || []);
const current = computed(() => images.value[photo.value] || images.value[0]);
function source(url?: string) { return url && !failed.value.has(url) ? url : PRODUCT_IMAGE_PLACEHOLDER; }
const canZoom = computed(() => Boolean(current.value?.url && !failed.value.has(current.value.url)));
function imageError(url?: string) { if (url) failed.value = new Set(failed.value).add(url); }
watch(() => props.images, () => { photo.value = 0; zoom.value = false; failed.value = new Set(); });
</script>

<template>
  <section class="gallery">
    <button type="button" class="main-image" :disabled="!canZoom" :aria-label="canZoom ? '放大商品图片' : '暂无商品图片'" @click="zoom = true">
      <img :src="source(current?.url)" :alt="title" @error="imageError(current?.url)" />
      <span v-if="canZoom"><UmIcon name="search" />点击查看大图</span>
    </button>
    <div class="thumbnails">
      <button v-for="(image, index) in images" :key="`${image.url}-${index}`" type="button" :class="{ active: photo === index }" :aria-label="'商品图片 ' + (index + 1)" :aria-pressed="photo === index" @click="photo = index">
        <img :src="source(image.url)" :alt="title + ' ' + (index + 1)" @error="imageError(image.url)" />
      </button>
      <span>每一个细节，都值得认真看。</span>
    </div>
    <div class="gallery-actions">
      <button type="button" :disabled="favoriting" :aria-pressed="saved" :title="favoriteError" @click="emit('favorite')"><UmIcon name="heart" />{{ favoriting ? '正在更新' : favoriteError ? '重试收藏状态' : saved ? '已收藏 · 取消收藏' : '收藏这件好物' }}</button>
      <button type="button" @click="emit('share')"><UmIcon name="globe" />分享</button>
    </div>
    <V47DetailPreview v-model="zoom" :images="images.map(image => image.url)" :start-index="photo" :title="title" />
  </section>
</template>

<style scoped>
.thumbnails { overflow-x:auto; }
.thumbnails button { flex-shrink:0; }
.main-image:disabled { opacity:1; cursor:default; }
@media (prefers-reduced-motion:reduce) { .main-image:hover > img { transform:none; } }
</style>
