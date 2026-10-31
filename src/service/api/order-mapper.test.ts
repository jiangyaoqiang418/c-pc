import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reverseStageMap, reverseStatusMap, toOrderRecord } from './order-mapper';
import * as orderApi from './order';
import { confirmRefund } from './refund';
import { cartStorageKey, useCartStore } from '@/stores/cart';
import { getOrderCapabilities, resolveOrderView } from '@/utils/order';
import { createCheckoutIntent, readCheckoutIntent, prepareCheckoutPayment, canDiscardRejectedCheckout, cleanupPaidCheckout, readPendingCheckout, pendingCheckoutStorageKey, sumPaymentAmounts, multiplyPaymentAmount, formatPaymentAmount, validateGroupPayResult, validateRecoveredCheckoutOrders, isGroupPaymentComplete } from '@/utils/checkout';
import { RequestError } from '@/service/request/type';
import * as productApi from './product';
import { createPurchase, fetchPurchaseDetail } from './purchase';
import { realOrderRequest, realUserRequest } from '@/service/request';
import { exactAssetAmount, exactTransactionAmount } from '@/components/wallet/decimal-amount';
import { resolveProductPurchase } from '@/utils/product-sku';
import { createRecharge, createWithdraw, fetchRechargeAssets, fetchRechargeAddress, fetchRechargeByKey, fetchRechargePage, fetchWalletOverview, fetchWalletLedger, fetchWithdrawChains, fetchWithdrawFeePreview, fetchWithdrawPage, prepareWithdrawal, rechargeMethodEnabled, sameRechargeContract, validateRechargeDeclaration } from './wallet';
import { fetchFinanceOverview } from './finance';
import { formatFinanceAmount } from '@/components/finance/v47-interest-math';
import { submitKeyedFinancialOperation, withSubmissionLock } from '@/utils/financial-submission';
import { createRenderer, nextTick, reactive, ssrContextKey } from 'vue';
import * as vueRouter from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useProductFavoritesStore } from '@/stores/product-favorites';
import * as reviewApi from './review';
import ProductDetail from '@/views/product/detail.vue';
import { Message } from '@/lib/feedback';

afterEach(() => {
  Message.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('v47 收藏及公开评价异步恢复', () => {
  const productId = '9007199254740993';

  function session() {
    vi.stubGlobal('localStorage', { getItem: () => null });
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id: 'qa-owner' } as Api.RealSession.UserRecord;
    return user;
  }

  it('收藏丢响应且回读旧状态时保留原目标，后续成功状态不会被重试反向取消', async () => {
    session();
    const store = useProductFavoritesStore();
    vi.spyOn(productApi, 'fetchFavoriteStates')
      .mockResolvedValueOnce(new Map([[productId, false]]))
      .mockResolvedValueOnce(new Map([[productId, false]]))
      .mockResolvedValueOnce(new Map([[productId, true]]));
    const save = vi.spyOn(productApi, 'toggleProductFavorite').mockRejectedValue(new Error('response lost'));
    const remove = vi.spyOn(productApi, 'cancelProductFavorite');
    await expect(store.toggle(productId)).rejects.toThrow('response lost');
    expect(store.entries[productId]).toMatchObject({ value: false, target: true, writing: false });
    expect(await store.toggle(productId)).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(store.entries[productId].target).toBeUndefined();
    store.$dispose();
  });

  it('返回可见标签时回读收藏，隐藏不请求；新会话丢弃旧回包，释放Store后移除监听', async () => {
    const target = new EventTarget();
    const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', visibility);
    const user = session();
    const store = useProductFavoritesStore();
    const query = vi.spyOn(productApi, 'fetchFavoriteStates').mockResolvedValue(new Map([[productId, false]]));
    await store.refresh([productId]);
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('focus'));
    expect(query).toHaveBeenCalledTimes(1);
    visibility.visibilityState = 'visible';
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(2);
    let finish!: (value: Map<string, boolean>) => void;
    query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    target.dispatchEvent(new Event('focus'));
    expect(query).toHaveBeenCalledTimes(3);
    user.sessionVersion += 1;
    finish(new Map([[productId, true]]));
    await Promise.resolve();
    expect(store.entries).toEqual({});
    query.mockResolvedValue(new Map([[productId, true]]));
    await store.refresh([productId]);
    expect(store.entries[productId].value).toBe(true);
    store.$dispose();
    target.dispatchEvent(new Event('focus'));
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(query).toHaveBeenCalledTimes(4);
  });

  async function detail() {
    const user = session();
    const events = new EventTarget();
    const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', events);
    vi.stubGlobal('document', visibility);
    const route = reactive({ params: { id: productId }, query: {}, fullPath: `/product/${productId}` });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(productApi, 'fetchProductDetail').mockImplementation(async id => ({ id, price: '1', stock: 1, images: [], specGroups: [] } as unknown as Api.RealProduct.Record));
    vi.spyOn(productApi, 'trackProductBrowse').mockResolvedValue({ ok: true });
    vi.spyOn(productApi, 'trackProductView').mockResolvedValue({ ok: true });
    vi.spyOn(productApi, 'fetchFavoriteStates').mockResolvedValue(new Map([[productId, false]]));
    vi.spyOn(productApi, 'fetchHomeRecommendations').mockResolvedValue([]);
    vi.spyOn(reviewApi, 'fetchReviewSummary').mockResolvedValue({ totalCount: 0 } as Api.RealReview.ReviewSummaryDTO);
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const app = renderer.createApp({ ...ProductDetail, render: () => null });
    app.provide(ssrContextKey, {});
    app.provide(vueRouter.routeLocationKey, route as unknown as vueRouter.RouteLocationNormalizedLoaded);
    app.provide(vueRouter.routerKey, { push: vi.fn() } as unknown as vueRouter.Router);
    app.mount({});
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    await nextTick();
    interface DetailState {
      reviews: Api.RealReview.ReviewDTO[];
      reviewPage: number;
      reviewError: string;
      reviewLoading: boolean;
      reviewSort: Api.RealReview.ReviewSort;
      helpfulBusy: Record<string, boolean>;
      loadReviews: (page: number) => Promise<void>;
      voteHelpful: (row: Api.RealReview.ReviewDTO) => Promise<void>;
    }
    const state = (app as unknown as { _instance: { setupState: DetailState } })._instance.setupState;
    let closed = false;
    return { state, route, user, events, visibility, close: () => {
      if (closed) return;
      closed = true;
      app.unmount();
      useProductFavoritesStore().$dispose();
    } };
  }

  it('公开评价回到末页期间总数再次缩减，继续校正到实际可读取的末页', async () => {
    const query = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ total: 100, records: [], pageSize: 20 });
    const { state, close } = await detail();
    try {
      query.mockClear();
      query.mockResolvedValueOnce({ total: 61, records: [], pageSize: 20 })
        .mockResolvedValueOnce({ total: 41, records: [], pageSize: 20 })
        .mockResolvedValueOnce({ total: 41, records: [{ reviewId: 'last-review' } as Api.RealReview.ReviewDTO], pageSize: 20 });
      await state.loadReviews(5);
      expect(query.mock.calls.map(([params]) => params.pageNo)).toEqual([5, 4, 3]);
      expect(state.reviewPage).toBe(3);
      expect(state.reviews).toEqual([{ reviewId: 'last-review' }]);
      expect(state.reviewError).toBe('');
    } finally { close(); }
  });

  it('公开评价分页持续变化时停止续读并保留可重试错误，不展示越界空页', async () => {
    const query = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ total: 100, records: [], pageSize: 20 });
    const { state, close } = await detail();
    try {
      query.mockClear();
      for (const total of [161, 141, 121, 101]) query.mockResolvedValueOnce({ total, records: [], pageSize: 20 });
      await state.loadReviews(10);
      expect(query.mock.calls.map(([params]) => params.pageNo)).toEqual([10, 9, 8, 7]);
      expect(state.reviewError).toBe('评价读取失败，请重新加载');
      expect(state.reviewLoading).toBe(false);
      expect(state.reviews).toEqual([]);
    } finally { close(); }
  });

  it('可见性恢复公开评价，隐藏和投票中不请求；卸载移除监听并忽略旧回包', async () => {
    const row = { reviewId: '9007199254740997', helpful: false, helpfulCount: 0 } as Api.RealReview.ReviewDTO;
    const query = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ total: 1, records: [row], pageSize: 20 });
    const { state, events, visibility, close } = await detail();
    try {
      query.mockClear();
      state.helpfulBusy[row.reviewId] = true;
      events.dispatchEvent(new Event('focus'));
      visibility.dispatchEvent(new Event('visibilitychange'));
      expect(query).not.toHaveBeenCalled();
      state.helpfulBusy[row.reviewId] = false;
      visibility.visibilityState = 'hidden';
      visibility.dispatchEvent(new Event('visibilitychange'));
      events.dispatchEvent(new Event('focus'));
      expect(query).not.toHaveBeenCalled();
      query.mockResolvedValueOnce({ total: 1, records: [{ ...row, helpful: true, helpfulCount: 1 }], pageSize: 20 });
      visibility.visibilityState = 'visible';
      visibility.dispatchEvent(new Event('visibilitychange'));
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      expect(state.reviews[0]).toMatchObject({ helpful: true, helpfulCount: 1 });
      let finish!: (value: Api.RealReview.PageResult<Api.RealReview.ReviewDTO>) => void;
      query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const pending = state.loadReviews(1);
      close();
      finish({ total: 1, records: [row] });
      await pending;
      expect(state.reviews).toEqual([]);
      const calls = query.mock.calls.length;
      events.dispatchEvent(new Event('focus'));
      visibility.dispatchEvent(new Event('visibilitychange'));
      expect(query).toHaveBeenCalledTimes(calls);
    } finally { close(); }
  });

  it('商品路由切换后忽略未能中止的旧评价回包', async () => {
    const query = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ total: 0, records: [] });
    const { state, route, close } = await detail();
    try {
      let finish!: (value: Api.RealReview.PageResult<Api.RealReview.ReviewDTO>) => void;
      query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const previous = state.loadReviews(1);
      route.params.id = '9007199254741993';
      await nextTick();
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      finish({ total: 1, records: [{ reviewId: 'old-product-review' } as Api.RealReview.ReviewDTO] });
      await previous;
      expect(query.mock.calls.at(-1)?.[0].productId).toBe(route.params.id);
      expect(state.reviews).toEqual([]);
      expect(state.reviewError).toBe('');
    } finally { close(); }
  });

  it('投票丢响应且评价移出当前页时保留原目标，重新出现后仍只按原方向重试', async () => {
    const row = { reviewId: '9007199254740997', helpful: false, helpfulCount: 0 } as Api.RealReview.ReviewDTO;
    const query = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ total: 1, records: [row], pageSize: 20 });
    const { state, close } = await detail();
    try {
      state.reviewSort = 'NEWEST';
      const vote = vi.spyOn(reviewApi, 'setReviewHelpful').mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValueOnce({ reviewId: row.reviewId, helpful: true, helpfulCount: 1 });
      query.mockResolvedValueOnce({ total: 1, records: [], pageSize: 20 });
      await state.voteHelpful(row);
      expect(state.helpfulBusy[row.reviewId]).toBe(false);
      query.mockResolvedValueOnce({ total: 1, records: [{ ...row, helpful: true, helpfulCount: 1 }], pageSize: 20 });
      await state.loadReviews(1);
      await state.voteHelpful(state.reviews[0]);
      expect(vote.mock.calls).toEqual([[row.reviewId, true], [row.reviewId, true]]);
      expect(state.reviews[0]).toMatchObject({ helpful: true, helpfulCount: 1 });
    } finally { close(); }
  });
});

