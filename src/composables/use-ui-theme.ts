import { computed, readonly, ref } from 'vue';

export const DEFAULT_UI_THEME = 'web3-meme';
export const UI_LAYOUT = 'web3-meme';

// Palette card metadata from Umaomao v47; CSS is the actual rendered palette.
export const UI_THEMES = [
  { id: 'web3-meme', name: 'MEME 荧光', family: 'Web3', note: '荧光绿 × 电光紫 · 猫咪宇宙', primary: '#b6f36b', dark: '#0c0d10', accent: '#c5adff', light: '#c5adff', bg: '#0c0d10', paper: '#15171b', ink: '#f2f2ed', muted: '#b1b5bd', soft: '#1c1f24', line: '#2d3036', mode: 'dark', label: 'MEME 荧光' },
  { id: 'navy-coral', name: '深海蓝橙', family: '经典', note: '海军蓝 × 珊瑚橙 · 参考图', primary: '#24466b', dark: '#183554', accent: '#f57553', light: '#ff805e', bg: '#f4f7fb', paper: '#ffffff', ink: '#172e48', muted: '#52657a', soft: '#eaf0f7', line: '#d9e3ee', label: '深海蓝橙', mode: 'light' },
  { id: 'forest', name: '森林绿金', note: '自然质感 · 品牌延续', primary: '#214f41', dark: '#183c32', accent: '#dbad54', light: '#f2cc7b', bg: '#f8f7f2', paper: '#fffefa', ink: '#213a33', muted: '#546057', soft: '#eef0e8', line: '#dce2d7', family: '经典', label: '森林绿金', mode: 'light' },
  { id: 'ocean', name: '海盐蓝', note: '清爽理性 · 数码生活', primary: '#174b78', dark: '#133956', accent: '#d28b3a', light: '#f1bd74', bg: '#f4f7fa', paper: '#ffffff', ink: '#1d3043', muted: '#53636f', soft: '#eaf1f7', line: '#dce5ed', family: '经典', label: '海盐蓝', mode: 'light' },
  { id: 'clay', name: '陶土奶油', note: '温暖柔和 · 生活方式', primary: '#954a36', dark: '#663525', accent: '#8d915c', light: '#e0d5aa', bg: '#faf5ef', paper: '#fffdf8', ink: '#3d2d27', muted: '#68574d', soft: '#f2e6da', line: '#e8dacf', family: '经典', label: '陶土奶油', mode: 'light' },
  { id: 'graphite', name: '黑白琥珀', note: '极简利落 · 商品聚焦', primary: '#25272b', dark: '#141619', accent: '#d99035', light: '#f4b868', bg: '#f5f5f4', paper: '#ffffff', ink: '#222326', muted: '#5b5d61', soft: '#eaeaec', line: '#dcdcde', family: '经典', label: '黑白琥珀', mode: 'light' },
  { id: 'plum', name: '莓紫雾粉', note: '细腻优雅 · 时尚美妆', primary: '#683e66', dark: '#452743', accent: '#c67878', light: '#efc4b9', bg: '#faf6fa', paper: '#fffafd', ink: '#352736', muted: '#685668', soft: '#f0e6f0', line: '#e4d6e3', family: '经典', label: '莓紫雾粉', mode: 'light' },
  { id: 'matcha', name: '抹茶燕麦', family: '自然', note: '清雅绿意 · 日常生活', primary: '#526039', dark: '#3b4529', accent: '#b69964', light: '#e4d4ac', bg: '#f6f7ef', paper: '#fffff9', ink: '#2f3627', muted: '#5a6051', soft: '#e9edda', line: '#dce2cb', label: '抹茶燕麦', mode: 'light' },
  { id: 'mint', name: '薄荷蜜桃', family: '自然', note: '清透薄荷 · 轻盈日常', primary: '#247064', dark: '#1a5148', accent: '#d68b70', light: '#f1cfb9', bg: '#f0f8f5', paper: '#fbfffd', ink: '#223d35', muted: '#4b6258', soft: '#e0f0e9', line: '#cce1d7', label: '薄荷蜜桃', mode: 'light' },
  { id: 'cocoa', name: '可可香槟', family: '自然', note: '醇厚棕调 · 精品质感', primary: '#624536', dark: '#473227', accent: '#bd9659', light: '#ead4af', bg: '#f7f3ee', paper: '#fffcf8', ink: '#372b25', muted: '#63534c', soft: '#ece3d8', line: '#dfd0c1', label: '可可香槟', mode: 'light' },
  { id: 'oat', name: '亚麻橄榄', family: '自然', note: '朴素亚麻 · 自然选物', primary: '#76603f', dark: '#55452d', accent: '#818c58', light: '#dbe0bf', bg: '#f7f5ed', paper: '#fffef7', ink: '#3b3326', muted: '#615749', soft: '#eee9d9', line: '#ded6c2', label: '亚麻橄榄', mode: 'light' },
  { id: 'canyon', name: '赤陶日落', family: '自然', note: '赤陶暖橙 · 活力生活', primary: '#a03e28', dark: '#732d1d', accent: '#dc9b46', light: '#f5cc86', bg: '#fff4ed', paper: '#fffdf8', ink: '#462b23', muted: '#6c4f46', soft: '#f7e1d2', line: '#ebcab8', label: '赤陶日落', mode: 'light' },
  { id: 'cobalt', name: '钴蓝柠黄', family: '都市', note: '鲜明对比 · 年轻数码', primary: '#2549aa', dark: '#1b357a', accent: '#d2b52a', light: '#f6e589', bg: '#f3f5ff', paper: '#ffffff', ink: '#202d4c', muted: '#4f5971', soft: '#e5eafd', line: '#d1daf3', label: '钴蓝柠黄', mode: 'light' },
  { id: 'navy', name: '午夜冰蓝', family: '都市', note: '深蓝秩序 · 精密科技', primary: '#253d67', dark: '#1b2c4a', accent: '#69a7bc', light: '#bde2ef', bg: '#f2f5f9', paper: '#ffffff', ink: '#243149', muted: '#515c6e', soft: '#e4ebf4', line: '#d2ddec', label: '午夜冰蓝', mode: 'light' },
  { id: 'teal', name: '孔雀蓝铜', family: '都市', note: '沉静蓝绿 · 现代精品', primary: '#14676c', dark: '#0e4a4e', accent: '#be8550', light: '#eac7a1', bg: '#eff7f7', paper: '#fbffff', ink: '#203a3e', muted: '#4c5f62', soft: '#dceced', line: '#c6dfe0', label: '孔雀蓝铜', mode: 'light' },
  { id: 'indigo', name: '靛蓝银灰', family: '都市', note: '冷静简洁 · 设计感', primary: '#4e45a5', dark: '#383277', accent: '#939aaf', light: '#d9deeb', bg: '#f5f5fc', paper: '#ffffff', ink: '#2d2b47', muted: '#5a566d', soft: '#e9e8f7', line: '#dad7ed', label: '靛蓝银灰', mode: 'light' },
  { id: 'cherry', name: '樱桃红白', family: '都市', note: '明快醒目 · 潮流选购', primary: '#a32b45', dark: '#751f32', accent: '#dcab64', light: '#f4dfb2', bg: '#fff5f5', paper: '#ffffff', ink: '#462831', muted: '#6b5058', soft: '#f9e3e8', line: '#efcdd6', label: '樱桃红白', mode: 'light' },
  { id: 'blush', name: '玫瑰奶茶', family: '柔和', note: '柔软玫瑰 · 悦己好物', primary: '#975264', dark: '#6d3b48', accent: '#c2947d', light: '#ecd4bf', bg: '#fcf5f4', paper: '#fffcfa', ink: '#422e34', muted: '#68525b', soft: '#f2e2e1', line: '#e6cfd2', label: '玫瑰奶茶', mode: 'light' },
  { id: 'apricot', name: '杏橙雾蓝', family: '柔和', note: '温柔橙调 · 清新碰撞', primary: '#a54f25', dark: '#77391b', accent: '#789ba9', light: '#cce2ea', bg: '#fff6ed', paper: '#fffdf9', ink: '#453026', muted: '#695145', soft: '#f6e5d4', line: '#e9d1b9', label: '杏橙雾蓝', mode: 'light' },
  { id: 'lavender', name: '薰衣草金', family: '柔和', note: '轻盈花色 · 精致日常', primary: '#75539b', dark: '#543c70', accent: '#b9a25e', light: '#eee1b5', bg: '#f8f4fc', paper: '#fffaff', ink: '#352b43', muted: '#5f526a', soft: '#eee4f7', line: '#deceeb', label: '薰衣草金', mode: 'light' },
  { id: 'sky', name: '晴空蓝白', family: '柔和', note: '明亮清爽 · 轻快购物', primary: '#276b94', dark: '#1c4d6b', accent: '#86b7a5', light: '#cfe9db', bg: '#f0f8fc', paper: '#ffffff', ink: '#253d4b', muted: '#4c5f6b', soft: '#dfedf6', line: '#c8dfed', label: '晴空蓝白', mode: 'light' },
  { id: 'citron', name: '青柠米白', family: '柔和', note: '清新果色 · 轻自然', primary: '#666218', dark: '#494711', accent: '#a4ad45', light: '#e6eda8', bg: '#f9faef', paper: '#fffff7', ink: '#373819', muted: '#5c5f42', soft: '#eef1d7', line: '#dde3b5', label: '青柠米白', mode: 'light' },
  { id: 'web3-aurora', name: '极光薄荷', note: '黑绿荧光 · 链上资产', family: 'Web3', primary: '#5eeab5', dark: '#090f10', accent: '#a9e85b', light: '#a9e85b', bg: '#090f10', paper: '#111c1b', soft: '#192827', ink: '#edf9f3', muted: '#a5bab0', line: '#2b403a', mode: 'dark', label: '极光薄荷' },
  { id: 'web3-cyber', name: '赛博紫电', note: '紫青碰撞 · 数字未来', family: 'Web3', primary: '#bb9aff', dark: '#100d1b', accent: '#53e5dd', light: '#53e5dd', bg: '#100d1b', paper: '#1b162b', soft: '#272039', ink: '#f3edff', muted: '#b7accb', line: '#3c3152', mode: 'dark', label: '赛博紫电' },
  { id: 'web3-electric', name: '深空冰蓝', note: '冷蓝光感 · 科技金融', family: 'Web3', primary: '#78b5ff', dark: '#080f1e', accent: '#5ce2f0', light: '#5ce2f0', bg: '#080f1e', paper: '#111d30', soft: '#1c2a40', ink: '#eaf3ff', muted: '#a6b7ce', line: '#2c405c', mode: 'dark', label: '深空冰蓝' },
  { id: 'web3-ember', name: '黑曜琥珀', note: '黑金暖光 · 数字价值', family: 'Web3', primary: '#ffc46b', dark: '#13100c', accent: '#edb396', light: '#edb396', bg: '#13100c', paper: '#211b14', soft: '#30261b', ink: '#fff4e5', muted: '#c0b29f', line: '#4b3b29', mode: 'dark', label: '黑曜琥珀' },
  { id: 'web3-prism', name: '霓虹玫红', note: '粉紫光谱 · 创作者经济', family: 'Web3', primary: '#ff9acd', dark: '#160d17', accent: '#b1a7ff', light: '#b1a7ff', bg: '#160d17', paper: '#251727', soft: '#352139', ink: '#fff0fb', muted: '#c9abc4', line: '#51324f', mode: 'dark', label: '霓虹玫红' },
] as const;

