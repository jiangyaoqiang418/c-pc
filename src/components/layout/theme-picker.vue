<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import { useUiTheme, type UiTheme } from '@/composables/use-ui-theme';
import UmIcon from '@/components/common/um-icon.vue';
import { useUmScrollRail } from '@/composables/use-um-scroll-rail';

const route = useRoute();
const { currentTheme, themes, setTheme } = useUiTheme();
const open = ref(false);
const family = ref('全部');
const sourcesOpen = ref(false);
const panel = ref<InstanceType<typeof DialogContent>>();
const familyRail = ref<HTMLElement>();
const rail = useUmScrollRail(familyRail);
const families = ['全部', 'Web3', '经典', '自然', '都市', '柔和'];
const selected = computed(() => themes.find(theme => theme.id === currentTheme.value) ?? themes[0]);
const shownThemes = computed(() => themes.filter(theme => family.value === '全部' || theme.family === family.value));
watch(open, value => { if (value) { family.value = '全部'; sourcesOpen.value = false; } });
watch(() => route.fullPath, () => { open.value = false; });
function syncSources(event: Event) { sourcesOpen.value = (event.currentTarget as HTMLDetailsElement).open; }
function selectTheme(value: string) { if (themes.some(theme => theme.id === value)) setTheme(value as UiTheme); }
function focusSelected(event: Event) {
  event.preventDefault();
  void nextTick(() => { panel.value?.$el?.querySelector('.theme-option[aria-pressed="true"]')?.focus(); });
}
</script>

<template>
  <div class="theme-switcher">
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child><button type="button" class="theme-trigger" aria-label="切换界面配色" :title="`当前配色：${selected.label}`"><span class="theme-trigger-mark" aria-hidden="true" /><span class="theme-trigger-label">配色</span></button></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="theme-backdrop" />
      <DialogContent ref="panel" as="section" class="theme-panel" aria-label="界面配色方案" @open-auto-focus="focusSelected">
        <div class="theme-panel-heading"><DialogTitle as="h2">选一套喜欢的配色</DialogTitle><DialogClose as-child><button type="button" aria-label="关闭配色面板"><UmIcon name="close" /></button></DialogClose></div>
        <DialogDescription class="theme-panel-intro">{{ themes.length }} 套配色 · 即时预览 · 自动记住选择</DialogDescription>
        <div class="theme-rail-host"><div ref="familyRail" class="theme-families" :class="{ 'drag-scroll-overflow': rail.overflow.value, 'is-dragging': rail.isDragging.value }" role="group" aria-label="配色分组" data-um-rail :tabindex="rail.overflow.value ? 0 : undefined" @scroll.passive="rail.update" @pointerdown="rail.onPointerdown" @pointermove="rail.onPointermove" @pointerup="rail.onPointerend" @pointercancel="rail.onPointerend" @lostpointercapture="rail.onPointerend" @click.capture="rail.onClickCapture" @dragstart="rail.onDragStart" @keydown="rail.onKeydown"><button v-for="item in families" :key="item" type="button" :aria-pressed="family === item" @click="family = item">{{ item }}<small>{{ item === '全部' ? themes.length : themes.filter(theme => theme.family === item).length }}</small></button></div><div v-if="rail.overflow.value" class="edge-scroll-layer edge-scroll-compact"><button type="button" class="edge-scroll-button edge-scroll-prev" :disabled="!rail.canPrev.value" aria-label="向左滑动" @click="rail.step(-1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><button type="button" class="edge-scroll-button edge-scroll-next" :disabled="!rail.canNext.value" aria-label="向右滑动" @click="rail.step(1)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div></div>
        <div class="theme-options"><button v-for="theme in shownThemes" :key="theme.id" type="button" class="theme-option" :aria-pressed="currentTheme === theme.id" @click="selectTheme(theme.id)"><span class="theme-swatches" aria-hidden="true"><i :style="{ background: theme.primary }" /><i :style="{ background: theme.light }" /><i :style="{ background: theme.bg }" /></span><span><strong>{{ theme.label }}</strong><small>{{ theme.note }}</small></span><span class="theme-selected" aria-hidden="true">{{ currentTheme === theme.id ? '✓' : '' }}</span></button></div>
        <div class="theme-panel-footer"><span role="status">当前：{{ selected.label }}</span><DialogClose as-child><button type="button">查看页面</button></DialogClose></div>
        <details class="theme-panel-sources" :open="sourcesOpen" @toggle="syncSources"><summary>配色参考</summary><template v-if="sourcesOpen"><a href="https://cds.coinbase.com/getting-started/colors" target="_blank" rel="noopener">Coinbase · 明暗语义色彩</a><a href="https://solana.com/branding" target="_blank" rel="noopener">Solana · 官方品牌配色</a><a href="https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale" target="_blank" rel="noopener">Radix · 色阶与使用场景</a><a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html" target="_blank" rel="noopener">WCAG · 文字对比度标准</a><a href="https://www.shopify.com/blog/website-color-schemes" target="_blank" rel="noopener">Shopify · 电商配色案例</a><a href="https://shopify.dev/docs/storefronts/themes/best-practices/design/color-system" target="_blank" rel="noopener">Shopify · 色彩系统设计</a></template></details>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  </div>
</template>

<style scoped>
.theme-panel { position:fixed; right:24px; top:90px; z-index:161; max-width:calc(100vw - 48px); }
.theme-rail-host { position:relative; flex:none; min-width:0; }
.edge-scroll-layer { inset:0 0 4px; }
.theme-backdrop[data-state="open"] { animation:themeFadeIn .15s; } .theme-backdrop[data-state="closed"] { animation:themeFadeOut .15s; }
.theme-panel[data-state="open"] { animation:themePanelIn .15s; } .theme-panel[data-state="closed"] { animation:themePanelOut .15s; }
@keyframes themeFadeIn { from { opacity:0; } to { opacity:1; } } @keyframes themeFadeOut { from { opacity:1; } to { opacity:0; } }
@keyframes themePanelIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } } @keyframes themePanelOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-8px); } }
@media (max-width:700px) { .theme-panel { right:10px; top:50px; max-width:calc(100vw - 20px); } }
@media (prefers-reduced-motion:reduce) { .theme-backdrop[data-state],.theme-panel[data-state] { animation:none; } }
</style>
