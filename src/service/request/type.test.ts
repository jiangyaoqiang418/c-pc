import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message, Modal } from '@arco-design/web-vue';
import { isAuthenticationFailure, isDefinitiveRejection, RequestError } from './type';
import { financialSubmissionIssue, financialSubmissionSnapshot, submitFinancialOperation, pendingDepositOperation, submitDepositOperation, withSubmissionLock } from '@/utils/financial-submission';
import { getAccessToken, realUserRequest, setAccessToken, shouldRedirectAfterAuthenticationFailure } from '.';
import { createPinia, setActivePinia } from 'pinia';
import * as authApi from '@/service/api/auth';
import { useUserStore } from '@/stores/user';
import { useWalletStore } from '@/stores/wallet';
import { useCartStore } from '@/stores/cart';
import { authApi as demoAuthApi, MOCK_USERS } from '@shared';
import { ACCESS_TOKEN_KEY } from './token';
import { useNotifyStore } from '@/stores/notify';
import * as notifyApi from '@/service/api/notify';
import { redeemFinanceWithReadback } from '@/service/api/finance';
import { useReviewStore } from '@/stores/review';
import * as reviewApi from '@/service/api/review';

beforeEach(() => {
  vi.spyOn(authApi, 'fetchUserAccountInfo').mockResolvedValue({ points: undefined, vipLevel: undefined, accountInfoUnavailable: true });
  const held = new Set<string>();
  vi.stubGlobal('navigator', { locks: { request: vi.fn((key: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => unknown) => {
    expect(options.ifAvailable).toBe(true);
    if (held.has(key)) return Promise.resolve().then(() => callback(null));
    held.add(key);
    return Promise.resolve().then(() => callback({ name: key })).finally(() => held.delete(key));
  }) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('实时会话隔离与全局未读', () => {
  function setupRealtime() {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
    class Socket {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSING = 2;
      static instances: Socket[] = [];
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      close = vi.fn(() => { this.readyState = 2; });
      send = vi.fn();
      constructor() { Socket.instances.push(this); }
    }
    vi.stubGlobal('WebSocket', Socket);
    setAccessToken('qa-realtime-a');
    setActivePinia(createPinia());
    const notificationCount = vi.spyOn(notifyApi, 'fetchUnreadNotificationCount').mockResolvedValue(2);
    const imCount = vi.spyOn(notifyApi, 'fetchUnreadMessageCount').mockResolvedValue(3);
    const store = useNotifyStore();
    return { Socket, store, notificationCount, imCount };
  }

  it('通知已读按 ID 去重，失败可重试，旧会话完成不刷新新账号角标', async () => {
    const { store, notificationCount } = setupRealtime();
    let finish!: (value: boolean) => void;
    const read = vi.spyOn(notifyApi, 'markNotificationRead').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = store.readNotification('9007199254740993');
    const second = store.readNotification('9007199254740993');
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    finish(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(notificationCount).toHaveBeenCalledTimes(1);
    read.mockRejectedValueOnce(new Error('offline'));
    expect(await store.readNotification('qa-failed')).toBe(false);
    const retry = store.readNotification('qa-failed');
    await Promise.resolve();
    store.disconnect();
    setAccessToken('qa-realtime-b');
    finish(true);
    expect(await retry).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(notificationCount).toHaveBeenCalledTimes(1);
  });

  it('旧连接迟到关闭、错误及消息不能清理或污染新账号连接', async () => {
    const { Socket, store } = setupRealtime();
    store.connect();
    const first = Socket.instances[0];
    const late = { open: first.onopen!, close: first.onclose!, error: first.onerror!, message: first.onmessage! };
    store.disconnect();
    expect(first.onmessage).toBeNull();
    setAccessToken('qa-realtime-b');
    store.connect();
    const second = Socket.instances[1];
    second.onmessage!({ data: JSON.stringify({ type: 'READY' }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.socketState).toBe('open');
    late.open();
    late.close();
    late.error();
    late.message({ data: JSON.stringify({ type: 'NOTIFICATION', unreadCount: 999 }) });
    expect(store.socketState).toBe('open');
    expect(store.notificationUnreadCount).toBe(2);
    expect(second.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(Socket.instances).toHaveLength(2);
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PING' }));
    store.disconnect();
    late.close();
    expect(store.socketState).toBe('idle');
  });

  it('凭证更换后 connect 会替换仍打开的旧连接，相同凭证不重复连接', () => {
    const { Socket, store } = setupRealtime();
    store.connect();
    const first = Socket.instances[0];
    setAccessToken('qa-realtime-renewed');
    store.connect();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(first.onmessage).toBeNull();
    expect(Socket.instances).toHaveLength(2);
    const second = Socket.instances[1];
    second.onmessage!({ data: JSON.stringify({ type: 'NOTIFICATION', unreadCount: 6 }) });
    expect(store.notificationUnreadCount).toBe(6);
    store.connect();
    expect(Socket.instances).toHaveLength(2);
    store.disconnect();
  });

  it('没有消息页面订阅时仍刷新角标，合并事件并在退出时取消排队刷新', async () => {
    const { Socket, store, notificationCount, imCount } = setupRealtime();
    store.connect();
    const socket = Socket.instances[0];
    for (const type of ['IM_MESSAGE', 'IM_MESSAGE', 'IM_READ', 'IM_RECALL']) {
      socket.onmessage!({ data: JSON.stringify({ type }) });
    }
    expect(imCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(imCount).toHaveBeenCalledTimes(1);
    expect(notificationCount).toHaveBeenCalledTimes(1);
    expect(store.imUnreadCount).toBe(3);
    socket.onmessage!({ data: JSON.stringify({ type: 'IM_MESSAGE' }) });
    store.disconnect();
    await vi.advanceTimersByTimeAsync(100);
    expect(imCount).toHaveBeenCalledTimes(1);
    expect(store.imUnreadCount).toBe(0);
  });
});

describe('资金操作结果待确认', () => {
  function setupStorage() {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    return values;
  }

  it('赎回响应丢失后按原锁仓核实，仍持仓不重提，确认已赎回才解除', async () => {
    setupStorage();
    const post = vi.spyOn(realUserRequest, 'post').mockRejectedValue(new TypeError('offline'));
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValueOnce({ id: '9007199254740993', status: 'HOLDING' })
      .mockResolvedValueOnce({ id: '9007199254740993', status: 'REDEEMED' });
    await expect(redeemFinanceWithReadback('qa-a', '9007199254740993')).rejects.toMatchObject({ code: 'FINANCIAL_PENDING' });
    expect(financialSubmissionIssue('qa-a', 'finance-redeem:9007199254740993')).not.toBe('');
    expect(await redeemFinanceWithReadback('qa-a', '9007199254740993')).toBe('9007199254740993');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith('/finance/orders/detail', { params: { id: '9007199254740993' }, showError: false });
    expect(financialSubmissionIssue('qa-a', 'finance-redeem:9007199254740993')).toBe('');
  });

  it('赎回未知结果不接受其他订单、未确定状态或读取失败作为成功', async () => {
    setupStorage();
    const post = vi.spyOn(realUserRequest, 'post').mockResolvedValue('wrong-id');
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValueOnce({ id: 'other', status: 'REDEEMED' })
      .mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({ id: '1', status: 'SETTLED' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(redeemFinanceWithReadback('qa-a', '1')).rejects.toMatchObject({ code: 'FINANCIAL_PENDING' });
    }
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(3);
    expect(financialSubmissionIssue('qa-a', 'finance-redeem:1')).not.toBe('');
    expect(financialSubmissionIssue('qa-b', 'finance-redeem:1')).toBe('');
  });

  it('赎回明确拒绝可恢复提交，正常返回原 ID 不依赖额外回读', async () => {
    setupStorage();
    const post = vi.spyOn(realUserRequest, 'post').mockRejectedValueOnce(new RequestError('不可赎回', { status: 422 }))
      .mockResolvedValueOnce('1');
    const get = vi.spyOn(realUserRequest, 'get');
    await expect(redeemFinanceWithReadback('qa-a', '1')).rejects.toThrow('不可赎回');
    expect(financialSubmissionIssue('qa-a', 'finance-redeem:1')).toBe('');
    expect(await redeemFinanceWithReadback('qa-a', '1')).toBe('1');
    expect(post).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
  });

  it('明确拒绝与网络、超时、服务端异常、损坏响应分开处理', () => {
    expect(isDefinitiveRejection(new RequestError('参数拒绝', { status: 400 }))).toBe(true);
    expect(isDefinitiveRejection(new RequestError('登录失效', { code: '-200', response: { code: -200, data: null } }))).toBe(true);
    for (const error of [new TypeError('Failed to fetch'), new RequestError('连接失败', { code: 'NETWORK_ERROR' }),
      new RequestError('超时', { status: 408 }), new RequestError('网关异常', { status: 502 }),
      new RequestError('损坏响应', { code: '' }), new RequestError('未知业务错误', { code: '-1', response: { code: -1, data: null } }),
      new RequestError('操作冲突', { status: 409 }), new RequestError('请求限流', { status: 429 })]) {
      expect(isDefinitiveRejection(error)).toBe(false);
    }
  });

  it('发出请求之前保存标记，确定成功保留 Long ID 并解除标记', async () => {
    const values = setupStorage();
    const submit = vi.fn(async () => {
      expect(financialSubmissionIssue('qa-a', 'withdraw')).toContain('尚未取得确定结果');
      expect([...values.values()][0]).toMatch(/attemptId/);
      return '9007199254740993';
    });
    expect(await submitFinancialOperation('qa-a', 'withdraw', submit, id => id)).toBe('9007199254740993');
    expect(financialSubmissionIssue('qa-a', 'withdraw')).toBe('');
    expect(values.size).toBe(0);
  });

  it('明确拒绝后可修改并重试，但响应丢失后再次进入仍不能重提', async () => {
    setupStorage();
    const reject = vi.fn().mockRejectedValue(new RequestError('参数拒绝', { status: 422 }));
    await expect(submitFinancialOperation('qa-a', 'withdraw', reject, id => id)).rejects.toThrow('参数拒绝');
    expect(financialSubmissionIssue('qa-a', 'withdraw')).toBe('');
    const disconnected = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitFinancialOperation('qa-a', 'withdraw', disconnected, id => id)).rejects.toThrow();
    await expect(submitFinancialOperation('qa-a', 'withdraw', disconnected, id => id)).rejects.toMatchObject({ code: 'FINANCIAL_PENDING' });
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(financialSubmissionIssue('qa-a', 'withdraw')).toContain('暂不可重复提交');
  });

  it('缺失和不安全数字业务编号保留待确认状态，不伪造成功', async () => {
    setupStorage();
    for (const [index, result] of [undefined, null, '', Number.MAX_SAFE_INTEGER + 1].entries()) {
      const action = `finance-subscribe:${index}` as const;
      await expect(submitFinancialOperation('qa-a', action, async () => result, id => id))
        .rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_RESULT' });
      expect(financialSubmissionIssue('qa-a', action)).not.toBe('');
    }
  });

  it('不同账号和产品隔离，同账号同操作进行中不可重复提交', async () => {
    setupStorage();
    let finish!: (value: string) => void;
    const first = submitFinancialOperation('qa-a', 'withdraw', () => new Promise<string>(resolve => { finish = resolve; }), id => id);
    const second = vi.fn(async () => '2');
    await expect(submitFinancialOperation('qa-a', 'withdraw', second, id => id)).rejects.toMatchObject({ code: 'SUBMISSION_IN_PROGRESS' });
    expect(second).not.toHaveBeenCalled();
    await expect(submitFinancialOperation('qa-b', 'withdraw', async () => { throw new TypeError('offline'); }, id => id)).rejects.toThrow();
    expect(financialSubmissionIssue('qa-a', 'finance-subscribe:other')).toBe('');
    finish('9007199254740993');
    await first;
    expect(financialSubmissionIssue('qa-a', 'withdraw')).toBe('');
    expect(financialSubmissionIssue('qa-b', 'withdraw')).not.toBe('');
  });

  it('无法保存标记时不发请求，已成功业务不因清理存储失败变成提交失败', async () => {
    setupStorage();
    const submit = vi.fn(async () => '1');
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('storage denied'); });
    await expect(submitFinancialOperation('qa-a', 'withdraw', submit, id => id)).rejects.toMatchObject({ code: 'LOCAL_STORAGE_UNAVAILABLE' });
    expect(submit).not.toHaveBeenCalled();
    vi.spyOn(localStorage, 'removeItem').mockImplementationOnce(() => { throw new Error('storage denied'); });
    expect(await submitFinancialOperation('qa-a', 'withdraw', submit, id => id)).toBe('1');
    expect(financialSubmissionIssue('qa-a', 'withdraw')).not.toBe('');
  });

  it('待确认快照独立于后来编辑的表单，刷新读取和账号隔离保持，不保存额外字段', async () => {
    const values = setupStorage();
    const form = { amount: '20', chain: 'TRON', toAddress: 'qa-address', token: 'not-to-be-stored' };
    await expect(submitFinancialOperation('qa-a', 'withdraw', async () => { throw new TypeError('offline'); }, id => id, form)).rejects.toThrow();
    form.amount = '50';
    form.toAddress = 'other-address';
    expect(financialSubmissionSnapshot('qa-a', 'withdraw')).toEqual({ amount: '20', chain: 'TRON', toAddress: 'qa-address' });
    expect(financialSubmissionSnapshot('qa-b', 'withdraw')).toBeUndefined();
    expect([...values.values()].join('')).not.toContain('not-to-be-stored');
  });

  it('押金响应丢失后按原金额和幂等键恢复，成功后才允许新操作', async () => {
    setupStorage();
    const submit = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue('9007199254740993');
    await expect(submitDepositOperation('qa-a', 'pay', 2, submit)).rejects.toThrow();
    const pending = pendingDepositOperation('qa-a');
    expect(pending).toMatchObject({ kind: 'pay', amount: 2 });
    expect(pendingDepositOperation('qa-b')).toBeUndefined();
    await expect(submitDepositOperation('qa-a', 'pay', 3, submit)).rejects.toThrow('原金额和方向');
    await expect(submitDepositOperation('qa-a', 'refund', 2, submit)).rejects.toThrow('原金额和方向');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(await submitDepositOperation('qa-a', 'pay', 2, submit)).toBe('9007199254740993');
    expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
    expect(pendingDepositOperation('qa-a')).toBeUndefined();
  });

  it('押金首次明确拒绝解除标记，未知结果后的重试拒绝不能丢弃原键', async () => {
    setupStorage();
    const rejected = vi.fn().mockRejectedValue(new RequestError('参数拒绝', { status: 422 }));
    await expect(submitDepositOperation('qa-a', 'refund', 2, rejected)).rejects.toThrow();
    expect(pendingDepositOperation('qa-a')).toBeUndefined();
    await expect(submitDepositOperation('qa-a', 'refund', 2, async () => { throw new TypeError('offline'); })).rejects.toThrow();
    const pending = pendingDepositOperation('qa-a');
    await expect(submitDepositOperation('qa-a', 'refund', 2, rejected)).rejects.toThrow();
    expect(pendingDepositOperation('qa-a')).toEqual(pending);
  });

  it('押金写前持久化、并发互斥和缺失业务编号保留原操作', async () => {
    setupStorage();
    let finish!: (id: string) => void;
    const first = submitDepositOperation('qa-a', 'pay', 2, operation => {
      expect(pendingDepositOperation('qa-a')).toEqual(operation);
      return new Promise<string>(resolve => { finish = resolve; });
    });
    const second = vi.fn(async () => '2');
    await expect(submitDepositOperation('qa-a', 'pay', 2, second)).rejects.toMatchObject({ code: 'SUBMISSION_IN_PROGRESS' });
    expect(second).not.toHaveBeenCalled();
    finish('1');
    await first;
    await expect(submitDepositOperation('qa-a', 'pay', 2, async () => '')).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_RESULT' });
    expect(pendingDepositOperation('qa-a')?.amount).toBe(2);
  });

  it('押金记录损坏或存储失败时不发送新请求', async () => {
    const values = setupStorage();
    const submit = vi.fn(async () => '1');
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('storage denied'); });
    await expect(submitDepositOperation('qa-a', 'pay', 2, submit)).rejects.toThrow();
    values.set('cpc:deposit-pending:qa-a', '{broken');
    await expect(submitDepositOperation('qa-a', 'pay', 2, submit)).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled();
  });

  it('独立模块实例通过同源锁互斥，未知结果继续复用原押金键', async () => {
    setupStorage();
    vi.resetModules();
    const otherPage = await import('@/utils/financial-submission');
    let fail!: (error: Error) => void;
    const first = submitDepositOperation('qa-a', 'pay', 2, () => new Promise<string>((_, reject) => { fail = reject; })).catch(error => error);
    const submit = vi.fn(async () => '1');
    await expect(otherPage.submitDepositOperation('qa-a', 'pay', 2, submit)).rejects.toMatchObject({ code: 'SUBMISSION_IN_PROGRESS' });
    expect(submit).not.toHaveBeenCalled();
    const original = pendingDepositOperation('qa-a');
    fail(new TypeError('offline'));
    await first;
    expect(await otherPage.submitDepositOperation('qa-a', 'pay', 2, submit)).toBe('1');
    expect(submit).toHaveBeenCalledWith(original);
  });

  it('锁不可用或申请锁期间身份变化时，请求不发出、不保存资金标记', async () => {
    const values = setupStorage();
    const submit = vi.fn(async () => '1');
    const result = submitFinancialOperation('qa-a', 'withdraw', submit, id => id);
    values.set(ACCESS_TOKEN_KEY, 'qa-new-session');
    await expect(result).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(submit).not.toHaveBeenCalled();
    expect(financialSubmissionIssue('qa-a', 'withdraw')).toBe('');
    vi.stubGlobal('navigator', {});
    await expect(submitFinancialOperation('qa-a', 'withdraw', submit, id => id)).rejects.toMatchObject({ code: 'SUBMISSION_LOCK_UNAVAILABLE' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('结算锁覆盖整个异步动作，不排队执行另一次确认，结束后正常释放', async () => {
    setupStorage();
    let finish!: (value: string) => void;
    const first = withSubmissionLock('checkout:qa', () => new Promise<string>(resolve => { finish = resolve; }));
    const second = vi.fn(async () => 'second');
    await expect(withSubmissionLock('checkout:qa', second)).rejects.toMatchObject({ code: 'SUBMISSION_IN_PROGRESS' });
    expect(second).not.toHaveBeenCalled();
    finish('first');
    expect(await first).toBe('first');
    expect(await withSubmissionLock('checkout:qa', second)).toBe('second');
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('登录失效判定', () => {
  it('仅识别明确的 HTTP 或业务登录失效响应', () => {
    expect(isAuthenticationFailure(new RequestError('未登录', { status: 401 }))).toBe(true);
    expect(isAuthenticationFailure(new RequestError('登录失效', { code: '-200' }))).toBe(true);
    expect(isAuthenticationFailure(new RequestError('无权限', { status: 403 }))).toBe(false);
  });

  it('网络或普通业务异常不能清除本地登录态', () => {
    expect(isAuthenticationFailure(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthenticationFailure(new RequestError('服务繁忙', { status: 500 }))).toBe(false);
    expect(isAuthenticationFailure(new RequestError('参数错误', { code: '400' }))).toBe(false);
  });
});

describe('登录失效跳转边界', () => {
  it('纯 POST 查询超时提示重新加载，保留原 HTTP 方法和参数且不自动重试', async () => {
    setupSession();
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = realUserRequest.postQuery('/points/ledger/page', { pageNo: 2, pageSize: 20 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'REQUEST_TIMEOUT', message: '读取超时，请重新加载' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ pageNo: 2, pageSize: 20 }) });
    expect(Message.error).toHaveBeenCalledWith('读取超时，请重新加载');
  });

  it('查询网络失败可重载，IM 首屏已读副作用不能当作纯读取', async () => {
    setupSession();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(realUserRequest.postQuery('/qa-page', {})).rejects.toMatchObject({ message: '网络连接异常，请检查网络后重新加载' });
    await expect(notifyApi.fetchConversationMessages({ conversationId: 'qa', pageNo: 1, pageSize: 50 }))
      .rejects.toMatchObject({ message: '网络连接异常，未取得操作结果，请先核对当前状态' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('请求及响应正文读取超时均终止等待，不清登录、不判为明确拒绝', async () => {
    setupSession();
    vi.useFakeTimers();
    for (const bodyPending of [false, true]) {
      vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
        const pending = () => new Promise((_, reject) => options.signal!.addEventListener('abort',
          () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        return bodyPending ? Promise.resolve({ ok: true, text: pending }) : pending();
      }));
      const result = realUserRequest.get('/qa-read', { showError: false }).catch(error => error);
      await vi.advanceTimersByTimeAsync(30_000);
      const error = await result;
      expect(error).toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(isDefinitiveRejection(error)).toBe(false);
      expect(getAccessToken()).toBe('qa-session-a');
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('资金写请求超时保留标记，不自动重放；正常响应清除等待计时器', async () => {
    setupSession();
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = submitFinancialOperation('qa-timeout', 'withdraw', () => realUserRequest.post('/qa-write', {}, { showError: false }), id => id).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(financialSubmissionIssue('qa-timeout', 'withdraw')).not.toBe('');
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 1, data: 'ok' }))));
    expect(await realUserRequest.get('/qa-read')).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('仅真实 token 会话才跳转登录页', () => {
    expect(shouldRedirectAfterAuthenticationFailure({}, true)).toBe(true);
    expect(shouldRedirectAfterAuthenticationFailure({}, false)).toBe(false);
    expect(shouldRedirectAfterAuthenticationFailure({ skipAuthRedirect: true }, true)).toBe(false);
  });

  function setupSession() {
    const storage = new Map<string, string>();
    const assign = vi.fn();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname: '/order', search: '', assign } });
    vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    setAccessToken('qa-session-a');
    return assign;
  }

  function setupUser() {
    setupSession();
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id: 'account-a', isBuyer: false } as Api.RealSession.UserRecord;
    const wallet = useWalletStore();
    wallet.totalAssets = '42';
    const cart = useCartStore();
    cart.items = [{ productId: '1', qty: 1, selected: true, addedAt: '2026-08-30' }];
    return { user, wallet, cart };
  }

  it('KYC 等主资料刷新可延后积分，主状态先提交且迟到积分不覆盖新资料', async () => {
    const { user } = setupUser();
    const account = deferred<Awaited<ReturnType<typeof authApi.fetchUserAccountInfo>>>();
    vi.mocked(authApi.fetchUserAccountInfo).mockReturnValueOnce(account.promise);
    const profile = vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ id: 'account-a', isBuyer: false, kycStatus: 'approved', accountInfoUnavailable: true } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser({ deferAccount: true });
    expect(profile).toHaveBeenLastCalledWith(undefined, { deferAccount: true });
    expect(user.currentUser?.kycStatus).toBe('approved');
    profile.mockResolvedValue({ id: 'account-a', isBuyer: false, kycStatus: 'approved', points: 100, vipLevel: 'VIP2' } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    account.resolve({ points: 1, vipLevel: 'VIP0', accountInfoUnavailable: false });
    await Promise.resolve();
    expect(user.currentUser).toMatchObject({ points: 100, vipLevel: 'VIP2', kycStatus: 'approved' });
  });

  it('附属积分在途不阻塞登录，迟到响应不能覆盖已退出账号', async () => {
    const { user } = setupUser();
    const account = deferred<Awaited<ReturnType<typeof authApi.fetchUserAccountInfo>>>();
    vi.mocked(authApi.fetchUserAccountInfo).mockReturnValueOnce(account.promise);
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'qa-new-session', user: { id: 'account-b', isBuyer: false, accountInfoUnavailable: true } as Api.RealSession.UserRecord });
    await user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    expect(user.currentUser?.id).toBe('account-b');
    expect(user.initializing).toBe(false);
    expect(user.currentUser?.accountInfoUnavailable).toBe(true);
    user.logout();
    account.resolve({ points: 80, vipLevel: 'VIP1', accountInfoUnavailable: false });
    await Promise.resolve();
    expect(user.currentUser).toBeUndefined();
  });

  it('附属积分成功回填当前身份，但不能覆盖更新的资料回读', async () => {
    const { user } = setupUser();
    const account = deferred<Awaited<ReturnType<typeof authApi.fetchUserAccountInfo>>>();
    vi.mocked(authApi.fetchUserAccountInfo).mockReturnValueOnce(account.promise);
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'qa-new-session', user: { id: 'account-a', isBuyer: false } as Api.RealSession.UserRecord });
    await user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ id: 'account-a', isBuyer: false, points: 100, vipLevel: 'VIP2' } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    account.resolve({ points: 1, vipLevel: 'VIP0', accountInfoUnavailable: false });
    await Promise.resolve();
    expect(user.currentUser).toMatchObject({ points: 100, vipLevel: 'VIP2' });
    vi.mocked(authApi.fetchUserAccountInfo).mockResolvedValueOnce({ points: 80, vipLevel: 'VIP1', accountInfoUnavailable: false });
    await user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    await Promise.resolve();
    expect(user.currentUser).toMatchObject({ id: 'account-a', points: 80, vipLevel: 'VIP1' });
  });

  it('401 登录返回地址包含筛选和锚点', async () => {
    const assign = setupSession();
    window.location.search = '?view=sell&page=2';
    window.location.hash = '#qa-target';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: -200, message: 'expired' }), { status: 401 })));
    await expect(realUserRequest.get('/qa-read')).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith(`/auth/login?redirect=${encodeURIComponent('/order?view=sell&page=2#qa-target')}`);
  });

  it('部分余额保持未知，不显示虚假占比，重新读取可恢复完整分布', async () => {
    const { user, wallet } = setupUser();
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue({ total: '100', todayIn: 0, todayOut: 0,
      distribution: [{ type: 'AVAILABLE', amount: '100' }] });
    await wallet.fetchWallet(user.currentUser!.id);
    expect(wallet.totalAssets).toBe('100');
    expect(wallet.partialData).toBe(true);
    expect(wallet.compositionReady).toBe(false);
    expect(wallet.bucketsWithPct.find(b => b.key === 'available')?.pct).toBe(100);
    expect(wallet.bucketsWithPct.find(b => b.key === 'frozenOrder')?.pct).toBeUndefined();
    expect(wallet.compositionBreakdown).toEqual([]);
    get.mockResolvedValue({ total: 0, todayIn: 0, todayOut: 0, distribution:
      ['AVAILABLE', 'NON_WITHDRAWABLE', 'FINANCE_LOCKED', 'ORDER_FROZEN', 'RISK_FROZEN'].map(type => ({ type, amount: 0 })) });
    await wallet.fetchWallet(user.currentUser!.id);
    expect(wallet.partialData).toBe(false);
    expect(wallet.compositionReady).toBe(true);
    expect(wallet.bucketsWithPct.every(b => b.value === '0' && b.pct === 0)).toBe(true);
  });

  it('原评价在组件离开后仍保留，重试只使用原快照，普通用户资料刷新不清理', async () => {
    const { user } = setupUser();
    const reviews = useReviewStore();
    const params = { orderId: '9007199254740993', productScore: 5, sellerScore: 4, content: '原内容', images: ['原图片'] };
    const submit = vi.spyOn(reviewApi, 'submitReview').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('9007199254740995');
    await expect(reviews.submit(params)).rejects.toThrow('offline');
    params.content = '后来修改';
    params.images.push('新图片');
    user.currentUser = { ...user.currentUser! };
    expect(useReviewStore().getPending(params.orderId)).toMatchObject({ state: 'unknown', params: { content: '原内容', images: ['原图片'] } });
    await reviews.submit(params, true);
    expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);
    expect(reviews.getPending(params.orderId)).toBeUndefined();
  });

  it('评价在途禁止重复提交；退出后迟到失败不恢复旧账号记录', async () => {
    const { user } = setupUser();
    const reviews = useReviewStore();
    let reject!: (error: Error) => void;
    const submit = vi.spyOn(reviewApi, 'submitReview').mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const params = { orderId: 'qa-order', productScore: 5, sellerScore: 5 };
    const pending = reviews.submit(params);
    await expect(reviews.submit(params)).rejects.toMatchObject({ code: 'REVIEW_PENDING' });
    expect(submit).toHaveBeenCalledTimes(1);
    user.currentUser = undefined;
    expect(reviews.pendingReviews).toEqual([]);
    reject(new Error('late'));
    await expect(pending).rejects.toThrow('late');
    expect(reviews.pendingReviews).toEqual([]);
  });

  it('评价首次明确拒绝可重填，未知操作重试被拒仍保留；只用本人原订单记录确认', async () => {
    setupUser();
    const reviews = useReviewStore();
    const params = { orderId: 'qa-order', productScore: 5, sellerScore: 5 };
    const submit = vi.spyOn(reviewApi, 'submitReview').mockRejectedValueOnce(new RequestError('rejected', { status: 422 }));
    await expect(reviews.submit(params)).rejects.toThrow();
    expect(reviews.getPending(params.orderId)).toBeUndefined();
    submit.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new RequestError('rejected', { status: 422 }));
    await expect(reviews.submit(params)).rejects.toThrow();
    await expect(reviews.submit(params, true)).rejects.toThrow();
    expect(reviews.getPending(params.orderId)?.state).toBe('unknown');
    reviews.confirmExisting({ orderId: 'qa-order', reviewId: 'qa-review', userId: 'account-b' } as Api.RealReview.ReviewDTO);
    expect(reviews.getPending(params.orderId)).toBeDefined();
    reviews.confirmExisting({ orderId: 'qa-order', reviewId: 'qa-review', userId: 'account-a' } as Api.RealReview.ReviewDTO);
    expect(reviews.getPending(params.orderId)).toBeUndefined();
  });

  it('会员资料刷新失败保留同账号已知值并标记未更新，不沿用其他身份或角色等级', async () => {
    const { user } = setupUser();
    user.currentUser = { id: 'account-a', isBuyer: false, points: 50, vipLevel: 'VIP1' } as Api.RealSession.UserRecord;
    const fetch = vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ id: 'account-a', isBuyer: false, accountInfoUnavailable: true } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    expect(user.currentUser).toMatchObject({ points: 50, vipLevel: 'VIP1', accountInfoUnavailable: true });
    fetch.mockResolvedValueOnce({ id: 'account-a', isBuyer: true, accountInfoUnavailable: true } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    expect(user.currentUser?.vipLevel).toBeUndefined();
    fetch.mockResolvedValueOnce({ id: 'account-b', isBuyer: false, accountInfoUnavailable: true } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    expect(user.currentUser?.points).toBeUndefined();
    expect(user.currentUser?.vipLevel).toBeUndefined();
  });

  it('网络请求失败统一提示一次并保留会话，支持页面自行处理错误', async () => {
    setupSession();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(realUserRequest.post('/qa/save', {})).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(Message.error).toHaveBeenCalledTimes(1);
    expect(Message.error).toHaveBeenCalledWith(expect.stringContaining('未取得操作结果'));
    expect(getAccessToken()).toBe('qa-session-a');
    await expect(realUserRequest.get('/qa/read', { showError: false })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(Message.error).toHaveBeenCalledTimes(1);
  });

  it('主动取消以及旧账号迟到的网络失败不提示，不清除新会话', async () => {
    setupSession();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(realUserRequest.get('/qa/read', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(Message.error).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => {
      setAccessToken('qa-session-b');
      throw new TypeError('Failed to fetch');
    }));
    await expect(realUserRequest.get('/qa/read')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(Message.error).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('qa-session-b');
  });

  it('响应体读取被主动取消时不显示业务失败', async () => {
    setupSession();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    } }));
    await expect(realUserRequest.get('/qa/read', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(Message.error).not.toHaveBeenCalled();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('外部标签页改变凭证后，旧页面未同步前不能用新身份发请求', async () => {
    setupSession();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(ACCESS_TOKEN_KEY, 'qa-session-b');
    await expect(realUserRequest.post('/qa/save', { id: 'old-account-record' })).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isDefinitiveRejection(new RequestError('会话变更', { code: 'SESSION_CHANGED' }))).toBe(true);
  });

  it('外部会话同步先清旧身份和钱包，再读取新身份，不删除共享凭证', async () => {
    const { user, wallet, cart } = setupUser();
    const profile = deferred<Api.RealSession.UserRecord>();
    vi.spyOn(authApi, 'fetchCurrentUser').mockReturnValue(profile.promise);
    localStorage.setItem(ACCESS_TOKEN_KEY, 'qa-session-b');
    const pending = user.syncExternalSession();
    expect(user.currentUser).toBeUndefined();
    expect(wallet.totalAssets).toBe('0');
    expect(cart.items).toHaveLength(0);
    expect(getAccessToken()).toBe('qa-session-b');
    profile.resolve({ id: 'account-b', isBuyer: false } as Api.RealSession.UserRecord);
    expect(await pending).toBe(true);
    expect(user.currentUser?.id).toBe('account-b');
    expect(getAccessToken()).toBe('qa-session-b');
    expect(await user.syncExternalSession()).toBe(false);
  });

  it('外部连续切换只接受最新身份，外部退出立即移除受保护身份', async () => {
    const { user } = setupUser();
    const first = deferred<Api.RealSession.UserRecord>();
    const second = deferred<Api.RealSession.UserRecord>();
    vi.spyOn(authApi, 'fetchCurrentUser').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    localStorage.setItem(ACCESS_TOKEN_KEY, 'qa-session-b');
    const pendingFirst = user.syncExternalSession();
    localStorage.setItem(ACCESS_TOKEN_KEY, 'qa-session-c');
    const pendingSecond = user.syncExternalSession();
    second.resolve({ id: 'account-c', isBuyer: false } as Api.RealSession.UserRecord);
    await pendingSecond;
    first.resolve({ id: 'account-b', isBuyer: true } as Api.RealSession.UserRecord);
    expect(await pendingFirst).toBe(false);
    expect(user.currentUser?.id).toBe('account-c');
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    await user.syncExternalSession();
    expect(user.currentUser).toBeUndefined();
    expect(user.isLoggedIn).toBe(false);
  });

  it('外部身份读取失败保持新凭证和重试状态，不继续显示旧账号', async () => {
    const { user } = setupUser();
    localStorage.setItem(ACCESS_TOKEN_KEY, 'qa-session-b');
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ id: 'account-b', isBuyer: false } as Api.RealSession.UserRecord);
    await user.syncExternalSession();
    expect(user.currentUser).toBeUndefined();
    expect(user.initializationError).toContain('登录凭证已保留');
    expect(getAccessToken()).toBe('qa-session-b');
    await user.init();
    expect(user.currentUser?.id).toBe('account-b');
  });

  it('会话初始化网络失败保留凭证和错误状态，重试成功后恢复真实身份及购物车归属', async () => {
    setupSession();
    setActivePinia(createPinia());
    const user = useUserStore();
    const cart = useCartStore();
    cart.init();
    const switchOwner = vi.spyOn(cart, 'switchOwner');
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ id: 'account-a', isBuyer: false } as Api.RealSession.UserRecord);
    await user.init();
    expect(user.initializationError).toContain('登录凭证已保留');
    expect(user.isLoggedIn).toBe(false);
    expect(user.initializing).toBe(false);
    expect(getAccessToken()).toBe('qa-session-a');
    await user.init();
    expect(user.initializationError).toBe('');
    expect(user.isLoggedIn).toBe(true);
    expect(switchOwner).toHaveBeenCalledWith('account-a');
  });

  it('明确失效的初始化不伪装成可重试的网络异常', async () => {
    setupSession();
    setActivePinia(createPinia());
    const user = useUserStore();
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(new RequestError('过期', { status: 401 }));
    await user.init();
    expect(getAccessToken()).toBe('');
    expect(user.initializationError).toBe('');
    expect(user.isLoggedIn).toBe(false);
  });

  it('演示入口不能清除或替代已有真实身份', async () => {
    vi.stubEnv('DEV', true);
    const { user, wallet, cart } = setupUser();
    const demoLogin = vi.spyOn(demoAuthApi, 'switchCurrentUser');
    await expect(user.login(MOCK_USERS[0].userId)).rejects.toThrow('当前登录未改变');
    expect(demoLogin).not.toHaveBeenCalled();
    expect(user.currentUser?.id).toBe('account-a');
    expect(getAccessToken()).toBe('qa-session-a');
    expect(wallet.totalAssets).toBe('42');
    expect(cart.items).toHaveLength(1);
  });

  it('演示身份和刷新恢复都不成为真实登录；非开发环境拒绝演示入口', async () => {
    vi.stubEnv('DEV', true);
    setupSession();
    setAccessToken('');
    setActivePinia(createPinia());
    const user = useUserStore();
    vi.spyOn(demoAuthApi, 'switchCurrentUser').mockResolvedValue({ id: 1, nickname: 'QA demo', isBuyer: true } as Api.User.UserRecord);
    await user.login(MOCK_USERS[0].userId);
    expect(user.demoUser?.nickname).toBe('QA demo');
    expect(user.currentUser).toBeUndefined();
    expect(user.isLoggedIn).toBe(false);
    expect(user.canSwitchToBuyer).toBe(false);
    setActivePinia(createPinia());
    const restored = useUserStore();
    await restored.init();
    expect(restored.demoUser?.nickname).toBe('QA demo');
    expect(restored.isLoggedIn).toBe(false);
    vi.stubEnv('DEV', false);
    setActivePinia(createPinia());
    const production = useUserStore();
    await production.init();
    expect(production.demoUser).toBeUndefined();
    await expect(production.login(MOCK_USERS[0].userId)).rejects.toThrow('不提供演示登录');
  });

  it('买手权限回读失效后立即退出操作视角，不能仅凭旧视角继续操作', async () => {
    const { user } = setupUser();
    user.currentUser = { id: 'account-a', isBuyer: true } as Api.RealSession.UserRecord;
    expect(user.setAudience('buyer')).toBe(true);
    expect(user.isBuyerActive).toBe(true);
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ id: 'account-a', isBuyer: false } as Api.RealSession.UserRecord);
    await user.refreshCurrentUser();
    expect(user.currentAudience).toBe('customer');
    expect(user.isBuyerActive).toBe(false);
    expect(user.setAudience('buyer')).toBe(false);
    user.currentAudience = 'buyer';
    expect(user.isBuyerActive).toBe(false);
  });

  it('权限读取失败保留现有权限，不误退出有效买手视角', async () => {
    const { user } = setupUser();
    user.currentUser = { id: 'account-a', isBuyer: true } as Api.RealSession.UserRecord;
    user.setAudience('buyer');
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(new Error('读取失败'));
    await expect(user.refreshCurrentUser()).rejects.toThrow('读取失败');
    expect(user.currentAudience).toBe('buyer');
    expect(user.isBuyerActive).toBe(true);
  });

  it('临时凭证只作用于当前请求，不能提前切换全局会话', async () => {
    setupSession();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 1, data: { userId: 'account-b' } })));
    vi.stubGlobal('fetch', fetchMock);
    await realUserRequest.get('/auth/me', { headers: { 'X-Access-Token': 'qa-session-b' }, skipAuthRedirect: true });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Access-Token')).toBe('qa-session-b');
    expect(getAccessToken()).toBe('qa-session-a');
  });

  it('同账号重新登录推进会话版本，普通资料刷新不触发重连', async () => {
    const { user } = setupUser();
    const originalVersion = user.sessionVersion;
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: 'qa-session-renewed', user: { ...user.currentUser! } });
    await user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    expect(user.currentUser?.id).toBe('account-a');
    expect(user.sessionVersion).toBe(originalVersion + 1);
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ ...user.currentUser! });
    await user.refreshCurrentUser();
    expect(user.sessionVersion).toBe(originalVersion + 1);
  });

  it('登录资料补全期间及失败后，旧账号、钱包、购物车和凭证均保持', async () => {
    const { user, wallet, cart } = setupUser();
    const profile = deferred<Api.RealAuth.UserProfileVO>();
    const started = deferred<void>();
    vi.spyOn(realUserRequest, 'post').mockResolvedValue({ token: 'qa-session-b', userId: 'account-b' });
    vi.spyOn(realUserRequest, 'get').mockImplementation((url, options) => {
      expect(url).toBe('/auth/me');
      expect(new Headers(options?.headers).get('X-Access-Token')).toBe('qa-session-b');
      started.resolve();
      return profile.promise;
    });
    const pending = user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    const result = expect(pending).rejects.toThrow('资料读取失败');
    await started.promise;
    expect(getAccessToken()).toBe('qa-session-a');
    expect(user.currentUser?.id).toBe('account-a');
    profile.reject(new Error('资料读取失败'));
    await result;
    expect(getAccessToken()).toBe('qa-session-a');
    expect(user.currentUser?.id).toBe('account-a');
    expect(wallet.totalAssets).toBe('42');
    expect(cart.items).toHaveLength(1);
  });

  it('只有最新成功登录能同时提交身份和凭证并清理旧账号数据', async () => {
    const { user, wallet, cart } = setupUser();
    type LoginResult = Awaited<ReturnType<typeof authApi.login>>;
    const first = deferred<LoginResult>();
    const second = deferred<LoginResult>();
    vi.spyOn(authApi, 'login').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const pendingFirst = user.loginWithPassword({ email: 'first@example.invalid', password: 'qa-only' });
    const staleResult = expect(pendingFirst).rejects.toThrow('登录请求已失效');
    const pendingSecond = user.loginWithPassword({ email: 'second@example.invalid', password: 'qa-only' });
    second.resolve({ token: 'qa-session-c', user: { id: 'account-c', isBuyer: false } as Api.RealSession.UserRecord });
    await pendingSecond;
    first.resolve({ token: 'qa-session-b', user: { id: 'account-b', isBuyer: false } as Api.RealSession.UserRecord });
    await staleResult;
    expect(getAccessToken()).toBe('qa-session-c');
    expect(user.currentUser?.id).toBe('account-c');
    expect(wallet.totalAssets).toBe('0');
    expect(cart.items).toHaveLength(0);
  });

  it('退出账号后，未完成的登录响应不能重新登录', async () => {
    const { user } = setupUser();
    const response = deferred<Awaited<ReturnType<typeof authApi.login>>>();
    vi.spyOn(authApi, 'login').mockReturnValueOnce(response.promise);
    const pending = user.loginWithPassword({ email: 'qa@example.invalid', password: 'qa-only' });
    const result = expect(pending).rejects.toThrow('登录请求已失效');
    user.logout();
    response.resolve({ token: 'qa-session-b', user: { id: 'account-b', isBuyer: false } as Api.RealSession.UserRecord });
    await result;
    expect(getAccessToken()).toBe('');
    expect(user.currentUser).toBeUndefined();
  });

  it('旧请求返回 401 时不清除已切换的新会话', async () => {
    const assign = setupSession();
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const pending = realUserRequest.get('/auth/me');
    setAccessToken('qa-session-b');
    respond(new Response(JSON.stringify({ message: '已过期' }), { status: 401 }));
    await expect(pending).rejects.toThrow('已过期');
    expect(getAccessToken()).toBe('qa-session-b');
    expect(assign).not.toHaveBeenCalled();
  });

  it('403 仅显示权限失败，不退出当前账号', async () => {
    const assign = setupSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '无权限' }), { status: 403 })));
    await expect(realUserRequest.get('/auth/me')).rejects.toThrow('无权限');
    expect(getAccessToken()).toBe('qa-session-a');
    expect(assign).not.toHaveBeenCalled();
  });

  it('旧登录失效弹窗确认时重新核对会话', async () => {
    const assign = setupSession();
    let confirm: (() => void) | undefined;
    vi.spyOn(Modal, 'error').mockImplementation(config => {
      confirm = config.onOk as (() => void) | undefined;
      return { close: vi.fn(), update: vi.fn() };
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: '-201', message: '登录已过期' }))));
    await expect(realUserRequest.get('/auth/me')).rejects.toThrow('登录已过期');
    setAccessToken('qa-session-b');
    expect(confirm).toBeDefined();
    confirm!();
    expect(getAccessToken()).toBe('qa-session-b');
    expect(assign).not.toHaveBeenCalled();
  });
});
