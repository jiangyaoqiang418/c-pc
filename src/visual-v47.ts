// Independent DEV-only read-only visual entry. Not imported by the production entry or build.
import { createApp, defineComponent, h, readonly, ref } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import DefaultLayout from '@/layouts/default.vue';
import HomeView from '@/views/home/index.vue';
import V47DetailGallery from '@/components/product/v47-detail-gallery.vue';
import V47DetailShare from '@/components/product/v47-detail-share.vue';
import V47DetailPreview from '@/components/product/v47-detail-preview.vue';
import { categoryNavigationKey } from '@/composables/use-category-navigation';
import type { HomeVisualFixture, VisualProductRecord } from '@/visual/types';
import data from '@/visual/v47-reference-data.json';
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
const view = new URLSearchParams(window.location.search).get('view');
const ComponentStates = defineComponent({
  setup() {
    const share = ref(false);
    const photo = ref(false);
    const product = records[0]!;
    return () => h('div', { class: 'product-layout' }, [
      h(V47DetailGallery, { images: product.images, title: product.title, onShare: () => { share.value = true; } }),
      h('section', { class: 'product-info' }, [
        h('span', { class: 'eyebrow' }, product.brandName + ' / ' + product.categoryPath),
        h('h1', product.title), h('p', { class: 'lead' }, product.summary),
        h('button', { type: 'button', class: 'outline', onClick: () => { photo.value = true; } }, '查看评价配图')
      ]),
      h(V47DetailShare, { modelValue: share.value, 'onUpdate:modelValue': (value: boolean) => { share.value = value; }, url: 'http://127.0.0.1:4173/#/product/1' }),
      h(V47DetailPreview, { modelValue: photo.value, 'onUpdate:modelValue': (value: boolean) => { photo.value = value; }, images: product.images.map(image => image.url), title: '评价配图', review: true })
    ]);
  }
});
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', name: 'home', component: HomeView },
  { path: '/product/list', name: 'product-list', component: HomeView },
  { path: '/product/:id', name: 'product-detail', component: HomeView },
  { path: '/:pathMatch(.*)*', component: HomeView }
] });
const Host = defineComponent({
  setup() { return () => h(TooltipProvider, { delayDuration: 300 }, () => h(DefaultLayout, {}, {
    default: () => view === 'gallery' ? h(ComponentStates) : h(HomeView, { visualFixture: fixture })
  })); }
});
const app = createApp(Host);
app.use(createPinia());
app.use(router);
app.provide(categoryNavigationKey, { categories: readonly(ref(categories)), loading: readonly(ref(false)),
  loadError: readonly(ref('')), activeMenu: ref(null), loadCategories: async () => {} });
void router.isReady().then(async () => { await router.replace({ name: 'home' }); app.mount('#app'); });
