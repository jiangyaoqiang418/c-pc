<script setup lang="ts">
import { computed } from 'vue';
import { Image as KImage, useImage } from 'vue-konva';
const props = defineProps<{ node: Api.DetailStudio.Node; background: string; draggable: boolean }>();
const [image] = useImage(computed(() => props.node.src || ''), 'anonymous');
const rendered = computed(() => {
  if (!image.value) return;
  const n = props.node; const source = image.value;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(n.width)); canvas.height = Math.max(1, Math.round(n.height));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, (n.cropX || 0) * source.width, (n.cropY || 0) * source.height, (n.cropWidth || 1) * source.width, (n.cropHeight || 1) * source.height, 0, 0, canvas.width, canvas.height);
  if (n.edgeFade) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, props.background); gradient.addColorStop(n.edgeFade, props.background + '00');
    gradient.addColorStop(1 - n.edgeFade, props.background + '00'); gradient.addColorStop(1, props.background);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
});
// Crop ratios are already applied to rendered; Konva crop sizes are pixels, not ratios.
const config = computed(() => ({ ...props.node, id: props.node.id, image: rendered.value, cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0, draggable: props.draggable }));
</script>
<template><KImage :config="config" /></template>
