import { renderToString } from 'vue/server-renderer';
import { createSSRApp } from 'vue';
import OrderProductAccess from '@/components/order/order-product-access.vue';
import DemandProductPicker from '@/components/purchase/demand-product-picker.vue';
import ProductSourceBadge from '@/components/common/product-source-badge.vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMergeSourcePages, resolvePageSize, toPageTotal } from './page';
import { detectCarriers } from './logistics';
import * as logisticsApi from './logistics';
import LogisticsCarrierFields from '@/components/common/logistics-carrier-fields.vue';
import { realOrderRequest, realUserRequest, realNotifyRequest } from '@/service/request';
import { sendConversationMessage } from './notify';
import { findReviewableOrderIds, submitReview, replyReview, createReviewAppeal } from './review';
import { fetchMyOrders, payOrder, withOrderPayment, fetchCarriers } from './order';
import { fetchRechargePage, fetchWalletLedger, fetchWithdrawPage, fetchWalletOverview, prepareWithdrawal } from './wallet';
import { fetchHall, fetchMyPurchases, createPurchase } from './purchase';
import { fetchMyPointLogs, fetchPointRules } from './point';
import { fetchBuyerDepositLedger } from './buyer';
import { fetchCurrentUser, updateProfile, prepareRegistration } from './auth';
import { prepareAddress } from './address';
import { createAddress, updateAddress } from './address';
import { createRefund, operateRefund } from './refund';
import { refundCapabilities, refundActionAllowed, markRefundOperationUncertain, refundOperationUncertain } from '@/utils/refund';
import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { fetchFinanceOrderDetail, fetchFinanceProductDetail, financeAccumulatedInterest, financeRedemptionIssue, financeSubscriptionIssue } from './finance';
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
import { normalizeProductSource, productSourceOptions } from '@/utils/product-source';
import { requireCurrentProduct } from '@/utils/ai-product';
import { missingProductSkuCombinations, productEditSnapshot, productSkuEditorWrite, validateProductSkuWrite, validateProductDetails } from '@/utils/product-sku';
import { buyerProductDraftKey, readBuyerProductDraft, saveBuyerProductDraft } from '@/components/buyer/buyer-product-draft';
import { enrollFlashSale } from './flash-sale';
import { createRenderer, h, nextTick, reactive, readonly, ref, ssrContextKey, type App, type Component } from 'vue';
import { routeLocationKey, routerKey, type RouteLocationNormalizedLoaded, type Router } from 'vue-router';
import InterestPreview from '@/components/finance/interest-preview.vue';
import BusinessDialog from '@/components/common/business-dialog.vue';
import CatalogView from '@/views/product/list.vue';
import CategoryView from '@/views/category/index.vue';
import CategoryPicker from '@/components/common/category-picker.vue';
import * as categoryApi from './category';
import { categoryNavigationKey } from '@/composables/use-category-navigation';
import type { AddressVisualFixture, CatalogVisualFixture, EvidenceVisualFixture } from '@/visual/types';
import AddressForm from '@/components/profile/address-form.vue';
import EvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import DetailGallery from '@/components/product/v47-detail-gallery.vue';
import MessageInput from '@/components/im/message-input.vue';
import DetailView from '@/views/product/detail.vue';
import DetailReviews from '@/components/product/v47-detail-reviews.vue';
import ThemePicker from '@/components/layout/theme-picker.vue';
import { UI_THEMES, isUiTheme } from '@/composables/use-ui-theme';
import { provideSSRWidth } from '@vueuse/core';
import * as addressApi from './address';
import { Message, Modal, confirmations } from '@/lib/feedback';
import BuyerProductCreate from '@/views/buyer/product-create.vue';
import * as buyerApi from './buyer';
import BuyerApply from '@/views/buyer/apply.vue';
import { clearBuyerApplicationDraft, clearPrerequisiteDrafts, saveBuyerApplicationDraft, takeBuyerApplicationDraft, saveWithdrawDraft, takeWithdrawDraft } from '@/utils/prerequisite-navigation';
import { clearAccessToken, setAccessToken } from '@/service/request/token';
import { normalizeSearchHistory, searchHistoryKey, fetchSearchSuggestions } from './search';
import { fetchReviewComments, createReviewComment, createReviewReport, deleteReviewComment } from './review';
import SearchBar from '@/components/layout/search-bar.vue';
import ReviewDiscussion from '@/components/review/review-discussion-dialog.vue';
import DateTimeInput from '@/components/common/date-time-input.vue';
import ConversationOrderBar from '@/components/im/conversation-order-bar.vue';
import * as orderApi from './order';
import { conversationReturnPath } from '@/utils/notification';
import { normalizeReviewComments, hasMoreReviewComments } from '@/utils/review-comments';
import MessageBubble from '@/components/im/message-bubble.vue';
import * as reviewApi from './review';
import * as rechargeApi from './wallet';
import { effectScope, type EffectScope } from 'vue';
import { useRechargeReceipt, type RechargeReceiptTarget } from '@/composables/use-recharge-receipt';
import ProductImagePrefill from '@/components/buyer/product-image-prefill.vue';
import * as aiApi from './ai';
import * as walletPayApi from './wallet-pay';
import { useWalletBalancePayment, balancePaymentBlockedReason } from '@/composables/use-wallet-balance-payment';
import { plainTextToRichText } from '@/utils/rich-text';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('钱包到账回执与自动关闭', () => {
  const scopes: EffectScope[] = [];
  const initialTarget: RechargeReceiptTarget = { ownerId:'2117141212394250241', session:1, asset:'USDT', chain:'TRON', txHash:'tx-a' };
  const row = (change: Partial<Api.RealWallet.RechargeVO> = {}) => ({ id:'2117141212394250242', asset:'USDT', chain:'TRON', txHash:'tx-a', status:'PENDING', amount:'19.90000001', ...change } as Api.RealWallet.RechargeVO);
  const page = (records: Api.RealWallet.RechargeVO[], total = records.length, current = 1) => ({ current, size:30, total, records });
  function track() {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden:false });
    const target = ref<RechargeReceiptTarget>({ ...initialTarget });
    const active = ref(true);
    const onClose = vi.fn();
    const onConfirmed = vi.fn();
    const scope = effectScope();
    scopes.push(scope);
    const receipt = scope.run(() => useRechargeReceipt({ target:() => target.value, active:() => active.value, onClose, onConfirmed }))!;
    return { target, active, scope, onClose, onConfirmed, ...receipt };
  }
  afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.clearAllTimers(); vi.useRealTimers(); });

  it('钱包交易已提交但平台仍PENDING时，不提示到账或启动关闭倒计时', async () => {
    vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValue(page([row()]));
    vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row());
    const receipt = track();
    await vi.advanceTimersByTimeAsync(20000);
    expect(receipt.receivedRecharge.value).toBeUndefined();
    expect(receipt.closeCountdown.value).toBeUndefined();
    expect(receipt.onConfirmed).not.toHaveBeenCalled();
    expect(receipt.onClose).not.toHaveBeenCalled();
  });

  it.each([
    { txHash:'different-hash' }, { asset:'USDC' as const }, { chain:'ETH' }
  ])('已确认的其他交易不启动倒计时：%j', change => {
    vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValue(page([row({ status:'CONFIRMED', ...change })]));
    const detail = vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row({ status:'CONFIRMED' }));
    const receipt = track();
    return vi.advanceTimersByTimeAsync(10000).then(() => {
      expect(detail).not.toHaveBeenCalled();
      expect(receipt.receivedRecharge.value).toBeUndefined();
      expect(receipt.onClose).not.toHaveBeenCalled();
    });
  });

  it.each([
    { txHash:'different-hash' }, { asset:'USDC' as const }, { chain:'ETH' }, { status:'PENDING' }
  ])('列表已确认但详情不一致时不宣告到账：%j', async change => {
    vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValue(page([row({ status:'CONFIRMED' })]));
    vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row({ status:'CONFIRMED', ...change }));
    const receipt = track();
    await vi.advanceTimersByTimeAsync(10000);
    expect(receipt.receivedRecharge.value).toBeUndefined();
    expect(receipt.onClose).not.toHaveBeenCalled();
  });

  it('精确匹配本笔交易并详情确认后倒计时5秒，取消后查看记录返回不重新关闭', async () => {
    vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValue(page([row({ status:'CONFIRMED', txHash:undefined, reportedTxHash:'tx-a' })]));
    vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row({ status:'CONFIRMED', txHash:undefined, reportedTxHash:'tx-a' }));
    const receipt = track();
    await vi.advanceTimersByTimeAsync(0);
    expect(receipt.closeCountdown.value).toBe(5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(receipt.closeCountdown.value).toBe(3);
    receipt.cancelAutoClose();
    receipt.active.value = false;
    receipt.active.value = true;
    await vi.advanceTimersByTimeAsync(10000);
    expect(receipt.receivedRecharge.value?.status).toBe('CONFIRMED');
    expect(receipt.closeCountdown.value).toBeUndefined();
    expect(receipt.onClose).not.toHaveBeenCalled();
  });

  it.each(['owner', 'session', 'chain', 'asset', 'hash', 'unmount'] as const)('切换%s后，迟到分页即使返回旧交易确认也不更新或关闭', async change => {
    let finish!: (value: ReturnType<typeof page>) => void;
    const list = vi.spyOn(rechargeApi, 'fetchRechargePage').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(page([]));
    const detail = vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row({ status:'CONFIRMED' }));
    const receipt = track();
    if (change === 'unmount') receipt.scope.stop();
    else receipt.target.value = { ...receipt.target.value, ...(change === 'owner' ? { ownerId:'2117141212394250243' } : change === 'session' ? { session:2 } : change === 'chain' ? { chain:'ETH' } : change === 'asset' ? { asset:'USDC' as const } : { txHash:'tx-b' }) };
    expect(list.mock.calls[0][1]?.signal?.aborted).toBe(true);
    finish(page([row({ status:'CONFIRMED' })]));
    await vi.advanceTimersByTimeAsync(10000);
    expect(detail).not.toHaveBeenCalled();
    expect(receipt.receivedRecharge.value).toBeUndefined();
    expect(receipt.onConfirmed).not.toHaveBeenCalled();
    expect(receipt.onClose).not.toHaveBeenCalled();
  });

  it('卸载时正在等待的确认详情，迟到后不能刷新余额或关闭其他页面', async () => {
    let finish!: (value: Api.RealWallet.RechargeVO) => void;
    vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValue(page([row({ status:'CONFIRMED' })]));
    vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const receipt = track();
    await vi.advanceTimersByTimeAsync(0);
    receipt.scope.stop();
    finish(row({ status:'CONFIRMED' }));
    await vi.advanceTimersByTimeAsync(10000);
    expect(receipt.onConfirmed).not.toHaveBeenCalled();
    expect(receipt.receivedRecharge.value).toBeUndefined();
    expect(receipt.onClose).not.toHaveBeenCalled();
  });

  it('翻页找到PENDING后固定查详情，不被后来首屏记录挤掉；确认后才关闭', async () => {
    const list = vi.spyOn(rechargeApi, 'fetchRechargePage').mockResolvedValueOnce(page(Array.from({ length:30 }, (_, index) => row({ id:String(index + 1), txHash:'other-' + index })), 31)).mockResolvedValueOnce(page([row()], 31, 2));
    const detail = vi.spyOn(rechargeApi, 'fetchRechargeDetail').mockResolvedValue(row({ status:'CONFIRMED' }));
    const receipt = track();
    await vi.advanceTimersByTimeAsync(0);
    expect(list.mock.calls.map(call => call[0]?.pageNo)).toEqual([1, 2]);
    expect(receipt.closeCountdown.value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(detail.mock.calls[0][0]).toBe('2117141212394250242');
    expect(list).toHaveBeenCalledTimes(2);
    expect(receipt.closeCountdown.value).toBe(5);
    await vi.advanceTimersByTimeAsync(4999);
    expect(receipt.onClose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(receipt.onConfirmed).toHaveBeenCalledOnce();
    expect(receipt.onClose).toHaveBeenCalledOnce();
  });
});

describe('搜索与评论对接边界', () => {
  it('评论总数与最近预览独立保留，Long 数量无损比较，匿名正文按服务端快照传递', async () => {
    const reviewId = '2090377523934879745';
    const preview = { id: '2090377523934879750', reviewId, parentId: '2090377523934879749', authorName: '顾***', content: '<script>不可执行</script>', createdAt: '1793461800000', hidden: false, canDelete: false };
    const row = { reviewId, orderId: '2090377523934879751', status: 'PUBLISHED' as const, productScore: 5, sellerScore: 5, commentCount: '9007199254740993123', commentPreviews: [preview] };
    vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ records: [row], total: '1' });
    const mine = (await fetchMyReviews()).records[0];
    const storefront = (await fetchStorefrontReviews({ productId: '2090377523934879752' })).records[0];
    expect(mine.commentCount).toBe('9007199254740993123');
    expect(storefront.commentPreviews).toEqual([preview]);
    expect(hasMoreReviewComments(mine.commentCount, mine.commentPreviews!.length)).toBe(true);
    expect(normalizeReviewComments({ ...row, status: 'HIDDEN' })).toMatchObject({ commentCount: '0', commentPreviews: [] });
    expect(normalizeReviewComments({ ...row, commentCount: 8 }).commentCount).toBe('8');
    expect(() => normalizeReviewComments({ ...row, commentPreviews: [{ ...preview, hidden: true }] })).toThrow('评论预览格式异常');
    expect(() => normalizeReviewComments({ ...row, commentCount: Number.MAX_SAFE_INTEGER + 1 })).toThrow('评论数量格式异常');
  });
  it('历史只保留有效词，去重后最近优先且账号与游客隔离', () => {
    expect(normalizeSearchHistory([' 手机 ', '手机', '', null, 'x'.repeat(51), '平板'])).toEqual(['手机', '平板']);
    expect(normalizeSearchHistory(Array.from({ length: 25 }, (_, i) => `词${i}`))).toHaveLength(20);
    expect(searchHistoryKey()).not.toBe(searchHistoryKey('2090377523934879745'));
    expect(searchHistoryKey('a')).not.toBe(searchHistoryKey('b'));
  });
  it('联想返回短搜索词而非商品，并拒绝超长建议', async () => {
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValue([{ keyword:'手机', source:'KEYWORD' }]);
    expect(await fetchSearchSuggestions('shou')).toEqual([{ keyword:'手机', source:'KEYWORD' }]);
    expect(get).toHaveBeenCalledWith('/storefront/search/suggest', expect.objectContaining({ params:{ keyword:'shou' } }));
    get.mockResolvedValueOnce([{ keyword:'x'.repeat(51), source:'MODEL' }]);
    await expect(fetchSearchSuggestions('shou')).rejects.toThrow('搜索建议数据异常');
  });
  it('评论分页走公开读取，写入保留Long原文且不传后台操作人', async () => {
    const reviewId = '2090377523934879745', parentId = '2090377523934879746';
    const read = vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ pageNo:1, pageSize:20, total:'0', records:[] });
    expect((await fetchReviewComments(reviewId, 1)).total).toBe(0);
    expect(read).toHaveBeenCalledWith('/storefront/reviews/comments/page', { reviewId, pageNo:1, pageSize:20 }, expect.anything());
    const write = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(parentId);
    await createReviewComment({ reviewId, parentId, content:'使用感受' });
    await createReviewReport({ reviewId, commentId:parentId, reason:'举报原因' });
    expect(write).toHaveBeenNthCalledWith(1, '/reviews/comments/create', { reviewId, parentId, content:'使用感受' }, expect.anything());
    expect(write).toHaveBeenNthCalledWith(2, '/reviews/reports/create', { reviewId, commentId:parentId, reason:'举报原因' }, expect.anything());
    read.mockResolvedValueOnce({ total:'0' });
    await expect(fetchReviewComments(reviewId, 1)).rejects.toThrow();
    read.mockResolvedValueOnce({ total:'1', records:[{ id:parentId, reviewId, hidden:true, content:'已隐藏内容', authorName:'匿名', createdAt:'1' }] });
    await expect(fetchReviewComments(reviewId, 1)).rejects.toThrow('公开评论数据异常');
  });
  it('评价明确过滤拒绝后保留原输入并允许编辑，网络异常仍保留未知结果', async () => {
    vi.stubGlobal('localStorage', { getItem:() => null });
    setActivePinia(createPinia());
    useUserStore().currentUser = { id:'qa-review' } as Api.RealSession.UserRecord;
    const store = useReviewStore();
    const params = { orderId:'2090377523934879745', productScore:5, sellerScore:5, content:'原输入' };
    const post = vi.spyOn(realOrderRequest, 'post').mockRejectedValueOnce(new RequestError('内容含禁止信息', { response:{ code:-1, data:null, message:'内容含禁止信息' } }));
    await expect(store.submit(params)).rejects.toThrow('内容含禁止信息');
    expect(store.getPending(params.orderId)).toBeUndefined();
    expect(params.content).toBe('原输入');
    post.mockRejectedValueOnce(new Error('offline'));
    await expect(store.submit(params)).rejects.toThrow('offline');
    expect(store.getPending(params.orderId)?.state).toBe('unknown');
  });
  it('删除只信布尔权限，缺失或损坏标记不放开，删除保留Long原文', async () => {
    const reviewId = '2090377523934879745';
    const flags = [true, false, undefined, 'true', 1];
    vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ total:'5', records:flags.map((canDelete, i) => ({
      id:`209037752393487975${i}`, reviewId, hidden:false, canDelete, content:'同名作者评论', authorName:'匿名', createdAt:'1'
    })) });
    expect((await fetchReviewComments(reviewId, 1)).records.map(row => row.canDelete)).toEqual([true, false, false, false, false]);
    const remove = vi.spyOn(realOrderRequest, 'delete').mockResolvedValue('2090377523934879750');
    await deleteReviewComment('2090377523934879750');
    expect(remove).toHaveBeenCalledWith('/reviews/comments/delete', { params:{ id:'2090377523934879750' }, showError:false });
  });
});

