// Independent DEV-only read-only visual entry. Not imported by the production entry or build.
import { createApp, defineComponent, h, readonly, ref } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import DefaultLayout from '@/layouts/default.vue';
import HomeView from '@/views/home/index.vue';
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
  feedRecords: (() => {
    const groups = categories.map(category => records.filter(product => product.categoryPath === category.name));
    const result: VisualProductRecord[] = [];
    for (let i = 0; groups.some(group => group[i]); i++) for (const group of groups) if (group[i]) result.push(group[i]);
    return result;
  })(),
  categories
};
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', name: 'home', component: HomeView },
  { path: '/product/list', name: 'product-list', component: HomeView },
  { path: '/product/:id', name: 'product-detail', component: HomeView },
  { path: '/:pathMatch(.*)*', component: HomeView }
] });
const Host = defineComponent({
  setup() { return () => h(TooltipProvider, { delayDuration: 300 }, () => h(DefaultLayout, {}, {
    default: () => h(HomeView, { visualFixture: fixture })
  })); }
});
const app = createApp(Host);
app.use(createPinia());
app.use(router);
app.provide(categoryNavigationKey, { categories: readonly(ref(categories)), loading: readonly(ref(false)),
  loadError: readonly(ref('')), activeMenu: ref(null), loadCategories: async () => {} });
void router.isReady().then(async () => { await router.replace({ name: 'home' }); app.mount('#app'); });
