<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Stage, Layer, Rect, Text as KText, Line, Transformer } from 'vue-konva';
import type Konva from 'konva';
import CanvasImage from './canvas-image.vue';
import DetailScene from './detail-scene.vue';
import { blankPage, newDocument, palette, parseScene, textLines, uid } from './scene';
import * as api from '@/service/api/detail-studio';
import { uploadFile } from '@/service/api/product';

const props = defineProps<{ loadCapability?: () => Promise<Api.DetailStudio.Capability>; modelValue?: string; revisionId?: string; documentKey?: string; title: string; productImages?: string[]; productParameters?: Api.RealProduct.ProductParameter[]; productContext?: Record<string, unknown>; disabled?: boolean }>();
const emit = defineEmits<{ change: [value: { sourceJson: string; designRevisionId?: string; designDocumentKey: string; description?: string }]; busy: [value: boolean] }>();
const doc = ref(parseScene(props.modelValue) || newDocument());
const documentKey = ref(props.documentKey || uid());
const revision = ref(props.revisionId);
const saved = ref(props.modelValue || '');
const index = ref(0), selectedId = ref(''), tool = ref<'select' | 'draw'>('select');
const page = computed(() => doc.value.pages[index.value] || doc.value.pages[0]);
const selected = computed(() => page.value.nodes.find(n => n.id === selectedId.value));
const history = ref<string[]>([]), future = ref<string[]>([]);
const stage = ref<{ getNode(): Konva.Stage }>(), transformer = ref<{ getNode(): Konva.Transformer }>();
const error = ref(''), busy = ref(false), preview = ref(false), mobile = ref(false);
const canvasHost = ref<HTMLElement>(), scale = ref(.65);
const fileInput = ref<HTMLInputElement>();
let replaceImageId = '';
function chooseImage(replace = false) { replaceImageId = replace ? selectedId.value : ''; fileInput.value?.click(); }
const capability = ref<Api.DetailStudio.Capability>();
const task = ref<Api.DetailStudio.Task | null>();
const taskStatusLabels: Record<Api.DetailStudio.Task['status'], string> = { QUEUED: '排队中', RUNNING: '生成中', COMPLETED: '已完成', FAILED: '暂未完成', CANCELLED: '已中止', PARTIAL: '部分完成，可应用已生成内容', NEEDS_INPUT: '待补充资料' };
const generationMode = ref<'image' | 'mixed'>('image');
const generationTheme = ref<'auto' | 'dark' | 'light' | 'warm'>('auto');
const referenceLinks = ref(''), referenceImages = ref<string[]>([]);
const brief = ref('旗舰店风格，突出商品卖点，简洁清晰。符合品牌设计语言和设计美学'), language = ref('简体中文'), count = ref(4);
const brush = ref('#b9c8ff'), brushSize = ref(8);
const taskMatchesProduct = computed(() => !!task.value && doc.value.generationTask?.id === task.value.id && doc.value.generationTask.documentKey === documentKey.value && doc.value.generationTask.productTitle === props.title.trim());
const referenceSummary = computed(() => {
  if (!taskMatchesProduct.value || !task.value?.resultJson) return '';
  try { const value = JSON.parse(task.value.resultJson).referenceSummary; return typeof value === 'string' ? value : ''; }
  catch { return ''; }
});
let taskEpoch = 0;
const generating = computed(() => taskMatchesProduct.value && task.value && ['QUEUED', 'RUNNING'].includes(task.value.status));
let alive = true, observer: ResizeObserver | undefined, timer: ReturnType<typeof setTimeout> | undefined, drawing: Api.DetailStudio.Node | undefined;
function publish() { emit('change', { sourceJson: JSON.stringify(doc.value), designRevisionId: revision.value, designDocumentKey: documentKey.value }); }
function remember() { history.value.push(JSON.stringify(doc.value)); if (history.value.length > 40) history.value.shift(); future.value = []; }
function mutate(action: () => void) { if (props.disabled || busy.value) return; remember(); action(); publish(); }
function undo() { const previous = history.value.pop(); if (!previous) return; future.value.push(JSON.stringify(doc.value)); doc.value = JSON.parse(previous); selectedId.value = ''; publish(); }
function redo() { const next = future.value.pop(); if (!next) return; history.value.push(JSON.stringify(doc.value)); doc.value = JSON.parse(next); selectedId.value = ''; publish(); }
function addNode(type: Api.DetailStudio.Node['type']) {
  mutate(() => { const n: Api.DetailStudio.Node = { id: uid(), type, x: 55, y: 75, width: 640, height: type === 'text' ? 130 : 240, rotation: 0, fill: palette[doc.value.theme].text, text: '输入商品卖点', fontSize: 42, align: 'left' }; page.value.nodes.push(n); selectedId.value = n.id; });
}
function applyTheme(event: Event) { const theme = (event.target as HTMLSelectElement).value as Api.DetailStudio.Document['theme']; mutate(() => { doc.value.theme = theme; for (const p of doc.value.pages) { p.background = palette[doc.value.theme].background; for (const n of p.nodes) if (n.type === 'text') n.fill = palette[doc.value.theme].text; } }); }
function unifyTransitions() { mutate(() => { for (const p of doc.value.pages) { p.background = palette[doc.value.theme].background; for (const n of p.nodes) { if (n.type === 'image') n.edgeFade = .12; } } }); }
function addPage() { if (doc.value.pages.length >= 12) return; mutate(() => { doc.value.pages.push(blankPage(doc.value.theme)); index.value = doc.value.pages.length - 1; selectedId.value = ''; }); }
function movePage(offset: number) { const to = index.value + offset; if (to < 0 || to >= doc.value.pages.length) return; mutate(() => { const [p] = doc.value.pages.splice(index.value, 1); doc.value.pages.splice(to, 0, p); index.value = to; }); }
function deletePage() { if (doc.value.pages.length < 2) return; mutate(() => { doc.value.pages.splice(index.value, 1); index.value = Math.max(0, index.value - 1); selectedId.value = ''; }); }
function duplicatePage() { if (doc.value.pages.length >= 12) return; mutate(() => { const copy = JSON.parse(JSON.stringify(page.value)) as Api.DetailStudio.Page; copy.id = uid(); copy.nodes.forEach(n => n.id = uid()); doc.value.pages.splice(index.value + 1, 0, copy); index.value++; }); }
function removeNode() { mutate(() => { page.value.nodes = page.value.nodes.filter(n => n.id !== selectedId.value); selectedId.value = ''; }); }
function moveLayer(offset: number) { mutate(() => { const at = page.value.nodes.findIndex(n => n.id === selectedId.value), to = at + offset; if (at < 0 || to < 0 || to >= page.value.nodes.length) return; const [n] = page.value.nodes.splice(at, 1); page.value.nodes.splice(to, 0, n); }); }
function select(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) { if (tool.value === 'draw') return; selectedId.value = event.target.id(); }
function transform(event: Konva.KonvaEventObject<Event>) {
  const target = event.target, node = page.value.nodes.find(n => n.id === target.id()); if (!node) return;
  remember(); node.x = target.x(); node.y = target.y(); node.rotation = target.rotation();
  node.width = Math.max(20, target.width() * target.scaleX()); node.height = Math.max(20, target.height() * target.scaleY()); target.scaleX(1); target.scaleY(1); publish();
}
function pointerDown() {
  if (tool.value !== 'draw' || props.disabled || busy.value) return;
  const point = stage.value?.getNode().getPointerPosition(); if (!point) return;
  remember(); selectedId.value = ''; drawing = { id: uid(), type: 'path', x: 0, y: 0, width: 750, height: page.value.height, rotation: 0, fill: 'none', stroke: brush.value, strokeWidth: brushSize.value, points: [point.x / scale.value, point.y / scale.value] };
  page.value.nodes.push(drawing); drawing = page.value.nodes[page.value.nodes.length - 1];
}
function pointerMove() { if (!drawing) return; const point = stage.value?.getNode().getPointerPosition(); if (point && (drawing.points?.length || 0) < 12000) { drawing.points!.push(point.x / scale.value, point.y / scale.value); doc.value = { ...doc.value }; } }
function pointerUp() { if (drawing) { drawing = undefined; publish(); } }
watch([selectedId, index, tool], async () => { await nextTick(); const target = selectedId.value ? stage.value?.getNode().findOne('#' + selectedId.value) : undefined; transformer.value?.getNode().nodes(target && selected.value?.type !== 'path' && !selected.value?.locked && tool.value === 'select' ? [target] : []); });
watch(() => props.modelValue, value => { if (value && value !== JSON.stringify(doc.value)) { doc.value = parseScene(value)!; index.value = 0; selectedId.value = ''; } });
async function run(action: () => Promise<void>) { if (busy.value || props.disabled) return; busy.value = true; emit('busy', true); error.value = ''; try { await action(); } catch (e) { error.value = e instanceof Error ? e.message : '操作失败'; throw e; } finally { busy.value = false; emit('busy', false); } }
async function upload(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []); (event.target as HTMLInputElement).value = '';
  await run(async () => { remember(); for (const file of (replaceImageId ? files.slice(0, 1) : files)) { const result = await uploadFile(file, 'PRODUCT'); const uploadedImage = new Image(); uploadedImage.src = result.url; await uploadedImage.decode(); const imageHeight = Math.min(page.value.height - 240, 670 * uploadedImage.height / uploadedImage.width); if (!alive) return; const replacing = page.value.nodes.find(n => n.id === replaceImageId); if (replacing) { replacing.src = result.url; replacing.cropX = replacing.cropY = 0; replacing.cropWidth = replacing.cropHeight = 1; continue; } page.value.nodes.push({ id: uid(), type: 'image', x: 40, y: 220, width: Math.min(670, imageHeight * uploadedImage.width / uploadedImage.height), height: imageHeight, rotation: 0, fill: 'transparent', src: result.url }); } publish(); }).catch(() => {});
}
async function uploadReferences(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []);
  (event.target as HTMLInputElement).value = '';
  await run(async () => {
    for (const file of files.slice(0, 3 - referenceImages.value.length)) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('参考图须为 PNG/JPEG/WebP，单张最多8MB');
      const uploaded = await uploadFile(file, 'PRODUCT');
      if (alive) referenceImages.value.push(uploaded.url);
    }
  }).catch(() => {});
}
async function exportDescription(): Promise<string> {
  // Raster output uses the exact same SVG renderer as storefront and preview.
  const host = document.createElement('div'); document.body.appendChild(host);
  const { createApp, h } = await import('vue'); const app = createApp({ render: () => h(DetailScene, { document: doc.value }) });
  host.style.cssText = 'position:fixed;left:-20000px;width:750px'; app.mount(host); await nextTick();
  try {
    const urls: string[] = [];
    for (const svg of Array.from(host.querySelectorAll<SVGSVGElement>('.detail-scenes > svg'))) {
      for (const img of Array.from(svg.querySelectorAll('image'))) {
        const response = await fetch(img.getAttribute('href')!, { mode: 'cors' }); if (!response.ok) throw new Error('图片读取失败，请检查存储跨域配置');
        const blob = await response.blob(); const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); img.setAttribute('href', data);
      }
      svg.setAttribute('width', '750'); svg.setAttribute('height', String(svg.viewBox.baseVal.height));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = svg.viewBox.baseVal.height * 2;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = svg.style.background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('画布导出失败')), 'image/webp', .9));
        const uploaded = await uploadFile(new File([blob], 'detail.webp', { type: 'image/webp' }), 'PRODUCT'); urls.push(uploaded.url);
      } finally { URL.revokeObjectURL(url); }
    }
    return urls.map(url => `<p><img src="${url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" alt="商品详情" /></p>`).join('');
  } finally { app.unmount(); host.remove(); }
}
async function save() {
  if (revision.value && saved.value === JSON.stringify(doc.value)) return revision.value;
  await run(async () => { const description = await exportDescription(); const sourceJson = JSON.stringify(doc.value);
    const result = await api.saveDetailRevision({ documentKey: documentKey.value, parentId: revision.value, sourceJson, description });
    revision.value = result.id; saved.value = sourceJson; emit('change', { sourceJson, designRevisionId: result.id, designDocumentKey: documentKey.value, description });
  }); return revision.value;
}
async function generate(scope: 'all' | 'screen' | 'text' = 'all') {
  if (!capability.value?.enabled || busy.value || props.disabled || generating.value) return;
  if (scope !== 'text' && !props.productImages?.length) { error.value = '请先在商品信息中上传商品实拍图或官方产品图，助手会自动引用，确保外观一致。'; return; }
  const epoch = ++taskEpoch;
  const productTitle = props.title.trim();
  const key = documentKey.value;
  if (timer) clearTimeout(timer);
  task.value = null;
  delete doc.value.generationTask;
  publish();
  await run(async () => { const created = await api.createDetailTask({ requestKey: uid(), inputJson: JSON.stringify({ name: props.title, facts: [JSON.stringify(props.productContext || {}), ...(props.productParameters || []).map(p => `${p.name}：${p.value}${p.explanation ? '（' + p.explanation + '）' : ''}`)].join('\n').slice(0, 18000), brief: brief.value, referenceLinks: referenceLinks.value.split(/\s+/).filter(Boolean).slice(0, 3), referenceImages: referenceImages.value, language: language.value, count: scope === 'all' ? count.value : 1, action: scope === 'text' ? 'edit_text' : 'generate', targetPageId: scope === 'all' ? undefined : page.value.id, targetNodeId: scope === 'text' ? selectedId.value : undefined, currentPage: scope === 'text' ? page.value : undefined, theme: scope === 'all' ? generationTheme.value : doc.value.theme, mode: scope === 'text' ? doc.value.mode : generationMode.value, images: [...new Set(props.productImages || [])].slice(0, 6) }) }); if (!alive || epoch !== taskEpoch) return; doc.value.generationTask = { id: created.id, documentKey: key, productTitle }; task.value = created; publish(); schedulePoll(); }).catch(() => {});
}
function schedulePoll() { if (timer) clearTimeout(timer); if (alive && generating.value) timer = setTimeout(poll, 2000); }
watch(taskMatchesProduct, () => schedulePoll());
async function poll() {
  const id = task.value?.id, epoch = taskEpoch;
  if (!id || !taskMatchesProduct.value) return;
  try { const result = await api.fetchDetailTask(id); if (alive && epoch === taskEpoch && task.value?.id === id && taskMatchesProduct.value) task.value = result; }
  catch { if (alive && epoch === taskEpoch) error.value = '任务进度暂时无法读取，可稍后刷新；后台任务继续执行。'; }
  finally { if (epoch === taskEpoch) schedulePoll(); }
}
async function cancel() {
  const id = task.value?.id, epoch = taskEpoch;
  if (!id || !taskMatchesProduct.value) return;
  try { const result = await api.cancelDetailTask(id); if (alive && epoch === taskEpoch && task.value?.id === id) task.value = result; }
  catch (e) { if (alive && epoch === taskEpoch) error.value = (e as Error).message; }
}
function applyResult() { if (!taskMatchesProduct.value || !task.value?.resultJson) return; const result = parseScene(task.value.resultJson)!; const target = result.targetPageId ? doc.value.pages.findIndex(p => p.id === result.targetPageId) : -1; if (result.targetPageId && target < 0) { error.value = '原画布已删除，未覆盖当前内容。'; return; } mutate(() => { if (target >= 0) { result.pages[0].id = result.targetPageId!; doc.value.pages.splice(target, 1, result.pages[0]); index.value = target; } else { result.generationTask = doc.value.generationTask; doc.value = result; index.value = 0; } selectedId.value = ''; }); }
onMounted(async () => {
  observer = new ResizeObserver(entries => scale.value = Math.min(1, Math.max(.25, (entries[0].contentRect.width - 24) / 750))); if (canvasHost.value) observer.observe(canvasHost.value);
  const epoch = taskEpoch;
  try {
    capability.value = await (props.loadCapability ? props.loadCapability() : api.fetchDetailCapability());
    if (props.revisionId) { const r = await api.fetchDetailRevision(props.revisionId); if (!alive || epoch !== taskEpoch) return; documentKey.value = r.documentKey; }
    const binding = doc.value.generationTask;
    if (capability.value.enabled && binding && binding.documentKey === documentKey.value && binding.productTitle === props.title.trim()) {
      const restored = await api.fetchDetailTask(binding.id);
      if (!alive || epoch !== taskEpoch) return;
      task.value = restored; schedulePoll();
    }
  } catch (e) { if (alive && epoch === taskEpoch) error.value = (e as Error).message; }
});
onBeforeUnmount(() => { alive = false; taskEpoch++; observer?.disconnect(); if (timer) clearTimeout(timer); });
defineExpose({ save });
</script>
<template>
  <div class="studio">
    <header class="studio-header"><div><strong>商品详情设计工作室</strong><small>750px 设计宽度 · 顾客端等比展示 · 源图层可再次编辑</small></div><button type="button" @click="preview = !preview">{{ preview ? '返回编辑' : '预览详情' }}</button><button type="button" :disabled="busy || disabled" @click="save().catch(() => {})">{{ busy ? '正在处理…' : '保存画布' }}</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="controls" :inert="busy || disabled"><label>统一主题 <select :value="doc.theme" :disabled="disabled || busy" @change="applyTheme"><option value="dark">深色科技</option><option value="light">明亮简洁</option><option value="warm">温暖质感</option></select></label><label>展示方式 <select v-model="doc.mode" :disabled="disabled || busy" @change="publish"><option value="mixed">图片＋可读文字</option><option value="image">纯图片</option></select></label><button type="button" @click="mobile = !mobile">{{ mobile ? '切换 PC' : '检查 H5' }}</button><button type="button" @click="unifyTransitions">统一整页衔接</button><span>{{ saved === JSON.stringify(doc) ? '已保存' : '有未保存修改' }}</span></div>
    <div v-if="preview" class="scene-preview" :class="{ mobile }"><DetailScene :document="doc" /></div>
    <div v-else class="workspace" :inert="busy || disabled">
      <aside class="pages"><button v-for="(p, i) in doc.pages" :key="p.id" type="button" :class="{ active: index === i }" @click="index = i; selectedId = ''">{{ String(i + 1).padStart(2, '0') }} / {{ p.height }}px</button><button type="button" @click="addPage">＋ 添加画布</button><button type="button" @click="duplicatePage">复制本屏</button><button type="button" @click="movePage(-1)">上移</button><button type="button" @click="movePage(1)">下移</button><button type="button" @click="deletePage">删除本屏</button></aside>
      <div ref="canvasHost" class="canvas-host"><nav class="tools"><button type="button" @click="tool = 'select'" :class="{ active: tool === 'select' }">选择</button><button type="button" @click="addNode('text')">文字</button><button type="button" @click="chooseImage()">上传图片</button><button type="button" @click="addNode('rect')">色块</button><button type="button" @click="tool = 'draw'" :class="{ active: tool === 'draw' }">画笔</button><button type="button" :disabled="!history.length" @click="undo">撤销</button><button type="button" :disabled="!future.length" @click="redo">重做</button></nav>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="upload" />
        <div :style="{ pointerEvents: disabled || busy ? 'none' : undefined }"><Stage ref="stage" :config="{ width: 750 * scale, height: page.height * scale, scaleX: scale, scaleY: scale }" @mousedown="pointerDown" @mousemove="pointerMove" @mouseup="pointerUp" @mouseleave="pointerUp" @touchstart="pointerDown" @touchmove="pointerMove" @touchend="pointerUp">
          <Layer><Rect :config="{ width: 750, height: page.height, fill: page.background }" @click="selectedId = ''" />
            <template v-for="node in page.nodes" :key="node.id">
              <CanvasImage v-if="node.type === 'image'" :node="node" :background="page.background" :draggable="tool === 'select' && !node.locked" @click="select" @tap="select" @dragend="transform" @transformend="transform" />
              <KText v-else-if="node.type === 'text'" :config="{ ...node, text: textLines(node).join('\n'), fontFamily: 'Arial, sans-serif', wrap: 'none', lineHeight: 1.25, draggable: tool === 'select' && !node.locked }" @click="select" @tap="select" @dragend="transform" @transformend="transform" />
              <Rect v-else-if="node.type === 'rect'" :config="{ ...node, cornerRadius: 16, draggable: tool === 'select' && !node.locked }" @click="select" @tap="select" @dragend="transform" @transformend="transform" />
              <Line v-else :config="{ ...node, lineCap: 'round', lineJoin: 'round', draggable: tool === 'select' && !node.locked }" @click="select" @tap="select" @dragend="transform" />
            </template><Transformer ref="transformer" :config="{ flipEnabled: false }" />
          </Layer>
        </Stage></div>
      </div>
      <aside class="properties"><label>画布高度<input v-model.number="page.height" type="number" min="300" max="2400" step="50" @change="publish" /></label><label>画笔颜色<input v-model="brush" type="color" /></label><label>笔刷粗细<input v-model.number="brushSize" type="range" min="2" max="40" /></label>
        <template v-if="selected"><h4>图层属性</h4><template v-if="selected.type === 'image'"><button type="button" @click="chooseImage(true)">替换图片</button><label>图片上下边缘融合<input :value="selected.edgeFade || 0" type="range" min="0" max="0.2" step="0.01" @focus="remember" @input="selected.edgeFade = Number(($event.target as HTMLInputElement).value); publish()" /></label><label>水平裁剪起点<input v-model.number="selected.cropX" type="range" min="0" :max="1 - (selected.cropWidth || 1)" step="0.01" @change="publish" /></label><label>垂直裁剪起点<input v-model.number="selected.cropY" type="range" min="0" :max="1 - (selected.cropHeight || 1)" step="0.01" @change="publish" /></label><label>保留宽度比例<input :value="selected.cropWidth || 1" type="range" min="0.1" max="1" step="0.01" @input="selected.cropWidth = Number(($event.target as HTMLInputElement).value); selected.cropX = 0; publish()" /></label><label>保留高度比例<input :value="selected.cropHeight || 1" type="range" min="0.1" max="1" step="0.01" @input="selected.cropHeight = Number(($event.target as HTMLInputElement).value); selected.cropY = 0; publish()" /></label></template><label v-if="selected.type === 'text'">文字<textarea v-model="selected.text" @focus="remember" @input="publish" /></label><label v-if="selected.type === 'text'">字号<input v-model.number="selected.fontSize" type="number" min="16" max="150" @change="publish" /></label><label>颜色<input v-model="selected.fill" type="color" @change="publish" /></label><label>宽度<input v-model.number="selected.width" type="number" min="20" max="750" @change="publish" /></label><label>高度<input v-model.number="selected.height" type="number" min="20" max="2400" @change="publish" /></label><label><input v-model="selected.locked" type="checkbox" @change="publish" /> 锁定图层</label><button type="button" @click="moveLayer(1)">上移图层</button><button type="button" @click="moveLayer(-1)">下移图层</button><button type="button" @click="removeNode">删除图层</button></template>
        <p v-else>选择图层后编辑。文字建议不小于 28px，保证手机可读。</p>
      </aside>
    </div>
    <details v-if="capability?.enabled" class="ai-panel" :inert="busy || disabled" open><summary>智能详情页设计助手</summary><p>商品主图用于保持真实外观，参考截图用于分析配色、版式、字号与信息密度，不照搬价格、商家信息和其他型号参数。默认整屏图文一体生成，每屏先出初稿，由设计模型看图审视后制作精修稿，再对比择优。检查商品形态、图中文字与整页风格；每屏最多生成两版，耗时和模型用量会增加。未通过的屏明确标记，不以空白页代替。</p><p>已自动读取当前商品名称、品牌、分类、参数、规格和商品图，无需重复填写。</p><label>版式参考截图（选填，最多3张）<input type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="busy || !!generating" @change="uploadReferences" /></label><div class="reference-thumbnails"><button v-for="(url, i) in referenceImages" :key="url" type="button" :disabled="busy || !!generating" @click="referenceImages.splice(i, 1)"><img :src="url" alt="版式参考图" width="80" />移除</button></div><div class="ai-fields"><label>参考链接（选填）<textarea v-model="referenceLinks" placeholder="官网或商品参数链接，不填则自动检索" /></label><label>生成方式<select v-model="generationMode"><option value="image">整屏图文一体（推荐）</option><option value="mixed">分层图片与可编辑文字</option></select><small>整屏模式由模型直接设计图片内的文字和版式；图片内文字需重新生成修改，可另外叠加文字、上传图片或画笔编辑。</small></label><label>设计主题<select v-model="generationTheme"><option value="auto">自动参考截图与品牌风格</option><option value="light">明亮简洁</option><option value="dark">深色科技</option><option value="warm">温暖质感</option></select></label><label>设计要求<textarea v-model="brief" /></label><label>语言<input v-model="language" /></label><label>屏数<input v-model.number="count" type="number" min="1" max="12" /></label></div><button type="button" :disabled="!capability?.enabled || busy || disabled || !!generating" @click="generate('all')">一键生成商品详情</button><button type="button" :disabled="!capability?.enabled || busy || disabled || !!generating" @click="generate('screen')">只重新生成当前屏</button><button v-if="selected?.type === 'text'" type="button" :disabled="!capability?.enabled || busy || disabled || !!generating" @click="generate('text')">按设计要求改写选中文字</button><button v-if="generating" type="button" @click="cancel">中止任务</button><p v-if="taskMatchesProduct && task">任务 {{ taskStatusLabels[task.status] }} · 已完成 {{ task.progress }} 屏 {{ task.errorMessage }}</p><p v-if="referenceSummary">本次参考采用：{{ referenceSummary }}</p><button v-if="taskMatchesProduct && task?.resultJson" type="button" :disabled="!!generating || busy || disabled" @click="applyResult">{{ task.status === 'PARTIAL' ? '应用已完成屏（未通过的屏不包含在内，可撤销）' : '将生成结果应用到画布（替换当前内容，可撤销）' }}</button><p>生成在后台执行，离开页面不会中止。生成结果不会自动覆盖你正在编辑的画布。</p></details>
  </div>