describe('v47前端本地边界', () => {
  function mountSubject<T>(component: Component, input: Record<string, unknown>, viewportWidth?: number, configure?: (app: App) => void) {
    const properties = reactive(input);
    const subject = { ...component, render:() => null };
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const app = renderer.createApp({ render:() => h(subject, properties) });
    app.provide(ssrContextKey, {});
    if (viewportWidth !== undefined) provideSSRWidth(viewportWidth, app);
    configure?.(app);
    app.mount({});
    const state = (app as unknown as { _instance:{ subTree:{ component:{ setupState:T } } } })._instance.subTree.component.setupState;
    return { app, state, properties };
  }

  it('识图接口保留Long原文、等待60秒，坏响应不得当作空建议成功', async () => {
    const suggestion = { title:'商品', description:'<b>外观</b>', categoryCandidates:[{ id:'9007199254740993123', name:'分类' }], brandCandidates:[], parameters:[] };
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue(suggestion);
    const input = { fileId:'9007199254740993124', hint:'品牌型号' };
    expect(await productApi.prefillProductImage(input)).toEqual({ ...suggestion, specGroups: [] });
    post.mockResolvedValueOnce({ ...suggestion, description:null });
    expect((await productApi.prefillProductImage(input)).description).toBe('');
    expect(post).toHaveBeenCalledWith('/products/images/prefill', input, expect.objectContaining({ timeoutMs:110000, numericSuccessOnly:true }));
    post.mockResolvedValueOnce({ ...suggestion, categoryCandidates:[{ id:9007199254740992000, name:'失真ID' }] });
    await expect(productApi.prefillProductImage(input)).rejects.toThrow('不完整');
    await expect(productApi.prefillProductImage({ ...input, hint:'字'.repeat(121) })).rejects.toThrow('120');
    expect(plainTextToRichText('<b>外观</b>\n第二行')).toBe('<p>&lt;b&gt;外观&lt;/b&gt;</p><p>第二行</p>');
  });

  it('识图建议不自动覆盖：单分类预选、多品牌不猜测，空描述/参数不覆盖', async () => {
    const applied = vi.fn();
    vi.spyOn(aiApi, 'uploadAiImage').mockResolvedValue({ id:'9007199254740993123' } as Api.Ai.UploadedImage);
    vi.spyOn(productApi, 'prefillProductImage').mockResolvedValue({ title:'手表', description:'', categoryCandidates:[{id:'cat',name:'手表'}], brandCandidates:[{id:'a',name:'A'},{id:'b',name:'B'}], parameters:[] });
    const fixture = mountSubject<{ chooseFile:(event:Event)=>void; recognize:()=>Promise<void>; apply:()=>void; category:string; brand:string }>(ProductImagePrefill, { contextKey:'buyer:a', onApply:applied });
    try {
      fixture.state.chooseFile({ target:{ files:[new File(['image'], 'watch.png', {type:'image/png'})] } } as unknown as Event);
      await fixture.state.recognize();
      expect(applied).not.toHaveBeenCalled();
      expect(fixture.state.category).toBe('cat'); expect(fixture.state.brand).toBe('');
      fixture.state.apply();
      expect(applied).toHaveBeenCalledWith({title:'手表',category:{id:'cat',name:'手表'},overwrite:false});
    } finally { fixture.app.unmount(); }
  });

  it('识图超时保留fileId手动重试，切换上下文拒绝迟到建议', async () => {
    const applied = vi.fn();
    const upload = vi.spyOn(aiApi, 'uploadAiImage').mockResolvedValue({ id:'original-file' } as Api.Ai.UploadedImage);
    const suggestion = { title:'商品', description:'', categoryCandidates:[], brandCandidates:[], parameters:[] };
    let resolve!: (value:Api.RealProduct.ImagePrefillResult)=>void;
    const recognize = vi.spyOn(productApi, 'prefillProductImage').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(suggestion).mockImplementationOnce(() => new Promise(done => { resolve=done; }));
    const fixture = mountSubject<{ chooseFile:(event:Event)=>void; recognize:()=>Promise<void>; apply:()=>void; hint:string; result:unknown; error:string; busy:boolean }>(ProductImagePrefill, {contextKey:'buyer:a',onApply:applied});
    try {
      fixture.state.chooseFile({target:{files:[new File(['image'],'a.png',{type:'image/png'})]}} as unknown as Event);
      fixture.state.hint='原提示';
      await fixture.state.recognize(); expect(fixture.state.error).toContain('timeout');
      await fixture.state.recognize(); expect(upload).toHaveBeenCalledTimes(1);
      expect(recognize.mock.calls.slice(0,2).map(call=>call[0])).toEqual([{fileId:'original-file',hint:'原提示'},{fileId:'original-file',hint:'原提示'}]);
      const pending=fixture.state.recognize();
      fixture.properties.contextKey='buyer:b'; await nextTick();
      resolve(suggestion); await pending;
      fixture.state.apply();
      expect(fixture.state.result).toBeUndefined(); expect(fixture.state.busy).toBe(false); expect(applied).not.toHaveBeenCalled();
    } finally {fixture.app.unmount();}
  });

  function balanceFixture() {
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>undefined,removeItem:()=>undefined});
    setActivePinia(createPinia());
    return mountSubject<ReturnType<typeof useWalletBalancePayment>>({setup:()=>useWalletBalancePayment()}, {});
  }
  const walletPay = (status:walletPayApi.WalletPayStatus, payNo='pay-a') => ({status,payNo,orderGroupNo:'group',statusText:status} as walletPayApi.WalletPayOrder);

  it.each(['PENDING','CLOSED','FAILED'] as const)('直付%s改余额必须确认，选择页和取消不发付款请求', async status => {
    const read = vi.spyOn(walletPayApi,'fetchCurrentWalletPay').mockResolvedValue(walletPay(status));
    const post = vi.spyOn(realOrderRequest,'post');
    let options!:Parameters<typeof Modal.confirm>[0];
    vi.spyOn(Modal,'confirm').mockImplementation(value=>{options=value;return {close:()=>options.onClose?.()};});
    const fixture=balanceFixture();
    try {
      const consent=fixture.state.confirmBalanceSwitch('group','20.00000001',()=>true);
      await nextTick();
      expect(options.content).toContain('20.00000001'); expect(post).not.toHaveBeenCalled();
      options.onOk?.();
      expect(await consent).toEqual({group:'group',payNo:'pay-a'});
      read.mockResolvedValueOnce(walletPay('SUBMITTED'));
      await expect(fixture.state.assertBalanceSwitch({group:'group',payNo:'pay-a'})).rejects.toThrow('确认');
      expect(post).not.toHaveBeenCalled();
    } finally {fixture.app.unmount();}
  });

  it.each(['SUBMITTED','SUCCESS'] as const)('直付%s禁止再次余额支付，不按本机倒计时放行', async status => {
    vi.spyOn(walletPayApi,'fetchCurrentWalletPay').mockResolvedValue(walletPay(status));
    const confirm=vi.spyOn(Modal,'confirm');
    const fixture=balanceFixture();
    try {
      expect(balancePaymentBlockedReason(walletPay(status))).not.toBe('');
      await expect(fixture.state.confirmBalanceSwitch('group','10',()=>true)).rejects.toThrow();
      expect(confirm).not.toHaveBeenCalled();
    } finally {fixture.app.unmount();}
  });

  it('输入密码期间出现新直付单须重新确认；切页取消确认；付款失败回查两条路径', async () => {
    vi.spyOn(walletPayApi,'fetchCurrentWalletPay').mockResolvedValue(walletPay('PENDING','new-pay'));
    const result=vi.spyOn(orderApi,'fetchOrderGroupPayResult').mockRejectedValue(new Error('offline'));
    let options!:Parameters<typeof Modal.confirm>[0];
    vi.spyOn(Modal,'confirm').mockImplementation(value=>{options=value;return {close:()=>options.onClose?.()};});
    const fixture=balanceFixture();
    await expect(fixture.state.assertBalanceSwitch({group:'group',payNo:'pay-a'})).rejects.toThrow('已变化');
    const consent=fixture.state.confirmBalanceSwitch('group','10',()=>true); await nextTick();
    expect(options).toBeDefined(); fixture.app.unmount(); expect(await consent).toBeUndefined();
    const other=balanceFixture();
    try {expect(await other.state.recoverBalancePayment('group')).toHaveLength(2);expect(result).toHaveBeenCalledWith('group');} finally {other.app.unmount();}
  });

  it('最新直付定位后必须查同一支付单详情，不能用旧状态或串单结果', async () => {
    const pay={...walletPay('PENDING'),chain:'TRON',network:'nile',tokenContract:'token',toAddress:'address',rawAmount:'1000000',orderAmount:'1',payAmount:'1',expireAt:'2000000000000',decimals:6};
    const get=vi.spyOn(realOrderRequest,'get').mockResolvedValueOnce(pay).mockResolvedValueOnce({...pay,status:'SUBMITTED'});
    expect((await walletPayApi.fetchCurrentWalletPay('group'))?.status).toBe('SUBMITTED');
    expect(get.mock.calls[1][1]).toMatchObject({params:{payNo:'pay-a'}});
    get.mockResolvedValueOnce(pay).mockResolvedValueOnce({...pay,payNo:'another'});
    await expect(walletPayApi.fetchCurrentWalletPay('group')).rejects.toThrow('已变化');
  });

  it('运单变化丢弃旧识别，多候选须明确选择，识别失败仍可手选', async () => {
    vi.useFakeTimers();
    const carriers = [
      {id:'2117141212394250241',code:'SF',name:'顺丰',enabled:true,defaultCarrier:false,customNameRequired:false,sortNo:0},
      {id:'2117141212394250242',code:'OTHER',name:'其他',enabled:true,defaultCarrier:false,customNameRequired:true,sortNo:1}
    ];
    vi.spyOn(orderApi, 'fetchCarriers').mockResolvedValue(carriers);
    const pending = new Map<string, (rows:Api.RealOrder.CarrierDTO[]) => void>();
    const detect = vi.spyOn(logisticsApi, 'detectCarriers').mockImplementation(no => new Promise(resolve => { pending.set(no, resolve); }));
    let properties:Record<string, unknown>;
    const validity = vi.fn();
    const fixture = mountSubject<{ candidates:Api.RealOrder.CarrierDTO[]; chooseCarrier:(code:string) => void; detectionHint:string; valid:boolean }>(LogisticsCarrierFields, {
      trackingNo:'', carrierCode:'', carrierName:'', contextKey:'order:a',
      'onUpdate:carrierCode':(value:string) => {properties.carrierCode=value;},
      'onUpdate:carrierName':(value:string) => {properties.carrierName=value;}, onValid:validity
    });
    properties=fixture.properties;
    try {
      await nextTick(); await nextTick();
      properties.trackingNo='SF123456'; await nextTick(); await vi.advanceTimersByTimeAsync(400);
      properties.trackingNo='MULTI123'; await nextTick(); await vi.advanceTimersByTimeAsync(400);
      pending.get('SF123456')!([carriers[0]]); await nextTick(); await nextTick();
      expect(properties.carrierCode).toBe('');
      pending.get('MULTI123')!(carriers); await nextTick(); await nextTick();
      expect(fixture.state.candidates).toHaveLength(2); expect(properties.carrierCode).toBe('');
      expect(fixture.state.valid).toBe(false);
      fixture.state.chooseCarrier('OTHER'); await nextTick();
      expect(properties.carrierCode).toBe('OTHER'); expect(fixture.state.valid).toBe(false);
      properties.carrierName='本地快运'; await nextTick(); expect(fixture.state.valid).toBe(true);
      detect.mockRejectedValueOnce(new Error('no quota'));
      properties.trackingNo='FAIL1234'; await nextTick(); await vi.advanceTimersByTimeAsync(400);
      expect(properties.trackingNo).toBe('FAIL1234'); expect(fixture.state.detectionHint).toContain('手动');
      fixture.state.chooseCarrier('SF'); await nextTick();
      expect(properties.carrierCode).toBe('SF'); expect(fixture.state.valid).toBe(true);
    } finally {fixture.app.unmount(); vi.useRealTimers();}
  });

  it('手选物流公司取消在途识别，旧上下文响应不得覆盖新订单', async () => {
    vi.useFakeTimers();
    const rows = [{id:'9007199254740993001',code:'SF',name:'顺丰',enabled:true,defaultCarrier:false,customNameRequired:false,sortNo:0}, {id:'9007199254740993002',code:'YD',name:'韵达',enabled:true,defaultCarrier:false,customNameRequired:false,sortNo:1}];
    vi.spyOn(orderApi, 'fetchCarriers').mockResolvedValue(rows);
    let resolve!: (rows:Api.RealOrder.CarrierDTO[]) => void;
    vi.spyOn(logisticsApi, 'detectCarriers').mockImplementation(() => new Promise(done => {resolve=done;}));
    let properties:Record<string, unknown>;
    const fixture=mountSubject<{chooseCarrier:(code:string) => void}>(LogisticsCarrierFields, {trackingNo:'',carrierCode:'',carrierName:'',contextKey:'a', 'onUpdate:carrierCode':(value:string) => {properties.carrierCode=value;}, 'onUpdate:carrierName':(value:string) => {properties.carrierName=value;} });
    properties=fixture.properties;
    try {
      await nextTick(); await nextTick(); properties.trackingNo='FIRST123'; await nextTick(); await vi.advanceTimersByTimeAsync(400);
      fixture.state.chooseCarrier('YD'); await nextTick(); resolve([rows[0]]); await nextTick(); await nextTick(); expect(properties.carrierCode).toBe('YD');
      properties.trackingNo='SECOND12'; await nextTick(); await vi.advanceTimersByTimeAsync(400);
      const oldResolve=resolve; properties.contextKey='b'; properties.carrierCode=''; properties.trackingNo=''; await nextTick();
      oldResolve([rows[0]]); await nextTick(); await nextTick(); expect(properties.carrierCode).toBe('');
    } finally {fixture.app.unmount(); vi.useRealTimers();}
  });

  it('评价发布系统消息保留正文，已完成状态不覆盖评分播报', () => {
    const content = '买家已评价订单 2116539536067088384：商品 5 星，买手服务 5 星';
    const fixture = mountSubject<{ systemContent: string }>(MessageBubble, { side: 'center', msg: { id: '2116539536067088389', msgType: 'SYSTEM', eventType: 'REVIEW_PUBLISHED', content, params: { orderId: '2116539536067088386', reviewId: '6001', statusText: '已完成' } } });
    try { expect(fixture.state.systemContent).toBe(content); } finally { fixture.app.unmount(); }
  });

  it('公开评论变更回读当前筛选页，只更新数量和预览，迟到回包不污染新页', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { querySelector: () => null }));
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
    const fixture = mountSubject<{ product?: Api.RealProduct.Record; reviews: Api.RealReview.ReviewDTO[]; reviewPage: number; reviewStars: number; refreshCommentPreviews: (id: string) => Promise<void> }>(DetailView, {}, undefined, app => {
      app.use(createPinia()); app.provide(routeLocationKey, { params: {}, query: {} } as RouteLocationNormalizedLoaded); app.provide(routerKey, {} as Router);
    });
    const reviewId = '2090377523934879745', productId = '2090377523934879755';
    const review: Api.RealReview.ReviewDTO = { reviewId, orderId: '2090377523934879756', productScore: 5, sellerScore: 5, status: 'PUBLISHED', helpful: true, commentCount: '0', commentPreviews: [] };
    const fresh = { ...review, helpful: false, commentCount: '8', commentPreviews: [{ id: '2090377523934879760', reviewId, authorName: '顾***', content: '最近评论', createdAt: '1793461800000', hidden: false, canDelete: false }] };
    const read = vi.spyOn(reviewApi, 'fetchStorefrontReviews').mockResolvedValue({ records: [fresh], total: 1 });
    try {
      fixture.state.product = { id: productId } as Api.RealProduct.Record;
      fixture.state.reviews = [review]; fixture.state.reviewPage = 2; fixture.state.reviewStars = 5;
      await fixture.state.refreshCommentPreviews(reviewId);
      expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ productId, pageNo: 2, productScore: 5 }), expect.anything());
      expect(fixture.state.reviews[0]).toMatchObject({ helpful: true, commentCount: '8', commentPreviews: fresh.commentPreviews });
      let resolve!: (value: Api.RealReview.PageResult<Api.RealReview.ReviewDTO>) => void;
      read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
      const pending = fixture.state.refreshCommentPreviews(reviewId); fixture.state.reviewPage = 3;
      resolve({ records: [{ ...fresh, commentCount: '9' }], total: 1 }); await pending;
      expect(fixture.state.reviews[0].commentCount).toBe('8');
    } finally { fixture.app.unmount(); }
  });

  it('商品分类多选保留Long原值，支持取消主分类、上限及清空', async () => {
    const options = Array.from({ length:21 }, (_, index) => ({ value:`9007199254740993${String(index).padStart(2, '0')}`, label:`分类${index}` }));
    let properties: Record<string, unknown>;
    const fixture = mountSubject<{ select:(node:typeof options[number]) => void; clear:() => void; open:boolean; visibleChosen:string[]; showAllChosen:boolean }>(CategoryPicker, {
      options, multiple:true, max:20, modelValue:options[0].value, modelValues:[options[0].value],
      'onUpdate:modelValue':(value:unknown) => { properties.modelValue = value; },
      'onUpdate:modelValues':(value:unknown) => { properties.modelValues = value; }
    });
    properties = fixture.properties;
    try {
      fixture.state.open = true;
      fixture.state.select(options[1]);
      await nextTick();
      expect(properties.modelValues).toEqual([options[0].value, options[1].value]);
      expect(properties.modelValue).toBe(options[0].value);
      expect(fixture.state.open).toBe(true);
      fixture.state.select(options[0]);
      await nextTick();
      expect(properties.modelValue).toBe(options[1].value);
      fixture.state.clear();
      await nextTick();
      for (const option of options.slice(0, 20)) { fixture.state.select(option); await nextTick(); }
      expect(properties.modelValues).toHaveLength(20);
      const last = options[20];
      expect(properties.modelValues).not.toContain(last.value);
      fixture.state.select(last);
      await nextTick();
      expect(properties.modelValues).toHaveLength(20);
      expect(properties.modelValues).not.toContain(last.value);
      expect(fixture.state.visibleChosen).toHaveLength(3);
      fixture.state.showAllChosen = true;
      expect(fixture.state.visibleChosen).toHaveLength(20);
      fixture.state.showAllChosen = false;
      expect(properties.modelValues).toHaveLength(20);
      fixture.state.clear();
      await nextTick();
      expect(properties.modelValues).toEqual([]);
      expect(properties.modelValue).toBeUndefined();
    } finally { fixture.app.unmount(); }
  });

  it('未开启多选的分类框仍单选并关闭，禁用时不修改分类', () => {
    const changed = vi.fn();
    const fixture = mountSubject<{ select:(node:{ value:string; label:string }) => void; clear:() => void; open:boolean }>(CategoryPicker, {
      options:[{ value:'90071992547409931', label:'分类' }], 'onUpdate:modelValue':changed
    });
    try {
      fixture.state.open = true;
      fixture.state.select({ value:'90071992547409931', label:'分类' });
      expect(changed).toHaveBeenCalledWith('90071992547409931');
      expect(fixture.state.open).toBe(false);
    } finally { fixture.app.unmount(); }
    const disabled = mountSubject<{ select:(node:{ value:string; label:string }) => void; clear:() => void }>(CategoryPicker, {
      options:[{ value:'90071992547409931', label:'分类' }], disabled:true, 'onUpdate:modelValue':changed
    });
    try {
      changed.mockClear();
      disabled.state.select({ value:'90071992547409931', label:'分类' });
      disabled.state.clear();
      expect(changed).not.toHaveBeenCalled();
    } finally { disabled.app.unmount(); }
  });

  it.each([...productSourceOptions, '海外直采', '<b>自营</b>', null, '   '])('商品来源创建和全量编辑透传原名称或明确清空：%s', async source => {
    const title = '原商品标题';
    const input = {title, source, categoryId:'9007199254740993123',price:'1',shippingFee:'0',tax:'0',stock:1,aftersaleType:'none' as const,overseasCustoms:false,description:'',images:[]};
    const post = vi.spyOn(realOrderRequest,'post').mockResolvedValue('9007199254740993124');
    const put = vi.spyOn(realOrderRequest,'put').mockResolvedValue('9007199254740993124');
    await productApi.createProduct(input);
    await productApi.updateProduct({...input,id:'9007199254740993124',taxFee:'0',afterSaleType:'NONE'});
    expect(post.mock.calls[0][1]).toMatchObject({title,source:normalizeProductSource(source)});
    expect(put.mock.calls[0][1]).toMatchObject({title,source:normalizeProductSource(source)});
    expect(post.mock.calls[0][1]).not.toHaveProperty('sourceId');
  });
  it('来源胶囊按纯文本渲染，空来源不产生胶囊', async () => {
    const html=await renderToString(createSSRApp({render:() => h(ProductSourceBadge,{source:'<b>自营</b>',detail:true})}));
    expect(html).toContain('&lt;b&gt;自营&lt;/b&gt;');expect(html).not.toContain('<b>自营</b>');
    const empty=await renderToString(createSSRApp({render:() => h(ProductSourceBadge,{source:'   '})}));
    expect(empty).not.toContain('<span');
  });
  it('来源清理空白但不截断，32个Unicode字符保留，33个在写入前拒绝', async () => {
    expect(normalizeProductSource('  海外直采  ')).toBe('海外直采');
    expect(normalizeProductSource('📦'.repeat(32))).toBe('📦'.repeat(32));
    const post=vi.spyOn(realOrderRequest,'post');
    await expect(productApi.createProduct({title:'商品',source:'字'.repeat(33),categoryId:'1',price:'1',shippingFee:'0',tax:'0',stock:1,aftersaleType:'none',overseasCustoms:false,description:'',images:[]})).rejects.toThrow('商品来源最多32个字符');
    expect(post).not.toHaveBeenCalled();
  });
  it('详情与商城/识图列表保留来源，标题不拼接，来源变化使编辑快照失效', async () => {
    const record=productApi.toProductRecord({id:'9007199254740993123',title:'原名',source:' 京东国际 ',price:'1',stock:1} as Api.RealProduct.ProductDTO);
    expect(record.source).toBe('京东国际');expect(record.title).toBe('原名');
    expect(productEditSnapshot(record)).not.toBe(productEditSnapshot({...record,source:'淘宝'}));
    const post=vi.spyOn(realOrderRequest,'postQuery').mockResolvedValue({records:[{id:record.id,title:'原名',source:'海外直采',price:'1',stock:1}],total:1});
    expect((await productApi.fetchStorefrontProducts({})).records[0].source).toBe('海外直采');
    expect((await productApi.fetchStorefrontProducts({imageFileId:'9007199254740993124'})).records[0].source).toBe('海外直采');
    expect(post.mock.calls.map(call => call[0])).toEqual(['/storefront/products/page','/storefront/search/images/page']);
    const current={id:String(record.id),available:true,title:'原名',source:'京东',hasSku:false,priceLabel:'1 USDT',priceFrom:'1',priceTo:'1',stock:'1'};
    expect(requireCurrentProduct(current)).toMatchObject({source:'京东'});
    expect(requireCurrentProduct({...current,available:false})).toEqual({id:record.id,available:false});
  });
  it('新草稿保留自定义与明确清空，旧草稿缺字段不覆盖当前来源', () => {
    const draft={version:1,ownerId:'owner',savedAt:1,imageFiles:[],form:{title:'商品',price:1,shippingFee:0,tax:0,stock:1,overseasCustoms:false,description:'',images:[],source:' 海外直采 '}};
    expect(readBuyerProductDraft(JSON.stringify(draft),'owner').form.source).toBe('海外直采');
    expect(readBuyerProductDraft(JSON.stringify({...draft,form:{...draft.form,source:null}}),'owner').form.source).toBeNull();
    const legacy={...draft.form,source:undefined};const saved=readBuyerProductDraft(JSON.stringify({...draft,form:legacy}),'owner');
    expect(Object.assign({source:'京东'},saved.form).source).toBe('京东');
    expect(() => readBuyerProductDraft(JSON.stringify({...draft,form:{...draft.form,source:'字'.repeat(33)}}),'owner')).toThrow('最多32');
  });

  it('多分类在创建和编辑请求中同时保留主分类与全部Long原值', async () => {
    const categoryIds = ['2107332840677527553', '2107332840677527554'];
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('2107332840677527555');
    await productApi.createProduct({ title:'多分类商品', categoryId:categoryIds[0], categoryIds,
      price:'1', shippingFee:'0', tax:'0', stock:0, aftersaleType:'none', overseasCustoms:false,
      summary:'', description:'详情', images:[] });
    expect(post.mock.calls[0][1]).not.toHaveProperty('brief');
    expect(post.mock.calls[0][0]).toBe('/products/create');
    expect(post.mock.calls[0][1]).toMatchObject({ categoryId:categoryIds[0], categoryIds });
    const put = vi.spyOn(realOrderRequest, 'put').mockResolvedValue('2107332840677527555');
    await productApi.updateProduct({ id:'2107332840677527555', title:'多分类商品', categoryId:categoryIds[0], categoryIds,
      price:'1', shippingFee:'0', taxFee:'0', stock:0, afterSaleType:'NONE', overseasClearance:false,
      description:'详情', images:[] });
    expect(put.mock.calls[0][0]).toBe('/products/update');
    expect(put.mock.calls[0][1]).toMatchObject({ categoryId:categoryIds[0], categoryIds });
  });
  interface AddressState {
    reloadRegions:() => Promise<void>; onCountryChange:(code: string) => Promise<void>; submit:() => void;
    form:Api.RealAddress.AddressSaveParams; provinces:Api.RealAddress.RegionVO[]; canSubmit:boolean; loadError:string;
  }
  it('订单会话返回只接受本站业务路径，拒绝外链与自身循环', () => {
    expect(conversationReturnPath('/buyer/orders?status=pending')).toBe('/buyer/orders?status=pending');
    expect(conversationReturnPath('/im?conversationId=9007199254740993')).toBe('/im?conversationId=9007199254740993');
    for (const path of ['//example.com', 'https://example.com', '/im/order-group/1', '/buyer\\evil', '/buyer\n/orders', ['/order']]) expect(conversationReturnPath(path)).toBeUndefined();
  });
  it('创建商品不再提交简介，也不从标题生成简介', async () => {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia(); setActivePinia(pinia);
    const user = useUserStore(); user.currentUser = { id:'seller', isBuyer:true } as Api.RealSession.UserRecord; user.currentAudience = 'buyer';
    vi.spyOn(categoryApi, 'fetchCreateCategoryOptions').mockResolvedValue([{ value:'category', label:'分类' }]);
    vi.spyOn(buyerApi, 'fetchBuyerDepositSummary').mockResolvedValue({ listable:true } as Api.RealBuyer.DepositSummary);
    const create = vi.spyOn(productApi, 'createProduct').mockResolvedValue('9007199254740993');
    const confirm = vi.spyOn(Modal, 'confirm');
    const fixture = mountSubject<{ onSubmit:(form:Record<string, unknown>) => Promise<void> }>(BuyerProductCreate, {}, undefined, app => {
      app.use(pinia); app.provide(routeLocationKey, { name:'buyer-product-create', params:{}, fullPath:'/buyer/products/create' } as unknown as RouteLocationNormalizedLoaded); app.provide(routerKey, { push:vi.fn() } as unknown as Router);
    });
    try {
      await fixture.state.onSubmit({ title:'很长的商品标题'.repeat(8), summary:'', categoryId:'category', categoryIds:['category'], parameters:[], specGroups:[], skus:[], price:'1', shippingFee:'0', tax:'0', stock:1, aftersaleType:'none', overseasCustoms:false, description:'详情', images:[] });
      await confirm.mock.calls[0][0].onOk?.();
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0][0]).not.toHaveProperty('summary');
    } finally { fixture.app.unmount(); confirmations.splice(0); }
  });
  it('发货小时选择提交整点时间，清空日期同步清空值', async () => {
    const changed = vi.fn();
    const fixture = mountSubject<{ updateHourPart:(part:'date'|'hour', value:string) => void }>(DateTimeInput, { modelValue:String(new Date(2026, 9, 31, 12, 35, 47).getTime()), hourOnly:true, 'onUpdate:modelValue':changed });
    try {
      fixture.state.updateHourPart('hour', '18');
      const date = new Date(Number(changed.mock.calls[0][0]));
      expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([18, 0, 0]);
      fixture.state.updateHourPart('date', '');
      expect(changed).toHaveBeenLastCalledWith('');
    } finally { fixture.app.unmount(); }
  });
  it('群内改价核对当前订单和卖家；非待付款状态不发改价请求', async () => {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia(); setActivePinia(pinia);
    const user = useUserStore(); user.currentUser = { id:'seller' } as Api.RealSession.UserRecord;
    const record = { id:'9007199254740993', shopperId:'seller', customerId:'customer', status:'CANCELLED', totalAmount:'14' } as unknown as Api.RealOrder.Record;
    const read = vi.spyOn(orderApi, 'fetchOrderDetail').mockResolvedValue(record);
    const write = vi.spyOn(orderApi, 'changeOrderPrice').mockResolvedValue({ ok:true });
    const fixture = mountSubject<{ load:() => Promise<void>; edit:() => Promise<void>; submit:() => Promise<boolean | undefined>; canEdit:boolean; amount:number; open:boolean }>(ConversationOrderBar, { orderId:record.id }, undefined, app => { app.use(pinia); app.provide(routerKey, { push:vi.fn() } as unknown as Router); });
    try {
      await fixture.state.load();
      expect(fixture.state.canEdit).toBe(false);
      await fixture.state.edit();
      expect(fixture.state.open).toBe(false);
      fixture.state.amount = 15;
      await fixture.state.submit();
      expect(write).not.toHaveBeenCalled();
      read.mockResolvedValue({ ...record, status:'PENDING_PAYMENT', shopperId:'other-seller' });
      await fixture.state.load();
      expect(fixture.state.canEdit).toBe(false);
      await fixture.state.submit();
      expect(write).not.toHaveBeenCalled();
      read.mockResolvedValue({ ...record, status:'PENDING_PAYMENT' });
      await fixture.state.edit();
      expect(fixture.state.open).toBe(true);
      fixture.state.amount = 15;
      read.mockResolvedValue({ ...record, status:'CANCELLED' });
      await fixture.state.submit();
      expect(write).not.toHaveBeenCalled();
      read.mockResolvedValue({ ...record, status:'PENDING_PAYMENT' });
      await fixture.state.edit();
      fixture.state.amount = 15;
      await fixture.state.submit();
      expect(write).toHaveBeenCalledWith({ id:'9007199254740993', amount:15 });
      expect(write).toHaveBeenCalledOnce();
      expect(fixture.state.open).toBe(false);
    } finally { fixture.app.unmount(); }
  });
  interface DiscussionState {
    requestDelete:(row: Api.RealReview.Comment) => void; load:(page?:number) => Promise<void>;
    rows:Api.RealReview.Comment[]; sending:boolean; page:number; error:string; notice:string;
    submit:() => Promise<void>; content:string; parent:Api.RealReview.Comment | undefined;
  }
  function discussionHarness() {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia(); setActivePinia(pinia);
    const user = useUserStore(); user.currentUser = { id:'qa-owner' } as Api.RealSession.UserRecord;
    const own:Api.RealReview.Comment = { id:'2090377523934879746', reviewId:'2090377523934879745', authorName:'匿名', content:'QA评论', createdAt:'1', hidden:false, canDelete:true };
    const other = { ...own, id:'2090377523934879747', canDelete:false };
    const read = vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({ total:'2', records:[own, other] });
    const remove = vi.spyOn(realOrderRequest, 'delete').mockResolvedValue(own.id);
    const changed = vi.fn();
    const fixture = mountSubject<DiscussionState>(ReviewDiscussion, { review:{ reviewId:own.reviewId, content:'QA评价' }, mode:'comments', onChanged:changed }, undefined, app => {
      app.use(pinia); app.provide(routeLocationKey, { fullPath:'/review' } as RouteLocationNormalizedLoaded);
      app.provide(routerKey, { push:vi.fn() } as unknown as Router);
    });
    return { ...fixture, user, own, other, read, remove, changed };
  }
  it('同名他人评论无删除确认，切账号后旧确认失效且不发请求', async () => {
    const fixture = discussionHarness();
    try {
      await fixture.state.load();
      fixture.state.requestDelete(fixture.other); expect(confirmations).toHaveLength(0);
      fixture.state.requestDelete(fixture.own); expect(confirmations).toHaveLength(1);
      const confirm = confirmations[0]!.onBeforeOk!;
      fixture.user.currentUser = { id:'qa-other' } as Api.RealSession.UserRecord;
      expect(confirmations).toHaveLength(0);
      await confirm(); expect(fixture.remove).not.toHaveBeenCalled();
    } finally { fixture.app.unmount(); }
  });
  it('只读评价仍可读取评论，但不能通过提交和删除回调写入', async () => {
    const fixture = discussionHarness();
    const post = vi.spyOn(realOrderRequest, 'post');
    try {
      fixture.properties.readonly = true;
      await nextTick(); await fixture.state.load();
      fixture.state.content = '不应提交';
      await fixture.state.submit(); fixture.state.requestDelete(fixture.own);
      expect(post).not.toHaveBeenCalled(); expect(fixture.remove).not.toHaveBeenCalled(); expect(confirmations).toHaveLength(0);
    } finally { fixture.app.unmount(); }
  });
  it('删除确认期间防重复，末页删除后回退有效页并读取真实结果', async () => {
    const fixture = discussionHarness();
    try {
      await fixture.state.load(2);
      fixture.state.requestDelete(fixture.own);
      let done!:(id:string) => void;
      fixture.remove.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
      fixture.read.mockResolvedValueOnce({ total:'20', records:[] }).mockResolvedValueOnce({ total:'20', records:[fixture.other] });
      const confirm = confirmations[0]!.onBeforeOk!;
      const pending = confirm(); expect(fixture.state.sending).toBe(true);
      await confirm(); expect(fixture.remove).toHaveBeenCalledTimes(1);
      done(fixture.own.id); await pending;
      expect(fixture.state.page).toBe(1); expect(fixture.state.rows.map(row => row.id)).toEqual([fixture.other.id]);
      expect(fixture.state.notice).toBe('评论已删除'); expect(fixture.state.sending).toBe(false);
      expect(fixture.changed).toHaveBeenCalledExactlyOnceWith(fixture.own.reviewId);
    } finally { fixture.app.unmount(); }
  });
  it('发表评论和回复成功后通知卡片回读，未知结果不伪造更新', async () => {
    const fixture = discussionHarness();
    const post = vi.spyOn(realOrderRequest, 'post').mockResolvedValue('2090377523934879760');
    try {
      await fixture.state.load();
      fixture.state.content = '新增评论';
      await fixture.state.submit();
      expect(fixture.changed).toHaveBeenCalledTimes(1);
      fixture.state.parent = fixture.other; fixture.state.content = '回复评论';
      await fixture.state.submit();
      expect(post).toHaveBeenLastCalledWith('/reviews/comments/create', { reviewId: fixture.own.reviewId, parentId: fixture.other.id, content: '回复评论' }, expect.anything());
      expect(fixture.changed).toHaveBeenCalledTimes(2);
      post.mockRejectedValueOnce(new Error('offline')); fixture.state.content = '待核实';
      await fixture.state.submit();
      expect(fixture.changed).toHaveBeenCalledTimes(2);
    } finally { fixture.app.unmount(); }
  });
  it('删除网络结果不明不自动重发，原评论与核对提示保留', async () => {
    const fixture = discussionHarness();
    try {
      await fixture.state.load(); fixture.state.requestDelete(fixture.own);
      fixture.remove.mockRejectedValueOnce(new Error('offline'));
      await confirmations[0]!.onBeforeOk!();
      expect(fixture.remove).toHaveBeenCalledTimes(1);
      expect(fixture.state.rows).toHaveLength(2); expect(fixture.state.error).toContain('删除结果待核实');
      expect(fixture.state.sending).toBe(false);
    } finally { fixture.app.unmount(); }
  });
  it('联想旧响应不能覆盖新输入，切账号后立即隔离历史并拒绝旧结果', async () => {
    vi.useFakeTimers();
    const values = new Map([[searchHistoryKey('a'), JSON.stringify(['甲的历史'])], [searchHistoryKey('b'), JSON.stringify(['乙的历史'])]]);
    vi.stubGlobal('localStorage', { getItem:(key: string) => values.get(key) || null, setItem:(key: string, value: string) => values.set(key, value) });
    const pinia = createPinia(); setActivePinia(pinia);
    const user = useUserStore(); user.currentUser = { id:'a' } as Api.RealSession.UserRecord;
    const pending = new Map<string, (rows: Api.RealSearch.Suggestion[]) => void>();
    vi.spyOn(realOrderRequest, 'get').mockImplementation((path, options) => {
      if (path === '/storefront/search/suggest') return new Promise(resolve => { pending.set(String(options?.params?.keyword), resolve); });
      return Promise.resolve([]);
    });
    const fixture = mountSubject<{ kw:string; history:string[]; suggestions:Api.RealSearch.Suggestion[]; focus:() => void }>(SearchBar, {}, undefined, app => {
      app.use(pinia); app.provide(routeLocationKey, { name:'home', query:{} } as unknown as RouteLocationNormalizedLoaded);
      app.provide(routerKey, { push:vi.fn() } as unknown as Router);
    });
    try {
      fixture.state.focus(); fixture.state.kw = 'sh'; await nextTick(); await vi.advanceTimersByTimeAsync(250);
      fixture.state.kw = 'ping'; await nextTick(); await vi.advanceTimersByTimeAsync(250);
      pending.get('sh')!([{ keyword:'手机', source:'MODEL' }]); await nextTick();
      expect(fixture.state.suggestions).toEqual([]);
      pending.get('ping')!([{ keyword:'平板', source:'MODEL' }]); await nextTick(); await nextTick();
      expect(fixture.state.suggestions.map(row => row.keyword)).toEqual(['平板']);
      user.currentUser = { id:'b' } as Api.RealSession.UserRecord; await nextTick();
      expect(fixture.state.history).toEqual(['乙的历史']); expect(fixture.state.suggestions).toEqual([]);
    } finally { fixture.app.unmount(); vi.useRealTimers(); }
  });
  it('选择联想补全关键词并搜索列表，同词再次搜索仍触发刷新', async () => {
    vi.stubGlobal('localStorage', { getItem:() => null, setItem:vi.fn() });
    vi.spyOn(realOrderRequest, 'get').mockResolvedValue([]);
    vi.spyOn(realOrderRequest, 'post').mockResolvedValue(null);
    const pinia = createPinia(); setActivePinia(pinia);
    const push = vi.fn().mockResolvedValue(undefined);
    const route = { name:'home', query:{} as Record<string,string> };
    const mounted = mountSubject<{ kw:string; submit:(keyword:string) => void; composing:boolean }>(SearchBar, {}, undefined, app => {
      app.use(pinia); app.provide(routeLocationKey, route as unknown as RouteLocationNormalizedLoaded);
      app.provide(routerKey, { push } as unknown as Router);
    });
    try {
      mounted.state.kw = 'duo'; mounted.state.submit('iphone duo');
      expect(mounted.state.kw).toBe('iphone duo');
      expect(push).toHaveBeenLastCalledWith({ name:'product-list', query:{ keyword:'iphone duo' } });
      route.name = 'product-list'; route.query.keyword = 'iphone duo';
      mounted.state.submit('iphone duo');
      expect(push.mock.lastCall?.[0]).toEqual({ name:'product-list', query:{ keyword:'iphone duo', searchRun:expect.any(String) } });
      mounted.state.composing = true; mounted.state.submit('iphone');
      expect(push).toHaveBeenCalledTimes(2);
    } finally { mounted.app.unmount(); }
  });
