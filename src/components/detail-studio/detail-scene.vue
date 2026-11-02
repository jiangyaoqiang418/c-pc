<script setup lang="ts">
import { textLines, nodeTransform } from './scene';
defineProps<{ document: Api.DetailStudio.Document }>();
</script>
<template>
  <div class="detail-scenes">
    <svg v-for="page in document.pages" :key="page.id" xmlns="http://www.w3.org/2000/svg" :viewBox="`0 0 750 ${page.height}`" role="img" aria-label="商品详情设计" :style="{ background: page.background }">
      <g v-for="node in page.nodes" :key="node.id" :transform="nodeTransform(node)">
        <template v-if="node.type === 'image'">
          <svg :width="node.width" :height="node.height" :viewBox="`${node.cropX || 0} ${node.cropY || 0} ${node.cropWidth || 1} ${node.cropHeight || 1}`" preserveAspectRatio="none"><image :href="node.src" width="1" height="1" preserveAspectRatio="none" /></svg>
          <template v-if="node.edgeFade">
            <defs><linearGradient :id="`fade-${page.id}-${node.id}`" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" :stop-color="page.background" /><stop :offset="node.edgeFade" :stop-color="page.background" stop-opacity="0" /><stop :offset="1 - node.edgeFade" :stop-color="page.background" stop-opacity="0" /><stop offset="1" :stop-color="page.background" /></linearGradient></defs>
            <rect :width="node.width" :height="node.height" :fill="`url(#fade-${page.id}-${node.id})`" />
          </template>
        </template>
        <rect v-else-if="node.type === 'rect'" :width="node.width" :height="node.height" :fill="node.fill" rx="16" />
        <polyline v-else-if="node.type === 'path'" :points="node.points?.reduce((out, v, i) => out + (i % 2 ? ',' : ' ') + v, '')" fill="none" :stroke="node.stroke" :stroke-width="node.strokeWidth" stroke-linecap="round" stroke-linejoin="round" />
        <svg v-else :width="node.width" :height="node.height" overflow="hidden"><text :fill="node.fill" :font-size="node.fontSize || 32" font-family="Arial, sans-serif" :text-anchor="node.align === 'center' ? 'middle' : node.align === 'right' ? 'end' : 'start'">
          <tspan v-for="(line, i) in textLines(node)" :key="i" :x="node.align === 'center' ? node.width / 2 : node.align === 'right' ? node.width : 0" :y="(node.fontSize || 32) * (.9 + i * 1.25)">{{ line }}</tspan>
        </text></svg>
      </g>
    </svg>
  </div>
</template>
<style scoped>
.detail-scenes { width:100%; background:transparent; }.detail-scenes > svg { display:block; width:100%; height:auto; overflow:hidden; }
</style>
