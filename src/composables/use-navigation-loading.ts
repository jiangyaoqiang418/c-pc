import { readonly, ref } from 'vue';

const loading = ref(false);
let activeNavigation: object | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

export const navigationLoading = readonly(loading);

export function startNavigationLoading(navigation: object) {
  activeNavigation = navigation;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (activeNavigation === navigation) loading.value = true;
  }, 150);
}

export function finishNavigationLoading(navigation: object) {
  if (activeNavigation !== navigation) return;
  clearTimeout(timer);
  timer = undefined;
  activeNavigation = undefined;
  loading.value = false;
}