describe('v47 交易契约边界', () => {
  it('金额字符串保留最大值、最小单位和科学计数；拒绝超限及超精度', () => {
    const maximum = '9999999999999999999999999999.99999999';
    expect(exactTransactionAmount(maximum).value).toBe(maximum);
    expect(exactTransactionAmount('9007199254740993.12345678').value).toBe('9007199254740993.12345678');
    expect(exactTransactionAmount('1e-8').value).toBe('0.00000001');
    expect(exactTransactionAmount('1e27').value).toBe('1000000000000000000000000000');
    for (const raw of ['1e28', '0.000000001', '1.000000000', '-1', '', 'Infinity', '0']) {
      expect(exactTransactionAmount(raw).value).toBeUndefined();
    }
    expect(exactTransactionAmount('0', true).value).toBe('0');
  });

  it('商品费用的合法零与超精度未知分开；零价不可购买', () => {
    const dto = { id: '9007199254740993', title: '契约隔离样本', price: '1', stock: 2, status: 'ON_SALE' } as Api.RealProduct.ProductDTO;
    expect(productApi.toProductRecord({ ...dto, shippingFee: '0', taxFee: '0.00000001' }))
      .toMatchObject({ shippingFee: '0', tax: '0.00000001' });
    for (const shippingFee of [undefined, '0.000000001', '10000000000000000000000000000']) {
      expect(productApi.toProductRecord({ ...dto, shippingFee }).shippingFee).toBeUndefined();
    }
    expect(resolveProductPurchase(productApi.toProductRecord({ ...dto, price: '0' })).available).toBe(false);
  });

  it('同额同商品的 SKU 改变也必须重新确认付款', () => {
    const order = toOrderRecord({ orderId: '1', orderGroupNo: 'g', customerId: 'qa', productId: '2',
      status: 'CREATED', totalAmount: '1', skuId: '9007199254740993' });
    const changed = { ...order, skuId: '9007199254740994' };
    expect(prepareCheckoutPayment([order], [changed], 'qa', 'g').changed).toBe(true);
  });

  it('充值分页显式提交 USDT，避免依赖省略资产时的默认行为', async () => {
    const post = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ records: [], total: '0', pageNo: 1, pageSize: 10 });
    expect((await fetchRechargePage()).total).toBe(0);
    expect(post.mock.calls[0][1]).toMatchObject({ asset: 'USDT' });
  });

  it('订单号原字符串、商品关键词与每个阶段查询取交集，计数沿用相同搜索条件', async () => {
    const post = vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ records: [], total: 0 });
    await orderApi.fetchMyOrders({ customerId: '9007199254740993', orderNo: ' 0009007199254740993 ', productTitle: ' 手机 ',
      statuses: ['PROCURING', 'PROCURED'] });
    expect(post.mock.calls).toHaveLength(2);
    expect(post.mock.calls.map(([, query]) => query)).toEqual([
      { pageNo: 1, pageSize: 10, stage: 'PROCURING', orderNo: '0009007199254740993', productTitle: '手机' },
      { pageNo: 1, pageSize: 10, stage: 'PROCURED', orderNo: '0009007199254740993', productTitle: '手机' }
    ]);
    post.mockClear();
    await orderApi.countMyOrdersByStatus({ orderNo: '0009007199254740993', productTitle: '手机' });
    expect(post.mock.calls.every(([, query]) => (query as Api.RealOrder.OrderPageQuery).orderNo === '0009007199254740993'
      && (query as Api.RealOrder.OrderPageQuery).productTitle === '手机')).toBe(true);
  });

  it('计数记录已请求搜索快照，表单先改值再导航仍能识别查询和重置', () => {
    const applied = { orderNo: '', productTitle: '' };
    const counted = orderApi.orderSearchKey(applied);
    Object.assign(applied, { orderNo: '0009007199254740993', productTitle: '手机' });
    expect(orderApi.orderSearchKey(applied)).not.toBe(counted);
    const filteredCounted = orderApi.orderSearchKey(applied);
    Object.assign(applied, { orderNo: '', productTitle: '' });
    expect(orderApi.orderSearchKey(applied)).not.toBe(filteredCounted);
    expect(orderApi.orderSearchKey({ orderNo: ' 0001 ', productTitle: ' 手机 ' })).toBe(orderApi.orderSearchKey({ orderNo: '0001', productTitle: '手机' }));
    expect(orderApi.orderSearchKey({ orderNo: '0001' })).not.toBe(orderApi.orderSearchKey({ orderNo: '1' }));
  });

  it('每日利息只读权威新字段，合法零与缺失分开，不用到期收益代替', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue({ holdingCount: 0, expectedInterest: '99',
      dailyExpectedInterest: '0.00000000', estimatedAt: '1792022400000', estimateUntil: '1792108800000' });
    const overview = await fetchFinanceOverview();
    expect(formatFinanceAmount(overview.dailyExpectedInterest, { decimals: 8 })).toBe('0.00000000');
    expect(overview.estimatedAt).toBe('1792022400000');
    get.mockResolvedValue({ holdingCount: 0, expectedInterest: '99' });
    expect(formatFinanceAmount((await fetchFinanceOverview()).dailyExpectedInterest)).toBe('—');
    get.mockRejectedValue(new Error('读取失败'));
    await expect(fetchFinanceOverview()).rejects.toThrow('读取失败');
  });

  it('充值能力取资产矩阵，共享地址只开放申报，不从平台地址推导专属能力', async () => {
    const matrix = [{ asset: 'USDT', chain: 'TRON', label: '波场', enabled: true, tokenContract: 'CaseSensitive',
      decimals: 6, minConfirmations: 19, methods: ['DECLARATION'], depositAddress: 'shared' },
    { asset: 'USDC', chain: 'TRON', label: '波场', enabled: false, methods: [] }];
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue(matrix);
    const result = await fetchRechargeAssets();
    expect(get.mock.calls[0][0]).toBe('/recharge/assets');
    expect(result[0].methods).toEqual(['DECLARATION']);
    expect(rechargeMethodEnabled(result[0], 'ADDRESS')).toBe(false);
    expect(rechargeMethodEnabled(result[0], 'WALLET')).toBe(false);
    expect(rechargeMethodEnabled(result[0], 'DECLARATION')).toBe(true);
    expect(result[1].enabled).toBe(false);
    expect(rechargeMethodEnabled(result[1], 'DECLARATION')).toBe(false);
    expect(rechargeMethodEnabled(undefined, 'ADDRESS')).toBe(false);
    expect(sameRechargeContract('TRON', 'CaseSensitive', 'casesensitive')).toBe(false);
    expect(sameRechargeContract('ETH', '0xAbCd', '0xabcd')).toBe(true);
    for (const invalid of [
      [{ ...matrix[1], enabled: true, methods: ['ADDRESS'] }],
      [{ ...matrix[0], tokenContract: '' }],
      [matrix[0], matrix[0]]
    ]) {
      get.mockResolvedValue(invalid);
      await expect(fetchRechargeAssets()).rejects.toThrow();
    }
    get.mockResolvedValue([{ ...matrix[0], asset: 'USDC', methods: ['ADDRESS'] }]);
    expect(rechargeMethodEnabled((await fetchRechargeAssets())[0], 'ADDRESS')).toBe(true);
    get.mockResolvedValue([{ ...matrix[0], methods: ['WALLET'], walletNetwork: null }]);
    expect((await fetchRechargeAssets())[0].methods).toEqual(['WALLET']);
  });

  it('充值申报保留精准字符串及原键，原单资产不符拒绝恢复', async () => {
    const post = vi.spyOn(realUserRequest, 'post').mockResolvedValue('9007199254740993');
    await createRecharge({ chain: 'TRON', amount: '9007199254740993.12345678', idempotencyKey: 'original-key' });
    expect(post.mock.calls[0][1]).toEqual({ asset: 'USDT', chain: 'TRON', amount: '9007199254740993.12345678', idempotencyKey: 'original-key' });
    vi.spyOn(realUserRequest, 'get').mockResolvedValue({ id: '9007199254740993', asset: 'USDC', chain: 'TRON', amount: '1' });
    await expect(fetchRechargeByKey('original-key')).rejects.toThrow('原单资产');
  });

  it('首次和待详情重试只接受原申报网络、金额及来源，不展示错误地址', () => {
    const expected = { id: '9007199254740993', chain: 'TRON', amount: '9007199254740993.12345678' };
    const record = { ...expected, asset: 'USDT', source: 'DECLARATION', depositAddress: 'declaration-address' } as Api.RealWallet.RechargeVO;
    expect(validateRechargeDeclaration(record, expected)).toBe(record);
    expect(validateRechargeDeclaration({ ...record, amount: '9007199254740993.123456780' }, expected)).toBeDefined();
    for (const delta of [{ chain: 'ETH' }, { amount: '9007199254740993.12345679' }, { source: 'ADDRESS' },
      { source: undefined }, { asset: 'USDC' }, { id: '9007199254740994' }, { amount: undefined }]) {
      expect(() => validateRechargeDeclaration({ ...record, ...delta } as Api.RealWallet.RechargeVO, expected)).toThrow('充值信息未能核对一致');
    }
    expect(() => validateRechargeDeclaration(record, { ...expected, chain: undefined })).toThrow();
    expect(() => validateRechargeDeclaration({ ...record, amount: '0' }, { ...expected, amount: '0' })).toThrow();
  });

  it('多资产接口按契约分别传 asset 与 currency，错币种回包拒绝展示', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue({ currency: 'USDC', total: null, todayIn: null,
      distribution: [{ type: 'AVAILABLE', name: '可用', amount: null, ratio: null }] });
    const overview = await fetchWalletOverview('9007199254740993', { asset: 'USDC' });
    expect(get.mock.calls[0][1]?.params).toEqual({ asset: 'USDC' });
    expect(overview.total).toBeNull();
    expect(overview.today.depositIn).toBeNull();
    expect(overview.distribution[0]).toMatchObject({ key: 'available', amount: null, ratio: null });
    await expect(fetchWalletOverview('u')).rejects.toThrow('资产');
    get.mockResolvedValue({ asset: 'USDT', chain: 'BSC', address: '0xother' });
    await expect(fetchRechargeAddress('BSC', { asset: 'USDC' })).rejects.toThrow('资产');
    const postQuery = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ pageNo: '1', pageSize: '10', total: '0', records: [] });
    await fetchWalletLedger({ currency: 'USDC', current: 1, size: 10 });
    expect(postQuery.mock.calls[0][1]).toMatchObject({ currency: 'USDC' });
    expect(postQuery.mock.calls[0][1]).not.toHaveProperty('asset');
    await fetchRechargePage({ asset: 'USDC' });
    await fetchWithdrawPage({ asset: 'USDC' });
    expect(postQuery.mock.calls.slice(1).every(call => (call[1] as { asset: string }).asset === 'USDC')).toBe(true);
    postQuery.mockResolvedValue({ total: '1', records: [{ asset: 'USDT', currency: 'USDT', id: '1', amount: '1' }] });
    await expect(fetchWalletLedger({ currency: 'USDC' })).rejects.toThrow('资产');
    await expect(fetchRechargePage({ asset: 'USDC' })).rejects.toThrow('资产');
    await expect(fetchWithdrawPage({ asset: 'USDC' })).rejects.toThrow('资产');
  });

  it('USDC 原申报按原资产恢复，提交金额和动态精度不经过浮点转换', async () => {
    const original = { id: '9007199254740993', asset: 'USDC', chain: 'BSC', amount: '9007199254740993.123456', source: 'DECLARATION' } as Api.RealWallet.RechargeVO;
    vi.spyOn(realUserRequest, 'get').mockResolvedValue(original);
    expect(await fetchRechargeByKey('usdc-original', 'USDC')).toBe(original);
    expect(validateRechargeDeclaration(original, { ...original, asset: 'USDC' })).toBe(original);
    const post = vi.spyOn(realUserRequest, 'post').mockResolvedValue('9007199254740993');
    await createRecharge({ asset: 'USDC', chain: 'BSC', amount: original.amount, idempotencyKey: 'usdc-original' });
    expect(post.mock.calls[0][1]).toMatchObject({ asset: 'USDC', amount: original.amount, idempotencyKey: 'usdc-original' });
    const config: Api.RealWallet.WithdrawChainVO = { asset: 'USDC', chain: 'BSC', label: 'BSC', enabled: true, decimals: 6, minAmount: '0.1', maxAmount: null };
    const params = { asset: 'USDC' as const, chain: 'BSC' as const, toAddress: '0x' + '2'.repeat(40), amount: '0.12345600', idempotencyKey: 'wd-original' };
    const prepared = prepareWithdrawal(params, '9007199254740993.123456', config);
    expect(prepared.error).toBe('');
    expect(prepared.params.amount).toBe('0.123456');
    await createWithdraw({ ...prepared.params, payPassword: '123456' });
    expect(post.mock.calls[1][1]).toMatchObject({ asset: 'USDC', amount: '0.123456', idempotencyKey: 'wd-original' });
    expect(prepareWithdrawal({ ...params, amount: '0.12345601' }, '1', config).error).toContain('6 位');
    expect(prepareWithdrawal({ ...params, amount: '0.09' }, '1', config).error).toContain('0.1 USDC');
    expect(prepareWithdrawal(params, '1', { ...config, enabled: false }).error).toContain('暂不可转出');
    expect(exactAssetAmount('1.000000001', 6).error).toContain('8 位');
    expect(exactAssetAmount('1e-6', 6).error).not.toBe('');
  });

  it('提现网络配置和报价保留空值，报价原生币与资产必须匹配', async () => {
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue([{ asset: 'USDC', chain: 'BSC', label: 'BSC', enabled: true,
      decimals: 6, minAmount: null, maxAmount: null, estimatedNetworkFee: null }]);
    expect((await fetchWithdrawChains('USDC'))[0].estimatedNetworkFee).toBeNull();
    expect(get.mock.calls[0][1]?.params).toEqual({ asset: 'USDC' });
    const quote = { chain: 'BSC', tokenSymbol: 'USDC', platformId: 'BSC-01', fromAddress: '0xsource', estimatedNetworkFee: '0.000000000000000001',
      networkFeeSymbol: 'BNB', feeLimitAtomic: null, expiresAt: '1792300030000', isEstimate: true };
    const post = vi.spyOn(realUserRequest, 'post').mockResolvedValue(quote);
    const params = { chain: 'BSC' as const, tokenSymbol: 'USDC' as const, toAddress: '0x' + '2'.repeat(40), amount: '9007199254740993.123456' };
    expect(await fetchWithdrawFeePreview(params)).toBe(quote);
    expect(post.mock.calls[0][1]).toEqual(params);
    post.mockResolvedValue({ ...quote, networkFeeSymbol: 'USDC' });
    await expect(fetchWithdrawFeePreview(params)).rejects.toThrow('预览不完整');
  });

  it('跨标签充值锁阻止第二笔签名，原钱包结果未知时不移除标记', async () => {
    let held = false;
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, options: { ifAvailable: boolean }, callback: (lock: object | null) => Promise<unknown>) => {
      expect(options.ifAvailable).toBe(true);
      if (held) return callback(null);
      held = true;
      try { return await callback({}); } finally { held = false; }
    } } });
    let release!: () => void;
    const wallet = new Promise<void>(resolve => { release = resolve; });
    const sign = vi.fn(async () => { storage.set('direct-progress', 'UNKNOWN'); await wallet; throw new Error('钱包响应丢失'); });
    const first = withSubmissionLock('cpc:wallet-direct:transfer:qa', sign);
    const firstFailure = expect(first).rejects.toThrow('钱包响应丢失');
    await expect(withSubmissionLock('cpc:wallet-direct:transfer:qa', sign)).rejects.toThrow('其他页面提交');
    expect(sign).toHaveBeenCalledTimes(1);
    release();
    await firstFailure;
    expect(storage.get('direct-progress')).toBe('UNKNOWN');
  });

  it('原申报by-key回查期间会话切换，既不接受原回包也不重发资金操作', async () => {
    const storage = new Map<string, string>([['bw-shop-access-token', 'session-a']]);
    const key = 'cpc:financial-pending:qa:recharge';
    const original = JSON.stringify({ userId: 'qa', action: 'recharge', idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      snapshot: { chain: 'TRON', amount: '0.00000001' } });
    storage.set(key, original);
    vi.stubGlobal('localStorage', { getItem: (name: string) => storage.get(name) ?? null, setItem: (name: string, value: string) => storage.set(name, value) });
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<unknown>) => callback({}) } });
    const submit = vi.fn();
    const lookup = vi.fn(async () => {
      storage.set('bw-shop-access-token', 'session-b');
      return { id: '9007199254740993', chain: 'TRON', amount: '0.00000001' };
    });
    await expect(submitKeyedFinancialOperation('qa', 'recharge', undefined, { lookup, submit }, true)).rejects.toThrow('账号已切换');
    expect(submit).not.toHaveBeenCalled();
    expect(storage.get(key)).toBe(original);
  });
});

