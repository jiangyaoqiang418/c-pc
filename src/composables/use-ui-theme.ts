import { computed, readonly, ref } from 'vue';

export const DEFAULT_UI_THEME = 'web3-meme';
export const UI_LAYOUT = 'web3-meme';

// Keep the two approved palettes; their IDs also restore existing preferences.
export const UI_THEMES = [
  { id: 'web3-meme', label: '深色', primary: '#b6f36b', mode: 'dark' },
  { id: 'navy-coral', label: '浅色', primary: '#24466b', mode: 'light' },
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