describe('订单商品与求购接单入口', () => {
  function mountAccess(order: Partial<Api.RealOrder.Record>) {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia(); setActivePinia(pinia);
    const push = vi.fn().mockResolvedValue(undefined);
    const mounted = mountSubject<{ viewProduct:() => Promise<void>; open:boolean; unavailable:string }>(OrderProductAccess,
      { order:{ id:'2116039434709848066', productId:'', productTitle:'求购商品', ...order } }, undefined,
      app => { app.use(pinia); app.provide(routerKey, { push } as unknown as Router); });
    return { ...mounted, push };
  }
  it('未关联商品的求购打开成交信息，不猜测商品ID', async () => {
    const query = vi.spyOn(productApi, 'fetchProductDetail');
    const mounted = mountAccess({ orderType:'DEMAND_FULFILL' });
    try { await mounted.state.viewProduct(); expect(mounted.state.open).toBe(true); expect(query).not.toHaveBeenCalled(); expect(mounted.push).not.toHaveBeenCalled(); }
    finally { mounted.app.unmount(); }
  });
  it('商品不可用仍可查看成交信息，不跳转商品页', async () => {
    vi.spyOn(productApi, 'fetchProductDetail').mockRejectedValue(new Error('unavailable'));
    const mounted = mountAccess({ productId:'9007199254740993' });
    try { await mounted.state.viewProduct(); expect(mounted.state.open).toBe(true); expect(mounted.state.unavailable).toBeTruthy(); expect(mounted.push).not.toHaveBeenCalled(); }
    finally { mounted.app.unmount(); }
  });
  it('关联商品可访问时按原始长ID跳转', async () => {
    vi.spyOn(productApi, 'fetchProductDetail').mockResolvedValue({ id:'9007199254740993' } as Api.RealProduct.Record);
    const mounted = mountAccess({ productId:'9007199254740993' });
    try { await mounted.state.viewProduct(); expect(mounted.push).toHaveBeenCalledWith({ name:'product-detail', params:{id:'9007199254740993'} }); }
    finally { mounted.app.unmount(); }
  });
  it('接单确认可以不关联商品，取消不会产生选择', async () => {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia(); setActivePinia(pinia);
    const mounted = mountSubject<{ choose:() => Promise<unknown>; confirm:() => void; finish:() => void }>(DemandProductPicker, {}, undefined, app => app.use(pinia));
    try { const first = mounted.state.choose(); mounted.state.confirm(); await expect(first).resolves.toEqual({}); const second = mounted.state.choose(); mounted.state.finish(); await expect(second).resolves.toBeUndefined(); }
    finally { mounted.app.unmount(); }
  });
});

  interface UploaderState { uploadFiles:(files: File[]) => Promise<void>; remove:(index: number) => void; failedFiles:File[]; uploading:boolean }
  it('商品图片排序更新数组与封面顺序，禁用及上传中不重排', async () => {
    const changed = vi.fn();
    const mounted = mountSubject<{ moveImage:(index:number, step:number) => void; uploading:boolean }>(EvidenceUploader, { modelValue:['cover','second','third'], coverMode:true, 'onUpdate:modelValue':changed });
    try {
      mounted.state.moveImage(2, -1);
      expect(changed).toHaveBeenLastCalledWith(['cover','third','second']);
      mounted.state.moveImage(1, -1);
      expect(changed).toHaveBeenLastCalledWith(['second','cover','third']);
      const count = changed.mock.calls.length;
      mounted.state.uploading = true;
      mounted.state.moveImage(1, 1);
      mounted.state.uploading = false;
      mounted.properties.disabled = true; await nextTick();
      mounted.state.moveImage(1, 1);
      expect(changed).toHaveBeenCalledTimes(count);
    } finally { mounted.app.unmount(); }
  });
  const file = () => new File(['local-only'], 'evidence.png', { type:'image/png' });
  const uploaded: Api.RealProduct.FileUploadResult = { id:'local-only', bucket:'local-only', filePath:'local-only', url:'https://example.com/local-only.png' };

  interface BuyerApplyState {
    canApply:boolean; kycStatus?:Api.User.KycStatus; kycAction?:{ label:string }; loadError:string;
    form:Api.RealBuyer.BuyerApplyParams; loadApplication:() => Promise<void>; openKyc:() => Promise<void>; submit:() => Promise<void>;
  }
  function buyerApplyHarness(kyc: { value:Api.RealKyc.KycVO | null; fail?:boolean }) {
    vi.stubGlobal('localStorage', { getItem:() => null });
    const pinia = createPinia();
    setActivePinia(pinia);
    const user = useUserStore();
    user.currentUser = { id:'qa-application-owner', isBuyer:false } as Api.RealSession.UserRecord;
    const get = vi.spyOn(realUserRequest, 'get').mockImplementation(async path => {
      if (path === '/buyer/application') return null;
      if (path === '/kyc/detail') {
        if (kyc.fail) throw new Error('KYC unavailable');
        return kyc.value;
      }
      throw new Error('Unexpected read in buyer application test');
    });
    const post = vi.spyOn(realUserRequest, 'post').mockResolvedValue(undefined);
    const push = vi.fn().mockResolvedValue(undefined);
    function mount() {
      return mountSubject<BuyerApplyState>(BuyerApply, {}, undefined, app => {
        app.use(pinia);
        app.provide(routeLocationKey, { fullPath:'/buyer/apply?source=profile', query:{ source:'profile' } } as unknown as RouteLocationNormalizedLoaded);
        app.provide(routerKey, { push } as unknown as Router);
      });
    }
    return { user, get, post, push, mount };
  }

  it.each([
    { detail:null, status:'none', action:'去实名认证' },
    { detail:{ id:'kyc-local', status:'PENDING' }, status:'pending', action:'查看认证进度' },
    { detail:{ id:'kyc-local', status:'REJECTED' }, status:'rejected', action:'完善实名认证' },
    { detail:{ id:'kyc-local', status:'PASSED', expireAt:'1' }, status:'expired', action:'重新实名认证' }
  ])('买手申请根据实名认证 $status 显示处理入口并阻止提交', async ({ detail, status, action }) => {
    clearBuyerApplicationDraft();
    const fixture = buyerApplyHarness({ value:detail });
    const mounted = fixture.mount();
    try {
      await mounted.state.loadApplication();
      expect(mounted.state.kycStatus).toBe(status);
      expect(mounted.state.kycAction?.label).toBe(action);
      expect(mounted.state.canApply).toBe(false);
      Object.assign(mounted.state.form, { realName:'本地测试', contact:'qa-only', reason:'本地测试申请说明至少十个字' });
      await mounted.state.submit();
      expect(fixture.post).not.toHaveBeenCalled();
      expect(fixture.get).toHaveBeenCalledWith('/kyc/detail', expect.objectContaining({ showError:false, signal:expect.any(AbortSignal) }));
    } finally { mounted.app.unmount(); clearBuyerApplicationDraft(); }
  });

  it('实名认证有效时允许申请，读取失败后关闭提交而不沿用旧认证结果', async () => {
    clearBuyerApplicationDraft();
    const kyc = { value:{ id:'kyc-local', status:'PASSED', expireAt:String(Date.now() + 86400_000) } as Api.RealKyc.KycVO, fail:false };
    const fixture = buyerApplyHarness(kyc);
    const mounted = fixture.mount();
    try {
      await mounted.state.loadApplication();
      expect(mounted.state.canApply).toBe(true);
      expect(mounted.state.kycAction).toBeUndefined();
      kyc.fail = true;
      await mounted.state.loadApplication();
      expect(mounted.state.canApply).toBe(false);
      expect(mounted.state.kycStatus).toBeUndefined();
      expect(mounted.state.loadError).toContain('实名认证状态加载失败');
      await mounted.state.submit();
      expect(fixture.post).not.toHaveBeenCalled();
    } finally { mounted.app.unmount(); clearBuyerApplicationDraft(); }
  });

  it('实名认证已通过但非空有效期非法时不可申请，也不自动跳转或提交', async () => {
    clearBuyerApplicationDraft();
    const fixture = buyerApplyHarness({ value:{ id:'kyc-local', status:'PASSED', expireAt:'not-a-date' } });
    const mounted = fixture.mount();
    try {
      await mounted.state.loadApplication();
      expect(mounted.state.canApply).toBe(false);
      expect(mounted.state.kycStatus).toBeUndefined();
      expect(mounted.state.loadError).toContain('实名认证状态加载失败');
      await mounted.state.submit();
      expect(fixture.push).not.toHaveBeenCalled();
      expect(fixture.post).not.toHaveBeenCalled();
    } finally { mounted.app.unmount(); clearBuyerApplicationDraft(); }
  });

  it('前往实名再返回买手申请恢复本人本次草稿并重新读取状态，不自动提交', async () => {
    clearBuyerApplicationDraft();
    const kyc: { value:Api.RealKyc.KycVO | null } = { value:null };
    const fixture = buyerApplyHarness(kyc);
    let mounted = fixture.mount();
    const draft = { realName:'本地测试', contact:'qa-only', reason:'本地测试采购经验及服务品类说明' };
    try {
      await mounted.state.loadApplication();
      Object.assign(mounted.state.form, draft);
      await mounted.state.openKyc();
      expect(fixture.push).toHaveBeenCalledExactlyOnceWith({ name:'kyc', query:{ redirect:'/buyer/apply?source=profile' } });
      expect(fixture.post).not.toHaveBeenCalled();
      mounted.app.unmount();
      kyc.value = { id:'kyc-local', status:'PASSED', expireAt:String(Date.now() + 86400_000) };
      mounted = fixture.mount();
      expect(mounted.state.form).toEqual(draft);
      expect(mounted.state.canApply).toBe(false);
      await mounted.state.loadApplication();
      expect(mounted.state.canApply).toBe(true);
      expect(fixture.post).not.toHaveBeenCalled();
    } finally { mounted.app.unmount(); clearBuyerApplicationDraft(); }
  });

  it.each(['owner', 'session'] as const)('买手申请草稿在 %s 改变后不恢复给新会话', async boundary => {
    clearBuyerApplicationDraft();
    const fixture = buyerApplyHarness({ value:null });
    let mounted = fixture.mount();
    try {
      await mounted.state.loadApplication();
      Object.assign(mounted.state.form, { realName:'旧会话资料', contact:'qa-only', reason:'本地测试采购经验及服务品类说明' });
      await mounted.state.openKyc();
      mounted.app.unmount();
      if (boundary === 'owner') fixture.user.currentUser = { id:'qa-different-owner', isBuyer:false } as Api.RealSession.UserRecord;
      else fixture.user.sessionVersion += 1;
      mounted = fixture.mount();
      expect(mounted.state.form).toEqual({ realName:'', contact:'', reason:'' });
      await mounted.state.loadApplication();
      expect(mounted.state.canApply).toBe(false);
      expect(fixture.post).not.toHaveBeenCalled();
    } finally { mounted.app.unmount(); clearBuyerApplicationDraft(); }
  });

  it('提现绕行草稿仅恢复所选资产的非敏感表单，不保留支付密码或费用报价', () => {
    clearPrerequisiteDrafts();
    const form = {
      asset:'USDC' as const, chain:'ETH' as const, toAddress:'qa-local-only-address', amount:'9007199254740993.01',
      payPassword:'local-only-input', feePreview:{ amount:'0.01', expiresAt:123 }, idempotencyKey:'local-only-key'
    };
    try {
      saveWithdrawDraft('9007199254740993', 3, form);
      const restored = takeWithdrawDraft('9007199254740993', 3, 'USDC');
      expect(restored).toEqual({ asset:'USDC', chain:'ETH', toAddress:'qa-local-only-address', amount:'9007199254740993.01' });
      expect(restored).not.toHaveProperty('payPassword');
      expect(restored).not.toHaveProperty('feePreview');
      expect(restored).not.toHaveProperty('idempotencyKey');
      expect(takeWithdrawDraft('9007199254740993', 3, 'USDC')).toBeUndefined();
    } finally { clearPrerequisiteDrafts(); }
  });

  it.each(['owner', 'session', 'asset'] as const)('提现绕行草稿的 %s 不匹配时拒绝恢复并丢弃旧草稿', boundary => {
    clearPrerequisiteDrafts();
    try {
      saveWithdrawDraft('qa-owner', 3, { asset:'USDC', chain:'ETH', toAddress:'qa-local-only-address', amount:'12.34' });
      expect(takeWithdrawDraft(boundary === 'owner' ? 'qa-other' : 'qa-owner', boundary === 'session' ? 4 : 3, boundary === 'asset' ? 'USDT' : 'USDC')).toBeUndefined();
      expect(takeWithdrawDraft('qa-owner', 3, 'USDC')).toBeUndefined();
    } finally { clearPrerequisiteDrafts(); }
  });

  it.each(['logout', 'external-logout'] as const)('真实用户Store的 %s 清除买手申请与提现绕行草稿', async boundary => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem:(key:string) => storage.get(key) ?? null,
      setItem:(key:string, value:string) => storage.set(key, value),
      removeItem:(key:string) => storage.delete(key)
    });
    clearPrerequisiteDrafts();
    setAccessToken('qa-local-only-session');
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id:'qa-owner' } as Api.RealSession.UserRecord;
    const session = user.sessionVersion;
    saveBuyerApplicationDraft('qa-owner', session, { realName:'本地测试', contact:'qa-only', reason:'本地申请说明' });
    saveWithdrawDraft('qa-owner', session, { asset:'USDT', chain:'TRON', toAddress:'qa-local-only-address', amount:'12.34' });
    try {
      if (boundary === 'logout') user.logout();
      else {
        clearAccessToken();
        expect(await user.syncExternalSession()).toBe(true);
      }
      expect(user.currentUser).toBeUndefined();
      expect(takeBuyerApplicationDraft('qa-owner', session)).toBeUndefined();
      expect(takeWithdrawDraft('qa-owner', session, 'USDT')).toBeUndefined();
    } finally { clearPrerequisiteDrafts(); clearAccessToken(); }
  });

  it('主题按钮只在深浅两套配色间切换并保存选择', () => {
    vi.stubGlobal('document', undefined);
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const { app, state } = mountSubject<{
      isDark: boolean; nextTheme: 'web3-meme' | 'navy-coral'; label: string;
      setTheme: (theme: 'web3-meme' | 'navy-coral') => void;
    }>(ThemePicker, {});
    const original = state.isDark ? 'web3-meme' : 'navy-coral';
    try {
      expect(UI_THEMES.map(theme => theme.id)).toEqual(['web3-meme', 'navy-coral']);
      expect(isUiTheme('forest')).toBe(false);
      state.setTheme('web3-meme');
      expect(state.label).toBe('切换为浅色模式');
      state.setTheme(state.nextTheme);
      expect(state.isDark).toBe(false);
      expect(state.label).toBe('切换为深色模式');
      expect(setItem).toHaveBeenLastCalledWith('um.uiTheme', 'navy-coral');
      state.setTheme(state.nextTheme);
      expect(state.isDark).toBe(true);
      expect(setItem).toHaveBeenLastCalledWith('um.uiTheme', 'web3-meme');
    } finally { state.setTheme(original); app.unmount(); }
  });

  it('商品买手与公开评价头像保留完整首码点，匿名评价不泄露昵称首字', () => {
    vi.stubGlobal('localStorage', { getItem:() => null });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches:false }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('document', Object.assign(new EventTarget(), { querySelector: () => null }));
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const detail = mountSubject<{ product?: Api.RealProduct.Record; sellerInitial:string }>(DetailView, {}, undefined, app => {
      app.use(createPinia());
      app.provide(routeLocationKey, { params:{}, query:{} } as RouteLocationNormalizedLoaded);
      app.provide(routerKey, {} as Router);
    });
    const reviews = mountSubject<{ initial:(review: Api.RealReview.ReviewDTO) => string; shortText:(review: Api.RealReview.ReviewDTO) => string }>(DetailReviews, {
      rows:[], total:0, current:1, pageSize:20, loading:false, error:'', stars:0, hasImage:false, keyword:'', sort:'MOST_HELPFUL'
    });
    try {
      for (const [userName, initial] of [['😀买手', '😀'], ['𠮷野家', '𠮷'], ['普通买手', '普'], ['Alice', 'A']]) {
        detail.state.product = { sellerName:userName } as Api.RealProduct.Record;
        expect(detail.state.sellerInitial).toBe(initial);
        expect(reviews.state.initial({ userName, anonymous:false } as Api.RealReview.ReviewDTO)).toBe(initial);
      }
      detail.state.product = { sellerName:'' } as Api.RealProduct.Record;
      expect(detail.state.sellerInitial).toBe('U');
      expect(reviews.state.initial({ userName:'😀实名', anonymous:true } as Api.RealReview.ReviewDTO)).toBe('匿');
      expect(reviews.state.initial({} as Api.RealReview.ReviewDTO)).toBe('匿');
      expect(reviews.state.shortText({ content:'a'.repeat(84) + '😀x' } as Api.RealReview.ReviewDTO)).toBe('a'.repeat(84) + '…');
      expect(reviews.state.shortText({ content:'a'.repeat(83) + '😀x' } as Api.RealReview.ReviewDTO)).toBe('a'.repeat(83) + '😀…');
      expect(reviews.state.shortText({ content:'a'.repeat(86) } as Api.RealReview.ReviewDTO)).toBe('a'.repeat(85) + '…');
    } finally { detail.app.unmount(); reviews.app.unmount(); }
  });

  it('聊天输入框右上拖柄上拖加高、下拖缩小并限制高度，切换会话释放捕获', async () => {
    const captured = new Set<number>();
    const target = {
      setPointerCapture:vi.fn((id:number) => captured.add(id)),
      hasPointerCapture:(id:number) => captured.has(id),
      releasePointerCapture:vi.fn((id:number) => captured.delete(id))
    };
    const pointer = (clientY:number, pointerId = 1) => ({ button:0, isPrimary:true, pointerId, clientY, currentTarget:target } as unknown as PointerEvent);
    const { app, state, properties } = mountSubject<{
      composerHeight:number; startResize:(event:PointerEvent) => void; moveResize:(event:PointerEvent) => void;
      finishResize:(event?:PointerEvent) => void; toggleResize:(event:MouseEvent) => void;
    }>(MessageInput, { contextKey:'first' }, 1440);
    try {
      expect(state.composerHeight).toBe(52);
      state.startResize(pointer(400));
      state.moveResize(pointer(360, 2));
      expect(state.composerHeight).toBe(52);
      state.moveResize(pointer(360));
      expect(state.composerHeight).toBe(92);
      state.moveResize(pointer(100));
      expect(state.composerHeight).toBe(160);
      state.finishResize(pointer(100));
      state.toggleResize({ detail:1 } as MouseEvent);
      expect(state.composerHeight).toBe(160);
      state.startResize(pointer(400));
      state.moveResize(pointer(600));
      expect(state.composerHeight).toBe(52);
      properties.contextKey = 'second';
      await nextTick();
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(2);
      state.moveResize(pointer(100));
      expect(state.composerHeight).toBe(52);
      state.startResize(pointer(400));
    } finally { app.unmount(); }
    expect(captured.size).toBe(0);
  });

  it('聊天输入框支持点击切换高度及键盘调整，手机保留适用最小高度', () => {
    const { app, state } = mountSubject<{
      composerHeight:number; toggleResize:(event:MouseEvent) => void; onResizeKeydown:(event:KeyboardEvent) => void;
    }>(MessageInput, {}, 375);
    const preventDefault = vi.fn();
    const key = (key:string) => state.onResizeKeydown({ key, preventDefault } as unknown as KeyboardEvent);
    try {
      expect(state.composerHeight).toBe(56);
      state.toggleResize({ detail:0 } as MouseEvent);
      expect(state.composerHeight).toBe(160);
      key('ArrowDown');
      expect(state.composerHeight).toBe(144);
      key('ArrowUp');
      expect(state.composerHeight).toBe(160);
      key('Home');
      expect(state.composerHeight).toBe(56);
      key('ArrowDown');
      expect(state.composerHeight).toBe(56);
      key('End');
      expect(state.composerHeight).toBe(160);
      state.toggleResize({ detail:1 } as MouseEvent);
      expect(state.composerHeight).toBe(56);
      expect(preventDefault).toHaveBeenCalledTimes(5);
    } finally { app.unmount(); }
  });

  it('手机发送等待保留输入框和下一条草稿，PC与会话禁用保持原规则', async () => {
    const sent = vi.fn();
    const { app, state, properties } = mountSubject<{
      inputDisabled:boolean; text:string; send:() => Promise<void>;
    }>(MessageInput, { submitting:true, onSend:sent }, 375);
    try {
      expect(state.inputDisabled).toBe(false);
      state.text = '下一条草稿';
      await state.send();
      expect(sent).not.toHaveBeenCalled();
      expect(state.text).toBe('下一条草稿');
      properties.submitting = false;
      await nextTick();
      await state.send();
      expect(sent).toHaveBeenCalledExactlyOnceWith({ type:'text', content:'下一条草稿' });
      expect(state.text).toBe('');
      properties.disabled = true;
      await nextTick();
      expect(state.inputDisabled).toBe(true);
    } finally { app.unmount(); }
    const pc = mountSubject<{ inputDisabled:boolean }>(MessageInput, { submitting:true }, 1440);
    try {
      expect(pc.state.inputDisabled).toBe(true);
      pc.properties.submitting = false;
      await nextTick();
      expect(pc.state.inputDisabled).toBe(false);
    } finally { pc.app.unmount(); }
  });

  it('点击失败缩略图可重新加载，仅重试当前图片', () => {
    const { app, state } = mountSubject<{
      imageError:(url: string) => void; selectPhoto:(index: number) => void;
      source:(url: string) => string; canZoom:boolean;
    }>(DetailGallery, { images:[{ type:'image', url:'first.jpg' }, { type:'image', url:'second.jpg' }], title:'图片恢复' });
    try {
      state.imageError('first.jpg');
      state.imageError('second.jpg');
      expect(state.canZoom).toBe(false);
      state.selectPhoto(0);
      expect(state.source('first.jpg')).toBe('first.jpg');
      expect(state.canZoom).toBe(true);
      expect(state.source('second.jpg')).not.toBe('second.jpg');
      state.imageError('first.jpg');
      state.selectPhoto(1);
      expect(state.source('second.jpg')).toBe('second.jpg');
      expect(state.source('first.jpg')).not.toBe('first.jpg');
    } finally { app.unmount(); }
  });

  it('验收字典失败保留错误态，不调用真实字典作为回退', async () => {
    const real = vi.spyOn(addressApi, 'fetchCountries');
    const fixture: AddressVisualFixture = { countries:async () => { throw new Error('local dictionary failure'); }, regions:async () => [] };
    const { app, state } = mountSubject<AddressState>(AddressForm, { visualFixture:fixture });
    try {
      await state.reloadRegions();
      expect(state.loadError).toContain('字典加载失败');
      expect(state.canSubmit).toBe(false);
      expect(real).not.toHaveBeenCalled();
    } finally { app.unmount(); }
  });

  it('国家切换后旧区划回包失效，海外地址只输出文本地区', async () => {
    let finish!: (regions: Api.RealAddress.RegionVO[]) => void;
    const fixture: AddressVisualFixture = {
      countries:async () => [{ code:'JP', name:'日本', hasRegion:false }, { code:'CN', name:'中国大陆', hasRegion:true }],
      regions:() => new Promise(resolve => { finish = resolve; })
    };
    const submit = vi.fn();
    const { app, state } = mountSubject<AddressState>(AddressForm, { visualFixture:fixture, modelValue:{ countryCode:'JP', receiverName:'本地样例', receiverPhone:'00000000000', detail:'本地地址', province:'Tokyo', city:'Tokyo' }, onSubmit:submit });
    try {
      await state.reloadRegions();
      const previous = state.onCountryChange('CN');
      await state.onCountryChange('JP');
      finish([{ code:'old', name:'旧地区', level:1, leaf:true }]);
      await previous;
      expect(state.form.countryCode).toBe('JP');
      expect(state.provinces).toEqual([]);
      state.form.province = 'Tokyo'; state.form.city = 'Tokyo';
      state.submit();
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ countryCode:'JP', province:'Tokyo', city:'Tokyo' }));
      expect(submit.mock.calls[0]![0]).not.toHaveProperty('provinceCode');
    } finally { app.unmount(); }
  });

  it.each(['71', '81', '82', '110000'])('末级地区 %s 不提交历史市区编码，地址Long原值保留', async code => {
    const submit = vi.fn();
    const fixture: AddressVisualFixture = {
      countries:async () => [{ code:'CN', name:'中国大陆', hasRegion:true }],
      regions:async () => [{ code, name:'末级地区', level:1, leaf:true }]
    };
    const { app, state } = mountSubject<AddressState>(AddressForm, { visualFixture:fixture, modelValue:{ id:'9007199254740993', countryCode:'CN', provinceCode:code, cityCode:'old-city', districtCode:'old-district', receiverName:'本地样例', receiverPhone:'00000000000', detail:'本地地址' }, onSubmit:submit });
    try {
      await state.reloadRegions();
      expect(state.canSubmit).toBe(true);
      state.submit();
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ id:'9007199254740993', countryCode:'CN', provinceCode:code }));
      expect(submit.mock.calls[0]![0]).not.toHaveProperty('province');
      expect(submit.mock.calls[0]![0]).not.toHaveProperty('cityCode');
      expect(submit.mock.calls[0]![0]).not.toHaveProperty('districtCode');
    } finally { app.unmount(); }
  });

  it('凭证上传途中禁用后，迟到结果不再修改禁用中的表单', async () => {
    let finish!: (value: Api.RealProduct.FileUploadResult) => void;
    const fixture: EvidenceVisualFixture = { upload:() => new Promise(resolve => { finish = resolve; }) };
    const update = vi.fn();
    const { app, state, properties } = mountSubject<UploaderState>(EvidenceUploader, { modelValue:[], visualFixture:fixture, 'onUpdate:modelValue':update });
    try {
      const pending = state.uploadFiles([file()]);
      properties.disabled = true;
      await nextTick();
      properties.disabled = false;
      await nextTick();
      finish(uploaded);
      await pending;
      expect(update).not.toHaveBeenCalled();
      expect(state.uploading).toBe(false);
    } finally { app.unmount(); Message.clear(); }
  });

  it('上传中删除原图仍合并当前列表，失败重试不调用真实上传', async () => {
    let finish!: (value: Api.RealProduct.FileUploadResult) => void;
    const real = vi.spyOn(productApi, 'uploadFile');
    const upload = vi.fn<EvidenceVisualFixture['upload']>().mockRejectedValueOnce(new Error('local failure'))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let properties: Record<string, unknown>;
    const update = vi.fn((images: string[]) => { properties.modelValue = images; });
    const mounted = mountSubject<UploaderState>(EvidenceUploader, { modelValue:['first','second'], visualFixture:{ upload }, 'onUpdate:modelValue':update });
    properties = mounted.properties;
    try {
      await mounted.state.uploadFiles([file()]);
      expect(mounted.state.failedFiles).toHaveLength(1);
      const pending = mounted.state.uploadFiles([...mounted.state.failedFiles]);
      mounted.state.remove(0);
      await nextTick();
      finish(uploaded);
      await pending;
      expect(update).toHaveBeenLastCalledWith(['second', uploaded.url]);
      expect(mounted.state.failedFiles).toHaveLength(0);
      expect(real).not.toHaveBeenCalled();
    } finally { mounted.app.unmount(); Message.clear(); }
  });
});

