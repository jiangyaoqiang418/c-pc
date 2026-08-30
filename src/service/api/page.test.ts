import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMergeSourcePages, resolvePageSize, toPageTotal } from './page';
import { realOrderRequest, realUserRequest, realNotifyRequest } from '@/service/request';
import { sendConversationMessage } from './notify';
import { findReviewableOrderIds, submitReview, replyReview, createReviewAppeal } from './review';
import { fetchMyOrders } from './order';
import { fetchRechargePage, fetchWalletLedger, fetchWithdrawPage, fetchWalletOverview, prepareWithdrawal } from './wallet';
import { fetchHall } from './purchase';
import { fetchMyPointLogs, fetchPointRules } from './point';
import { fetchCurrentUser, updateProfile, prepareRegistration } from './auth';
import { prepareAddress } from './address';
import { createAddress, updateAddress } from './address';
import { createRefund } from './refund';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { financeRedemptionIssue, financeSubscriptionIssue } from './finance';
import { createRecharge } from './wallet';
import { submitBuyerApplication } from './buyer';

afterEach(() => vi.restoreAllMocks());

describe('本轮交互边界', () => {
  it('IM发送允许页面依据实时确认处理错误，保留原请求标识与失败原因', async () => {
    const error = new RequestError('timeout', { code: 'REQUEST_TIMEOUT' });
    const send = vi.spyOn(realNotifyRequest, 'post').mockRejectedValue(error);
    const params = { conversationId: '2093370220769533954', clientMsgId: 'qa-original', msgType: 'TEXT' as const, content: 'QA' };
    await expect(sendConversationMessage(params, { showError: false })).rejects.toBe(error);
    expect(send).toHaveBeenCalledExactlyOnceWith('/im/messages/send', params, { skipAuthRedirect: true, showError: false });
  });
  it('申购仅允许在售产品，下架售罄及未知状态均明确拦截', () => {
    expect(financeSubscriptionIssue({ status: 'ON_SALE' })).toBe('');
    expect(financeSubscriptionIssue({ status: 'OFF_SALE' })).toContain('下架');
    expect(financeSubscriptionIssue({ status: 'SOLD_OUT' })).toContain('售罄');
    expect(financeSubscriptionIssue({ status: undefined! })).toContain('未确认');
  });

  it('赎回费用区分有效零与缺失值，状态不可赎回时不接受确认', () => {
    const order = { status: 'HOLDING', canRedeem: true, redeemFee: '0', redeemableInterest: 0 } as Api.RealFinance.FinanceOrderVO;
    expect(financeRedemptionIssue(order)).toBe('');
    for (const value of [undefined, null, '', ' ', 'invalid', -1]) {
      expect(financeRedemptionIssue({ ...order, redeemFee: value as string })).toContain('尚未确认');
      expect(financeRedemptionIssue({ ...order, redeemableInterest: value as string })).toContain('尚未确认');
    }
    expect(financeRedemptionIssue({ ...order, status: 'REDEEMED' })).toContain('不可');
    expect(financeRedemptionIssue({ ...order, canRedeem: false })).toContain('不可');
  });

  it('充值和买手申请可由页面接管未知结果提示，保持原参数且不重试', async () => {
    const error = new RequestError('timeout', { code: 'REQUEST_TIMEOUT' });
    const post = vi.spyOn(realUserRequest, 'post').mockRejectedValue(error);
    const recharge = { chain: 'TRON', amount: 1 };
    const buyer = { realName: 'QA', contact: 'QA', reason: 'QA' };
    await expect(createRecharge(recharge, { showError: false })).rejects.toBe(error);
    await expect(submitBuyerApplication(buyer, { showError: false })).rejects.toBe(error);
    expect(post).toHaveBeenNthCalledWith(1, '/recharge/create', recharge, { showError: false });
    expect(post).toHaveBeenNthCalledWith(2, '/buyer/apply', buyer, { showError: false });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('地址统一去空白、保留国际电话及 Long ID，拒绝空白与超长字段', () => {
    const form = { id: '9007199254740993', receiverName: ' QA ', receiverPhone: ' +44 123456789012 ',
      country: ' QA ', province: ' QA ', detailAddress: ' QA ' };
    const result = prepareAddress(form);
    expect(result.error).toBe('');
    expect(result.params).toMatchObject({ id: form.id, receiverName: 'QA', receiverPhone: '+44 123456789012' });
    expect(form.receiverName).toBe(' QA ');
    expect(prepareAddress({ ...form, detailAddress: '   ' }).error).not.toBe('');
    expect(prepareAddress({ ...form, receiverPhone: '1'.repeat(33) }).error).not.toBe('');
  });

  it('注册校验与提示一致且不裁剪密码', () => {
    const form = { email: ' qa@example.invalid ', nickname: ' QA ', password: ' QApass ', confirm: ' QApass ' };
    expect(prepareRegistration(form)).toEqual({ error: '', params: { email: 'qa@example.invalid', nickname: 'QA', password: ' QApass ', roles: ['CUSTOMER'] } });
    for (const value of [{ email: 'bad' }, { nickname: '   ' }, { password: '12345', confirm: '12345' },
      { password: 'a'.repeat(65), confirm: 'a'.repeat(65) }, { confirm: 'other' }]) {
      expect(prepareRegistration({ ...form, ...value }).error).not.toBe('');
    }
  });

  it('登录主资料不发起积分读取，返回未更新标记而非虚假等级', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue({ userId: 'qa', roles: ['BUYER'] });
    expect(await fetchCurrentUser(undefined, { deferAccount: true })).toMatchObject({ id: 'qa', isBuyer: true, accountInfoUnavailable: true });
    expect(get).toHaveBeenCalledExactlyOnceWith('/auth/me', {});
  });

  it('评价回复/申诉由页面接管提示，保留原错误且不自动重试', async () => {
    const error = new RequestError('timeout', { code: 'REQUEST_TIMEOUT' });
    const put = vi.spyOn(realOrderRequest, 'put').mockRejectedValue(error);
    const post = vi.spyOn(realOrderRequest, 'post').mockRejectedValue(error);
    const reply = { reviewId: '9007199254740993', content: 'QA' };
    const appeal = { reviewId: reply.reviewId, reason: 'QA', evidenceImages: ['qa-image'] };
    await expect(replyReview(reply, { showError: false })).rejects.toBe(error);
    await expect(createReviewAppeal(appeal, { showError: false })).rejects.toBe(error);
    expect(put).toHaveBeenCalledExactlyOnceWith('/reviews/reply', reply, { showError: false });
    expect(post).toHaveBeenCalledExactlyOnceWith('/reviews/appeals/create', appeal, { showError: false });
    expect(isDefinitiveRejection(error)).toBe(false);
  });
});

describe('仅退款提交错误分类', () => {
  it('页面接管提示时保留原订单参数和原退款 ID', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('2092532719385403393');
    const params = { orderId: '2092532719385403393', reason: 'QA', evidenceImages: [] };
    await expect(createRefund(params, { showError: false })).resolves.toBe('2092532719385403393');
    expect(post).toHaveBeenCalledExactlyOnceWith('/orders/refunds/create', params, { showError: false });
  });
  it('网络未知与明确拒绝原样传递，不吞错或自动重试', async () => {
    const post = vi.spyOn(realOrderRequest, 'post');
    for (const [error, rejected] of [
      [new RequestError('timeout', { code: 'REQUEST_TIMEOUT' }), false],
      [new RequestError('invalid', { status: 422 }), true]
    ] as const) {
      post.mockRejectedValueOnce(error);
      await expect(createRefund({ orderId: 'qa-order', reason: 'QA' }, { showError: false })).rejects.toBe(error);
      expect(isDefinitiveRejection(error)).toBe(rejected);
    }
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('钱包部分金额未知', () => {
  it('缺失分布与收支不伪造零，已返回总额仍保留', async () => {
    vi.spyOn(realUserRequest, 'get').mockResolvedValue({ total: '12.34000000', todayIn: 0 });
    const result = await fetchWalletOverview('qa');
    expect(result.total).toBe('12.34000000');
    expect(result.account.available).toBeUndefined();
    expect(result.account.depositGuaranteed).toBeUndefined();
    expect(result.today).toEqual({ depositIn: '0', withdrawOut: undefined, internalVolume: undefined });
  });

  it('逐桶保留有效零与原精度，无效金额不覆盖其他有效桶', async () => {
    vi.spyOn(realUserRequest, 'get').mockResolvedValue({ distribution: [
      { type: 'AVAILABLE', amount: '30.12345678' }, { type: 'FROZEN_ORDER', amount: 0 },
      { type: 'DEPOSIT_AVAILABLE', amount: null }, { type: 'FROZEN_RISK', amount: 'invalid' }
    ] });
    const result = await fetchWalletOverview('qa');
    expect(result.total).toBeUndefined();
    expect(result.account).toMatchObject({ available: '30.12345678', frozenOrder: '0' });
    expect(result.account.depositAvailable).toBeUndefined();
    expect(result.account.frozenRisk).toBeUndefined();
  });

  it('提现明确区分未知余额和真实零余额', () => {
    const params: Api.RealWallet.WithdrawCreateParams = { chain: 'TRON', toAddress: 'T'.repeat(34), amount: 20 };
    for (const balance of [undefined, '', ' ', 'invalid']) {
      expect(prepareWithdrawal(params, balance).error).toBe('请先成功读取钱包余额');
    }
    expect(prepareWithdrawal(params, '0').error).toBe('可用余额不足');
    expect(prepareWithdrawal(params, '20').error).toBe('');
  });
});

describe('保存结果与后续读取分离', () => {
  it('资料保存成功不再等待资料读取，也不重复读取', async () => {
    const put = vi.spyOn(realUserRequest, 'put').mockResolvedValue(undefined);
    const get = vi.spyOn(realUserRequest, 'get').mockRejectedValue(new Error('read unavailable'));
    await expect(updateProfile({ nickname: 'QA' })).resolves.toBeUndefined();
    expect(put).toHaveBeenCalledWith('/auth/profile', { nickname: 'QA' });
    expect(get).not.toHaveBeenCalled();
  });

  it('地址新增和修改保留成功 ID，不因详情服务不可用否定写入', async () => {
    const id = '9007199254740993';
    const params = { receiverName: 'QA', receiverPhone: '10000000000', country: '中国', province: 'QA', detailAddress: 'QA' };
    vi.spyOn(realUserRequest, 'post').mockResolvedValue(id);
    vi.spyOn(realUserRequest, 'put').mockResolvedValue(id);
    const get = vi.spyOn(realUserRequest, 'get').mockRejectedValue(new Error('read unavailable'));
    expect(await createAddress(params)).toBe(id);
    expect(await updateAddress({ ...params, id })).toBe(id);
    expect(get).not.toHaveBeenCalled();
  });

  it('写入明确失败保持失败，缺失地址编号不伪造成功', async () => {
    const params = { receiverName: 'QA', receiverPhone: '10000000000', country: '中国', province: 'QA', detailAddress: 'QA' };
    const post = vi.spyOn(realUserRequest, 'post').mockRejectedValueOnce(new Error('rejected'));
    await expect(createAddress(params)).rejects.toThrow('rejected');
    for (const id of [undefined, '', Number.MAX_SAFE_INTEGER + 1]) {
      post.mockResolvedValueOnce(id);
      await expect(createAddress(params)).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_RESULT' });
    }
  });
});

describe('会话会员资料缺失', () => {
  it('积分接口失败不伪造等级或零积分，资料中的有效积分仍保留', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValueOnce({ userId: 'qa', roles: [] }).mockRejectedValueOnce(new Error('offline'));
    expect(await fetchCurrentUser()).toMatchObject({ id: 'qa', points: undefined, vipLevel: undefined, accountInfoUnavailable: true });
    get.mockResolvedValueOnce({ userId: 'qa', roles: [], points: 15 }).mockRejectedValueOnce(new Error('offline'));
    expect(await fetchCurrentUser()).toMatchObject({ points: 15, vipLevel: undefined, accountInfoUnavailable: true });
  });
  it('真实零积分和 VIP0 保持有效，不把未支持等级当 VIP0', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValueOnce({ userId: 'qa', roles: [] })
      .mockResolvedValueOnce({ points: 0, customer: { level: 'VIP0' } });
    expect(await fetchCurrentUser()).toMatchObject({ points: 0, vipLevel: 'VIP0', accountInfoUnavailable: false });
    get.mockResolvedValueOnce({ userId: 'qa', roles: ['BUYER'] }).mockResolvedValueOnce({ points: 12, buyer: { level: 'OTHER' } });
    expect(await fetchCurrentUser()).toMatchObject({ points: 12, vipLevel: undefined, accountInfoUnavailable: true });
  });
});

describe('评价提交结果', () => {
  it('保留原订单与内容重试，不接受缺失或不安全评价 ID 为成功', async () => {
    const params = { orderId: '9007199254740993', productScore: 5, sellerScore: 4, content: 'QA 原内容', images: ['qa-image'], anonymous: false };
    const post = vi.spyOn(realOrderRequest, 'post').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('9007199254740995');
    await expect(submitReview(params)).rejects.toThrow('offline');
    expect(await submitReview(params)).toBe('9007199254740995');
    expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
    expect(post).toHaveBeenLastCalledWith('/reviews/create', params);
    for (const id of [undefined, '', {}, Number.MAX_SAFE_INTEGER + 1]) {
      post.mockResolvedValueOnce(id);
      await expect(submitReview(params)).rejects.toMatchObject({ code: 'UNKNOWN_OPERATION_RESULT' });
    }
  });
});

describe('普通分页实际步长', () => {
  it('读取实际元数据，无元数据沿用请求步长，不把短末页当作新步长', () => {
    expect(resolvePageSize({ size: 5 }, 10)).toBe(5);
    expect(resolvePageSize({ pageSize: 5 }, 10)).toBe(5);
    expect(resolvePageSize({}, 10)).toBe(10);
    expect(() => resolvePageSize({ size: 0 }, 10)).toThrow('分页大小异常');
    expect(() => resolvePageSize({ size: 1.5 }, 10)).toThrow('分页大小异常');
  });

  it('单状态订单和钱包不丢弃服务端页大小，分页器可到达第六页', async () => {
    vi.spyOn(realOrderRequest, 'post').mockResolvedValue({ total: 30, pageSize: 5, records: [] });
    vi.spyOn(realUserRequest, 'post').mockResolvedValue({ total: 30, size: 5, records: [] });
    const results = await Promise.all([
      fetchMyOrders({ current: 1, size: 10, statuses: ['PENDING_PAYMENT'] }),
      fetchWalletLedger({ current: 1, size: 10 }),
      fetchRechargePage({ pageNo: 1, pageSize: 10 }),
      fetchWithdrawPage({ pageNo: 1, pageSize: 10 }),
      fetchHall({ current: 1, size: 10 })
    ]);
    for (const result of results) {
      expect(resolvePageSize(result, 10)).toBe(5);
      expect(Math.ceil(result.total / result.size)).toBe(6);
    }
  });
});

describe('积分原始行为边界', () => {
  it('未知和缺失行为不映射成消费，保留原名称、分值与申诉资格', async () => {
    vi.spyOn(realUserRequest, 'post').mockResolvedValue({ total: 2, records: [
      { id: '9007199254740993', userId: '1', behaviorCode: 'QA_NEW_BEHAVIOR', behaviorName: '测试新行为', score: -3, balanceAfter: 7, appealable: true },
      { id: '9007199254740994', userId: '1', score: 1, balanceAfter: 8, appealable: false }
    ] });
    const result = await fetchMyPointLogs({ userId: '1' });
    expect(result.records[0]).toMatchObject({ id: '9007199254740993', behavior: 'QA_NEW_BEHAVIOR', behaviorName: '测试新行为', change: -3, isAppealable: true });
    expect(result.records[1].behavior).toBe('');
    expect(result.records.every(record => record.behavior !== 'CONSUME')).toBe(true);
  });

  it('多行为筛选不把未知记录错误归到消费，未知规则代码不与消费冲突', async () => {
    vi.spyOn(realUserRequest, 'post').mockResolvedValue({ total: 2, records: [
      { id: '1', userId: '1', behaviorCode: 'QA_NEW_BEHAVIOR', score: 1, balanceAfter: 1 },
      { id: '2', userId: '1', behaviorCode: 'CONSUME', score: 2, balanceAfter: 3 }
    ] });
    const result = await fetchMyPointLogs({ userId: '1', behaviors: ['CONSUME', 'RECHARGE'] });
    expect(result.records.map(record => record.id)).toEqual(['2']);
    vi.spyOn(realUserRequest, 'get').mockResolvedValue([
      { behaviorCode: 'QA_NEW_BEHAVIOR', name: '测试新规则', score: 3 },
      { behaviorCode: 'CONSUME', name: '消费规则', score: 1 }
    ]);
    expect((await fetchPointRules()).map(rule => rule.code)).toEqual(['QA_NEW_BEHAVIOR', 'CONSUME']);
  });
});

describe('多条件分页实际页大小', () => {
  it('空来源、短末页和缺少页大小元数据均保持正确读取边界', async () => {
    const request = vi.fn(async (source: string, pageNo: number, pageSize: number) => {
      const all = source === 'empty' ? [] : [{ id: '9007199254740993' }, { id: '9007199254740994' }, { id: '9007199254740995' }];
      const actualSize = Math.min(2, pageSize);
      return { total: all.length, records: all.slice((pageNo - 1) * actualSize, pageNo * actualSize) };
    });
    const result = await fetchMergeSourcePages({ sources: ['empty', 'full'], current: 1, size: 4,
      request, recordId: record => record.id });
    expect(result.total).toBe(3);
    expect(result.pages.flatMap(page => page.records).map(record => record.id)).toEqual(['9007199254740993', '9007199254740994', '9007199254740995']);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2]).toEqual(['full', 2, 2]);
  });

  it.each([
    { second: { total: 3, size: 1, records: [{ id: '2' }] }, error: '列表已变化' },
    { second: { total: 2, size: 1, records: [] }, error: '分页不完整' },
    { second: { total: 2, size: 1, records: [{ id: '1' }] }, error: '列表已变化' },
    { second: { total: 2, size: 2, records: [{ id: '2' }] }, error: '列表已变化' }
  ])('分页变化或缺页不能返回貌似完整的列表：$error', async ({ second, error }) => {
    const request = vi.fn<() => Promise<typeof second>>().mockResolvedValueOnce({ total: 2, size: 1, records: [{ id: '1' }] }).mockResolvedValueOnce(second);
    await expect(fetchMergeSourcePages({ sources: ['one'], current: 1, size: 2,
      request, recordId: record => record.id })).rejects.toThrow(error);
  });

  it('来源很多时最多四个请求并行，且不读取当前合并页以外的候选', async () => {
    let active = 0;
    let peak = 0;
    const request = vi.fn(async (source: number, pageNo: number) => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active -= 1;
      return { total: 100, size: 1, records: [{ id: `${source}:${pageNo}` }] };
    });
    await fetchMergeSourcePages({ sources: [1, 2, 3, 4, 5, 6], current: 2, size: 2,
      request, recordId: record => record.id });
    expect(peak).toBe(4);
    expect(request).toHaveBeenCalledTimes(24);
    expect(Math.max(...request.mock.calls.map(call => call[1]))).toBe(4);
  });

  it('越界页只查询总数；取消后不再读取后续页', async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => ({ total: 2, size: 1, records: [{ id: '1' }] }));
    expect(await fetchMergeSourcePages({ sources: ['one'], current: 3, size: 2,
      request, recordId: record => record.id })).toEqual({ pages: [], total: 2 });
    request.mockImplementationOnce(async () => {
      controller.abort();
      return { total: 2, size: 1, records: [{ id: '1' }] };
    });
    await expect(fetchMergeSourcePages({ sources: ['one'], current: 1, size: 2,
      request, recordId: record => record.id, signal: controller.signal })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('订单第二页按服务端页大小读取，不提前显示旧状态记录', async () => {
    const request = vi.spyOn(realOrderRequest, 'post').mockImplementation(async (_url, params) => {
      const q = params as Api.RealOrder.OrderPageQuery;
      const offset = ((q.pageNo || 1) - 1) * 2;
      return { total: 8, pageSize: 2, records: Array.from({ length: 2 }, (_, i) => ({
        orderId: `${q.status}-900719925474099${offset + i}`,
        status: q.status,
        createdAt: new Date(Date.UTC(2026, 0, q.status === 'CREATED' ? 30 : 15) - (offset + i) * 1000).toISOString()
      })) } as never;
    });
    const result = await fetchMyOrders({ current: 2, size: 4, statuses: ['PENDING_PAYMENT', 'CANCELLED'] });
    expect(result.records.map(item => item.id)).toEqual([4, 5, 6, 7].map(i => `CREATED-900719925474099${i}`));
    expect(result.total).toBe(16);
    expect(request).toHaveBeenCalledTimes(8);
  });

  it('钱包多原始类型合并时读取足够的较新流水，保留原始 Long ID', async () => {
    const request = vi.spyOn(realUserRequest, 'post').mockImplementation(async (_url, params) => {
      const q = params as Api.RealWallet.WalletLedgerPageQuery;
      const offset = ((q.pageNo || 1) - 1) * 2;
      return { total: 8, size: 2, records: Array.from({ length: 2 }, (_, i) => ({
        id: `${q.bizType}-900719925474099${offset + i}`,
        bizType: q.bizType,
        createdAt: new Date(Date.UTC(2026, 0, q.bizType === 'CHAIN_DEPOSIT' ? 30 : 15) - (offset + i) * 1000).toISOString()
      })) } as never;
    });
    const result = await fetchWalletLedger({ current: 2, size: 4, types: ['DEPOSIT_IN', 'WITHDRAW_OUT'] });
    expect(result.records.map(item => item.id)).toEqual([4, 5, 6, 7].map(i => `CHAIN_DEPOSIT-900719925474099${i}`));
    expect(result.total).toBe(16);
    expect(request).toHaveBeenCalledTimes(8);
  });
});

