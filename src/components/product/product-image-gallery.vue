<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PRODUCT_IMAGE_PLACEHOLDER } from '@/utils/image-placeholder';

interface Props {
  images: Api.Product.ProductMedia[];
  fallbackSeed?: string | number;
}
const props = defineProps<Props>();

const activeIdx = ref(0);
const hovering = ref(false);
const mouseRatio = ref({ x: 0, y: 0 });
const containerRef = ref<HTMLDivElement>();
const failedUrls = ref(new Set<string>());

const list = computed<Api.Product.ProductMedia[]>(() => {
  if (props.images?.length) return props.images;
  return [
    { url: PRODUCT_IMAGE_PLACEHOLDER, name: '暂无商品图片', type: 'image' as const, sort: 0 }
  ];
});

const hasRealImages = computed(() => Boolean(props.images?.length));

const imageSource = (url?: string) => url && !failedUrls.value.has(url) ? url : PRODUCT_IMAGE_PLACEHOLDER;
const mainUrl = computed(() => imageSource(list.value[activeIdx.value]?.url || list.value[0]?.url));

watch(
  () => props.images?.map(image => `${image.url}:${image.sort}`).join('|') || '',
  () => {
    activeIdx.value = 0;
    hovering.value = false;
    failedUrls.value = new Set();
  }
);

function onImageError(url?: string) {
  if (!url || failedUrls.value.has(url)) return;
  failedUrls.value = new Set(failedUrls.value).add(url);
}

function onMove(e: MouseEvent) {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  mouseRatio.value = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
</script>

<template>
  <div class="gallery">
    <div
      ref="containerRef"
      class="main-wrap"
      @mouseenter="hasRealImages && (hovering = true)"
      @mouseleave="hovering = false"
      @mousemove="onMove"
    >
      <img :src="mainUrl" alt="商品图片" class="main-img" @error="onImageError(list[activeIdx]?.url || list[0]?.url)" />
      <div v-if="hovering && hasRealImages" class="lens" :style="{
        left: mouseRatio.x * 100 + '%',
        top: mouseRatio.y * 100 + '%'
      }" />
      <div v-if="hovering && hasRealImages" class="zoom-pane" :style="{
        backgroundImage: `url(${mainUrl})`,
        backgroundPosition: `${mouseRatio.x * 100}% ${mouseRatio.y * 100}%`
      }" />
    </div>
    <div class="thumbs">
      <div
        v-for="(img, i) in list"
        :key="img.url"
        class="thumb"
        :class="{ active: activeIdx === i }"
        role="button"
        tabindex="0"
        :aria-label="`查看商品图片 ${i + 1}`"
        :aria-current="activeIdx === i ? 'true' : undefined"
        @mouseenter="activeIdx = i"
        @click="activeIdx = i"
        @keydown.enter="activeIdx = i"
        @keydown.space.prevent="activeIdx = i"
      >
        <img :src="imageSource(img.url)" :alt="img.name" @error="onImageError(img.url)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 480px;
  position: relative;
}
.main-wrap {
  position: relative;
  width: 480px;
  height: 480px;
  background: #fff;
  border: 1px solid #f2f3f5;
  border-radius: 6px;
  overflow: hidden;
  cursor: crosshair;
}
.main-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.lens {
  position: absolute;
  width: 200px;
  height: 200px;
  background: rgba(22, 93, 255, 0.12);
  border: 1px solid rgba(22, 93, 255, 0.6);
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.zoom-pane {
  position: absolute;
  top: 0;
  left: calc(100% + 12px);
  width: 480px;
  height: 480px;
  background-size: 240%;
  background-repeat: no-repeat;
  border: 1px solid #f2f3f5;
  border-radius: 6px;
  background-color: #fff;
  z-index: 5;
  pointer-events: none;
}
.thumbs {
  display: flex;
  gap: 8px;
}
.thumb {
  width: 64px;
  height: 64px;
  border: 1px solid #f2f3f5;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  flex: 0 0 auto;
}
.thumb.active {
  border-color: var(--bw-brand-primary);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