describe('手机分类搜索焦点恢复', () => {
  function mountCategory() {
    vi.spyOn(categoryApi, 'fetchCategoryTree').mockResolvedValue([]);
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const push = vi.fn().mockResolvedValue(undefined);
    const app = renderer.createApp({ ...CategoryView, render:() => null });
    app.provide(ssrContextKey, {});
    app.provide(routeLocationKey, reactive({ query:{}, fullPath:'/category', path:'/category' }) as RouteLocationNormalizedLoaded);
    app.provide(routerKey, { push, options:{ history:{ state:{ back:'/' } } } } as unknown as Router);
    app.mount({});
    const state = (app as unknown as { _instance:{ setupState:{
      searchOpen:boolean; searchInput:HTMLInputElement; searchTrigger:HTMLButtonElement;
      openSearch:() => void; closeSearch:() => void; exitCategory:() => void;
    } } })._instance.setupState;
    const inputFocus = vi.fn();
    const triggerFocus = vi.fn();
    state.searchInput = { focus:inputFocus } as unknown as HTMLInputElement;
    state.searchTrigger = { focus:triggerFocus } as unknown as HTMLButtonElement;
    return { app, state, push, inputFocus, triggerFocus };
  }

  it.each(['closeSearch', 'exitCategory'] as const)('%s收起输入后将焦点还给搜索触发按钮', async close => {
    const { app, state, push, inputFocus, triggerFocus } = mountCategory();
    try {
      state.openSearch();
      await nextTick();
      expect(inputFocus).toHaveBeenCalledOnce();
      state[close]();
      expect(state.searchOpen).toBe(false);
      expect(triggerFocus).not.toHaveBeenCalled();
      await nextTick();
      expect(triggerFocus).toHaveBeenCalledOnce();
      expect(push).not.toHaveBeenCalled();
    } finally { app.unmount(); }
  });

  it('重新展开或卸载后不执行过期的焦点恢复', async () => {
    const { app, state, inputFocus, triggerFocus } = mountCategory();
    state.openSearch();
    await nextTick();
    state.closeSearch();
    state.openSearch();
    await nextTick();
    expect(triggerFocus).not.toHaveBeenCalled();
    expect(inputFocus).toHaveBeenCalledTimes(2);
    state.closeSearch();
    app.unmount();
    await nextTick();
    expect(triggerFocus).not.toHaveBeenCalled();
  });
});

