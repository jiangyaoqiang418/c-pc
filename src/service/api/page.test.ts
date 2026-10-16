import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMergeSourcePages, resolvePageSize, toPageTotal } from './page';
import { realOrderRequest, realUserRequest, realNotifyRequest } from '@/service/request';
import { sendConversationMessage } from './notify';
import { findReviewableOrderIds, submitReview, replyReview, createReviewAppeal } from './review';
import { fetchMyOrders, payOrder, withOrderPayment, fetchCarriers } from './order';
import { fetchRechargePage, fetchWalletLedger, fetchWithdrawPage, fetchWalletOverview, prepareWithdrawal } from './wallet';
import { fetchHall, fetchMyPurchases } from './purchase';
import { fetchMyPointLogs, fetchPointRules } from './point';
import { fetchBuyerDepositLedger } from './buyer';
import { fetchCurrentUser, updateProfile, prepareRegistration } from './auth';
import { prepareAddress } from './address';
import { createAddress, updateAddress } from './address';
import { createRefund } from './refund';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { financeRedemptionIssue, financeSubscriptionIssue } from './finance';
import { createRecharge } from './wallet';
import { submitBuyerApplication } from './buyer';
import { fetchKycSchema, kycSubmissionIssue } from './kyc';
import { fetchRechargeByKey, fetchWithdrawByKey } from './wallet';
import { fetchFinanceOrderByKey } from './finance';
import { createCategoryOptions, fetchCategoryTree, fetchCreateCategoryOptions, isSelectableCategory } from './category';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '@/stores/user';
import { useProductFavoritesStore } from '@/stores/product-favorites';
import { useReviewStore } from '@/stores/review';
import * as productApi from './product';
import { fetchBrandsPage, fetchBrandDetail } from './brand';
import { fetchHelpPage, fetchHelpDetail, fetchAgreementCurrent, fetchAnnouncementsPage, contentReadMessage } from './content';
import { fetchMyReviews, fetchStorefrontReviews, setReviewHelpful, validateHelpfulState } from './review';
import { productEditSnapshot, productSkuEditorWrite, validateProductSkuWrite } from '@/utils/product-sku';
import { buyerProductDraftKey, readBuyerProductDraft, saveBuyerProductDraft } from '@/components/buyer/buyer-product-draft';
import { enrollFlashSale } from './flash-sale';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('v47 新接入契约与恢复边界', () => {
  const productId = '9007199254740993';
  const skuId = '9007199254740995';
  const groups = [{ name:'颜色', options:['黑', '白'] }];
  const sku = { id:skuId, specs:[{ name:'颜色', value:'黑' }], price:'9007199254740993.12345678', stock:2, enabled:true };

  it('收藏态按200个分批并保留Long，漏项/重复/未知ID/无效状态拒绝', async () => {
    const request = vi.spyOn(realOrderRequest, 'postQuery').mockImplementation(async (_url, payload) =>
      (payload as { productIds: string[] }).productIds.map(id => ({ productId:id, favorited:false })) as never);
    const ids = Array.from({ length:201 }, (_, i) => `${productId}${i}`);
    expect((await productApi.fetchFavoriteStates([...ids, ids[0]])).size).toBe(201);
    expect(request.mock.calls.map(call => (call[1] as {productIds:string[]}).productIds.length)).toEqual([200, 1]);
    const invalid = [[], [{ productId, favorited:null }], [{ productId:'other', favorited:false }], [{ productId, favorited:false }, { productId, favorited:true }]];
    for (const rows of invalid) {
      request.mockResolvedValueOnce(rows);
      await expect(productApi.fetchFavoriteStates([productId])).rejects.toThrow(/收藏状态/);
    }
  });

  function favoriteStore() {
    vi.stubGlobal('localStorage', { getItem: () => null });
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id:'test-owner' } as Api.RealSession.UserRecord;
    return { user, store:useProductFavoritesStore() };
  }

  it('收藏写入丢响应后按权威状态恢复，未确认时保留原目标，重试不反向取消', async () => {
    const { store } = favoriteStore();
    const query = vi.spyOn(realOrderRequest, 'postQuery')
      .mockResolvedValueOnce([{ productId, favorited:false }])
      .mockRejectedValueOnce(new Error('read unavailable'))
      .mockResolvedValueOnce([{ productId, favorited:true }]);
    const post = vi.spyOn(realOrderRequest, 'post').mockRejectedValue(new RequestError('timeout', { code:'REQUEST_TIMEOUT' }));
    const remove = vi.spyOn(realOrderRequest, 'delete');
    await expect(store.toggle(productId)).rejects.toThrow('read unavailable');
    expect(store.entries[productId]).toMatchObject({ value:undefined, target:true, writing:false });
    expect(await store.toggle(productId)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('收藏取消读回为false才确认成功；账号切换丢弃在途旧结果', async () => {
    const { user, store } = favoriteStore();
    const query = vi.spyOn(realOrderRequest, 'postQuery')
      .mockResolvedValueOnce([{ productId, favorited:true }])
      .mockResolvedValueOnce([{ productId, favorited:false }]);
    vi.spyOn(realOrderRequest, 'delete').mockRejectedValue(new Error('lost response'));
    expect(await store.set(productId, false)).toBe(false);
    let resolve!: (value:unknown) => void;
    query.mockImplementationOnce(() => new Promise(done => { resolve = done; }) as never);
    const read = store.refresh([productId]);
    user.currentUser = { id:'another-owner' } as Api.RealSession.UserRecord;
    resolve([{ productId, favorited:true }]);
    await read;
    expect(store.entries).toEqual({});
  });

  it('收藏同账号重叠读取丢弃旧结果，队列读取不覆盖刚确认的写入', async () => {
    const { store } = favoriteStore();
    let resolveOld!: (value:unknown) => void;
    const query = vi.spyOn(realOrderRequest, 'postQuery')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }) as never)
      .mockResolvedValueOnce([{ productId, favorited:true }]);
    const old = store.refresh([productId]);
    await store.refresh([productId]);
    resolveOld([{ productId, favorited:false }]);
    await old;
    expect(store.entries[productId].value).toBe(true);

    const nextId = 'another-product';
    query.mockResolvedValueOnce([{ productId:nextId, favorited:false }]).mockResolvedValueOnce([{ productId:nextId, favorited:true }]);
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(true);
    store.ensure(nextId);
    expect(await store.toggle(nextId)).toBe(true);
    expect(store.entries[nextId]).toMatchObject({ value:true, loading:false, writing:false });
    expect(query).toHaveBeenCalledTimes(4);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('资料刷新保留收藏未知目标，同账号新会话才清除原状态', async () => {
    const { user, store } = favoriteStore();
    vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValueOnce([{ productId, favorited:false }])
      .mockRejectedValueOnce(new Error('read unavailable'));
    vi.spyOn(realOrderRequest, 'post').mockRejectedValue(new Error('lost response'));
    await expect(store.toggle(productId)).rejects.toThrow('read unavailable');
    user.currentUser = { ...user.currentUser!, nickname:'资料刷新' };
    expect(store.entries[productId]).toMatchObject({ target:true, writing:false });
    user.sessionVersion += 1;
    expect(store.entries).toEqual({});
  });

  it('评价原提交仅属于当前会话，旧异常不能覆盖新会话的在途操作', async () => {
    const { user } = favoriteStore();
    const store = useReviewStore();
    let rejectOld!: (error:Error) => void;
    let resolveNew!: (value:unknown) => void;
    vi.spyOn(realOrderRequest, 'post')
      .mockImplementationOnce(() => new Promise((_resolve,reject) => { rejectOld = reject; }) as never)
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }) as never);
    const params = { orderId:productId, productScore:5, sellerScore:5, content:'真实请求前的内存测试' };
    const old = store.submit(params).catch(error => error);
    store.pendingActions.set('original-reply', {
      kind:'reply', phase:'unknown', note:'核对原回复', content:'原回复',
      review:{ reviewId:skuId, orderId:productId, productScore:5, sellerScore:5, status:'PUBLISHED' }
    });
    user.currentUser = { ...user.currentUser!, nickname:'资料刷新' };
    expect(store.getPending(productId)?.state).toBe('submitting');
    expect(store.pendingActions.get('original-reply')?.content).toBe('原回复');
    user.sessionVersion += 1;
    expect(store.getPending(productId)).toBeUndefined();
    expect(store.pendingActions.size).toBe(0);
    const current = store.submit(params);
    rejectOld(new Error('旧会话超时'));
    await old;
    expect(store.getPending(productId)?.state).toBe('submitting');
    resolveNew(skuId);
    expect(await current).toBe(skuId);
    expect(store.getPending(productId)).toBeUndefined();
  });

  it('评价编号返回后详情验证失败保留原操作，按原内容恢复完成才清理', async () => {
    favoriteStore();
    const store = useReviewStore();
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(skuId);
    const params = { orderId:productId, productScore:5, sellerScore:5, content:'原始评价', images:['https://example.com/original.png'] };
    await expect(store.submit(params, false, async () => {
      throw new RequestError('详情读取失败', { status:404, code:'-322' });
    })).rejects.toThrow('详情读取失败');
    expect(store.getPending(productId)).toMatchObject({ state:'unknown', params });
    const verify = vi.fn().mockResolvedValue(undefined);
    await store.submit({ ...params, content:'不应替换原评价' }, true, verify);
    expect(post.mock.calls[1][1]).toMatchObject({ content:'原始评价', images:params.images });
    expect(verify).toHaveBeenCalledWith(skuId);
    expect(store.getPending(productId)).toBeUndefined();
  });

  it('已确认订单存在不同评价时清理原待核实操作，但不报告本次提交成功', async () => {
    favoriteStore();
    const store = useReviewStore();
    vi.spyOn(realOrderRequest, 'post').mockResolvedValue(skuId);
    const params = { orderId:productId, productScore:5, sellerScore:5, content:'本次内容' };
    await expect(store.submit(params, false, async () => {
      throw new RequestError('该订单已有不同内容的评价', { code:'REVIEW_CONTENT_MISMATCH' });
    })).rejects.toMatchObject({ code:'REVIEW_CONTENT_MISMATCH' });
    expect(store.getPending(productId)).toBeUndefined();
  });

  it('评价列表回读只确认同作者且同内容的原评价，不清除不同内容的待核实快照', async () => {
    favoriteStore();
    const store = useReviewStore();
    vi.spyOn(realOrderRequest, 'post').mockRejectedValue(new Error('lost response'));
    const params = { orderId:productId, productScore:5, sellerScore:4, content:'原评价', images:['https://example.com/original.png'] };
    await expect(store.submit(params)).rejects.toThrow('lost response');
    const detail: Api.RealReview.ReviewDTO = { ...params, reviewId:skuId, userId:'test-owner', status:'PUBLISHED' };
    store.confirmExisting({ ...detail, content:'其他评价' });
    store.confirmExisting({ ...detail, userId:undefined });
    expect(store.getPending(productId)?.params).toEqual(params);
    store.confirmExisting(detail);
    expect(store.getPending(productId)).toBeUndefined();
  });

  it('评价分页损坏的total不伪装成合法空页供删除恢复确认', async () => {
    const query = vi.spyOn(realOrderRequest, 'postQuery');
    for (const total of [undefined, null, '', false, 'not-a-total', -1, 0.5, '9007199254740993']) {
      query.mockResolvedValueOnce({ records:[], total });
      await expect(fetchMyReviews({}, { showError:false })).rejects.toThrow('分页总数异常');
    }
    query.mockResolvedValueOnce({ records:[], total:'0' });
    expect(await fetchMyReviews()).toMatchObject({ records:[], total:0 });
  });

  it('卖家资格仅使用匹配卖家的权威布尔值，失败不降为未认证', async () => {
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValue({ sellerId:productId, verifiedBuyer:true, approvedAt:'1792022400000' });
    expect(await productApi.fetchSellerQualification(productId)).toMatchObject({ verifiedBuyer:true });
    for (const value of [{ sellerId:'other', verifiedBuyer:true }, { sellerId:productId }, null]) {
      get.mockResolvedValueOnce(value);
      await expect(productApi.fetchSellerQualification(productId)).rejects.toThrow('资格响应');
    }
  });

  it('投票采用幂等目标状态，保留Long与合法零，拒绝错ID/反向状态/缺计数', async () => {
    const put = vi.spyOn(realOrderRequest, 'put').mockResolvedValue({ reviewId:productId, helpful:false, helpfulCount:'0' });
    expect(await setReviewHelpful(productId, false)).toMatchObject({ helpful:false, helpfulCount:'0' });
    expect(put).toHaveBeenCalledWith('/reviews/helpful', { reviewId:productId, helpful:false }, { showError:false });
    for (const value of [{ reviewId:'other', helpful:false, helpfulCount:0 }, { reviewId:productId, helpful:false }, { reviewId:productId, helpful:null, helpfulCount:0 }]) {
      expect(() => validateHelpfulState(value as Api.RealReview.ReviewHelpfulVO, productId)).toThrow();
    }
    await expect(setReviewHelpful(productId, true)).rejects.toThrow('未更新');
  });

  it('评价关键词/排序组合在服务端分页，品牌ID不合并进商品关键词', async () => {
    const post = vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ records:[], total:0, pageNo:2, pageSize:10 });
    await fetchStorefrontReviews({ productId, pageNo:2, keyword:'发货', hasImage:true, productScore:5, sortBy:'MOST_HELPFUL' });
    expect(post.mock.calls[0][1]).toMatchObject({ productId, keyword:'发货', hasImage:true, productScore:5, sortBy:'MOST_HELPFUL', pageNo:2 });
    await productApi.fetchStorefrontProducts({ brandId:productId, keyword:'耳机' });
    expect(post.mock.calls[1][1]).toMatchObject({ brandId:productId, keyword:'耳机' });
  });

  it('品牌分页/详情保留ID，禁用及错ID资料不得进入专区', async () => {
    const brand = { id:productId, name:'正式品牌', enabled:true };
    vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ records:[brand], total:1, pageSize:10 });
    expect((await fetchBrandsPage({ keyword:' 正式 ', size:10 })).records[0].id).toBe(productId);
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValue(brand);
    expect((await fetchBrandDetail(productId)).id).toBe(productId);
    get.mockResolvedValueOnce({ ...brand, enabled:false }).mockResolvedValueOnce({ ...brand, id:'other' });
    await expect(fetchBrandDetail(productId)).rejects.toThrow('停用');
    await expect(fetchBrandDetail(productId)).rejects.toThrow('停用');
    const mapped = productApi.toProductRecord({ id:productId, title:'商品', price:'1', stock:1, brandId:productId, brand } as Api.RealProduct.ProductDTO);
    expect(mapped).toMatchObject({ brandId:productId, brandName:brand.name, brand });
  });

  it('正式内容列表允许body=null，正文必须独立读取；错协议/下线内容不回退演示', async () => {
    const article = { id:productId, contentType:'HELP', code:'guide', title:'正式帮助', status:'PUBLISHED', contentVersion:'1', body:null };
    const post = vi.spyOn(realNotifyRequest, 'postQuery').mockResolvedValue({ records:[article], total:1 });
    expect((await fetchHelpPage({ topic:'orders', keyword:' 标题 ' })).records[0].body).toBeNull();
    expect(post.mock.calls[0][1]).toMatchObject({ topic:'orders', keyword:'标题' });
    const get = vi.spyOn(realNotifyRequest, 'get').mockResolvedValue({ ...article, body:'<p>审核正文</p>' });
    expect((await fetchHelpDetail(productId)).id).toBe(productId);
    get.mockResolvedValueOnce({ ...article, body:null });
    await expect(fetchHelpDetail(productId)).rejects.toThrow('资料不完整');
    get.mockResolvedValueOnce({ ...article, contentType:'AGREEMENT', code:'privacy', body:'正文' });
    await expect(fetchAgreementCurrent('user')).rejects.toThrow('种类');
    get.mockRejectedValueOnce(new RequestError('offline', { code:'-324' }));
    await expect(fetchAgreementCurrent('user')).rejects.toThrow('offline');
    expect(contentReadMessage(new RequestError('offline', { code:'-324' }))).toContain('下线');
    post.mockResolvedValueOnce({ records:[], total:0 });
    expect((await fetchAnnouncementsPage()).records).toEqual([]);
  });

  it('SKU全量校验保留原ID与28+8金额，聚合仅包含启用项', () => {
    const original = [sku, { ...sku, id:'second', specs:[{ name:'颜色', value:'白' }], stock:5, price:'0.00000001', enabled:false }];
    const result = validateProductSkuWrite(groups, original, original);
    expect(result).toMatchObject({ price:sku.price, stock:2 });
    expect(result.skus).toEqual(original.map(item => ({ ...item, image:undefined })));
    expect(productSkuEditorWrite({ enabled:false, groups, skus:[] })).toEqual({ specGroups:[], skus:[], price:undefined, stock:undefined });
    expect(() => validateProductSkuWrite(groups, [{ ...sku, stock:2147483647 }, { ...original[1], stock:1, enabled:true }])).toThrow('总库存');
    expect(() => validateProductSkuWrite(groups, [sku, { ...sku, id:'second' }])).toThrow('组合不能重复');
    expect(() => validateProductSkuWrite(groups, [{ ...sku, enabled:false }])).toThrow('至少启用');
    expect(() => validateProductSkuWrite(groups, [{ ...sku, specs:[{ name:'颜色', value:'白' }] }], [sku])).toThrow('不可改');
    expect(() => validateProductSkuWrite(groups, [{ ...sku, id:'unknown' }], [sku])).toThrow('不可改');
  });

  it('SKU新增不带旧ID，编辑全量回传，品牌与原金额不经浮点转换', async () => {
    const input = { title:'规格商品', categoryId:productId, brandId:productId, price:'1', shippingFee:'0', tax:'0', stock:1, aftersaleType:'none' as const, overseasCustoms:false, summary:'', description:'', images:[], specGroups:groups, skus:[{ ...sku, id:undefined }] };
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(productId);
    await productApi.createProduct(input);
    expect(post.mock.calls[0][1]).toMatchObject({ brandId:productId, price:sku.price, stock:2, skus:[{ price:sku.price }] });
    await expect(productApi.createProduct({ ...input, skus:[sku] })).rejects.toThrow('不能回传已有');
    const put = vi.spyOn(realOrderRequest, 'put').mockResolvedValue(productId);
    await productApi.updateProduct({ ...input, id:productId, taxFee:'0', afterSaleType:'NONE', skus:[sku] });
    expect(put.mock.calls[0][1]).toMatchObject({ id:productId, brandId:productId, price:sku.price, skus:[{ id:skuId, enabled:true }] });
  });

  it('编辑快照识别库存/SKU变化；归属草稿保留原SKU、停用行与精准输入', () => {
    const product = productApi.toProductRecord({ id:productId, title:'商品', price:'1', stock:1 } as Api.RealProduct.ProductDTO);
    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({ ...product, stock:2 }));
    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({ ...product, hasSku:true, specGroups:groups, skus:[sku] }));
    const draft = { version:1, ownerId:productId, productId:skuId, productSnapshot:'original', savedAt:Date.now(), imageFiles:[], form:{ title:'草稿', categoryId:productId, brandId:skuId, price:null, shippingFee:0, tax:0, stock:2, aftersaleType:'none', overseasCustoms:false, summary:'', description:'', images:[], amountTexts:{ price:sku.price, shippingFee:'0', tax:'0' }, skuEditor:{ enabled:true, groups, skus:[{ ...sku, price:sku.price, stock:'2', enabled:false, image:'https://example.com/sku.png' }] } } };
    const restored = readBuyerProductDraft(JSON.stringify(draft), productId, skuId);
    expect(restored.productSnapshot).toBe('original');
    expect(restored.form.amountTexts?.price).toBe(sku.price);
    expect(restored.form.skuEditor?.skus[0]).toMatchObject({ id:skuId, price:sku.price, enabled:false, image:'https://example.com/sku.png' });
    expect(() => readBuyerProductDraft(JSON.stringify(draft), 'other', skuId)).toThrow('归属');
    expect(() => readBuyerProductDraft(JSON.stringify({ ...draft, form:{ ...draft.form, amountTexts:undefined, price:9007199254740992 } }), productId, skuId)).toThrow('不完整');
    expect(readBuyerProductDraft(JSON.stringify({ ...draft, form:{ ...draft.form, brandId:null } }), productId, skuId).form.brandId).toBeNull();
  });

  it('草稿保存串行核对原版本，其他标签更新与会话变化不会被静默覆盖', async () => {
    const storage = new Map<string,string>();
    vi.stubGlobal('localStorage', { getItem:(key:string) => storage.get(key) ?? null, setItem:(key:string,value:string) => storage.set(key,value) });
    const lock = vi.fn((_key:string, _options:unknown, callback:(lock:unknown) => unknown) => callback({}));
    vi.stubGlobal('navigator', { locks:{ request:lock } });
    const draft = { version:1 as const, ownerId:productId, savedAt:Date.now(), imageFiles:[], form:{ title:'草稿', price:100, shippingFee:0, tax:0, stock:1, overseasCustoms:false, summary:'', description:'', images:[], amountTexts:{ price:'0.00000001', shippingFee:'0', tax:'0' } } };
    const saved = await saveBuyerProductDraft(draft, undefined, () => true);
    const key = buyerProductDraftKey(productId);
    expect(lock.mock.calls[0][0]).toBe('cpc:submission:' + key);
    storage.set(key, 'newer-draft');
    await expect(saveBuyerProductDraft(draft, saved.raw, () => true)).rejects.toThrow('其他页面更新');
    expect(storage.get(key)).toBe('newer-draft');
    await expect(saveBuyerProductDraft(draft, 'newer-draft', () => false)).rejects.toThrow('已切换');
    expect(storage.get(key)).toBe('newer-draft');
    const invalidLegacyRaw = JSON.stringify({ ...draft, form:{ ...draft.form, amountTexts:undefined, price:19.9 } });
    storage.set(key, invalidLegacyRaw);
    expect(() => readBuyerProductDraft(invalidLegacyRaw, productId)).toThrow('不完整');
    // 显式重新保存可替换本页已读到的损坏版本，仍不能覆盖后来出现的新版本。
    const replaced = await saveBuyerProductDraft(draft, invalidLegacyRaw, () => true);
    expect(storage.get(key)).toBe(replaced.raw);
  });

  it('秒杀报名保留SKU及最小金额，并在请求前拒绝超精度', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('entry');
    await enrollFlashSale({ sessionId:productId, productId, skuId, flashPrice:'0.00000001', flashStock:1 });
    expect(post.mock.calls[0][1]).toMatchObject({ skuId, flashPrice:'0.00000001' });
    expect(() => enrollFlashSale({ sessionId:productId, productId, skuId, flashPrice:'0.000000001' })).toThrow('秒杀价');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('本轮交互边界', () => {
  it('创建分类允许启用的一至五级，拒绝停用节点和错误父子关系', async () => {
    const leaf: Api.RealCategory.CategoryNodeDTO = { id: '9007199254740993', parentId: 'second', level: 3, name: '三级', enabled: true };
    const root: Api.RealCategory.CategoryNodeDTO = { id: 'root', level: 1, name: '一级', enabled: true, children: [
      { id: 'second', parentId: 'root', level: 2, name: '二级', enabled: true, children: [leaf] }
    ] };
    const options = createCategoryOptions([root]);
    expect(isSelectableCategory(options, leaf.id)).toBe(true);
    expect(isSelectableCategory(options, root.id)).toBe(true);
    expect(isSelectableCategory(options, 'second')).toBe(true);
    expect(isSelectableCategory(createCategoryOptions([{ ...root, children: [{ ...root.children![0], parentId: undefined,
      children: [{ ...leaf, parentId: undefined }] }] }]), leaf.id)).toBe(true);
    for (const node of [{ ...root, enabled: false }, { ...root, enabled: undefined }, { ...root, level: 2 as const }, { ...root, id: '' }]) {
      expect(createCategoryOptions([node])).toEqual([]);
    }
    const malformed = createCategoryOptions([{ ...root, children: [{ ...root.children![0], children: [{ ...leaf, parentId: 'wrong' }] }] }]);
    expect(isSelectableCategory(malformed, root.id)).toBe(true);
    expect(isSelectableCategory(malformed, 'second')).toBe(true);
    expect(isSelectableCategory(malformed, leaf.id)).toBe(false);
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValueOnce([root]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    expect(isSelectableCategory(await fetchCreateCategoryOptions(), leaf.id)).toBe(true);
    expect(get).toHaveBeenLastCalledWith('/categories/tree', { params: { onlyEnabled: true, onlyWithProduct: false } });
    expect(isSelectableCategory(await fetchCreateCategoryOptions(), leaf.id)).toBe(false);
    await expect(fetchCreateCategoryOptions()).rejects.toThrow('offline');
  });
  it('C 端分类树请求有商品分类并保留服务端商品数', async () => {
    const root: Api.RealCategory.CategoryNodeDTO = {
      id: 'root', level: 1, name: '有商品分类', enabled: true, source: 'APPLY', productCount: 3
    };
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValueOnce([root]);
    const tree = await fetchCategoryTree();
    expect(get).toHaveBeenCalledWith('/categories/tree', { params: { onlyEnabled: true, onlyWithProduct: true } });
    expect(tree[0].productCount).toBe(3);
    expect(tree[0].creatorType).toBe('buyer');
  });
  it('钱包桶和日期关键词透传服务端，返回总数和记录不再二次筛选', async () => {
    const post = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ total: 21, pageSize: 10, records: [{ id: '9007199254740993', bizType: 'ORDER_REFUND', amount: 1, toBalanceAfter: 0 }] });
    const result = await fetchWalletLedger({ current: 2, size: 10, bucket: 'lockedFinance', keyword: ' QA ', fromAt: '2026-09-05', toAt: '2026-09-05' });
    expect(post.mock.calls[0][1]).toMatchObject({ pageNo: 2, balanceType: 'FINANCE_LOCKED', keyword: 'QA', startAt: new Date('2026-09-05T00:00:00').getTime(), endAt: new Date('2026-09-05T23:59:59.999').getTime() });
    expect(result.total).toBe(21);
    expect(result.records[0].id).toBe('9007199254740993');
  });
  it('钱包及押金流水缺金额或余额时拒绝，不把异常响应补成零', async () => {
    const request = vi.spyOn(realUserRequest, 'postQuery');
    for (const read of [() => fetchWalletLedger({}), () => fetchBuyerDepositLedger()]) {
      for (const row of [{ amount: 1 }, { balanceAfter: 0, toBalanceAfter: 0 }, { amount: '', balanceAfter: 0, toBalanceAfter: 0 }]) {
        request.mockResolvedValue({ total: 1, records: [{ id: '9007199254740993', bizType: 'PAY', ...row }] });
        await expect(read()).rejects.toThrow(/流水.*(?:尚未确认|格式异常)/);
      }
    }
  });
  it('钱包及押金流水保留零值、Long ID与小数原值，并启用原 token 解析', async () => {
    const request = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ total: 1, pageNo: 1, pageSize: 20, records: [{
      id: '9007199254740993', userId: '9007199254740995', bizType: 'PAY',
      amount: '9007199254740993.12345678', balanceAfter: 0, toBalanceAfter: 0
    }] });
    for (const read of [() => fetchWalletLedger({}), () => fetchBuyerDepositLedger()]) {
      const result = await read();
      expect(result.records[0]).toMatchObject({ id: '9007199254740993', userId: '9007199254740995', amount: '9007199254740993.12345678', balanceAfter: '0' });
    }
    expect(request.mock.calls.every(call => call[2]?.preserveDecimals === true)).toBe(true);
  });
  it('积分多行为、扣分 false 和零时间戳不丢失，登录人由后端限定', async () => {
    const post = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ total: 0, records: [] });
    await fetchMyPointLogs({ userId: 'u', behaviors: ['CONSUME', 'RECHARGE'], earned: false, fromAt: '0', toAt: '0' });
    expect(post.mock.calls[0][1]).toMatchObject({ behaviorCodes: ['CONSUME', 'RECHARGE'], earned: false, startAt: 0, endAt: 0 });
    expect(post.mock.calls[0][1]).not.toHaveProperty('userId');
  });
  it('KYC 按配置校验护照背面、国籍、手持及驳回重提，不回退固定规则', async () => {
    const schema: Api.RealKyc.Schema = { version: 1, allowedIdTypes: ['PASSPORT'], nationalityRequired: false, idCardBackRequired: false, holdingPhotoRequired: false, resubmitAfterRejectAllowed: true };
    const form: Api.RealKyc.SubmitParams = { idType: 'PASSPORT', realName: 'QA', idNo: 'QA', idCardFrontFileId: '9007199254740993' };
    expect(kycSubmissionIssue(schema, form, 'none')).toBe('');
    expect(kycSubmissionIssue({ ...schema, idCardBackRequired: true }, form)).toContain('背面');
    expect(kycSubmissionIssue({ ...schema, holdingPhotoRequired: true }, form)).toContain('手持');
    expect(kycSubmissionIssue({ ...schema, nationalityRequired: true }, form)).toContain('国籍');
    expect(kycSubmissionIssue({ ...schema, resubmitAfterRejectAllowed: false }, form, 'rejected')).toContain('不允许');
    expect(kycSubmissionIssue({ ...schema, allowedIdTypes: ['ID_CARD'] }, form)).toContain('证件类型');
    expect(kycSubmissionIssue(undefined, form)).toContain('配置');
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue(schema);
    expect(await fetchKycSchema()).toBe(schema);
    get.mockResolvedValueOnce({ ...schema, holdingPhotoRequired: undefined });
    await expect(fetchKycSchema()).rejects.toThrow('不完整');
  });
  it('三类原单回查仅明确 null 表示未落地，缺失或失败不转为空', async () => {
    const get = vi.spyOn(realUserRequest, 'get');
    for (const lookup of [fetchRechargeByKey, fetchWithdrawByKey, fetchFinanceOrderByKey]) {
      get.mockResolvedValueOnce(null);
      expect(await lookup('qa-key')).toBeNull();
      get.mockResolvedValueOnce(undefined);
      await expect(lookup('qa-key')).rejects.toThrow('不完整');
      get.mockRejectedValueOnce(new Error('offline'));
      await expect(lookup('qa-key')).rejects.toThrow('offline');
    }
  });
  it('付款传确认金额且保留组付款的部分结果对象', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('navigator', { locks: { request: (_key: string, _options: unknown, callback: (lock: unknown) => unknown) => callback({}) } });
    const result = { orderGroupNo: 'g', totalCount: 2, paidCount: 1, failedCount: 1, paidAmount: '0.1', unpaidAmount: '0.2', items: [] };
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(result);
    expect(await withOrderPayment('u', ['a', 'b'], 'g', payment => payment.payOrderGroup('0.3', '123456'))).toBe(result);
    expect(post.mock.calls[0].slice(0, 2)).toEqual(['/orders/group/pay', { orderGroupNo: 'g', confirmedAmount: '0.3', payPassword: '123456' }]);
    post.mockResolvedValueOnce('9007199254740993');
    await payOrder('9007199254740993', '0.12345678', '123456', 'u');
    expect(post.mock.calls[1].slice(0, 2)).toEqual(['/orders/pay', { id: '9007199254740993', confirmedAmount: '0.12345678', payPassword: '123456' }]);
  });
  it('求购筛选透传零预算及交付上限，状态作用于后端总数', async () => {
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue({ pageNo: 1, pageSize: 20, total: 0, records: [] });
    await fetchHall({ minBudget: 0, maxBudget: 10, maxDeliveryDays: 7 });
    expect(post.mock.calls[0][1]).toMatchObject({ minBudget: 0, maxBudget: 10, maxDeliveryDays: 7 });
    expect(post.mock.calls[0][1]).not.toHaveProperty('statuses');
    await fetchMyPurchases('u', ['cancelled']);
    expect(post.mock.calls[1][1]).toMatchObject({ statuses: ['VOID', 'CANCELED'] });
  });
  it('动态字典支持新编码，排序并剔除停用项，不使用固定回退', async () => {
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValue([
      { code: 'NEW', enabled: true, sortNo: 20 }, { code: 'OFF', enabled: false, sortNo: 0 }, { code: 'DEFAULT', enabled: true, sortNo: 1 }
    ]);
    expect((await fetchCarriers()).map(item => item.code)).toEqual(['DEFAULT', 'NEW']);
    get.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchCarriers()).rejects.toThrow('offline');
  });
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
    expect(post).toHaveBeenNthCalledWith(1, '/recharge/create', { ...recharge, asset: 'USDT' }, { showError: false });
    expect(post).toHaveBeenNthCalledWith(2, '/buyer/apply', buyer, { showError: false });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('地址统一去空白、保留国际电话及 Long ID，拒绝空白与超长字段', () => {
    const form = { id: '9007199254740993', receiverName: ' QA ', receiverPhone: ' +44 123456789012 ',
      countryCode: ' GB ', province: ' QA ', detailAddress: ' QA ' };
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
    const params = { chain: 'TRON' as const, toAddress: 'T'.repeat(34), amount: 20 };
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
    const params = { receiverName: 'QA', receiverPhone: '10000000000', countryCode: 'CN', province: 'QA', detailAddress: 'QA' };
    vi.spyOn(realUserRequest, 'post').mockResolvedValue(id);
    vi.spyOn(realUserRequest, 'put').mockResolvedValue(id);
    const get = vi.spyOn(realUserRequest, 'get').mockRejectedValue(new Error('read unavailable'));
    expect(await createAddress(params)).toBe(id);
    expect(await updateAddress({ ...params, id })).toBe(id);
    expect(get).not.toHaveBeenCalled();
  });

  it('写入明确失败保持失败，缺失地址编号不伪造成功', async () => {
    const params = { receiverName: 'QA', receiverPhone: '10000000000', countryCode: 'CN', province: 'QA', detailAddress: 'QA' };
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
    expect(result.records.map(record => record.id)).toEqual(['1', '2']);
    expect(result.records[0].behavior).toBe('QA_NEW_BEHAVIOR');
    vi.spyOn(realUserRequest, 'get').mockResolvedValue([
      { behaviorCode: 'QA_NEW_BEHAVIOR', name: '测试新规则', score: 3, identity: 'COMMON', enabled: true },
      { behaviorCode: 'CONSUME', name: '消费规则', score: 1, identity: 'COMMON', enabled: true }
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
        orderId: `${q.stage}-900719925474099${offset + i}`,
        status: q.stage === 'PROCURING' || q.stage === 'PROCURED' ? 'PAID' : q.stage,
        stage: q.stage,
        totalAmount: '1',
        createdAt: new Date(Date.UTC(2026, 0, q.stage === 'CREATED' ? 30 : 15) - (offset + i) * 1000).toISOString()
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
        amount: 1, toBalanceAfter: 0,
        createdAt: new Date(Date.UTC(2026, 0, q.bizType === 'CHAIN_DEPOSIT' ? 30 : 15) - (offset + i) * 1000).toISOString()
      })) } as never;
    });
    const result = await fetchWalletLedger({ current: 2, size: 4, types: ['DEPOSIT_IN', 'WITHDRAW_OUT'] });
    expect(result.records.map(item => item.id)).toEqual([4, 5, 6, 7].map(i => `CHAIN_DEPOSIT-900719925474099${i}`));
    expect(result.total).toBe(16);
    expect(request).toHaveBeenCalledTimes(8);
  });
});

