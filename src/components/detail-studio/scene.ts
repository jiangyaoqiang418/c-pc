export const palette = { dark: { background: '#101114', text: '#f4f4f5', accent: '#b9c8ff' }, light: { background: '#f5f5f7', text: '#171719', accent: '#3556a8' }, warm: { background: '#f2eee7', text: '#302a24', accent: '#88603e' } };
export const uid = () => crypto.randomUUID();
export function blankPage(theme: Api.DetailStudio.Document['theme']): Api.DetailStudio.Page { return { id: uid(), width: 750, height: 950, background: palette[theme].background, nodes: [] }; }
export function newDocument(): Api.DetailStudio.Document { return { schemaVersion: 1, theme: 'dark', mode: 'mixed', pages: [blankPage('dark')] }; }
export function parseScene(source?: string): Api.DetailStudio.Document | undefined {
  if (!source) return;
  const doc = JSON.parse(source) as Api.DetailStudio.Document;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.length > 12 || doc.pages.some(p => p.width !== 750 || !Array.isArray(p.nodes))) throw new Error('画布源稿格式不支持');
  return doc;
}
export function textLines(node: Api.DetailStudio.Node): string[] {
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d')!;
  ctx.font = `${node.fontSize || 32}px Arial, sans-serif`;
  const lines: string[] = [];
  for (const paragraph of (node.text || '').split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > node.width) {
        const last = Array.from(line).at(-1)!;
        if (line.length > 1 && (/[，。！？；：、）】》”’.,!?;:)]/.test(char) || /[（【《“‘(]/.test(last))) {
          lines.push(line.slice(0, -last.length)); line = last;
        } else { lines.push(line); line = ''; }
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
export function nodeTransform(node: Api.DetailStudio.Node) { return `translate(${node.x} ${node.y}) rotate(${node.rotation || 0})`; }
