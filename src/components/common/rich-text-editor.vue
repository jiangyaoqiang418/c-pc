<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TableKit } from '@tiptap/extension-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Message } from '@/lib/feedback';
import { uploadFile } from '@/service/api/product';
import { sanitizeRichText } from '@/utils/rich-text';

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean; contextKey?: string | number }>(), { disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void; (e: 'uploaded', value: Api.RealProduct.FileUploadResult[]): void }>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const linkOpen = ref(false);
const linkDraft = ref('');
const sizedImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), style: { default: null, parseHTML: element => element.getAttribute('style'), renderHTML: attributes => attributes.style ? { style: attributes.style } : {} } };
  }
});
function imageLayout(width: number, align: 'left' | 'center' | 'right', focus = true) {
  if (props.disabled || !editor.isActive('image')) return;
  const size = Math.min(100, Math.max(10, Math.round(width)));
  if (!Number.isFinite(size)) return;
  const margin = align === 'left' ? '12px auto 12px 0' : align === 'right' ? '12px 0 12px auto' : '12px auto';
  const command = editor.chain();
  if (focus) command.focus();
  command.updateAttributes('image', { style: `width:${size}%;height:auto;display:block;margin:${margin}` }).run();
}
function imageWidth() {
  return Number(String(editor.getAttributes('image').style || '').match(/width:\s*(\d+)%/)?.[1] || 100);
}
function resizeImage(event: Event) {
  const width = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(width) && width >= 10 && width <= 100) imageLayout(width, 'center', false);
}
let uploadVersion = 0;

const editor = new Editor({
  content: sanitizeRichText(props.modelValue),
  editable: !props.disabled,
  extensions: [StarterKit.configure({ link: false, underline: false }), Underline, sizedImage.configure({ inline: false, allowBase64: false }), Link.configure({ openOnClick: false }), TableKit],
  onUpdate: ({ editor: current }) => emit('update:modelValue', sanitizeRichText(current.getHTML()))
});

watch(() => props.disabled, value => editor.setEditable(!value));
watch(() => props.contextKey, () => {
  uploadVersion += 1;
  uploading.value = false;
  emit('uploading', false);
  linkOpen.value = false;
  linkDraft.value = '';
});
watch(() => props.modelValue, value => {
  const next = sanitizeRichText(value);
  if (next !== editor.getHTML()) editor.commands.setContent(next, { emitUpdate: false });
});
onBeforeUnmount(() => {
  uploadVersion += 1;
  if (uploading.value) emit('uploading', false);
  editor.destroy();
});

function setLink() {
  if (props.disabled) return;
  linkDraft.value = editor.getAttributes('link').href || '';
  linkOpen.value = true;
}

function saveLink() {
  if (props.disabled) return false;
  const href = linkDraft.value.trim();
  if (href && !/^https?:\/\//i.test(href)) {
    Message.warning('链接必须以 http:// 或 https:// 开头');
    return false;
  }
  if (!href) editor.chain().focus().unsetLink().run();
  else editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
  linkOpen.value = false;
  return true;
}

async function uploadImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.disabled || uploading.value) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'].includes(file.type)) return Message.warning('仅支持 JPG、PNG、WebP、GIF、AVIF、BMP 图片');
  if (file.size > 10 * 1024 * 1024) return Message.warning('图片不能超过 10MB');
  if ((props.modelValue.match(/<img\b/gi) || []).length >= 30) return Message.warning('详情最多插入 30 张图片');
  const operation = ++uploadVersion;
  uploading.value = true;
  emit('uploading', true);
  try {
    const uploaded = await uploadFile(file, 'PRODUCT');
    if (operation !== uploadVersion || editor.isDestroyed || props.disabled) return;
    if ((props.modelValue.match(/<img\b/gi) || []).length >= 30) return Message.warning('详情最多插入 30 张图片');
    if (editor.chain().focus().setImage({ src: uploaded.url || uploaded.filePath, alt: file.name }).run()) emit('uploaded', [uploaded]);
  } catch {
    if (operation === uploadVersion) Message.error('详情图片上传失败');
  } finally {
    if (operation === uploadVersion) { uploading.value = false; emit('uploading', false); }
  }
}
</script>

