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
