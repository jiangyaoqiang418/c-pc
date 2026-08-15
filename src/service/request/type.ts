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
    && (error.status === 401 || error.status === 403 || error.code === '-200' || error.code === '-201');
}
