import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reverseStatusMap, toOrderRecord } from './order-mapper';
import { cartStorageKey, useCartStore } from '@/stores/cart';
import { getOrderCapabilities, resolveOrderView } from '@/utils/order';
import { createCheckoutIntent, readCheckoutIntent, prepareCheckoutPayment, canDiscardRejectedCheckout, cleanupPaidCheckout, readPendingCheckout, pendingCheckoutStorageKey } from '@/utils/checkout';
import { RequestError } from '@/service/request/type';
import * as productApi from './product';
import { createPurchase, fetchPurchaseDetail } from './purchase';
import { realOrderRequest } from '@/service/request';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('结算待确认记录保护', () => {
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

  it('顾客操作同时校验订单归属和实际状态', () => {
    const order = toOrderRecord({ orderId: '1', customerId: '9007199254740993', sellerId: '9007199254740994', status: 'CREATED' });
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
    const record = toOrderRecord({ orderId: '1', status: 'PAID', createdAt: '1786454129000' });

    expect(record.shippingAddress).toBe('后端暂未返回收货地址');
    expect(record.trackingNumber).toBeUndefined();
    expect(record.purchaseScreenshotUrl).toBeUndefined();
    expect(record.shippingScreenshotUrl).toBeUndefined();
    expect(record.shippingVoucherUrls).toBeUndefined();
    expect(record.status).toBe('PROCURING');
    expect(record.customerName).toBe('匿名顾客');
    expect(record.overseasCustoms).toBeUndefined();
    expect(record.aftersaleType).toBeUndefined();
    expect(reverseStatusMap.PROCURED).toBeUndefined();
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

  it('缓存损坏不显示为正常空车、不覆盖原记录，修复后可重新读取', async () => {
    const cart = createCart();
    for (const raw of ['{broken', 'null', '{}', '', JSON.stringify([{ productId: '1', qty: -1, addedAt: '' }])]) {
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
});

describe('独立结算上下文', () => {
  it('首次明确拒绝可解除记录，但未知结果的重试拒绝不能解除原记录', () => {
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
      expect(payment.orderGroupNo).toBeUndefined();
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
      const product = productApi.toProductRecord({ id: '9007199254740993', afterSaleType } as Api.RealProduct.ProductDTO);
      expect(product.aftersaleType).toBe('unknown');
      expect(product.rawAfterSaleType).toBe(afterSaleType);
      expect(productApi.getAftersaleMeta(product.aftersaleType).label).toBe('售后信息待确认');
      vi.spyOn(realOrderRequest, 'get').mockResolvedValueOnce({ id: '9007199254740993', status: 'OPEN', afterSaleType });
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
      return { id: '9007199254740993', categoryId: 'qa-category', status: 'OPEN' };
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