export type UiTheme = typeof UI_THEMES[number]['id'];
const currentTheme = ref<UiTheme>(DEFAULT_UI_THEME);
let themePaint = 0;

export function isUiTheme(value: unknown): value is UiTheme {
  return UI_THEMES.some(theme => theme.id === value);
}

function applyTheme(value: unknown, animate = false) {
  const nextTheme = isUiTheme(value) ? value : DEFAULT_UI_THEME;
  const changed = currentTheme.value !== nextTheme;
  currentTheme.value = nextTheme;
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const paint = ++themePaint;
  if (animate && changed) root.classList.add('theme-changing');
  // Frozen CSS uses this legacy attribute for structure as well as color.
  // Keep its MEME structure stable; the separate palette cascade changes colors only.
  root.dataset.uiTheme = UI_LAYOUT;
  root.dataset.uiLayout = 'v47';
  root.dataset.uiPalette = nextTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    UI_THEMES.find(theme => theme.id === nextTheme)!.primary
  );
  if (!animate || !changed) {
    root.classList.remove('theme-changing');
    return;
  }

  // One layout read only when changing a palette, matching the reference paint.
  getComputedStyle(document.body).color;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (paint === themePaint) root.classList.remove('theme-changing');
  }));
}

if (typeof document !== 'undefined') {
  applyTheme(document.documentElement.dataset.uiPalette ?? document.documentElement.dataset.uiTheme);
  window.addEventListener('storage', event => {
    if (event.key === 'um.uiTheme' || event.key === null) {
      applyTheme(event.key === null ? null : event.newValue, true);
    }
  });
}

export function useUiTheme() {
  const selectedTheme = computed(() => UI_THEMES.find(theme => theme.id === currentTheme.value)!);
  const isMeme = computed(() => currentTheme.value === 'web3-meme');
  const isDark = computed(() => selectedTheme.value.mode === 'dark');

  function setTheme(theme: UiTheme) {
    applyTheme(theme, true);
    try { localStorage.setItem('um.uiTheme', currentTheme.value); } catch { /* Session-only theme remains usable. */ }
  }

  return { currentTheme: readonly(currentTheme), selectedTheme, isMeme, isMemeLayout: true, isDark, setTheme, themes: UI_THEMES };
}