<template>
  <div class="rich-editor" :class="{ disabled }">
    <fieldset class="toolbar" :disabled="disabled" aria-label="富文本工具栏">
      <button type="button" :class="{ active: editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()">加粗</button>
      <button type="button" :class="{ active: editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()">斜体</button>
      <button type="button" :class="{ active: editor.isActive('underline') }" @click="editor.chain().focus().toggleUnderline().run()">下划线</button>
      <button type="button" :class="{ active: editor.isActive('heading', { level: 2 }) }" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">标题</button>
      <button type="button" :class="{ active: editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">列表</button>
      <button type="button" :class="{ active: editor.isActive('blockquote') }" @click="editor.chain().focus().toggleBlockquote().run()">引用</button>
      <button type="button" @click="setLink">链接</button>
      <button type="button" @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">表格</button>
      <button v-if="editor.isActive('table')" type="button" @click="editor.chain().focus().addRowAfter().run()">加行</button>
      <button v-if="editor.isActive('table')" type="button" @click="editor.chain().focus().addColumnAfter().run()">加列</button>
      <button v-if="editor.isActive('table')" type="button" @click="editor.chain().focus().deleteTable().run()">删表</button>
      <button type="button" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? '上传中' : '图片' }}</button>
      <button type="button" @click="editor.chain().focus().undo().run()">撤销</button>
      <button type="button" @click="editor.chain().focus().redo().run()">重做</button>
      <span v-if="editor.isActive('image')" class="image-controls"><label>图片宽度（%）<input type="number" min="10" max="100" step="5" :value="imageWidth()" @input="resizeImage" @change="($event.target as HTMLInputElement).value = String(imageWidth())" /></label><button type="button" @click="imageLayout(imageWidth(), 'left')">图片居左</button><button type="button" @click="imageLayout(imageWidth(), 'center')">图片居中</button><button type="button" @click="imageLayout(imageWidth(), 'right')">图片居右</button></span>
      <input ref="fileInput" hidden type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.bmp" @change="uploadImage">
    </fieldset>
    <EditorContent :editor="editor" class="editor-content" />
    <div class="editor-tip">支持标题、列表、链接和图片；图片会先上传后插入，最多 30 张。</div>
    <a-modal v-model:visible="linkOpen" title="编辑链接" :on-before-ok="saveLink"><div class="link-field"><Label for="rich-editor-link">链接地址</Label><Input id="rich-editor-link" v-model="linkDraft" placeholder="https://" :disabled="disabled" @keydown.enter.prevent="!$event.isComposing && saveLink()" /><p>仅支持 http / https；清空地址可移除当前链接。</p></div></a-modal>
  </div>
</template>

<style scoped>
.image-controls { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }.image-controls label { font-size:12px; }.image-controls input { width:64px; padding:4px; border:1px solid var(--line); border-radius:4px; background:var(--paper); color:var(--ink); }
.rich-editor { width:100%; border:1px solid var(--yb-hairline-2); border-radius:8px; background:var(--yb-surface); overflow:hidden; }.toolbar { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:10px; min-width:0; border:0; border-bottom:1px solid var(--yb-hairline); background:var(--yb-fill); }.toolbar button { padding:6px 9px; border:1px solid transparent; border-radius:5px; background:var(--yb-surface); color:var(--yb-ink); cursor:pointer; font-size:12px; transition:background 150ms var(--um-ease),color 150ms var(--um-ease); }.toolbar button:hover,.toolbar button.active { border-color:var(--yb-primary); color:var(--yb-primary); background:var(--yb-primary-soft); }.toolbar button:disabled { opacity:.5; cursor:not-allowed; }.editor-content :deep(.tiptap) { min-height:200px; padding:18px; line-height:1.8; }.editor-content :deep(.tiptap:focus-visible) { outline:2px solid var(--yb-primary); outline-offset:-2px; }.editor-content :deep(.tiptap p) { margin:0 0 12px; }.editor-content :deep(.tiptap img) { max-width:100%; height:auto; border-radius:7px; }.editor-content :deep(table) { width:100%; border-collapse:collapse; margin:14px 0; }.editor-content :deep(th),.editor-content :deep(td) { min-width:70px; padding:8px; border:1px solid var(--yb-hairline-2); vertical-align:top; }.editor-tip { padding:0 18px 13px; color:var(--yb-muted); font-size:12px; }.link-field { display:grid; gap:12px; }.link-field p { font-size:12px; color:var(--yb-muted); margin:0; }@media(prefers-reduced-motion:reduce) { .toolbar button { transition:none; } }
@media(max-width:700px) {
  .editor-content { min-width:0; }
  .editor-content :deep(.tableWrapper) { max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; }
}
</style>
