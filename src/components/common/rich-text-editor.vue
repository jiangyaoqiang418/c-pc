<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TableKit } from '@tiptap/extension-table';
import { Message } from '@arco-design/web-vue';
import { uploadFile } from '@/service/api/product';
import { sanitizeRichText } from '@/utils/rich-text';

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void }>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);

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
  const previous = editor.getAttributes('link').href || '';
  const href = window.prompt('请输入链接地址（仅支持 http/https）', previous)?.trim();
  if (href === undefined) return;
  if (!href) return void editor.chain().focus().unsetLink().run();
  if (!/^https?:\/\//i.test(href)) return Message.warning('链接必须以 http:// 或 https:// 开头');
  editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
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
    <div class="toolbar">
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
    </div>
    <EditorContent :editor="editor" class="editor-content" />
    <div class="editor-tip">支持标题、列表、链接和图片；图片会先上传后插入，最多 30 张。</div>
  </div>
</template>

<style scoped>
.rich-editor { width: 100%; border: 1px solid #c9cdd4; border-radius: 4px; background: #fff; overflow: hidden; }
.toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-bottom: 1px solid #e5e6eb; background: #f7f8fa; }
.toolbar button { padding: 4px 9px; border: 1px solid #c9cdd4; border-radius: 4px; background: #fff; color: #4e5969; cursor: pointer; }
.toolbar button.active { border-color: #165dff; color: #165dff; background: #e8f3ff; }
.toolbar button:disabled, .disabled { opacity: .65; pointer-events: none; }
.editor-content :deep(.tiptap) { min-height: 180px; padding: 12px; outline: none; line-height: 1.7; }
.editor-content :deep(.tiptap p) { margin: 0 0 10px; }
.editor-content :deep(.tiptap img) { max-width: 100%; height: auto; border-radius: 6px; }
.editor-content :deep(table) { width: 100%; border-collapse: collapse; margin: 12px 0; }
.editor-content :deep(th), .editor-content :deep(td) { min-width: 70px; padding: 7px; border: 1px solid #c9cdd4; vertical-align: top; }
.editor-tip { padding: 0 12px 9px; color: #86909c; font-size: 12px; }
</style>
