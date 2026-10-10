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
const mouseRatio = ref({ x: 0.5, y: 0.5 });
const zoomScale = 4;
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
const canZoom = computed(() => hasRealImages.value && mainUrl.value !== PRODUCT_IMAGE_PLACEHOLDER);
const zoomPosition = computed(() => {
  const halfLens = 1 / zoomScale / 2;
  return {
    x: (mouseRatio.value.x - halfLens) / (1 - 2 * halfLens) * 100,
    y: (mouseRatio.value.y - halfLens) / (1 - 2 * halfLens) * 100
  };
});

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
  const halfLens = 1 / zoomScale / 2;
  mouseRatio.value = {
    x: Math.max(halfLens, Math.min(1 - halfLens, x)),
    y: Math.max(halfLens, Math.min(1 - halfLens, y))
  };
}

function onEnter(e: MouseEvent) {
  onMove(e);
  hovering.value = canZoom.value;
}
</script>

<template>
  <div class="gallery">
    <div
      ref="containerRef"
      class="main-wrap"
      @mouseenter="onEnter"
      @mouseleave="hovering = false"
      @mousemove="onMove"
    >
      <img :src="mainUrl" alt="商品图片" class="main-img" @error="onImageError(list[activeIdx]?.url || list[0]?.url)" />
      <div v-if="hovering && canZoom" class="lens" :style="{
        left: mouseRatio.x * 100 + '%',
        top: mouseRatio.y * 100 + '%',
        width: 100 / zoomScale + '%',
        height: 100 / zoomScale + '%'
      }" />
    </div>
    <div v-if="hovering && canZoom" class="zoom-pane" :style="{
      backgroundImage: `url(${mainUrl})`,
      backgroundSize: `${zoomScale * 100}%`,
      backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`
    }" aria-hidden="true" />
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
  width: 100%;
  max-width: 560px;
  position: relative;
}
.main-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
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
  background: rgba(var(--yb-primary-rgb), 0.12);
  border: 1px solid rgba(var(--yb-primary-rgb), 0.6);
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.zoom-pane {
  position: absolute;
  top: 0;
  left: calc(100% + 12px);
  width: 100%;
  aspect-ratio: 1;
  background-repeat: no-repeat;
  border: 1px solid var(--yb-hairline);
  border-radius: 6px;
  background-color: var(--yb-surface);
  z-index: 5;
  pointer-events: none;
}
.thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 3px;
}
.thumb {
  width: 64px;
  height: 64px;
  border: 1px solid var(--yb-hairline);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: var(--yb-surface);
  flex: 0 0 auto;
}
.thumb.active {
  border-color: var(--bw-brand-primary);
}
.thumb:focus-visible { outline: 2px solid var(--yb-primary); outline-offset: 1px; }
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 1024px) { .zoom-pane { left: 0; pointer-events: none; } }
</style>
