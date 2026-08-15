import { describe, expect, it } from 'vitest';
import { isAuthenticationFailure, RequestError } from './type';

describe('登录失效判定', () => {
  it('仅识别明确的 HTTP 或业务登录失效响应', () => {
    expect(isAuthenticationFailure(new RequestError('未登录', { status: 401 }))).toBe(true);
    expect(isAuthenticationFailure(new RequestError('登录失效', { code: '-200' }))).toBe(true);
    expect(isAuthenticationFailure(new RequestError('无权限', { status: 403 }))).toBe(true);
  });

  it('网络或普通业务异常不能清除本地登录态', () => {
    expect(isAuthenticationFailure(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthenticationFailure(new RequestError('服务繁忙', { status: 500 }))).toBe(false);
    expect(isAuthenticationFailure(new RequestError('参数错误', { code: '400' }))).toBe(false);
  });
});