describe('结算待确认记录保护', () => {
  const pending = { idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', productIds: ['9007199254740993', '9007199254740993'],
    addressId: '9007199254740995', orderItems: [{ productId: '9007199254740993', skuId: '9007199254740997', quantity: 1, confirmedUnitPrice: '1.00000001' },
      { productId: '9007199254740993', skuId: '9007199254740999', quantity: 2, confirmedUnitPrice: '2' }] };
  const result: Api.RealOrder.OrderCreationResult = { status: 'CREATED', orderGroupNo: 'original-group', orderIds: ['9007199254741001', '9007199254741003'] };
  const recoveredOrders = pending.orderItems.map((item, index) => toOrderRecord({ orderId: String(result.orderIds[index]),
    orderGroupNo: result.orderGroupNo!, customerId: 'customer', productId: item.productId, skuId: item.skuId,
    quantity: item.quantity, unitPrice: item.confirmedUnitPrice, totalAmount: item.confirmedUnitPrice,
    addressId: pending.addressId, status: 'CREATED' }));

  it('原键整批订单完整回读并核对顾客、地址及SKU后才返回可保存身份，保留Long ID原值', () => {
    const recovered = validateRecoveredCheckoutOrders(pending, result, [...recoveredOrders].reverse(), 'customer');
    expect(recovered.orderIds).toEqual(result.orderIds);
    expect(recovered.orderGroupNo).toBe('original-group');
    expect(recovered.firstOrderId).toBe('9007199254741001');
    expect(pending).not.toHaveProperty('orderIds');
    expect(recovered.orderIds).not.toBe(result.orderIds);
  });

  it('未创建、重复或缺少部分订单的结果不保存，也不把未知结果当成拒绝', () => {
    for (const status of ['NOT_FOUND', 'PROCESSING', 'REJECTED'] as const) {
      expect(() => validateRecoveredCheckoutOrders(pending, { ...result, status }, recoveredOrders, 'customer')).toThrow('回查订单不完整');
    }
    for (const orderIds of [[], [result.orderIds[0]], [result.orderIds[0], result.orderIds[0]]]) {
      expect(() => validateRecoveredCheckoutOrders(pending, { ...result, orderIds }, recoveredOrders, 'customer')).toThrow('回查订单不完整');
    }
    expect(() => validateRecoveredCheckoutOrders(pending, result, [recoveredOrders[0]], 'customer')).toThrow('回查订单不完整');
    expect(() => validateRecoveredCheckoutOrders(pending, result, [recoveredOrders[0], recoveredOrders[0]], 'customer')).toThrow('回查订单不完整');
    expect(pending).not.toHaveProperty('orderIds');
  });

  it('别的顾客、订单组、地址、SKU、场次、数量或单价不能替代原订单身份', () => {
    for (const changed of [
      { customerId: 'other' }, { orderGroupNo: 'other' }, { addressId: '9007199254741095' },
      { productId: '9007199254741093' }, { skuId: '9007199254741097' }, { skuId: undefined },
      { sessionId: '9007199254741101' }, { quantity: 2 }, { price: '1.00000002' }
    ]) {
      expect(() => validateRecoveredCheckoutOrders(pending, result, [{ ...recoveredOrders[0], ...changed }, recoveredOrders[1]], 'customer')).toThrow();
    }
    expect(() => validateRecoveredCheckoutOrders(pending, result, recoveredOrders, 'other')).toThrow('顾客、订单组或地址不一致');
  });

  it('相同商品及SKU合并数量允许恢复，遗漏另一个SKU不能冒充完整批次', () => {
    const mergedPending = { ...pending, orderItems: [{ ...pending.orderItems[0], quantity: 1 }, { ...pending.orderItems[0], quantity: 2 }] };
    const mergedResult = { ...result, orderIds: [result.orderIds[0]] };
    const mergedOrder = { ...recoveredOrders[0], quantity: 3 };
    expect(validateRecoveredCheckoutOrders(mergedPending, mergedResult, [mergedOrder], 'customer').orderIds).toEqual(mergedResult.orderIds);
    expect(() => validateRecoveredCheckoutOrders(pending, mergedResult, [mergedOrder], 'customer')).toThrow('缺少部分商品或数量');
  });

  it('历史无SKU无确认价的完整快照可以恢复，活动场次仍须一致', () => {
    const legacy = { ...pending, orderItems: [{ productId: pending.productIds[0], quantity: 1 }] };
    const singleResult = { ...result, orderIds: [result.orderIds[0]] };
    const legacyOrder = { ...recoveredOrders[0], skuId: null };
    expect(validateRecoveredCheckoutOrders(legacy, singleResult, [legacyOrder], 'customer').orderIds).toEqual(singleResult.orderIds);
    const flash = { ...legacy, orderItems: [{ ...legacy.orderItems[0], sessionId: '9007199254741199' }] };
    expect(() => validateRecoveredCheckoutOrders(flash, singleResult, [legacyOrder], 'customer')).toThrow();
    expect(validateRecoveredCheckoutOrders(flash, singleResult, [{ ...legacyOrder, sessionId: '9007199254741199' }], 'customer').orderIds).toEqual(singleResult.orderIds);
  });

  it('损坏、缺字段、不安全 ID 和非法数量均保留原记录，不当作新结算', () => {
    const valid = { idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', productIds: ['9007199254740993'],
      addressId: '9007199254740995', orderItems: [{ productId: '9007199254740993', quantity: 1 }] };
    const values = new Map<string, string>();
    const remove = vi.fn();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, removeItem: remove });
    const key = pendingCheckoutStorageKey('qa');
    expect(readPendingCheckout('qa')).toBeUndefined();
    for (const raw of ['', '{broken', 'null', '{}', JSON.stringify({ ...valid, addressId: undefined }),
      JSON.stringify({ ...valid, orderIds: [Number.MAX_SAFE_INTEGER + 1] }),
      JSON.stringify({ ...valid, orderItems: [{ productId: '1', quantity: 0 }] })]) {
      values.set(key, raw);
      expect(() => readPendingCheckout('qa')).toThrow('原结算记录无法读取');
      expect(values.get(key)).toBe(raw);
    }
    expect(remove).not.toHaveBeenCalled();
    values.set(key, JSON.stringify(valid));
    expect(readPendingCheckout('qa')).toEqual(valid);
    expect(readPendingCheckout('qa-other')).toBeUndefined();
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    expect(() => readPendingCheckout('qa')).toThrow('原结算记录无法读取');
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('toOrderRecord', () => {
  it('订单链接视角优先于全局视角，老链接兼容当前视角且卖出必须有权限', () => {
    expect(resolveOrderView('buy', true, 'buyer')).toBe('buy');
    expect(resolveOrderView('sell', true, 'customer')).toBe('sell');
    expect(resolveOrderView(undefined, true, 'buyer')).toBe('sell');
    expect(resolveOrderView('invalid', true, 'customer')).toBe('buy');
    expect(resolveOrderView('sell', false, 'buyer')).toBe('buy');
  });
  it('缺失或未知状态不能转为可付款订单', () => {
    expect(() => toOrderRecord({ orderId: '1' })).toThrow('订单状态');
    expect(() => toOrderRecord({ orderId: '1', status: 'UNRECOGNIZED' as Api.RealOrder.OrderStatus })).toThrow('订单状态');
  });
  it('当前应付金额缺失不能用原价合计或成交单价补成订单金额', () => {
    for (const totalAmount of [undefined, null, '', 'NaN', '-1']) {
      expect(() => toOrderRecord({ orderId: '9007199254740993', status: 'CREATED', unitPrice: '2', originalAmount: '5', totalAmount } as Api.RealOrder.OrderDTO)).toThrow('订单当前应付金额');
    }
  });
  it('原始金额和合法零保留，未提供单价和费用显示未知', () => {
    const missingBreakdown = toOrderRecord({ orderId: '9007199254740993', status: 'CREATED', totalAmount: '9007199254740993.12345678' });
    expect(missingBreakdown).toMatchObject({ id: '9007199254740993', totalAmount: '9007199254740993.12345678' });
    expect(missingBreakdown.price).toBeUndefined();
    expect(missingBreakdown.shippingFee).toBeUndefined();
    expect(missingBreakdown.tax).toBeUndefined();
    expect(toOrderRecord({ orderId: '9007199254740993', status: 'CREATED', totalAmount: 0, unitPrice: '1e-8', shippingFee: 0, taxFee: '0' }))
      .toMatchObject({ totalAmount: '0', price: '1e-8', shippingFee: '0', tax: '0' });
  });

  it('顾客操作同时校验订单归属和实际状态', () => {
    const order = toOrderRecord({ orderId: '1', customerId: '9007199254740993', sellerId: '9007199254740994', status: 'CREATED', totalAmount: '1' });
    expect(getOrderCapabilities(order, order.customerId).pay).toBe(true);
    expect(getOrderCapabilities(order, order.shopperId).pay).toBe(false);
    expect(getOrderCapabilities(order).pay).toBe(false);
    order.status = 'IN_TRANSIT';
    expect(getOrderCapabilities(order, order.customerId).confirm).toBe(true);
    expect(getOrderCapabilities(order, order.shopperId).confirm).toBe(false);
    expect(getOrderCapabilities(order, order.customerId).pay).toBe(false);
  });
  it('保留退款完成状态、长 ID 与资金凭证', () => {
    const record = toOrderRecord({
      orderId: '2087045217757257730',
      orderNo: '2087045217635622912',
      status: 'REFUNDED',
      customerId: '2086359209189400577',
      sellerId: '2082303088212398081',
      productId: '2086331622220189697',
      totalAmount: '300.00',
      paymentBizNo: 'ORD-PAY-2087045217635622912',
      refundId: '2087052706519277569',
      refundStatus: 'AGREED',
      refundAmount: '300.00',
      createdAt: '1786454129000',
      completedAt: '1786454200000'
    });

    expect(record.id).toBe('2087045217757257730');
    expect(record.productId).toBe('2086331622220189697');
    expect(record.status).toBe('REFUNDED');
    expect(record.paymentBizNo).toBe('ORD-PAY-2087045217635622912');
    expect(record.refundId).toBe('2087052706519277569');
    expect(record.refundAmount).toBe('300.00');
    expect(record.archivedAt).toBe(new Date(1786454200000).toISOString());
  });

  it('组合收货地址并映射后端发货凭证字段', () => {
    const record = toOrderRecord({
      orderId: '1',
      status: 'SHIPPED',
      totalAmount: '1',
      country: '中国',
      province: '测试省',
      city: '测试市',
      district: '测试区',
      detailAddress: 'QA 地址',
      trackingNo: 'QA-SF-20260810-201500',
      logisticsCompany: '顺丰国际',
      logisticsCompanyCode: 'SF_INTL',
      shipVouchers: ['https://example.com/ship-proof.png'],
      shippedRemark: '已完成出库',
      createdAt: '1786454129000'
    });

    expect(record.shippingAddress).toBe('中国测试省测试市测试区QA 地址');
    expect(record.trackingNumber).toBe('QA-SF-20260810-201500');
    expect(record.shippingCarrier).toBe('SF_INTL');
    expect(record.shippingScreenshotUrl).toBe('https://example.com/ship-proof.png');
    expect(record.shippingVoucherUrls).toEqual(['https://example.com/ship-proof.png']);
    expect(record.shippedRemark).toBe('已完成出库');
  });

  it('缺失履约字段时只降级，不伪造地址或凭证', () => {
    const record = toOrderRecord({ orderId: '1', status: 'PAID', productId: null, createdAt: '1786454129000', totalAmount: '1' });

    expect(record.productId).toBe('');
    expect(record.shippingAddress).toBe('暂无法获取收货地址');
    expect(record.trackingNumber).toBeUndefined();
    expect(record.purchaseScreenshotUrl).toBeUndefined();
    expect(record.shippingScreenshotUrl).toBeUndefined();
    expect(record.shippingVoucherUrls).toBeUndefined();
    expect(record.status).toBe('PROCURING');
    expect(record.customerName).toBe('匿名顾客');
    expect(record.overseasCustoms).toBeUndefined();
    expect(record.aftersaleType).toBeUndefined();
    expect(reverseStatusMap.PROCURED).toBe('PAID');
    expect(reverseStageMap.PROCURING).toBe('PROCURING');
    expect(reverseStageMap.PROCURED).toBe('PROCURED');
  });

  it('采购阶段按权威stage映射，已付款缺资格不能采购或发货', () => {
    const base = { orderId: '9007199254740993', sellerId: 'seller', customerId: 'customer', status: 'PAID' as const, totalAmount: '1' };
    const legacy = toOrderRecord(base);
    expect(getOrderCapabilities(legacy, 'seller')).toMatchObject({ procure: false, ship: false });
    const procuring = toOrderRecord({ ...base, stage: 'PROCURING', canProcure: true, canShip: false });
    const procured = toOrderRecord({ ...base, stage: 'PROCURED', canShip: true, procuredAt: 1792022400000,
      skuId: '9007199254740995', skuSpecs: [{ name: '尺寸', value: 'M' }], flashSessionId: '9007199254740997' });
    expect(procuring.status).toBe('PROCURING');
    expect(procured).toMatchObject({ status: 'PROCURED', skuId: '9007199254740995', skuSpecs: [{ name: '尺寸', value: 'M' }], sessionId: '9007199254740997', procuredAt: new Date(1792022400000).toISOString() });
    expect(getOrderCapabilities(procuring, 'seller')).toMatchObject({ procure: true, ship: false });
    expect(getOrderCapabilities(procured, 'seller')).toMatchObject({ procure: false, ship: true });
    expect(getOrderCapabilities(procured, 'customer').ship).toBe(false);
    expect(getOrderCapabilities({ ...procured, canShip: undefined }, 'seller').ship).toBe(false);
    expect(() => toOrderRecord({ ...base, stage: 'SHIPPED' })).toThrow('阶段与状态');
  });

  it('售后确认属于卖家意见流程，顾客不能再次退款或确认收货', () => {
    const record = toOrderRecord({ orderId: '1', sellerId: 'seller', customerId: 'customer', status: 'AFTERSALE_CONFIRM',
      stage: 'AFTERSALE_CONFIRM', canConfirmAftersale: true, totalAmount: '1' });
    expect(record.status).toBe('AFTERSALE_CONFIRM');
    expect(getOrderCapabilities(record, 'customer')).toMatchObject({ confirm: false, refund: false, viewAftersale: true, confirmAftersale: false });
    expect(getOrderCapabilities(record, 'seller').confirmAftersale).toBe(true);
    expect(getOrderCapabilities({ ...record, stage: undefined }, 'seller').confirmAftersale).toBe(false);
  });
});

describe('订单采购与售后契约', () => {
  it('采购中与待发货按独立stage及服务端total分页和计数', async () => {
    const post = vi.spyOn(realOrderRequest, 'postQuery').mockImplementation(async (_url, query) => {
      const stage = (query as Api.RealOrder.OrderPageQuery).stage;
      return { total: stage === 'PROCURING' ? 23 : stage === 'PROCURED' ? 11 : 0, records: [] };
    });
    const page = await orderApi.fetchMyOrders({ shopperId: 'seller', statuses: ['PROCURED'], current: 2, size: 10 });
    expect(page.total).toBe(11);
    expect(post.mock.calls[0][1]).toEqual({ pageNo: 2, pageSize: 10, stage: 'PROCURED' });
    const counts = await orderApi.countMySoldOrdersByStatus();
    expect(counts).toMatchObject({ PROCURING: 23, PROCURED: 11 });
    expect(post.mock.calls.every(([, query]) => !(query as Api.RealOrder.OrderPageQuery).status)).toBe(true);
  });

  it('采购凭证必填HTTPS，发货请求不再携带采购字段', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('9007199254740993');
    for (const purchaseVouchers of [[], ['http://example.com/a.jpg'], Array(7).fill('https://example.com/a.jpg')]) {
      await expect(orderApi.procureOrder({ id: '9007199254740993', purchaseNo: 'PO-1', purchaseVouchers })).rejects.toThrow('采购凭证');
    }
    await expect(orderApi.procureOrder({ id: '9007199254740993', purchaseNo: ' ', purchaseVouchers: ['https://example.com/a.jpg'] })).rejects.toThrow('采购单号');
    expect(post).not.toHaveBeenCalled();
    await orderApi.procureOrder({ id: '9007199254740993', purchaseNo: ' PO-1 ', purchaseVouchers: ['https://example.com/a.jpg'] });
    expect(post).toHaveBeenLastCalledWith('/orders/procure', { id: '9007199254740993', purchaseNo: 'PO-1', purchaseVouchers: ['https://example.com/a.jpg'] });
    await orderApi.shipOrder({ id: '9007199254740993', carrier: 'DHL', trackingNo: 'QA123456', shipVouchers: [] });
    expect(post).toHaveBeenLastCalledWith('/orders/ship', { id: '9007199254740993', carrier: 'DHL', trackingNo: 'QA123456', shipVouchers: [] });
  });

  it('卖家不同意退款也提交确认接口，说明必填且只提交原refundId', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('9007199254740995');
    expect(() => confirmRefund({ refundId: '9007199254740995', agree: false, remark: ' ' })).toThrow('说明');
    expect(post).not.toHaveBeenCalled();
    await confirmRefund({ refundId: '9007199254740995', agree: false, remark: ' 已核实，提交平台判定 ' });
    expect(post).toHaveBeenCalledWith('/orders/refunds/confirm', { refundId: '9007199254740995', agree: false, remark: '已核实，提交平台判定' });
  });
});