describe('评价资格批量查询', () => {
  it('按订单 ID 映射，不依赖返回顺序，保留 Long ID', async () => {
    const request = vi.spyOn(realOrderRequest, 'post')
      .mockResolvedValueOnce([{ orderId: '2', reviewable: false, reason: 'ALREADY_REVIEWED', reviewId: 'deleted' }, { orderId: '9007199254740993', reviewable: true }]);
    expect(await findReviewableOrderIds(['9007199254740993', '2'])).toEqual(new Set(['9007199254740993']));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.slice(0, 2)).toEqual(['/reviews/eligibility', { orderIds: ['9007199254740993', '2'] }]);
  });

  it('响应漏项不能当作无资格', async () => {
    vi.spyOn(realOrderRequest, 'post').mockResolvedValue([]);
    await expect(findReviewableOrderIds(['3'])).rejects.toThrow('漏项');
  });

  it('超过 200 个自动分批，异常资格不默认为 false', async () => {
    const request = vi.spyOn(realOrderRequest, 'post').mockImplementation(async (_url, params) =>
      (params as { orderIds: string[] }).orderIds.map(orderId => ({ orderId, reviewable: true })) as never);
    expect((await findReviewableOrderIds(Array.from({ length: 201 }, (_, i) => String(i)))).size).toBe(201);
    expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValueOnce([{ orderId: '3' }]);
    await expect(findReviewableOrderIds(['3'])).rejects.toThrow('不完整');
  });

  it('明确拒绝返回无资格；取消读取后不继续查询', async () => {
    const request = vi.spyOn(realOrderRequest, 'post').mockResolvedValue([{ orderId: '1', reviewable: false, reason: 'WINDOW_EXPIRED' }]);
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
