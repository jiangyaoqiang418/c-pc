/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REAL_SERVICE_SUCCESS_CODE?: string;
  readonly VITE_REAL_SERVICE_LOGOUT_CODES?: string;
  readonly VITE_REAL_SERVICE_MODAL_LOGOUT_CODES?: string;
  readonly VITE_REAL_ADMIN_BASE_URL?: string;
  readonly VITE_REAL_ADMIN_TARGET_URL?: string;
  readonly VITE_REAL_USER_BASE_URL?: string;
  readonly VITE_REAL_USER_TARGET_URL?: string;
  readonly VITE_REAL_ORDER_BASE_URL?: string;
  readonly VITE_REAL_ORDER_TARGET_URL?: string;
  readonly VITE_REAL_NOTIFY_BASE_URL?: string;
  readonly VITE_REAL_NOTIFY_TARGET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
