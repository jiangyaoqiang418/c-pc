import { Message, Modal } from '@arco-design/web-vue';
import { clearAccessToken, getAccessToken } from './token';
import { RequestError, type RealResponse, type RequestConfig, type RequestOptions } from './type';
import { parseJsonPreservingLong } from '@/utils/json';

function splitCodes(value: string | undefined, fallback: string[]) {
  return value ? value.split(',').map(code => code.trim()).filter(Boolean) : fallback;
}

function joinURL(baseURL: string, url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

function appendParams(url: string, params?: RequestOptions['params']) {
  if (!params) return url;
  const isAbsoluteURL = /^https?:\/\//.test(url);
  const target = new URL(url, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') target.searchParams.set(key, String(value));
  });
  return isAbsoluteURL ? target.toString() : target.pathname + target.search + target.hash;
}

function getResponseMessage(response?: RealResponse | null) {
  return response?.message || response?.msg || '请求失败';
}

function redirectToLogin() {
  clearAccessToken();
  const current = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname !== '/auth/login') {
    window.location.assign(`/auth/login?redirect=${encodeURIComponent(current)}`);
  }
}

function handleLogoutMessage(message: string, modal: boolean) {
  if (modal) {
    Modal.error({
      title: '登录状态已失效',
      content: message,
      maskClosable: false,
      onOk: redirectToLogin
    });
    return;
  }
  Message.error(message);
  redirectToLogin();
}

class RealRequest {
  private config: RequestConfig;

  constructor(config: Partial<RequestConfig> & Pick<RequestConfig, 'baseURL'>) {
    this.config = {
      baseURL: config.baseURL,
      successCode: config.successCode || import.meta.env.VITE_REAL_SERVICE_SUCCESS_CODE || '1',
      logoutCodes: config.logoutCodes || splitCodes(import.meta.env.VITE_REAL_SERVICE_LOGOUT_CODES, ['-200']),
      modalLogoutCodes: config.modalLogoutCodes || splitCodes(import.meta.env.VITE_REAL_SERVICE_MODAL_LOGOUT_CODES, ['-201'])
    };
  }

  async request<T = unknown, TData = unknown>(options: RequestOptions<TData>): Promise<T> {
    const method = options.method || 'GET';
    const token = getAccessToken();
    const headers = new Headers(options.headers);

    if (token) headers.set('X-Access-Token', token);
    const isFormData = typeof FormData !== 'undefined' && options.data instanceof FormData;
    if (options.data !== undefined && !isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const url = appendParams(joinURL(this.config.baseURL, options.url), options.params);
    const response = await fetch(url, {
      method,
      headers,
      body: options.data === undefined ? undefined : isFormData ? (options.data as BodyInit) : JSON.stringify(options.data),
      signal: options.signal
    });

    let body: RealResponse<T> | null = null;
    try {
      body = parseJsonPreservingLong<RealResponse<T>>(await response.text());
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message = getResponseMessage(body) || `HTTP ${response.status}`;
      if (options.showError !== false) Message.error(message);
      throw new RequestError(message, { status: response.status, response: body || undefined });
    }

    const code = String(body?.code ?? '');
    if (code !== this.config.successCode) {
      const message = getResponseMessage(body);
      const isLogout = this.config.logoutCodes.includes(code);
      const isModalLogout = this.config.modalLogoutCodes.includes(code);

      if ((isLogout || isModalLogout) && token && !options.skipAuthRedirect) {
        handleLogoutMessage(message, isModalLogout);
      } else if (options.showError !== false) {
        Message.error(message);
      }

      throw new RequestError(message, { code, response: body || undefined });
    }

    return body?.data as T;
  }

  get<T = unknown>(url: string, options: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) {
    return this.request<T>({ ...options, url, method: 'GET' });
  }

  post<T = unknown, TData = unknown>(url: string, data?: TData, options: Omit<RequestOptions<TData>, 'url' | 'method' | 'data'> = {}) {
    return this.request<T, TData>({ ...options, url, method: 'POST', data });
  }

  put<T = unknown, TData = unknown>(url: string, data?: TData, options: Omit<RequestOptions<TData>, 'url' | 'method' | 'data'> = {}) {
    return this.request<T, TData>({ ...options, url, method: 'PUT', data });
  }

  delete<T = unknown>(url: string, options: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) {
    return this.request<T>({ ...options, url, method: 'DELETE' });
  }
}

export const realAdminRequest = new RealRequest({ baseURL: import.meta.env.VITE_REAL_ADMIN_BASE_URL || '/api/admin' });
export const realUserRequest = new RealRequest({ baseURL: import.meta.env.VITE_REAL_USER_BASE_URL || '/api/user' });
export const realOrderRequest = new RealRequest({ baseURL: import.meta.env.VITE_REAL_ORDER_BASE_URL || '/api/order' });
export const realNotifyRequest = new RealRequest({ baseURL: import.meta.env.VITE_REAL_NOTIFY_BASE_URL || '/api/notify' });

export { clearAccessToken, getAccessToken, setAccessToken } from './token';
export { RequestError };
export { isAuthenticationFailure } from './type';
export type { RealResponse, RequestOptions };