describe('cartStorageKey', () => {
  it('按用户 ID 隔离本地购物车，匿名态不复用登录用户数据', () => {
    expect(cartStorageKey('2086359209189400577')).toBe('bw-shop-cart:2086359209189400577');
    expect(cartStorageKey('2082303088212398081')).toBe('bw-shop-cart:2082303088212398081');
    expect(cartStorageKey()).toBe('bw-shop-cart:anonymous');
  });
});

describe('购物车读取和数量边界', () => {
  function createCart() {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value) });
    let queue = Promise.resolve<unknown>(undefined);
    vi.stubGlobal('navigator', { locks: { request: (_key: string, callback: () => unknown) => {
      const run = queue.then(callback);
      queue = run.catch(() => {});
      return run;
    } } });
    setActivePinia(createPinia());
    return useCartStore();
  }
  const product = { id: '9007199254740993', status: 'NORMAL', shelfStatus: 'on-shelf', stock: 3, price: '10', shippingFee: '1', tax: '1' } as Api.RealProduct.DisplayRecord;

  it('购物袋明确404置为失效，网络失败保留重试；恢复后重新核对可购', async () => {
    const cart = createCart();
    cart.init();
    await cart.add(product.id, 1, product);
    const fetch = vi.spyOn(productApi, 'fetchProductDetail').mockRejectedValueOnce(new RequestError('不存在', { status: 404 }));
    await cart.refresh();
    expect(cart.enrichedItems[0].confirmedInvalid).toBe(true);
    expect(cart.selectedItems).toEqual([]);
    expect(cart.items).toHaveLength(1);
    fetch.mockRejectedValueOnce(new Error('offline'));
    await cart.refresh();
    expect(cart.enrichedItems[0].confirmedInvalid).toBe(false);
    expect(cart.enrichedItems[0].loadState).toBe('error');
    fetch.mockResolvedValueOnce(product);
    await cart.refresh();
    expect(cart.enrichedItems[0].available).toBe(true);
  });

  it('缓存损坏不显示为正常空车、不覆盖原记录，修复后可重新读取', async () => {
    const cart = createCart();
    for (const raw of ['{broken', 'null', '{}', '', JSON.stringify([{ productId: '1', qty: -1, addedAt: '' }]),
      JSON.stringify([{ productId: '', qty: 1, addedAt: '' }]),
      JSON.stringify([{ productId: '  ', qty: 1, addedAt: '' }]),
      '[{"productId":9007199254740993,"qty":1,"addedAt":""}]']) {
      localStorage.setItem(cartStorageKey(), raw);
      await cart.retryLoad();
      expect(cart.cacheError).toContain('原记录未清空');
      expect(localStorage.getItem(cartStorageKey())).toBe(raw);
      expect(cart.selectedItems).toEqual([]);
    }
    localStorage.setItem(cartStorageKey(), '[]');
    await cart.retryLoad();
    expect(cart.cacheError).toBe('');
    expect(cart.items).toEqual([]);
  });

  it('存储不可读和账号切换不会沿用错误的购物车', async () => {
    const cart = createCart();
    const get = vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => { throw new Error('denied'); });
    cart.init('qa-a');
    expect(cart.cacheError).not.toBe('');
    get.mockRestore();
    cart.switchOwner('qa-b');
    expect(cart.cacheError).toBe('');
    expect(cart.items).toEqual([]);
  });

  it('读取失败保留商品记录，不允许清理为失效商品', async () => {
    const cart = createCart();
    expect(await cart.add(product.id, 1, product)).toBe(true);
    vi.spyOn(productApi, 'fetchProductDetail').mockRejectedValueOnce(new Error('读取失败'));
    await cart.refresh();
    expect(cart.items).toHaveLength(1);
    expect(cart.enrichedItems[0].loadState).toBe('error');
    expect(cart.enrichedItems[0].confirmedInvalid).toBe(false);
    expect(cart.selectedItems).toHaveLength(0);
  });

  it('连续添加不能超过库存，修改数量受库存约束', async () => {
    const cart = createCart();
    expect(await cart.add(product.id, 2, product)).toBe(true);
    expect(await cart.add(product.id, 2, product)).toBe(false);
    expect(cart.items[0].qty).toBe(2);
    await cart.update(product.id, 10);
    expect(cart.items[0].qty).toBe(3);
    cart.upsertProduct({ ...product, stock: 0 });
    expect(cart.enrichedItems[0].confirmedInvalid).toBe(true);
  });

  it('空ID和已丢精度的数字ID不能加购，Long字符串保持原值', async () => {
    const cart = createCart();
    for (const id of ['', '  ', Number.MAX_SAFE_INTEGER + 1]) {
      expect(await cart.add(id, 1, { ...product, id })).toBe(false);
    }
    expect(cart.items).toHaveLength(0);
    expect(await cart.add(product.id, 1, product)).toBe(true);
    expect(cart.items[0].productId).toBe('9007199254740993');
  });

  it('付款仅消耗提交快照，不清除之后添加或重新加入的商品', async () => {
    const cart = createCart();
    await cart.add(product.id, 1, product);
    const snapshot = cart.items.map(item => ({ ...item }));
    await cart.add(product.id, 2, product);
    await cart.consumePurchasedItems(snapshot);
    expect(cart.items[0].qty).toBe(2);
    const oldSnapshot = cart.items.map(item => ({ ...item }));
    cart.items[0].addedAt = '2099-01-01T00:00:00.000Z';
    localStorage.setItem(cartStorageKey(), JSON.stringify(cart.items));
    await cart.consumePurchasedItems(oldSnapshot);
    expect(cart.items[0].qty).toBe(2);
    await cart.consumePurchasedItems(cart.items.map(item => ({ ...item })));
    expect(cart.items).toHaveLength(0);
  });

  it('两标签基于锁内最新快照修改，付款后旧标签不会重新写回已买数量', async () => {
    const first = createCart();
    first.init('qa-cart');
    const second = useCartStore(createPinia());
    second.init('qa-cart');
    vi.spyOn(productApi, 'fetchProductDetail').mockImplementation(async id => ({ ...product, id }));
    await Promise.all([first.add(product.id, 1, product), second.add('2', 1, { ...product, id: '2' })]);
    first.syncExternalCart();
    expect(first.items).toHaveLength(2);
    const snapshot = first.items.filter(item => String(item.productId) === String(product.id)).map(item => ({ ...item }));
    await second.add(product.id, 1, product);
    await first.consumePurchasedItems(snapshot);
    await second.setSelected('2', false);
    expect(second.items.find(item => String(item.productId) === String(product.id))?.qty).toBe(1);
    expect(second.items.find(item => item.productId === '2')?.selected).toBe(false);
    first.syncExternalCart();
    expect(first.items).toEqual(second.items);
  });

  it('两标签同时加购仍按累计库存校验；排队中的付款清理不会影响新账号', async () => {
    const first = createCart();
    first.init('qa-cart');
    const second = useCartStore(createPinia());
    second.init('qa-cart');
    expect(await Promise.all([first.add(product.id, 2, product), second.add(product.id, 2, product)])).toEqual([true, false]);
    const snapshot = first.items.map(item => ({ ...item }));
    const consume = first.consumePurchasedItems(snapshot);
    first.switchOwner('other-account');
    await expect(consume).rejects.toThrow('账号已切换');
    expect(first.items).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(cartStorageKey('qa-cart'))!)[0].qty).toBe(2);
  });

  it('商品数量乘价和费用合计保留大数及小数原精度，只在展示时取两位', async () => {
    const cart = createCart();
    await cart.add(product.id, 2, { ...product, price: '9007199254740993.12345678', shippingFee: '0.001', tax: '0.004' });
    expect(cart.enrichedItems[0]).toMatchObject({ productId: product.id, qty: 2, subtotal: '18014398509481986.24691356', lineTotal: '18014398509481986.25191356' });
    expect(cart.grandTotal).toBe('18014398509481986.25191356');
    expect(formatPaymentAmount(cart.grandTotal)).toBe('18,014,398,509,481,986.25');
  });

  it('先合计原金额再显示，不把多项小额逐项提前舍入为零', async () => {
    const cart = createCart();
    for (const id of [product.id, '9007199254740994']) await cart.add(id, 1, { ...product, id, price: '0.0049', shippingFee: '0', tax: '0' });
    expect(cart.enrichedItems.map(item => item.subtotal)).toEqual(['0.0049', '0.0049']);
    expect(cart.subTotal).toBe('0.0098');
    expect(cart.grandTotal).toBe('0.0098');
    expect(formatPaymentAmount(cart.grandTotal)).toBe('0.01');
  });

  it('详情读缺费用保持未知且不可购，明确零费用可恢复', async () => {
    const cart = createCart();
    for (const missing of [{ shippingFee: undefined, taxFee: 0 }, { shippingFee: 0, taxFee: null }]) {
      const dto = { id: product.id, price: '1', stock: 3, status: 'ON_SALE', ...missing } as Api.RealProduct.ProductDTO;
      const record = productApi.toProductRecord(dto);
      await cart.add(product.id, 1, record);
      expect(cart.enrichedItems[0].available).toBe(false);
      expect(cart.enrichedItems[0].confirmedInvalid).toBe(false);
      expect(cart.selectedItems).toEqual([]);
      expect(formatPaymentAmount(record.shippingFee)).toBe(missing.shippingFee === undefined ? '—' : '0.00');
      expect(formatPaymentAmount(record.tax)).toBe(missing.taxFee === null ? '—' : '0.00');
    }
    cart.upsertProduct({ ...product, shippingFee: '0', tax: '0' });
    expect(cart.enrichedItems[0].available).toBe(true);
    expect(cart.enrichedItems[0].shippingFee).toBe('0');
    expect(cart.enrichedItems[0].tax).toBe('0');
  });

  it('同商品不同 SKU 独立勾选、调数量、移除和付款扣减，价格不使用汇总最低价', async () => {
    const cart = createCart();
    const multi = { ...product, hasSku:true, stock:6, price:'1', specGroups:[{ name:'颜色', options:['黑','白'] }], skus:[
      { id:'9007199254740995', specs:[{ name:'颜色', value:'黑' }], price:'9007199254740993.12345678', stock:3, enabled:true },
      { id:'9007199254740996', specs:[{ name:'颜色', value:'白' }], price:'25.00000001', stock:3, enabled:true }
    ] };
    expect(await cart.add(product.id, 1, multi)).toBe(false);
    expect(await cart.add(product.id, 2, multi, multi.skus[0].id)).toBe(true);
    expect(await cart.add(product.id, 1, multi, multi.skus[1].id)).toBe(true);
    expect(cart.items).toHaveLength(2);
    const black = () => cart.enrichedItems.find(item => item.skuId === multi.skus[0].id)!;
    expect(black()).toMatchObject({ unitPrice:'9007199254740993.12345678', subtotal:'18014398509481986.24691356', stock:3, specText:'颜色：黑' });
    await cart.setSelected(product.id, false, multi.skus[1].id);
    expect(cart.selectedItems.map(item => item.skuId)).toEqual([multi.skus[0].id]);
    const snapshot = cart.items.filter(item => item.skuId === multi.skus[0].id).map(item => ({ ...item }));
    await cart.update(product.id, 3, multi.skus[0].id);
    await cart.consumePurchasedItems(snapshot);
    expect(black().qty).toBe(1);
    await cart.remove(product.id, multi.skus[1].id);
    expect(cart.items.map(item => item.skuId)).toEqual([multi.skus[0].id]);
  });

  it('停用/无库存/未知 SKU 不可加购，旧无规格缓存不能自动购买新规格', async () => {
    const cart = createCart();
    await cart.add(product.id, 1, product);
    const multi = { ...product, hasSku:true, stock:3, skus:[
      { id:'sku-active', specs:[{ name:'规格', value:'A' }], price:'10', stock:3, enabled:true },
      { id:'sku-disabled', specs:[{ name:'规格', value:'B' }], price:'12', stock:3, enabled:false },
      { id:'sku-empty', specs:[{ name:'规格', value:'C' }], price:'13', stock:0, enabled:true }
    ], specGroups:[{ name:'规格', options:['A','B','C'] }] };
    cart.upsertProduct(multi);
    expect(cart.enrichedItems[0]).toMatchObject({ available:false, skuSelectionRequired:true, confirmedInvalid:false });
    for (const skuId of [undefined,'missing','sku-disabled','sku-empty']) expect(await cart.add(product.id, 1, multi, skuId)).toBe(false);
    expect(await cart.add(product.id, 1, multi, 'sku-active')).toBe(true);
    cart.upsertProduct({ ...multi, skus:[] });
    expect(cart.enrichedItems.find(item => item.skuId === 'sku-active')).toMatchObject({ available:false, confirmedInvalid:true });
    cart.switchOwner('another-account');
    expect(cart.items).toHaveLength(0);
  });

  it('SKU 详情保留 Long ID、完整组合和精确价格，契约损坏不降级普通商品', () => {
    const dto = { id:product.id, price:'1', hasSku:true, specGroups:[{ name:'颜色', options:['黑','白'] }], skus:[
      { id:'9007199254740997', specs:[{ name:'颜色', value:'白' }], price:'25.12345678', stock:2, enabled:true, image:'https://example.test/white.webp' }
    ] } as Api.RealProduct.ProductDTO;
    expect(productApi.toProductRecord(dto)).toMatchObject({ hasSku:true, skus:[{ id:'9007199254740997', price:'25.12345678', specs:[{ name:'颜色', value:'白' }] }] });
    for (const broken of [{ ...dto, hasSku:false }, { ...dto, skus:[dto.skus![0],dto.skus![0]] },
      { ...dto, skus:[{ ...dto.skus![0], specs:[{ name:'颜色', value:'不在选项中' }] }] }]) {
      expect(() => productApi.toProductRecord(broken)).toThrow('商品规格信息不完整');
    }
    expect(productApi.toProductRecord({ id:'1', price:'10', status:'REVIEWING', auditStage:'PENDING_AUDIT' } as Api.RealProduct.ProductDTO).status).toBe('PENDING_AUDIT');
  });

  it('小数、NaN及超安全范围数量不能加购或改写已有数量，累计数量不可溢出', async () => {
    const cart = createCart();
    for (const qty of [1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(await cart.add(product.id, qty, product)).toBe(false);
    await cart.add(product.id, 1, product);
    for (const qty of [1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) await cart.update(product.id, qty);
    expect(cart.items[0].qty).toBe(1);
    const large = { ...product, id: '9007199254740994', stock: Number.MAX_SAFE_INTEGER, price: '1', shippingFee: '0', tax: '0' };
    expect(await cart.add(large.id, Number.MAX_SAFE_INTEGER, large)).toBe(true);
    expect(await cart.add(large.id, 1, large)).toBe(false);
    expect(cart.enrichedItems.find(item => item.productId === large.id)).toMatchObject({ qty: Number.MAX_SAFE_INTEGER, available: true, lineTotal: String(Number.MAX_SAFE_INTEGER) });
  });

  it('金额乘法支持科学计数及零，展示半入边界正确，未知不显示零', () => {
    expect(multiplyPaymentAmount('1.005', 3)).toBe('3.015');
    expect(formatPaymentAmount(multiplyPaymentAmount('1.005', 3))).toBe('3.02');
    expect(multiplyPaymentAmount('1.25e-7', 3)).toBe('0.000000375');
    expect(multiplyPaymentAmount('0', 3)).toBe('0');
    expect(formatPaymentAmount('0')).toBe('0.00');
    expect(formatPaymentAmount(undefined)).toBe('—');
    expect(formatPaymentAmount('')).toBe('—');
    expect(() => multiplyPaymentAmount('1', 1.5)).toThrow('商品数量');
  });
});

describe('独立结算上下文', () => {
  it('首次明确拒绝可解除记录，但未知结果的重试拒绝不能解除原记录', () => {
    for (const status of [undefined, 200, 400]) {
      expect(canDiscardRejectedCheckout(new RequestError('参数冲突', { code: '-311', status }), false)).toBe(false);
      expect(canDiscardRejectedCheckout(new RequestError('参数冲突', { code: '-311', status }), true)).toBe(false);
      expect(canDiscardRejectedCheckout(new RequestError('创建仍在处理', { code: '-321', status }), false)).toBe(false);
      expect(canDiscardRejectedCheckout(new RequestError('创建仍在处理', { code: '-321', status }), true)).toBe(false);
    }
    for (const error of [new RequestError('参数拒绝', { status: 422 }), new RequestError('请求未发出', { code: 'SESSION_CHANGED' }), new RequestError('不能购买自己发布的商品')]) {
      expect(canDiscardRejectedCheckout(error, false)).toBe(true);
      expect(canDiscardRejectedCheckout(error, true)).toBe(false);
    }
    for (const error of [new RequestError('网络异常', { code: 'NETWORK_ERROR' }), new RequestError('服务异常', { status: 500 }), new RequestError('未知业务拒绝', { code: 'UNKNOWN' })]) {
      expect(canDiscardRejectedCheckout(error, false)).toBe(false);
    }
  });

  it('支付后的各项清理独立执行，本地失败只返回清理警告，不抛支付错误', async () => {
    const context = vi.fn(() => { throw new Error('存储受限'); });
    const cart = vi.fn(() => { throw new Error('空间不足'); });
    const pending = vi.fn();
    expect(await cleanupPaidCheckout([context, cart, pending])).toBe(false);
    expect(context).toHaveBeenCalledOnce();
    expect(cart).toHaveBeenCalledOnce();
    expect(pending).toHaveBeenCalledOnce();
    expect(await cleanupPaidCheckout([pending])).toBe(true);
  });

  it('匿名购买登录后绑定身份，不能被其他账号接续或回退购物车', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
    const id = createCheckoutIntent([{ productId: '9007199254740993', quantity: 2 }]);
    expect(readCheckoutIntent(id, 'account-a').items[0].quantity).toBe(2);
    expect(() => readCheckoutIntent(id, 'account-b')).toThrow('不属于当前账号');
    expect(() => readCheckoutIntent('missing-context', 'account-a')).toThrow('结算信息已失效');
  });

  it('超过一小时的购买意图不能恢复付款', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
    const createdAt = Date.now();
    const id = createCheckoutIntent([{ productId: '9007199254740993', quantity: 1 }], 'account-a');
    vi.spyOn(Date, 'now').mockReturnValue(createdAt + 60 * 60 * 1000 + 1000);
    expect(() => readCheckoutIntent(id, 'account-a')).toThrow('结算信息已失效');
  });
});

