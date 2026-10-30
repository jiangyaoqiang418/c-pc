import { provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue';

export const dialogFooterKey: InjectionKey<ShallowRef<HTMLElement | null>> = Symbol('dialog-footer');

export function provideDialogFooter() {
  const footer = shallowRef<HTMLElement | null>(null);
  provide(dialogFooterKey, footer);
  return footer;
}
