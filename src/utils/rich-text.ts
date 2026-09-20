import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];

export function sanitizeRichText(value?: string): string {
  if (!value) return '';
  const source = /<[^>]+>/.test(value) ? value : value.split(/\r?\n/).map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
  return DOMPurify.sanitize(source, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false
  });
}

export function richTextError(value?: string): string {
  const raw = value || '';
  if (raw.length > 200_000) return '商品详情内容过大，请精简后提交';
  const safe = sanitizeRichText(raw);
  if (safe.length > 60_000) return '商品详情 HTML 不能超过 60000 字符';
  const container = document.createElement('div');
  container.innerHTML = safe;
  if ((container.textContent || '').length > 20_000) return '商品详情文字不能超过 20000 字';
  if (container.querySelectorAll('img').length > 30) return '商品详情最多插入 30 张图片';
  return '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