describe('已创建订单付款恢复', () => {
  it('金额十进制精确合计，支持原始精度与科学计数法', () => {
    expect(sumPaymentAmounts(['0.1', '0.2'])).toBe('0.3');
    expect(sumPaymentAmounts(['9007199254740993.12345678', '0.00000001'])).toBe('9007199254740993.12345679');
    expect(sumPaymentAmounts(['1e-8', '10.00'])).toBe('10.00000001');
    expect(sumPaymentAmounts(['0.000', '100.00'])).toBe('100');
    expect(() => sumPaymentAmounts(['NaN'])).toThrow();
  });
  it('回执漏项、取消和部分付款不能冒充整组成功', () => {
    const result: Api.RealOrder.OrderGroupPayResult = { orderGroupNo: 'g', totalCount: 1, paidCount: 1, failedCount: 0, paidAmount: '1', unpaidAmount: '0', items: [{ orderId: '1', amount: '1', success: true, status: 'PAID' }] };
    expect(isGroupPaymentComplete(validateGroupPayResult(result, 'g', ['1']), ['1'])).toBe(true);
    expect(isGroupPaymentComplete(validateGroupPayResult({ ...result, unpaidAmount: '0E-8' }, 'g', ['1']), ['1'])).toBe(true);
    expect(() => validateGroupPayResult({ ...result, totalCount: 2 }, 'g', ['1'])).toThrow('不完整');
    expect(isGroupPaymentComplete({ ...result, unpaidAmount: '1' }, ['1'])).toBe(false);
    expect(isGroupPaymentComplete({ ...result, items: [{ ...result.items[0], status: 'CANCELED' }] }, ['1'])).toBe(false);
    expect(isGroupPaymentComplete(result, ['2'])).toBe(false);
  });
  const first = toOrderRecord({ orderId: '9007199254740993', customerId: 'customer', productId: 'product-a', status: 'CREATED', totalAmount: '10.00', quantity: 1 });
  const second = toOrderRecord({ orderId: '9007199254740994', customerId: 'customer', productId: 'product-b', status: 'CREATED', totalAmount: '20.00', quantity: 2 });

  it('整组未付且回读一致时才能使用订单组支付，保留原始 Long ID', () => {
    const payment = prepareCheckoutPayment([first, second], [second, first], 'customer', 'group');
    expect(payment.changed).toBe(false);
    expect(payment.orderGroupNo).toBe('group');
    expect(payment.payable.map(order => order.id)).toEqual([second.id, first.id]);
  });

  it('部分已付款、已取消或已退款时，只支付剩余未付订单', () => {
    for (const status of ['PROCURING', 'CANCELLED', 'REFUNDED'] as const) {
      const orders = [{ ...first, status }, second];
      const payment = prepareCheckoutPayment(orders, orders, 'customer', 'group');
      expect(payment.orderGroupNo).toBe('group');
      expect(payment.payable.map(order => order.id)).toEqual([second.id]);
    }
  });

  it('金额、数量、收件人或状态变化必须重新确认，不能产生付款对象', () => {
    for (const change of [{ totalAmount: '11' }, { quantity: 3 }, { receiverName: '不同收件人' }, { status: 'CANCELLED' as const }]) {
      const payment = prepareCheckoutPayment([first], [{ ...first, ...change }], 'customer', 'group');
      expect(payment.changed).toBe(true);
      expect(payment.payable).toEqual([]);
    }
  });

  it('错误订单、重复订单或其他顾客的订单均拒绝付款', () => {
    expect(() => prepareCheckoutPayment([first], [second], 'customer')).toThrow('回读对象不一致');
    expect(() => prepareCheckoutPayment([first, first], [first, first], 'customer')).toThrow('回读对象不一致');
    expect(() => prepareCheckoutPayment([first], [first], 'other-customer')).toThrow('不属于当前顾客');
  });

  it('全部结束或金额无效时，不生成付款计划', () => {
    const paid = { ...first, status: 'PROCURING' as const };
    expect(() => prepareCheckoutPayment([paid], [paid], 'customer')).toThrow('没有待付款订单');
    for (const totalAmount of ['', 'NaN', 'Infinity', '-1']) {
      const invalid = { ...first, totalAmount };
      expect(() => prepareCheckoutPayment([invalid], [invalid], 'customer')).toThrow('金额无效');
    }
  });
});

