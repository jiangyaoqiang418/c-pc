// Independent DEV-only read-only visual entry. Not imported by the production entry or build.
import { createApp, defineComponent, h, nextTick, onBeforeUnmount, readonly, ref } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import DefaultLayout from '@/layouts/default.vue';
import HomeView from '@/views/home/index.vue';
import WalletView from '@/views/wallet/index.vue';
import CatalogView from '@/views/product/list.vue';
import V47DetailGallery from '@/components/product/v47-detail-gallery.vue';
import V47DetailShare from '@/components/product/v47-detail-share.vue';
import V47DetailPreview from '@/components/product/v47-detail-preview.vue';
import BusinessDialog from '@/components/common/business-dialog.vue';
import ImagePreview from '@/components/common/image-preview.vue';
import MessageInput from '@/components/im/message-input.vue';
import MessageBubble from '@/components/im/message-bubble.vue';
import ProductCard from '@/components/product/product-card.vue';
import BuyerProductSkus from '@/components/buyer/buyer-product-skus.vue';
import type { ProductSkuEditorState } from '@/utils/product-sku';
import AmountInput from '@/components/common/amount-input.vue';
import FeedbackHost from '@/components/common/feedback-host.vue';
import { Modal } from '@/lib/feedback';
import { categoryNavigationKey } from '@/composables/use-category-navigation';
import { DEFAULT_UI_THEME, UI_THEMES } from '@/composables/use-ui-theme';
import { useUserStore } from '@/stores';
import type { CatalogVisualFixture, HomeVisualFixture, VisualProductRecord } from '@/visual/types';
import type { WalletVisualFixture } from '@/components/wallet/v47-types';
import data from '@/visual/v47-reference-data.json';
import FormStates from '@/visual/v47-form-states.vue';
import './styles/tokens.scss';
import './styles/shop.scss';
import './styles/chat.scss';
import './styles/main.css';