describe('评价资格深分页', () => {
  it('按实际页大小继续查询，找到当前订单后停止', async () => {
    const request = vi.spyOn(realOrderRequest, 'post')
      .mockResolvedValueOnce({ records: [{ orderId: '9007199254740991' }], total: 3, pageSize: 1 })
      .mockResolvedValueOnce({ records: [{ orderId: '9007199254740993' }], total: 3, pageSize: 1 });
    expect(await findReviewableOrderIds(['9007199254740993'])).toEqual(new Set(['9007199254740993']));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toEqual({ pageNo: 2, pageSize: 1 });
  });

  it('没有当前目标时查询至末页，不把缺页当作无资格', async () => {
    vi.spyOn(realOrderRequest, 'post')
      .mockResolvedValueOnce({ records: [{ orderId: '1' }], total: 2, pageSize: 1 })
      .mockResolvedValueOnce({ records: [], total: 2, pageSize: 1 });
    await expect(findReviewableOrderIds(['3'])).rejects.toThrow('分页不完整');
  });

  it('分页期间总数变化时要求重新核对，不返回错误资格', async () => {
    vi.spyOn(realOrderRequest, 'post')
      .mockResolvedValueOnce({ records: [{ orderId: '1' }], total: 2, pageSize: 1 })
      .mockResolvedValueOnce({ records: [{ orderId: '3' }], total: 3, pageSize: 1 });
    await expect(findReviewableOrderIds(['3'])).rejects.toThrow('列表已变化');
  });

  it('真实空列表返回无资格；取消读取后不继续查询', async () => {
    const request = vi.spyOn(realOrderRequest, 'post').mockResolvedValue({ records: [], total: 0, pageSize: 50 });
    expect(await findReviewableOrderIds(['1'])).toEqual(new Set());
    const controller = new AbortController();
    controller.abort();
    await expect(findReviewableOrderIds(['1'], { signal: controller.signal })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('分页总数适配', () => {
  it('将后端字符串总数转换为分页控件可用数值', () => {
    expect(toPageTotal('27')).toBe(27);
    expect(toPageTotal(3)).toBe(3);
  });

  it('将无效总数降级为零', () => {
    expect(toPageTotal()).toBe(0);
    expect(toPageTotal('invalid')).toBe(0);
    expect(toPageTotal(-1)).toBe(0);
  });
});
