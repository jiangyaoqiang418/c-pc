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

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void }>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const linkOpen = ref(false);
const linkDraft = ref('');

const editor = new Editor({
  content: sanitizeRichText(props.modelValue),
  editable: !props.disabled,
  extensions: [StarterKit.configure({ link: false, underline: false }), Underline, Image.configure({ inline: false, allowBase64: false }), Link.configure({ openOnClick: false }), TableKit],
  onUpdate: ({ editor: current }) => emit('update:modelValue', sanitizeRichText(current.getHTML()))
});

watch(() => props.disabled, value => editor.setEditable(!value));
watch(() => props.modelValue, value => {
  const next = sanitizeRichText(value);
  if (next !== editor.getHTML()) editor.commands.setContent(next, { emitUpdate: false });
});
onBeforeUnmount(() => editor.destroy());

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
  if (!file || uploading.value) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Message.warning('仅支持 JPG、PNG、WebP 图片');
  if (file.size > 10 * 1024 * 1024) return Message.warning('图片不能超过 10MB');
  if ((props.modelValue.match(/<img\b/gi) || []).length >= 30) return Message.warning('详情最多插入 30 张图片');
  uploading.value = true;
  emit('uploading', true);
  try {
    const uploaded = await uploadFile(file, 'PRODUCT');
    editor.chain().focus().setImage({ src: uploaded.url || uploaded.filePath, alt: file.name }).run();
  } catch { Message.error('详情图片上传失败'); }
  finally { uploading.value = false; emit('uploading', false); }
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
      <input ref="fileInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="uploadImage">
    </fieldset>
    <EditorContent :editor="editor" class="editor-content" />
    <div class="editor-tip">支持标题、列表、链接和图片；图片会先上传后插入，最多 30 张。</div>
    <a-modal v-model:visible="linkOpen" title="编辑链接" :on-before-ok="saveLink"><div class="link-field"><Label for="rich-editor-link">链接地址</Label><Input id="rich-editor-link" v-model="linkDraft" placeholder="https://" :disabled="disabled" @keydown.enter.prevent="!$event.isComposing && saveLink()" /><p>仅支持 http / https；清空地址可移除当前链接。</p></div></a-modal>
  </div>
</template>

<style scoped>
.rich-editor { width:100%; border:1px solid var(--yb-hairline-2); border-radius:8px; background:var(--yb-surface); overflow:hidden; }.toolbar { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:10px; min-width:0; border:0; border-bottom:1px solid var(--yb-hairline); background:var(--yb-fill); }.toolbar button { padding:6px 9px; border:1px solid transparent; border-radius:5px; background:var(--yb-surface); color:var(--yb-ink); cursor:pointer; font-size:12px; transition:background 150ms var(--um-ease),color 150ms var(--um-ease); }.toolbar button:hover,.toolbar button.active { border-color:var(--yb-primary); color:var(--yb-primary); background:var(--yb-primary-soft); }.toolbar button:disabled { opacity:.5; cursor:not-allowed; }.editor-content :deep(.tiptap) { min-height:200px; padding:18px; line-height:1.8; }.editor-content :deep(.tiptap:focus-visible) { outline:2px solid var(--yb-primary); outline-offset:-2px; }.editor-content :deep(.tiptap p) { margin:0 0 12px; }.editor-content :deep(.tiptap img) { max-width:100%; height:auto; border-radius:7px; }.editor-content :deep(table) { width:100%; border-collapse:collapse; margin:14px 0; }.editor-content :deep(th),.editor-content :deep(td) { min-width:70px; padding:8px; border:1px solid var(--yb-hairline-2); vertical-align:top; }.editor-tip { padding:0 18px 13px; color:var(--yb-muted); font-size:12px; }.link-field { display:grid; gap:12px; }.link-field p { font-size:12px; color:var(--yb-muted); margin:0; }@media(prefers-reduced-motion:reduce) { .toolbar button { transition:none; } }
</style>