if (!import.meta.env.DEV) throw new Error('The visual reference entry is development-only.');
const assets = import.meta.glob<string>('./visual/assets/**/*', { eager: true, query: '?url', import: 'default' });
const records = (data.records as VisualProductRecord[]).map(product => ({ ...product,
  images: product.images.map(image => ({ ...image, url: assets['./visual/assets/' + image.url] }))
}));
const categories = data.categories as Api.RealCategory.DisplayCategoryNode[];
const fixture: HomeVisualFixture = {
  recommendations: ['1', '14', '27', '43', '32', '21', '24', '30', '36', '17'].map(id => records.find(record => record.id === id)!),
  hot: [...records].sort((a, b) => b.salesCount - a.salesCount).slice(0, 20),
  newest: [...records].reverse().slice(0, 20),
  rankingProducts: ['3', '6', '1'].map(id => records.find(record => record.id === id)!),
  discoveryProducts: [['1', '3'], ['4', '8'], ['6', '5']].map(ids => ids.map(id => records.find(record => record.id === id)!)),
  feedRecords: (() => {
    const groups = categories.map(category => records.filter(product => product.categoryPath === category.name));
    const result: VisualProductRecord[] = [];
    for (let i = 0; groups.some(group => group[i]); i++) for (const group of groups) if (group[i]) result.push(group[i]);
    return result;
  })(),
  categories
};
// Component states use the same existing read-only reference assets. No account or write API is involved.
const visualParams = new URLSearchParams(window.location.search);
const view = visualParams.get('view');
// Use the composable's in-memory storage-event observer, without persisting a
// palette or changing another same-origin production tab's saved preference.
function setVisualTheme(id: string | null) {
  const theme = UI_THEMES.find(item => item.id === id)?.id || DEFAULT_UI_THEME;
  window.dispatchEvent(new StorageEvent('storage', { key: 'um.uiTheme', newValue: theme }));
}
window.addEventListener('storage', event => {
  if (event.isTrusted && (event.key === 'um.uiTheme' || event.key === null)) event.stopImmediatePropagation();
}, true);
document.addEventListener('click', event => {
  const option = event.target instanceof Element ? event.target.closest('.theme-option') : null;
  if (!option) return;
  const theme = UI_THEMES.find(item => item.name === option.querySelector('strong')?.textContent);
  if (!theme) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  setVisualTheme(theme.id);
}, true);
setVisualTheme(visualParams.get('theme'));
// Matches a fresh prototype wallet: balance 2,400 USDT, no transactions or orders.
// WalletView short-circuits all account/ledger reads when visualFixture is supplied.
const walletFixture: WalletVisualFixture = {
  account: { userId: 'visual-only', userName: 'visual-only', available: '2400', nonWithdrawable: '0', lockedFinance: '0',
    frozenOrder: '0', frozenRisk: '0', depositAvailable: '0', depositGuaranteed: '0', interestAccrued: '0',
    payPwdSet: false, frozen: false, updatedAt: '' },
  totalAssets: '2400', today: { depositIn: '0', withdrawOut: '0' }, recentTxns: [], showProductionDetails: false
};
// Deterministic source records are only supplied by this development entry.
// No request failure can enable this path in the production app.
const catalogFixture: CatalogVisualFixture = {
  async load(query) {
    const keyword = query.keyword?.trim().toLocaleLowerCase();
    const categoryIds = new Set<string>();
    function includeCategory(nodes: readonly Api.RealCategory.DisplayCategoryNode[], include = false) {
      for (const node of nodes) {
        const selected = include || node.id === String(query.categoryId);
        if (selected) categoryIds.add(node.id);
        includeCategory(node.children || [], selected);
      }
    }
    includeCategory(categories);
    const selected = records.filter(product => (!keyword || [product.title, product.brandName, product.summary].some(value => value?.toLocaleLowerCase().includes(keyword)))
      && (!query.categoryId || categoryIds.has(String(product.categoryId)))
      && (!query.aftersaleType || product.aftersaleType === query.aftersaleType)
      && (!query.overseasCustoms || product.overseasCustoms)
      && (query.minPrice === undefined || Number(product.price) >= query.minPrice)
      && (query.maxPrice === undefined || Number(product.price) <= query.maxPrice));
    if (query.sort === 'SALES') selected.sort((a, b) => b.salesCount - a.salesCount);
    if (query.sort === 'NEW') selected.reverse();
    if (query.sort === 'PRICE_ASC') selected.sort((a, b) => Number(a.price) - Number(b.price));
    if (query.sort === 'PRICE_DESC') selected.sort((a, b) => Number(b.price) - Number(a.price));
    const current = query.current || 1;
    const size = query.size || 20;
    return { current, size, total:selected.length, records:selected.slice((current - 1) * size, current * size) };
  }
};
const ComponentStates = defineComponent({
  setup() {
    const share = ref(false);
    const photo = ref(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const motionSamples = ref('');
    let motionFrame: number | undefined;
    function reverseModal(kind: 'share' | 'photo') {
      if (timers.length || motionFrame !== undefined) return;
      motionSamples.value = '';
      const started = performance.now();
      const samples: unknown[] = [];
      const nodes = new WeakMap<Element, number>();
      let sequence = 0;
      function sample() {
        const at = performance.now() - started;
        samples.push({ at, masks:[...document.querySelectorAll('.modal-overlay')].map(mask => {
          if (!nodes.has(mask)) nodes.set(mask, ++sequence);
          const dialog = mask.querySelector('.dialog');
          return { node:nodes.get(mask), opacity:getComputedStyle(mask).opacity, class:mask.className,
            transform:dialog ? getComputedStyle(dialog).transform : '', height:dialog?.getBoundingClientRect().height };
        }) });
        if (at < 1650) motionFrame = requestAnimationFrame(sample);
        else { motionFrame = undefined; motionSamples.value = JSON.stringify(samples); }
      }
      motionFrame = requestAnimationFrame(sample);
      for (const [delay, value] of [[300, true], [420, false], [500, true], [1300, false]] as const) {
        const timer = setTimeout(() => { timers.splice(timers.indexOf(timer), 1); (kind === 'share' ? share : photo).value = value; }, delay);
        timers.push(timer);
      }
    }
    onBeforeUnmount(() => { for (const timer of timers) clearTimeout(timer); if (motionFrame !== undefined) cancelAnimationFrame(motionFrame); });
    const product = records[0]!;
    return () => h('div', { class: 'product-detail' }, [
      h(V47DetailGallery, { images: product.images, title: product.title, onShare: () => { share.value = true; } }),
      h('section', { class: 'product-info' }, [
        h('span', { class: 'eyebrow' }, product.brandName + ' / ' + product.categoryPath),
        h('h1', product.title), h('p', { class: 'subtitle' }, product.summary),
        h('button', { type: 'button', class: 'outline', onClick: () => { photo.value = true; } }, '查看评价配图'),
        h('button', { type:'button', class:'outline', onClick:() => reverseModal('share') }, '测试分享弹窗快速开关'),
        h('button', { type:'button', class:'outline', onClick:() => reverseModal('photo') }, '测试评价配图快速开关'),
        h('output', { 'data-motion-samples':'', class:'sr-only' }, motionSamples.value)
      ]),
      h(V47DetailShare, { modelValue: share.value, 'onUpdate:modelValue': (value: boolean) => { share.value = value; }, url: 'http://127.0.0.1:4173/#/product/1' }),
      h(V47DetailPreview, { modelValue: photo.value, 'onUpdate:modelValue': (value: boolean) => { photo.value = value; }, images: product.images.map(image => image.url), title: '评价配图', review: true })
    ]);
  }
});
// Local component checks only: no service calls, account mutation or business submission.
const LocalControls = defineComponent({
  setup() {
    const dialog = ref(false);
    const preview = ref(false);
    const amount = ref('2.22345678');
    const busy = ref(false);
    const messagePending = ref(false);
    const localMessage = ref('');
    const localContext = ref(0);
    function blockLocalMedia(event: Event) {
      if (event.target instanceof Element && event.target.closest('.media-toolbar')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    let confirmation: ReturnType<typeof Modal.confirm> | undefined;
    onBeforeUnmount(() => confirmation?.close());
    return () => h('section', { class: 'buyer-panel' }, [
      h('h1', '本地组件验收'),
      h('div', { class: 'buyer-form-actions' }, [
        h('button', { type:'button', class:'outline', onClick:() => { dialog.value = true; } }, '打开公共弹窗'),
        h('button', { type:'button', class:'outline', onClick:() => { preview.value = true; } }, '查看图片预览')
      ]),
      h('label', ['精确金额输入', h(AmountInput, { exactDecimal:true, precision:8, rawValue:amount.value,
        'onUpdate:rawValue':(value: string) => { amount.value = value; } })]),
      h('output', { 'aria-label':'当前原始金额' }, amount.value),
      h('section', { 'data-local-composer':'', onClickCapture:blockLocalMedia }, [
        h('h2', '本地聊天输入'),
        h('p', '仅记录本地文本，不发送消息；媒体入口不执行操作。'),
        h(MessageInput, { submitting:messagePending.value, contextKey:String(localContext.value),
          onSend:(payload: { type:string; content?:string }) => {
            if (payload.type !== 'text') return;
            localMessage.value = payload.content || '';
            messagePending.value = true;
          } }),
        h('output', { 'aria-label':'本地已记录文本' }, localMessage.value),
        h('button', { type:'button', class:'outline', onClick:() => { messagePending.value = false; } }, '结束本地发送等待'),
        h('button', { type:'button', class:'outline', onClick:() => { localContext.value += 1; messagePending.value = false; } }, '切换本地会话')
      ]),
      h(BusinessDialog, { visible:dialog.value, title:'本地弹窗交互', okLoading:busy.value,
        'onUpdate:visible':(value: boolean) => { dialog.value = value; } }, () => [
        h('label', ['本地测试输入', h('input', { 'aria-label':'本地测试输入' })]),
        h('p', '仅检查键盘、焦点和关闭行为，不执行任何业务。'),
        h('button', { type:'button', class:'outline', onClick:() => { busy.value = !busy.value; } }, busy.value ? '解除本地忙碌' : '模拟本地忙碌'),
        h('button', { type:'button', class:'outline', disabled:busy.value, onClick:() => {
          confirmation = Modal.confirm({ title:'本地二级确认', content:'只检查确认弹层的焦点、取消和父弹窗恢复，不提交业务。' });
        } }, '打开二级确认')
      ]),
      h(ImagePreview, { modelValue:preview.value, images:records[0]!.images.map(image => image.url),
        'onUpdate:modelValue':(value: boolean) => { preview.value = value; } })
    ]);
  }
});
// Explicit boundary samples: local component state only; no uploads or submissions.
const BoundaryStates = defineComponent({
  setup() {
    const price = '9'.repeat(28) + '.12345678';
    const product = { ...records[0]!, brandName:'BoundaryBrand'.repeat(6), title:'长标题与精确金额边界'.repeat(8), price };
    const groups = [0, 1].map(index => ({ name:String.fromCharCode(65 + index).repeat(32), options:['X'.repeat(64), 'Y'.repeat(64)] }));
    const skus = ref<ProductSkuEditorState>({ enabled:true, groups, skus:[0, 1, 2, 3].map(index => ({
      id:'local-sku-' + index, specs:groups.map((group, groupIndex) => ({ name:group.name, value:group.options[index >> groupIndex & 1] })),
      price, stock:index === 0 ? '2147483647' : '0', enabled:true, image:''
    })) });
    function blockBoundaryUpload(event: Event) {
      if (event.target instanceof Element && event.target.closest('.evidence')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    // Silent PCM is generated locally to exercise the browser decoder, without a file or microphone.
    const wav = new Uint8Array(44 + 8000 * 2 * 30);
    const header = new DataView(wav.buffer);
    for (const [offset, value] of [[0,'RIFF'], [8,'WAVE'], [12,'fmt '], [36,'data']] as const) {
      for (let index = 0; index < value.length; index++) wav[offset + index] = value.charCodeAt(index);
    }
    header.setUint32(4, wav.length - 8, true); header.setUint32(16, 16, true);
    header.setUint16(20, 1, true); header.setUint16(22, 1, true); header.setUint32(24, 8000, true);
    header.setUint32(28, 16000, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true);
    header.setUint32(40, wav.length - 44, true);
    const mediaUrls = [URL.createObjectURL(new Blob([wav], { type:'audio/wav' })), URL.createObjectURL(new Blob([wav], { type:'audio/wav' }))];
    const message = ref<Api.RealNotify.ImMessageVO>({ id:'local-media', conversationId:'local-only', msgType:'VOICE', mediaUrl:mediaUrls[0], duration:30, senderName:'本地媒体验收' });
    const mediaVisible = ref(true);
    const mediaState = ref('');
    function changeLocalMedia(action: 'recall' | 'source' | 'remove' | 'reset') {
      const previous = document.querySelector<HTMLMediaElement>('[data-local-media] audio');
      if (action === 'remove') mediaVisible.value = false;
      else {
        mediaVisible.value = true;
        message.value = { ...message.value, recalled:action === 'recall', mediaUrl:action === 'source' ? mediaUrls[1] : mediaUrls[0] };
      }
      void nextTick(() => { mediaState.value = JSON.stringify({ action, previous:previous ? {
        paused:previous.paused, source:previous.getAttribute('src'), readyState:previous.readyState, connected:previous.isConnected
      } : null }); });
    }
    onBeforeUnmount(() => { for (const url of mediaUrls) URL.revokeObjectURL(url); });
    return () => h('section', { class:'buyer-panel', 'data-local-boundaries':'' }, [
      h('h1', '本地前端边界验收'), h('p', '只用本地长文本、金额与媒体；不上传、不发布、不发送业务消息。'),
      h('div', { class:'product-grid' }, [h(ProductCard, { product, demo:true })]),
      h('div', { class:'buyer-content' }, [h('form', { class:'buyer-editor', onSubmit:(event: Event) => event.preventDefault() }, [
        h('div', { class:'buyer-editor-fields', style:{ minWidth:0 } }, [h('section', { class:'paper', onClickCapture:blockBoundaryUpload }, [
          h(BuyerProductSkus, { modelValue:skus.value, contextKey:'local-boundary',
            'onUpdate:modelValue':(value: ProductSkuEditorState) => { skus.value = value; } })
        ])])
      ])]),
      h('section', { 'data-local-media':'' }, [h('h2', '本地媒体生命周期'),
        mediaVisible.value ? h(MessageBubble, { msg:message.value, side:'left' }) : h('p', '本地媒体已移除'),
        ...([['reset','恢复本地媒体'], ['recall','本地模拟撤回'], ['source','切换本地媒体源'], ['remove','移除本地媒体']] as const)
          .map(([action, label]) => h('button', { type:'button', class:'outline', onClick:() => changeLocalMedia(action) }, label)),
        h('output', { 'data-local-media-state':'', style:{ overflowWrap:'anywhere' } }, mediaState.value)
      ])
    ]);
  }
});
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', name: 'home', component: HomeView },
  { path: '/product/list', name: 'product-list', component: CatalogView },
  { path: '/product/:id', name: 'product-detail', component: HomeView },
  { path: '/wallet', name: 'wallet', component: WalletView, meta: { title: '我的钱包' } },
  { path: '/:pathMatch(.*)*', component: HomeView }
] });
const Host = defineComponent({
  setup() { return () => h(TooltipProvider, { delayDuration: 300 }, () => [h(DefaultLayout, {}, {
    default: () => view === 'gallery' ? h(ComponentStates)
      : view === 'components' ? h(LocalControls)
      : view === 'boundaries' ? h(BoundaryStates)
      : view === 'forms' ? h(FormStates, { images:records.slice(0, 6).map(product => product.images[0]!.url) })
      : view === 'catalog' ? h(CatalogView, { visualFixture:catalogFixture })
      : view === 'wallet' ? h(WalletView, { visualFixture: walletFixture }) : h(HomeView, { visualFixture: fixture })
  }), h(FeedbackHost)]); }
});
const app = createApp(Host);
const visualPinia = createPinia();
app.use(visualPinia);
// Same-origin production tabs may hold a real session. Keep identity/audience
// actions inert in this app instance without reading, clearing or rewriting it.
const visualUser = useUserStore(visualPinia);
visualUser.init = async () => {};
visualUser.syncExternalSession = async () => false;
visualUser.setAudience = () => false;
visualUser.logout = () => {};
app.use(router);
app.provide(categoryNavigationKey, { categories: readonly(ref(categories)), loading: readonly(ref(false)),
  loadError: readonly(ref('')), activeMenu: ref(null), loadCategories: async () => {} });
// Only the local memory route changes. No production router guards or user init run.
void router.isReady().then(async () => {
  await router.replace(view === 'catalog' ? { name:'product-list' } : view === 'wallet' ? { name: 'wallet' } : view === 'gallery' ? { name: 'product-detail', params: { id: '1' } } : { name: 'home' });
  app.mount('#app');
});