describe('公共弹窗卸载', () => {
  it.each(['confirm', 'cancel'] as const)('%s的异步检查在卸载后失败不再显示过期提示', async action => {
    let reject!: (reason: Error) => void;
    const guard = () => new Promise<void>((_resolve, fail) => { reject = fail; });
    const error = vi.spyOn(Message, 'error');
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const app = renderer.createApp({ ...BusinessDialog, render: () => null }, { visible:true, onBeforeOk:guard, onBeforeCancel:guard });
    app.provide(ssrContextKey, {});
    app.mount({});
    const state = (app as unknown as { _instance: { setupState: { confirm: () => Promise<void>; cancel: () => Promise<void> } } })._instance.setupState;
    const pending = state[action]();
    app.unmount();
    reject(new Error('late local guard failure'));
    try {
      await pending;
      expect(error).not.toHaveBeenCalled();
    } finally { Message.clear(); }
  });
});

describe('v47商品列表连续浏览', () => {
  const records = (start: number, length: number) => Array.from({ length }, (_, index) => ({
    id:`9007199254740993${start + index}`, title:`商品${start + index}`
  } as Api.RealProduct.Record));
  const page = (current: number, size = 24, total = 50) => ({ current, size, total, records:records((current - 1) * size, Math.min(size, total - (current - 1) * size)) });
  async function mountCatalog(load: CatalogVisualFixture['load'], query: Record<string, string> = {}) {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', { addEventListener:vi.fn(), removeEventListener:vi.fn() });
    vi.stubGlobal('matchMedia', () => ({ matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn() }));
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const app = renderer.createApp({ ...CatalogView, render:() => null }, { visualFixture:{ load } });
    const pinia = createPinia(); app.use(pinia);
    if (query.imageFileId !== undefined) useUserStore(pinia).currentUser = { id:'catalog-image-user' } as Api.RealSession.UserRecord;
    const route = reactive({ query:{...query}, fullPath:'/product/list', path:'/product/list' });
    app.provide(ssrContextKey, {});
    app.provide(routeLocationKey, route as RouteLocationNormalizedLoaded);
    app.provide(routerKey, { push:vi.fn().mockResolvedValue(undefined), replace:vi.fn().mockResolvedValue(undefined) } as unknown as Router);
    app.provide(categoryNavigationKey, { categories:readonly(ref([])), loading:readonly(ref(false)), loadError:readonly(ref('')), activeMenu:ref(null), loadCategories:async () => {} });
    app.mount({});
    await nextTick();
    const state = (app as unknown as { _instance:{ setupState:{
      load:(append?: boolean) => Promise<void>; loadMoreFeed:() => void;
      list:Api.RealProduct.Record[]; visibleProducts:Api.RealProduct.Record[];
      total:number; current:number; loadedPage:number; size:number; feedError:string; loadError:string; hasMoreFeed:boolean;
      filter:{ keyword:string };
    } } })._instance.setupState;
    return { app, state, route };
  }

  it('先显示24条，按12条揭示缓存，再追加下一页，Long原值及末页保留', async () => {
    const load = vi.fn<CatalogVisualFixture['load']>().mockImplementation(async query => page(query.current!));
    const { app, state } = await mountCatalog(load);
    try {
      expect(state.visibleProducts).toHaveLength(24);
      await state.load(true);
      expect(state.list).toHaveLength(48);
      expect(state.visibleProducts).toHaveLength(36);
      state.loadMoreFeed();
      expect(state.visibleProducts).toHaveLength(48);
      expect(load).toHaveBeenCalledTimes(2);
      await state.load(true);
      expect(state.visibleProducts).toHaveLength(50);
      expect(state.list[49]!.id).toBe('900719925474099349');
      expect(state.hasMoreFeed).toBe(false);
      expect(load.mock.calls.map(([query]) => query.current)).toEqual([1, 2, 3]);
    } finally { app.unmount(); }
  });

  it('追加失败保留商品与总数，重试原页；在途重复点击不重复请求', async () => {
    let fail!: (error: Error) => void;
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(1))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValueOnce(page(2));
    const { app, state } = await mountCatalog(load);
    try {
      const pending = state.load(true);
      state.loadMoreFeed();
      expect(load).toHaveBeenCalledTimes(2);
      fail(new Error('local failure'));
      await pending;
      expect(state.list).toHaveLength(24);
      expect(state.total).toBe(50);
      expect(state.loadedPage).toBe(1);
      expect(state.feedError).toContain('加载失败');
      await state.load(true);
      expect(state.feedError).toBe('');
      expect(state.visibleProducts).toHaveLength(36);
      expect(load.mock.calls.map(([query]) => query.current)).toEqual([1, 2, 2]);
    } finally { app.unmount(); }
  });

  it('筛选切换后旧追加回包不覆盖新列表', async () => {
    let finish!: (value: Awaited<ReturnType<CatalogVisualFixture['load']>>) => void;
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(1))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ current:1, size:24, total:1, records:records(99, 1) });
    const { app, state } = await mountCatalog(load);
    try {
      const previous = state.load(true);
      state.filter.keyword = '新查询';
      await state.load();
      finish(page(2));
      await previous;
      expect(state.list.map(product => product.id)).toEqual(['900719925474099399']);
      expect(state.total).toBe(1);
      expect(state.loadedPage).toBe(1);
    } finally { app.unmount(); }
  });

  it('采用服务端实际页大小，追加去重，卸载后不再应用迟到回包', async () => {
    let finish!: (value: Awaited<ReturnType<CatalogVisualFixture['load']>>) => void;
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(1, 20))
      .mockResolvedValueOnce({ ...page(2, 20), records:[...records(19, 1), ...records(20, 20)] })
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { app, state } = await mountCatalog(load);
    expect(state.size).toBe(20);
    await state.load(true);
    expect(load.mock.calls[1]![0]).toMatchObject({ current:2, size:20 });
    expect(state.list).toHaveLength(40);
    expect(new Set(state.list.map(product => product.id)).size).toBe(40);
    const pending = state.load(true);
    app.unmount();
    finish(page(3, 20));
    await pending;
    expect(state.list).toHaveLength(40);
    expect(state.loadedPage).toBe(2);
  });
  it('识图URL的文件标识无效时显示校验错误，不调用普通商品查询', async () => {
    const load = vi.fn<CatalogVisualFixture['load']>();
    const {app,state} = await mountCatalog(load,{imageFileId:['9001'] as unknown as string});
    try { expect(load).not.toHaveBeenCalled(); expect(state.loadError).toContain('图片标识无效'); }
    finally { app.unmount(); }
  });
  it('识图空页立即停止追加，保留已有结果和真实 total', async () => {
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce({current:2,size:24,total:50,records:[]});
    const {app,state} = await mountCatalog(load,{imageFileId:'9007199254740993123'});
    try {
      await state.load(true);
      expect(state.list).toHaveLength(24); expect(state.total).toBe(50); expect(state.hasMoreFeed).toBe(false);
      state.loadMoreFeed(); expect(load).toHaveBeenCalledTimes(2);
    } finally { app.unmount(); }
  });
  it('识图按已加载条数继续分页，不用页码乘页大小提前结束', async () => {
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(1,24,50))
      .mockResolvedValueOnce({current:2,size:24,total:50,records:records(24,1)})
      .mockResolvedValueOnce({current:3,size:24,total:50,records:records(25,1)})
      .mockResolvedValueOnce({current:4,size:24,total:50,records:records(26,1)});
    const {app,state} = await mountCatalog(load,{imageFileId:'9007199254740993123'});
    try {
      await state.load(true); await state.load(true);
      expect(state.list).toHaveLength(26); expect(state.hasMoreFeed).toBe(true);
      await state.load(true); expect(state.list).toHaveLength(27); expect(state.loadedPage).toBe(4);
    } finally { app.unmount(); }
  });
  it('识图业务失败保留后端提示，追加失败保留已有商品，可重试原页', async () => {
    const failure = new RequestError('图片暂时无法读取，请重新上传',{code:'-328'});
    const load = vi.fn<CatalogVisualFixture['load']>().mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(page(1)).mockRejectedValueOnce(failure).mockResolvedValueOnce(page(2));
    const {app,state} = await mountCatalog(load,{imageFileId:'9007199254740993123'});
    try {
      expect(state.loadError).toBe(failure.message); expect(state.list).toHaveLength(0);
      await state.load(); await state.load(true);
      expect(state.feedError).toBe(failure.message); expect(state.list).toHaveLength(24);
      await state.load(true); expect(state.feedError).toBe(''); expect(load.mock.calls.map(([q]) => q.current)).toEqual([1,1,2,2]);
    } finally { app.unmount(); }
  });
  it('识图条件变化立即清空旧结果并回到第一页，迟到旧页不写回', async () => {
    let old!: (value: Awaited<ReturnType<CatalogVisualFixture['load']>>) => void;
    let next!: (value: Awaited<ReturnType<CatalogVisualFixture['load']>>) => void;
    const load = vi.fn<CatalogVisualFixture['load']>().mockResolvedValueOnce(page(3,24,100))
      .mockImplementationOnce(() => new Promise(resolve => {old = resolve;}))
      .mockImplementationOnce(() => new Promise(resolve => {next = resolve;}));
    const {app,state,route} = await mountCatalog(load,{imageFileId:'9007199254740993123',page:'3',hint:'手机'});
    try {
      const pending = state.load(true);
      route.query.hint = '手机壳'; route.fullPath = '/product/list?changed';
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
      expect(state.current).toBe(1); expect(state.list).toHaveLength(0);
      expect(load.mock.calls[2]![0]).toMatchObject({current:1,hint:'手机壳'});
      next({current:1,size:24,total:1,records:records(99,1)});
      await vi.waitFor(() => expect(state.list).toHaveLength(1));
      old(page(4,24,100)); await pending; expect(state.list[0]?.id).toBe('900719925474099399');
    } finally { app.unmount(); }
  });

});