</template>
<style scoped>
.reference-thumbnails { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0; }.reference-thumbnails button { display:grid; gap:4px; }.reference-thumbnails img { width:80px; height:80px; object-fit:contain; }
.studio{border:1px solid var(--line,#ddd);border-radius:14px;overflow:hidden;background:var(--paper,#fff)}.studio-header,.controls,.tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid var(--line,#ddd)}.studio-header>div{flex:1}.studio-header small{display:block;margin-top:6px;color:var(--muted,#777)}button,select,input,textarea{border:1px solid var(--line,#ddd);border-radius:7px;padding:8px;background:var(--paper,#fff);color:inherit}button{cursor:pointer;font-size:12px}button:disabled{opacity:.45;cursor:not-allowed}button.active{background:#d9e5f6;color:#162c46}.workspace{display:grid;grid-template-columns:110px minmax(200px,1fr) 170px}.pages,.properties{padding:12px;display:flex;flex-direction:column;gap:10px;border-right:1px solid var(--line,#ddd)}.properties{border-left:1px solid var(--line,#ddd);border-right:0}label{display:flex;flex-direction:column;gap:6px;font-size:12px}label input,label textarea{min-width:0;width:100%}.canvas-host{min-width:0;max-height:850px;overflow:auto;background:#e5e7eb;padding-bottom:20px}.canvas-host :deep(.konvajs-content){margin:12px auto;box-shadow:0 8px 24px #0002}.tools{position:sticky;top:0;background:var(--paper,#fff);z-index:2;padding:8px}.properties textarea{min-height:110px}.properties p,.ai-panel p{font-size:12px;color:var(--muted,#777);line-height:1.7}.scene-preview{max-width:750px;margin:20px auto}.scene-preview.mobile{width:375px;max-width:100%}.error{padding:12px;color:#9c2020;background:#fff0ed}.ai-panel{padding:18px;border-top:1px solid var(--line,#ddd)}.ai-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.ai-fields textarea{min-height:100px}.ai-panel button{margin-right:10px}.controls span{font-size:12px;color:#777}.controls label{flex-direction:row;align-items:center}@media(max-width:800px){.workspace{grid-template-columns:1fr}.pages{flex-direction:row;overflow:auto}.properties{display:grid;grid-template-columns:1fr 1fr}.ai-fields{grid-template-columns:1fr}}
</style>
