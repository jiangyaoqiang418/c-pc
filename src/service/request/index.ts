import { Message, Modal } from '@arco-design/web-vue';
import { clearAccessToken, getAccessToken, getAcceptedAccessToken } from './token';
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

function redirectToLogin(expectedToken: string) {
  if (getAccessToken() !== expectedToken) return;
  clearAccessToken();
  const current = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
  if (window.location.pathname !== '/auth/login') {
    window.location.assign(`/auth/login?redirect=${encodeURIComponent(current)}`);
  }
}

let logoutModal: ReturnType<typeof Modal.error> | undefined;
let logoutModalToken: string | undefined;

function handleLogoutMessage(message: string, modal: boolean, token: string) {
  if (getAccessToken() !== token) return;
  if (modal) {
    if (logoutModal && logoutModalToken === token) return;
    logoutModal?.close();
    logoutModalToken = token;
    logoutModal = Modal.error({
      title: '登录状态已失效',
      content: message,
      maskClosable: false,
      onOk: () => {
        logoutModal = undefined;
        logoutModalToken = undefined;
        redirectToLogin(token);
      }
    });
    return;
  }
  Message.error(message);
  redirectToLogin(token);
}

/** 演示会话没有真实 token，真实接口失败时不应被当作登录失效清理。 */
export function shouldRedirectAfterAuthenticationFailure(options: Pick<RequestOptions, 'skipAuthRedirect'>, hasAccessToken: boolean) {
  return hasAccessToken && !options.skipAuthRedirect;
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
    const reading = options.operation === 'read' || (options.operation === undefined && method === 'GET');
    const headers = new Headers(options.headers);
    // 登录资料补全可使用临时凭证，不提前改变全局账号身份。
    const explicitToken = headers.get('X-Access-Token');
    const token = explicitToken ?? getAcceptedAccessToken();
    if (explicitToken === null && token !== getAccessToken()) {
      // 外部登录已改变共享凭证，但本页身份尚未完成清理；禁止拿新凭证提交旧表单。
      throw new RequestError('登录会话已在其他页面切换，请等待身份核对后重试', { code: 'SESSION_CHANGED' });
    }

    if (token) headers.set('X-Access-Token', token);
    const isFormData = typeof FormData !== 'undefined' && options.data instanceof FormData;
    if (options.data !== undefined && !isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const url = appendParams(joinURL(this.config.baseURL, options.url), options.params);
    let response: Response;
    let responseText: string;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), isFormData ? 120_000 : 30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.data === undefined ? undefined : isFormData ? (options.data as BodyInit) : JSON.stringify(options.data),
        signal
      });
      responseText = await response.text();
    } catch (error) {
      // 页面切换主动取消读取不是业务失败；旧账号的网络异常也不能干扰新会话。
      if (options.signal?.aborted) throw error;
      if (deadline.signal.aborted) {
        const message = reading ? '读取超时，请重新加载' : '请求超时，操作结果待核实，请先查看当前状态，勿重复提交';
        if (options.showError !== false && getAccessToken() === token) Message.error(message);
        throw new RequestError(message, { code: 'REQUEST_TIMEOUT' });
      }
      if (error instanceof Error && error.name === 'AbortError') throw error;
      const message = reading ? '网络连接异常，请检查网络后重新加载' : '网络连接异常，未取得操作结果，请先核对当前状态';
      if (options.showError !== false && getAccessToken() === token) Message.error(message);
      throw new RequestError(message, { code: 'NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }

    let body: RealResponse<T> | null = null;
    try {
      body = parseJsonPreservingLong<RealResponse<T>>(responseText);
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      body = null;
    }

    if (!response.ok) {
      const message = getResponseMessage(body) || `HTTP ${response.status}`;
      const isAuthenticationError = response.status === 401;
      if (isAuthenticationError && token && getAccessToken() === token && shouldRedirectAfterAuthenticationFailure(options, true)) {
        handleLogoutMessage(message, false, token);
      } else if (options.showError !== false && getAccessToken() === token) {
        Message.error(message);
      }
      throw new RequestError(message, { status: response.status, response: body || undefined });
    }

    const code = String(body?.code ?? '');
    if (code !== this.config.successCode) {
      const message = getResponseMessage(body);
      const isLogout = this.config.logoutCodes.includes(code);
      const isModalLogout = this.config.modalLogoutCodes.includes(code);

      if ((isLogout || isModalLogout) && token && getAccessToken() === token && shouldRedirectAfterAuthenticationFailure(options, true)) {
        handleLogoutMessage(message, isModalLogout, token);
      } else if (options.showError !== false && getAccessToken() === token) {
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

  /** 明确无写入副作用的 POST 查询；IM 首屏读取自动已读等接口不能使用。 */
  postQuery<T = unknown, TData = unknown>(url: string, data?: TData, options: Omit<RequestOptions<TData>, 'url' | 'method' | 'data'> = {}) {
    return this.post<T, TData>(url, data, { ...options, operation: 'read' });
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