describe('创建成功与详情回读解耦', () => {
  it('商品和求购缺失或未知售后类型不生成七天无理由承诺，保留未知原值', async () => {
    expect(productApi.toAfterSaleType('SEVEN_DAY_NO_REASON')).toBe('7day-no-reason');
    expect(productApi.toAfterSaleType('NONE')).toBe('none');
    for (const afterSaleType of [undefined, 'QA_NEW_TYPE']) {
      const product = productApi.toProductRecord({ id: '9007199254740993', price: '1', afterSaleType } as Api.RealProduct.ProductDTO);
      expect(product.aftersaleType).toBe('unknown');
      expect(product.rawAfterSaleType).toBe(afterSaleType);
      expect(productApi.getAftersaleMeta(product.aftersaleType).label).toBe('售后信息待确认');
      vi.spyOn(realOrderRequest, 'get').mockResolvedValueOnce({ id: '9007199254740993', status: 'OPEN', afterSaleType, budget: '1', expectDeliveryDays: 7 });
      const purchase = await fetchPurchaseDetail('9007199254740993');
      expect(purchase.aftersaleType).toBe('unknown');
      expect(purchase.rawAfterSaleType).toBe(afterSaleType);
    }
  });

  it('求购分类首次失败后再次读取可恢复名称，同批请求共用分类读取', async () => {
    let categoryCalls = 0;
    vi.spyOn(realOrderRequest, 'get').mockImplementation(async (url) => {
      if (url === '/categories/tree') {
        categoryCalls += 1;
        if (categoryCalls === 1) throw new Error('分类暂不可用');
        return [{ id: 'qa-category', name: 'QA 分类', level: 1 }];
      }
      return { id: '9007199254740993', categoryId: 'qa-category', status: 'OPEN', budget: '1', expectDeliveryDays: 7 };
    });
    const first = await Promise.all([fetchPurchaseDetail('9007199254740993'), fetchPurchaseDetail('9007199254740993')]);
    expect(first.map(item => item.categoryPath)).toEqual(['qa-category', 'qa-category']);
    expect(categoryCalls).toBe(1);
    expect((await fetchPurchaseDetail('9007199254740993')).categoryPath).toBe('QA 分类');
    expect(categoryCalls).toBe(2);
  });

  it('求购缺失或未知状态不能降级为可接单状态', async () => {
    const get = vi.spyOn(realOrderRequest, 'get');
    for (const status of [undefined, 'UNRECOGNIZED']) {
      get.mockResolvedValueOnce({ id: '9007199254740993', status });
      await expect(fetchPurchaseDetail('9007199254740993')).rejects.toThrow('求购状态');
    }
  });
  it('求购缺少预算或发货天数时拒绝，真实零和原金额精度保留', async () => {
    const get = vi.spyOn(realOrderRequest, 'get');
    for (const fields of [{ expectDeliveryDays: 7 }, { budget: '1' }, { budget: '', expectDeliveryDays: 7 }, { budget: '1', expectDeliveryDays: NaN }]) {
      get.mockResolvedValueOnce({ id: '9007199254740993', status: 'OPEN', ...fields });
      await expect(fetchPurchaseDetail('9007199254740993')).rejects.toThrow(/求购(?:预算|期望发货天数)/);
    }
    get.mockResolvedValueOnce({ id: '9007199254740993', status: 'OPEN', budget: 0, expectDeliveryDays: 0 });
    expect(await fetchPurchaseDetail('9007199254740993')).toMatchObject({ id: '9007199254740993', budgetAmount: '0', expectedDays: 0 });
    get.mockResolvedValueOnce({ id: '9007199254740993', status: 'OPEN', budget: '9007199254740993.12345678', expectDeliveryDays: '3e1' });
    expect(await fetchPurchaseDetail('9007199254740993')).toMatchObject({ budgetAmount: '9007199254740993.12345678', expectedDays: 30 });
    expect(get.mock.calls.at(-1)?.[1]).toMatchObject({ preserveDecimals: true });
  });

  it('商品和求购创建收到 ID 后不依赖详情读取', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('9007199254740993');
    const get = vi.spyOn(realOrderRequest, 'get').mockRejectedValue(new Error('详情暂未同步'));
    expect(await productApi.createProduct({ title: '隔离测试', categoryId: '1', price: '1', shippingFee: '0', tax: '0', stock: 1,
      aftersaleType: 'none', overseasCustoms: false, summary: '', description: '', images: [] })).toBe('9007199254740993');
    expect(await createPurchase({ productTitle: '隔离测试', productDescription: '', categoryId: '1', addressId: '2', budgetAmount: '1',
      expectedDays: 1, overseasCustoms: false, aftersaleType: 'none', appeal: '' })).toBe('9007199254740993');
    expect(post).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('商品售价读取边界', () => {
  it('缺失或损坏售价拒绝读取，不产生免费商品', () => {
    for (const price of [undefined, null, '', '  ', NaN, Infinity, '-1', 'NaN', true, {}]) {
      expect(() => productApi.toProductRecord({ id: '9007199254740993', price } as Api.RealProduct.ProductDTO)).toThrow('商品价格');
    }
  });

  it('真实零价、科学计数及高精度售价保留，商品状态库存和 ID 不变', () => {
    for (const [price, expected] of [[0, '0'], ['0.00', '0'], ['1.25e-7', '0.000000125'], ['9007199254740993.12345678', '9007199254740993.12345678']]) {
      expect(productApi.toProductRecord({ id: '9007199254740993', price, status: 'ON_SALE', stock: 3 } as Api.RealProduct.ProductDTO))
        .toMatchObject({ id: '9007199254740993', price: expected, status: 'NORMAL', shelfStatus: 'on-shelf', stock: 3 });
    }
  });

  it('公开商品分页缺售价整体拒绝读取，真实零价不被过滤', async () => {
    const post = vi.spyOn(realOrderRequest, 'postQuery');
    post.mockResolvedValueOnce({ total: 1, records: [{ id: '9007199254740993', stock: 1 }] });
    await expect(productApi.fetchStorefrontProducts({})).rejects.toThrow('商品价格');
    post.mockResolvedValueOnce({ total: 1, records: [{ id: '9007199254740993', price: 0, stock: 1 }] });
    expect((await productApi.fetchStorefrontProducts({})).records[0]).toMatchObject({ price: '0', stock: 1 });
    expect(post.mock.calls.at(-1)?.[2]).toMatchObject({ preserveDecimals: true });
  });

  it('秒杀未设促销价按契约使用原价，真实促销零价保留，两价均缺或促销价损坏拒绝', async () => {
    const get = vi.spyOn(realOrderRequest, 'get');
    get.mockResolvedValueOnce([{ productId: '9007199254740993', price: '25.12345678', flashPrice: null, stock: 2 }]);
    expect((await productApi.fetchFlashSale())[0].product).toMatchObject({ price: '25.12345678', stock: 2 });
    get.mockResolvedValueOnce([{ productId: '9007199254740993', price: '25', flashPrice: 0, stock: 2 }]);
    expect((await productApi.fetchFlashSale())[0].product.price).toBe('0');
    for (const item of [{ productId: '9007199254740993' }, { productId: '9007199254740993', price: '25', flashPrice: '' }]) {
      get.mockResolvedValueOnce([item]);
      await expect(productApi.fetchFlashSale()).rejects.toThrow('商品价格');
    }
    expect(get.mock.calls.at(-1)?.[1]).toMatchObject({ preserveDecimals: true });
  });

  it('商品详情从 JSON 数值原文保留金额小数和 Long ID，不先经过浮点舍入', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":1,"data":{"id":9007199254740993,"price":0.123456789012345678,"stock":1,"status":"ON_SALE"}}')));
    expect(await productApi.fetchProductDetail('9007199254740993')).toMatchObject({ id: '9007199254740993', price: '0.123456789012345678' });
  });
});
