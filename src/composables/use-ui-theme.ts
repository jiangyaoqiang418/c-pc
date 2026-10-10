import { readonly, ref } from 'vue';

export const UI_THEMES = [
  { id: 'forest', label: '森林绿金', primary: '#214f41', accent: '#dbad54' },
  { id: 'navy-coral', label: '深海蓝橙', primary: '#24466b', accent: '#f57553' },
  { id: 'ocean', label: '海盐蓝', primary: '#174b78', accent: '#d28b3a' },
  { id: 'clay', label: '陶土奶油', primary: '#954a36', accent: '#8d915c' },
  { id: 'graphite', label: '黑白琥珀', primary: '#25272b', accent: '#d99035' },
  { id: 'plum', label: '莓紫雾粉', primary: '#683e66', accent: '#c67878' }
] as const;

export type UiTheme = typeof UI_THEMES[number]['id'];
const currentTheme = ref<UiTheme>('forest');

function isTheme(value: unknown): value is UiTheme {
  return UI_THEMES.some(theme => theme.id === value);
}

function applyTheme(value: unknown) {
  currentTheme.value = isTheme(value) ? value : 'forest';
  document.documentElement.dataset.uiTheme = currentTheme.value;
}

if (typeof document !== 'undefined') {
  applyTheme(document.documentElement.dataset.uiTheme);
  window.addEventListener('storage', event => {
    if (event.key === 'um.uiTheme' || event.key === null) {
      applyTheme(event.key === null ? null : event.newValue);
    }
  });
}

export function useUiTheme() {
  function setTheme(theme: UiTheme) {
    applyTheme(theme);
    try { localStorage.setItem('um.uiTheme', currentTheme.value); } catch { /* Session-only theme remains usable. */ }
  }
  return { currentTheme: readonly(currentTheme), setTheme, themes: UI_THEMES };
}
