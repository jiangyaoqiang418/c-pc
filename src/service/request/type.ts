export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RealResponse<T = unknown> {
  code: string | number;
  message?: string;
  msg?: string;
  data: T;
  success?: boolean;
}

export interface RequestOptions<TData = unknown> {
  url: string;
  method?: RequestMethod;
  /** 仅影响失败提示，不改变 HTTP 方法，也不触发自动重试。 */
  operation?: 'read' | 'write';
  params?: Record<string, string | number | boolean | null | undefined>;
  data?: TData;
  headers?: HeadersInit;
  signal?: AbortSignal;
  showError?: boolean;
  skipAuthRedirect?: boolean;
}

export interface RequestConfig {
  baseURL: string;
  successCode: string;
  logoutCodes: string[];
  modalLogoutCodes: string[];
}

export class RequestError extends Error {
  code?: string;
  status?: number;
  response?: RealResponse;

  constructor(message: string, options: { code?: string; status?: number; response?: RealResponse } = {}) {
    super(message);
    this.name = 'RequestError';
    this.code = options.code;
    this.status = options.status;
    this.response = options.response;
  }
}

/** 只有服务端明确拒绝身份时才应清理本地 token；网络波动不能视为登出。 */
export function isAuthenticationFailure(error: unknown) {
  return error instanceof RequestError
    && (error.status === 401 || error.code === '-200' || error.code === '-201');
}

/** 写入响应丢失、网关超时和服务端异常不能证明业务未执行。 */
export function isDefinitiveRejection(error: unknown) {
  if (!(error instanceof RequestError)) return false;
  if (error.code === 'SESSION_CHANGED') return true; // 请求尚未发出，无资金结果待确认。
  // 仅接受明确的请求/身份校验拒绝；冲突、限流及未知业务码不能证明写入未执行。
  if (error.status !== undefined) return [400, 401, 403, 404, 405, 413, 415, 422].includes(error.status);
  return isAuthenticationFailure(error);
}