describe('v47 新接入契约与恢复边界', () => {
  const productId = '9007199254740993';
  const skuId = '9007199254740995';
  const groups = [{ name:'颜色', options:['黑', '白'] }];
  const sku = { id:skuId, specs:[{ name:'颜色', value:'黑' }], price:'9007199254740993.12345678', stock:2, enabled:true };

  it('驳回重提更新原求购，预算与业务ID保持原文，图片全量覆盖', async () => {
    const id = '9007199254740993123';
    const budget = '9999999999999999999999999999.12345678';
    const put = vi.spyOn(realOrderRequest, 'put').mockResolvedValue(id);
    const post = vi.spyOn(realOrderRequest, 'post');
    await createPurchase({id,productTitle:'求购手机',productDescription:'描述',categoryId:productId,addressId:skuId,budgetAmount:budget,expectedDays:1,overseasCustoms:false,aftersaleType:'none',appeal:'需要全新正品并提供发货照片',evidenceUrls:[]});
    expect(put).toHaveBeenCalledWith('/demands/update',expect.objectContaining({id,budget,addressId:skuId,images:[],expectDeliveryDays:1,afterSaleType:'NONE'}));
    expect(post).not.toHaveBeenCalled();
  });

  it('识图分页走独立接口、60秒期限，保留文件引用和服务端分页', async () => {
    const query = vi.spyOn(realOrderRequest, 'postQuery').mockResolvedValue({pageNo:2,pageSize:12,total:'30',records:[]});
    const result = await productApi.fetchStorefrontProducts({imageFileId:'9007199254740993123',hint:'手机',current:2,size:12,categoryId:productId});
    expect(query).toHaveBeenCalledWith('/storefront/search/images/page',expect.objectContaining({fileId:'9007199254740993123',hint:'手机',pageNo:2,pageSize:12,categoryId:productId}),expect.objectContaining({timeoutMs:60_000}));
    expect(result).toMatchObject({current:2,size:12,total:30,records:[]});
  });

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
    expect((await fetchHelpPage({ topic:'shopping', keyword:' 标题 ' })).records[0].body).toBeNull();
    expect(post.mock.calls[0][1]).toMatchObject({ topic:'shopping', keyword:'标题' });
    const get = vi.spyOn(realNotifyRequest, 'get').mockResolvedValue({ ...article, body:'<p>审核正文</p>' });
    expect((await fetchHelpDetail(productId)).id).toBe(productId);
    get.mockResolvedValueOnce({ ...article, body:null });
    await expect(fetchHelpDetail(productId)).rejects.toThrow('内容加载异常');
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

  it('一键生成只补缺失SKU，保留已有Long ID、价格、停用状态且拒绝超量', () => {
    const original = { id:'2117141212394250241', specs:[{ name:'颜色', value:'黑' }, { name:'容量', value:'128G' }], price:'999999999999.00000001', stock:'8', image:'https://example.com/sku.jpg', enabled:false };
    const state = { enabled:true, groups:[{ name:'颜色', options:['黑','白'] }, { name:'容量', options:['128G','256G'] }], skus:[original] };
    const missing = missingProductSkuCombinations(state);
    expect(missing).toHaveLength(3);
    expect(missing).toContainEqual([{ name:'颜色', value:'白' }, { name:'容量', value:'256G' }]);
    expect(state.skus).toEqual([original]);
    expect(missingProductSkuCombinations({ ...state, skus:[...state.skus, ...missing.map(specs => ({...original, id:undefined, specs}))] })).toEqual([]);
    expect(() => missingProductSkuCombinations({ ...state, groups:[{ name:'颜色', options:['黑',' 黑 '] }] })).toThrow('不能重复');
    expect(() => missingProductSkuCombinations({ ...state, groups:[{ name:'颜色', options:[''] }] })).toThrow('完整规格组');
    expect(() => missingProductSkuCombinations({ ...state, groups:[{ name:'甲', options:Array.from({length:15}, (_,i) => String(i)) }, { name:'乙', options:Array.from({length:15}, (_,i) => String(i)) }] })).toThrow('超过 200');
    expect(() => missingProductSkuCombinations({ ...state, skus:Array.from({length:199}, () => original) })).toThrow('保留已有规格');
  });

  it('运单识别透传业务code和取消信号，不以第三方编码替代且允许空候选', async () => {
    const controller = new AbortController();
    const row = { id:'2117141212394250241', code:'SF', name:'顺丰', enabled:true, defaultCarrier:false, customNameRequired:false, sortNo:0, expressCpCode:'shunfeng' };
    const get = vi.spyOn(realOrderRequest, 'get').mockResolvedValue([row]);
    expect(await detectCarriers(' SF123456789 ', {signal:controller.signal})).toEqual([row]);
    expect(get).toHaveBeenCalledWith('/orders/carriers/detect', {params:{trackingNo:'SF123456789'},signal:controller.signal,showError:false});
    get.mockResolvedValueOnce([]);
    expect(await detectCarriers('unknown')).toEqual([]);
    get.mockResolvedValueOnce([{...row, code:''}]);
    await expect(detectCarriers('invalid')).rejects.toThrow('识别结果异常');
    get.mockRejectedValueOnce(new Error('upstream unavailable'));
    await expect(detectCarriers('failed')).rejects.toThrow('upstream unavailable');
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
    const parameters = [{groupName:'主体',name:'型号',value:'A3721',explanation:'工业型号',highlighted:true}];
    const categories = [{id:productId,name:'手机'},{id:skuId,name:'拍照手机'}];
    const product = productApi.toProductRecord({ id:productId, title:'商品', price:'1', stock:1, categories, parameters } as Api.RealProduct.ProductDTO);
    expect(product.categories).toEqual(categories);
    expect(product.parameters).toEqual(parameters);
    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({...product, parameters:[]}));
    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({...product, categories:categories.slice(0,1)}));
    expect(validateProductDetails([productId,skuId],parameters)).toBeUndefined();
    expect(() => validateProductDetails([productId], [{name:'',value:'值'}])).toThrow('名称');

    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({ ...product, stock:2 }));
    expect(productEditSnapshot(product)).not.toBe(productEditSnapshot({ ...product, hasSku:true, specGroups:groups, skus:[sku] }));
    const draft = { version:1, ownerId:productId, productId:skuId, productSnapshot:'original', savedAt:Date.now(), imageFiles:[], form:{ title:'草稿', categoryId:productId, categoryIds:[productId,skuId], parameters, brandId:skuId, price:null, shippingFee:0, tax:0, stock:2, aftersaleType:'none', overseasCustoms:false, summary:'', description:'', images:[], amountTexts:{ price:sku.price, shippingFee:'0', tax:'0' }, skuEditor:{ enabled:true, groups, skus:[{ ...sku, price:sku.price, stock:'2', enabled:false, image:'https://example.com/sku.png' }] } } };
    const restored = readBuyerProductDraft(JSON.stringify(draft), productId, skuId);
    expect(restored.productSnapshot).toBe('original');
    expect(restored.form.categoryIds).toEqual([productId,skuId]);
    expect(restored.form.parameters).toEqual(parameters);
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
    const post = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ total: 21, pageSize: 10, records: [{ currency: 'USDT', id: '9007199254740993', bizType: 'ORDER_REFUND', amount: 1, toBalanceAfter: 0 }] });
    const result = await fetchWalletLedger({ current: 2, size: 10, bucket: 'lockedFinance', keyword: ' QA ', fromAt: '2026-09-05', toAt: '2026-09-05' });
    expect(post.mock.calls[0][1]).toMatchObject({ pageNo: 2, balanceType: 'FINANCE_LOCKED', keyword: 'QA', startAt: new Date('2026-09-05T00:00:00').getTime(), endAt: new Date('2026-09-05T23:59:59.999').getTime() });
    expect(result.total).toBe(21);
    expect(result.records[0].id).toBe('9007199254740993');
  });
  it('钱包及押金流水缺金额或余额时拒绝，不把异常响应补成零', async () => {
    const request = vi.spyOn(realUserRequest, 'postQuery');
    for (const read of [() => fetchWalletLedger({}), () => fetchBuyerDepositLedger()]) {
      for (const row of [{ amount: 1 }, { balanceAfter: 0, toBalanceAfter: 0 }, { amount: '', balanceAfter: 0, toBalanceAfter: 0 }]) {
        request.mockResolvedValue({ total: 1, records: [{ currency: 'USDT', id: '9007199254740993', bizType: 'PAY', ...row }] });
        await expect(read()).rejects.toThrow(/流水.*(?:尚未确认|格式异常)/);
      }
    }
  });
  it('钱包及押金流水保留零值、Long ID与小数原值，并启用原 token 解析', async () => {
    const request = vi.spyOn(realUserRequest, 'postQuery').mockResolvedValue({ total: 1, pageNo: 1, pageSize: 20, records: [{
      currency: 'USDT', id: '9007199254740993', userId: '9007199254740995', bizType: 'PAY',
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

  it('理财详情保留原Long和精确金额，拒绝另一产品或锁仓替代请求对象', async () => {
    const id = '9007199254740993';
    const detail = { id, lockDays: '30', heldDays: '2', remainingDays: '28', principal: '9007199254740993.12345678' };
    const get = vi.spyOn(realUserRequest, 'get').mockResolvedValue(detail);
    expect(await fetchFinanceProductDetail(id)).toMatchObject({ id, lockDays: 30 });
    expect(await fetchFinanceOrderDetail(id)).toMatchObject({ id, lockDays: 30, heldDays: 2, remainingDays: 28, principal: detail.principal });
    for (const actualId of ['9007199254740994', undefined, '', Number.MAX_SAFE_INTEGER + 1]) {
      get.mockResolvedValue({ ...detail, id: actualId });
      await expect(fetchFinanceProductDetail(id)).rejects.toThrow('请求对象不一致');
      await expect(fetchFinanceOrderDetail(id)).rejects.toThrow('请求对象不一致');
    }
  });

  it('累计利息精确合并总览中的已结算和待结算，合法零与缺失非法值分开', () => {
    expect(financeAccumulatedInterest({ totalInterest: '9007199254740993.12345678', pendingInterest: '0.00000001' }))
      .toBe('9007199254740993.12345679');
    expect(financeAccumulatedInterest({ totalInterest: '0', pendingInterest: 0 })).toBe('0');
    expect(financeAccumulatedInterest({ totalInterest: '0', pendingInterest: '0.14794520' })).toBe('0.1479452');
    expect(financeAccumulatedInterest(undefined)).toBeUndefined();
    for (const value of [undefined, null, '', ' ', 'invalid', '-1', NaN, Infinity, true]) {
      expect(financeAccumulatedInterest({ totalInterest: value as string, pendingInterest: '1' })).toBeUndefined();
      expect(financeAccumulatedInterest({ totalInterest: '1', pendingInterest: value as string })).toBeUndefined();
    }
  });

  it('充值和买手申请可由页面接管未知结果提示，保持原参数且不重试', async () => {
    const error = new RequestError('timeout', { code: 'REQUEST_TIMEOUT' });
    const post = vi.spyOn(realUserRequest, 'post').mockRejectedValue(error);
    const recharge = { chain: 'TRON', amount: 1 };
    const buyer = { realName: 'QA', contact: 'QA', reason: 'QA' };
    await expect(createRecharge(recharge, { showError: false })).rejects.toBe(error);
    await expect(submitBuyerApplication(buyer, { showError: false })).rejects.toBe(error);
    expect(post).toHaveBeenNthCalledWith(1, '/recharge/create', { ...recharge, asset: 'USDT', amount: '1' }, { showError: false });
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
    vi.spyOn(realUserRequest, 'get').mockResolvedValue({ currency: 'USDT', total: '12.34000000', todayIn: 0 });
    const result = await fetchWalletOverview('qa');
    expect(result.total).toBe('12.34000000');
    expect(result.account.available).toBeUndefined();
    expect(result.account.depositGuaranteed).toBeUndefined();
    expect(result.today).toEqual({ depositIn: '0', withdrawOut: undefined, internalVolume: undefined });
  });

  it('逐桶保留有效零与原精度，无效金额不覆盖其他有效桶', async () => {
    vi.spyOn(realUserRequest, 'get').mockResolvedValue({ currency: 'USDT', distribution: [
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

  it('提现最终确认按原始余额精确比较，不因Number舍入允许超额', () => {
    const params = { chain: 'TRON' as const, toAddress: 'T'.repeat(34), amount: 9007199254740992 };
    expect(prepareWithdrawal(params, '9007199254740991.99999999').error).toBe('可用余额不足');
    expect(prepareWithdrawal(params, '9007199254740992').error).toBe('');
    expect(prepareWithdrawal(params, '9007199254740992.00000001').error).toBe('');
    for (const balance of ['-1', 'Infinity', 'NaN']) {
      expect(prepareWithdrawal(params, balance).error).toBe('请先成功读取钱包余额');
    }
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

  it('订单单阶段沿用服务端实际页大小，不按较小的请求步长截掉本页尾部', async () => {
    vi.spyOn(realOrderRequest, 'post').mockResolvedValue({ total: 6, pageSize: 3, records: [1, 2, 3].map(index => ({
      orderId: `900719925474099${index}`, status: 'CREATED', stage: 'CREATED', totalAmount: '1',
      createdAt: new Date(Date.UTC(2026, 0, 10) - index * 1000).toISOString()
    })) });
    const result = await fetchMyOrders({ current: 1, size: 2, statuses: ['PENDING_PAYMENT'] });
    expect(result.size).toBe(3);
    expect(result.records.map(item => item.id)).toEqual([1, 2, 3].map(index => `900719925474099${index}`));
    expect(result.total).toBe(6);
  });

  it('钱包多原始类型合并时读取足够的较新流水，保留原始 Long ID', async () => {
    const request = vi.spyOn(realUserRequest, 'post').mockImplementation(async (_url, params) => {
      const q = params as Api.RealWallet.WalletLedgerPageQuery;
      const offset = ((q.pageNo || 1) - 1) * 2;
      return { total: 8, size: 2, records: Array.from({ length: 2 }, (_, i) => ({
        id: `${q.bizType}-900719925474099${offset + i}`,
        currency: 'USDT',
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

describe('锁仓确认金额快照', () => {
  it('起投金额移除接口尾零后可直接预览，保留真实精度并在身份重置时恢复', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id: 'qa-owner' } as Api.RealSession.UserRecord;
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const product: Api.RealFinance.FinanceProductVO = {
      id: '9007199254740993', name: 'QA', code: 'QA', annualRate: '0.365', lockDays: 1,
      minAmount: '1.00000000', maxAmount: '1000', earlyRedeemEnabled: false, status: 'ON_SALE'
    };
    const app = renderer.createApp({ ...InterestPreview, render: () => null }, { product, availableBalance: '1000' });
    app.provide(ssrContextKey, {});
    app.mount({});
    const state = (app as unknown as { _instance: { setupState: {
      amount: string; normalizedAmount?: string; expectedInterest?: string; estimatedTotal?: string; errMsg: string;
    } } })._instance.setupState;
    try {
      expect(state.amount).toBe('1');
      expect(state.normalizedAmount).toBe('1.00');
      expect(state.errMsg).toBe('');
      expect(state.expectedInterest).toBe('0.00100000');
      expect(state.estimatedTotal).toBe('1.001');
      state.amount = '2';
      user.sessionVersion += 1;
      await nextTick();
      expect(state.amount).toBe('1');
      product.minAmount = '1.00500000';
      user.sessionVersion += 1;
      await nextTick();
      expect(state.amount).toBe('1.005');
      expect(state.normalizedAmount).toBeUndefined();
      expect(state.errMsg).toContain('最多 2 位小数');
      state.amount = '9007199254740993.01';
      expect(state.normalizedAmount).toBe('9007199254740993.01');
    } finally { app.unmount(); }
  });

  it('确认期间本金改变立即撤销勾选，改回原金额也必须重新确认', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    setActivePinia(createPinia());
    const user = useUserStore();
    user.currentUser = { id: 'qa-owner' } as Api.RealSession.UserRecord;
    const renderer = createRenderer<object, object>({
      insert: () => undefined, remove: () => undefined, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText: () => undefined, setElementText: () => undefined, parentNode: () => null, nextSibling: () => null, patchProp: () => undefined
    });
    const subscribe = vi.fn();
    const product: Api.RealFinance.FinanceProductVO = {
      id: '9007199254740993', name: 'QA', code: 'QA', annualRate: '0.05', lockDays: 30,
      minAmount: '1', maxAmount: '1000', earlyRedeemEnabled: false, status: 'ON_SALE'
    };
    const app = renderer.createApp({ ...InterestPreview, render: () => null }, {
      product, availableBalance: '1000', onSubscribe: subscribe
    });
    app.provide(ssrContextKey, {});
    app.mount({});
    const state = (app as unknown as { _instance: { setupState: {
      amount: string; acknowledged: boolean; confirmVisible: boolean; openConfirm: () => void; submit: () => void;
    } } })._instance.setupState;
    try {
      state.openConfirm();
      state.acknowledged = true;
      state.amount = '2';
      expect(state.confirmVisible).toBe(false);
      expect(state.acknowledged).toBe(false);
      state.submit();
      expect(subscribe).not.toHaveBeenCalled();
      state.amount = '1';
      state.submit();
      expect(subscribe).not.toHaveBeenCalled();
      state.amount = '2';
      state.openConfirm();
      state.acknowledged = true;
      state.submit();
      expect(subscribe).toHaveBeenCalledExactlyOnceWith('2.00');
    } finally { app.unmount(); }
  });
});


describe('四种售后方式的角色和子状态边界', () => {
  const buyerId = '2117141212394250241';
  const sellerId = '2117141212394250242';
  const otherId = '2117141212394250243';
  const actions:Api.RealRefund.RefundAction[] = ['SELECT', 'RETURN_SHIP', 'RETURN_RECEIVE', 'EXCHANGE_SHIP', 'EXCHANGE_RECEIVE'];
  const cases:Array<[string, Api.RealRefund.RefundAction[], Api.RealRefund.RefundAction[]]> = [
    ['CONFIRMING', ['SELECT'], ['SELECT']], ['APPLYING', ['SELECT'], ['SELECT']],
    ['RETURNING', ['RETURN_SHIP'], []], ['RETURN_RECEIVING', [], ['RETURN_RECEIVE']],
    ['EXCHANGING', [], ['EXCHANGE_SHIP']], ['EXCHANGE_RECEIVING', ['EXCHANGE_RECEIVE'], []],
    ['PAYING', [], []], ['COMPLETED', [], []], ['AGREED', [], []], ['REJECTED', [], []], ['CANCELED', [], []], ['UNKNOWN_NEW_STATE', [], []]
  ];
  it.each(cases)('%s 只开放归属角色的当前步骤，未知状态不开放操作', (status, buyerActions, sellerActions) => {
    const refund:Api.RealRefund.RefundDTO = {refundId:'2117141212394250299', orderId:'2117141212394250300', buyerId, sellerId, status, refundType:'EXCHANGE'};
    for (const action of actions) {
      expect(refundActionAllowed(refund,buyerId,action)).toBe(buyerActions.includes(action));
      expect(refundActionAllowed(refund,sellerId,action)).toBe(sellerActions.includes(action));
      expect(refundActionAllowed(refund,otherId,action)).toBe(false);
    }
    expect(refundCapabilities(refund,buyerId).cancel).toBe(['CONFIRMING','APPLYING'].includes(status));
    expect(refundCapabilities(refund,sellerId).cancel).toBe(false);
    expect(refundCapabilities(refund,otherId).cancel).toBe(false);
  });
  it('无当前登录人或无归属字段时不允许选择、撤销或确认收发货', () => {
    const refund:Api.RealRefund.RefundDTO={refundId:'2117141212394250299',orderId:'2117141212394250300',status:'CONFIRMING'};
    expect(refundCapabilities(undefined,buyerId)).toEqual({buyer:false,seller:false,select:false,cancel:false,returnShip:false,returnReceive:false,exchangeShip:false,exchangeReceive:false});
    expect(refundCapabilities(refund,undefined).select).toBe(false);
    expect(refundCapabilities(refund,buyerId).select).toBe(false);
    expect(refundCapabilities({...refund,status:'EXCHANGE_RECEIVING'},undefined).exchangeReceive).toBe(false);
  });
  it.each(['WALLET','DEPOSIT'] as const)('售后赔偿 %s 请求保留Long ID和28+8金额原文，不注入员工ID', async compensationSource => {
    const params:Api.RealRefund.RefundOperateParams={refundId:'2117141212394250299',action:'SELECT',refundType:'COMPENSATION',compensationAmount:'9999999999999999999999999999.00000001',compensationSource,payPassword:'input-only',remark:'本次协商方案'};
    const before={...params};
    const put=vi.spyOn(realOrderRequest,'put').mockResolvedValue(null);
    await operateRefund(params);
    expect(put).toHaveBeenCalledExactlyOnceWith('/orders/refunds/operate',before,{showError:false});
    expect(put.mock.calls[0][1]).not.toHaveProperty('operatorId');
    expect(params).toEqual(before);
  });
});


describe('售后未知操作结果保护', () => {
  it('同值DTO回读和仍可执行SELECT的状态变化不解除未知提交，明确推进后才解除', () => {
    const refund = { refundId:'uncertain-long', buyerId:'buyer', sellerId:'seller', status:'CONFIRMING', refundType:'REFUND_ONLY' } as Api.RealRefund.RefundDTO;
    const key = 'seller-session-unknown-test';
    markRefundOperationUncertain(key, refund, 'SELECT');
    expect(refundOperationUncertain(key, { ...refund }, 'seller')).toBe(true);
    expect(refundOperationUncertain(key, { ...refund, status:'APPLYING' }, 'seller')).toBe(true);
    expect(refundOperationUncertain('other-session', refund, 'seller')).toBe(false);
    expect(refundOperationUncertain(key, { ...refund, status:'PAYING', refundType:'COMPENSATION' }, 'seller')).toBe(false);
  });
});


describe('三级分类关联规则', () => {
  it('四级数据不会进入可选目录，三级和上级均可选', () => {
    const options = createCategoryOptions([{id:'1',level:1,enabled:true,name:'一级',children:[{id:'2',parentId:'1',level:2,enabled:true,name:'二级',children:[{id:'3',parentId:'2',level:3,enabled:true,name:'三级',children:[{id:'4',parentId:'3',level:4,enabled:true,name:'四级'}]}]}]}]);
    expect(isSelectableCategory(options,'1')).toBe(true); expect(isSelectableCategory(options,'3')).toBe(true); expect(isSelectableCategory(options,'4')).toBe(false);
    expect(categoryApi.includeCategoryParents(options,['3'])).toEqual(['3','1','2']);
  });
});


describe('SHOP-77 识图搜索参数边界', () => {
  const id = '9007199254740993123';
  it.each(['', '0', '-1', '1.5', ' 12', 9001, ['9001']])('拒绝无效文件标识 %s，不降级为普通检索', async fileId => {
    const query = vi.spyOn(realOrderRequest,'postQuery');
    await expect(productApi.fetchStorefrontProducts({imageFileId:fileId as string})).rejects.toMatchObject({code:'INVALID_IMAGE_SEARCH'});
    expect(query).not.toHaveBeenCalled();
  });
  it('hint最多120字符，和keyword分别传递，价格保留8位小数及Long整数', async () => {
    const query = vi.spyOn(realOrderRequest,'postQuery').mockResolvedValue({pageNo:'1',pageSize:'20',total:'0',records:[]});
    const hint = '款'.repeat(120);
    await productApi.fetchStorefrontProducts({imageFileId:id,hint,minPrice:'9007199254740993.12345678',maxPrice:'9007199254740994.12345678',sort:'PRICE_ASC'});
    expect(query.mock.calls[0]![1]).toMatchObject({fileId:id,hint,keyword:undefined,minPrice:'9007199254740993.12345678',maxPrice:'9007199254740994.12345678',sortBy:'PRICE_ASC'});
    await expect(productApi.fetchStorefrontProducts({imageFileId:id,hint:hint+'款'})).rejects.toMatchObject({code:'INVALID_IMAGE_SEARCH'});
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('价格倒置或分页越界不发送，正常空页不当作业务错误', async () => {
    const query = vi.spyOn(realOrderRequest,'postQuery').mockResolvedValue({total:'0',records:[]});
    await expect(productApi.fetchStorefrontProducts({imageFileId:id,minPrice:'2',maxPrice:'1'})).rejects.toThrow('最低价格');
    await expect(productApi.fetchStorefrontProducts({imageFileId:id,size:501})).rejects.toThrow('分页参数');
    await expect(productApi.fetchStorefrontProducts({imageFileId:id})).resolves.toMatchObject({total:0,records:[]});
    expect(query).toHaveBeenCalledTimes(1);
  });
});


describe('VIP exact integer values', () => {
  it('retains thresholds beyond Number precision', async () => {
    const { readPointInteger } = await import('./point');
    expect(readPointInteger('9223372036854775807', 'threshold')).toBe('9223372036854775807');
    expect(() => readPointInteger(9007199254740992, 'threshold')).toThrow();
    expect(readPointInteger(undefined, 'threshold', true)).toBeUndefined();
  });
});
