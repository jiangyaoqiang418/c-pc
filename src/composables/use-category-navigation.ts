import { inject, onBeforeUnmount, onMounted, readonly, ref, type InjectionKey } from 'vue';
import * as categoryApi from '@/service/api/category';
import { createLatestRequestGuard } from '@/utils/latest-request';

// 页头与首页分类栏复用公开分类读取，不保存到本地，也不回退演示数据。
const categories = ref<Api.RealCategory.DisplayCategoryNode[]>([]);
const loading = ref(false);
const loadError = ref('');
const activeMenu = ref<string | null>(null);
const requestGuard = createLatestRequestGuard();
let consumers = 0;
let loadedAt = 0;
let pending: Promise<void> | undefined;

async function loadCategories(force = false): Promise<void> {
  if (pending) return pending;
  if (!force && loadedAt && Date.now() - loadedAt < 60_000) return;
  const isCurrent = requestGuard.begin();
  loading.value = true;
  loadError.value = '';
  const task = (async () => {
    try {
      const next = await categoryApi.fetchCategoryTree({ signal: isCurrent.signal });
      if (!isCurrent()) return;
      categories.value = next;
      loadedAt = Date.now();
    } catch {
      if (isCurrent()) loadError.value = '分类加载失败，请重试';
    } finally {
      if (isCurrent()) {
        loading.value = false;
        pending = undefined;
      }
    }
  })();
  pending = task;
  return task;
}

function realNavigation() {
  return { categories: readonly(categories), loading: readonly(loading), loadError: readonly(loadError), activeMenu, loadCategories };
}
export type CategoryNavigation = ReturnType<typeof realNavigation>;
// The separate development-only visual entry provides readonly reference data. Normal routes use real APIs.
export const categoryNavigationKey: InjectionKey<CategoryNavigation> = Symbol('category-navigation');

export function useCategoryNavigation(): CategoryNavigation {
  const provided = inject(categoryNavigationKey, undefined);
  if (provided) return provided;
  onMounted(() => {
    consumers += 1;
    void loadCategories();
  });
  onBeforeUnmount(() => {
    consumers -= 1;
    if (consumers) return;
    requestGuard.invalidate();
    categories.value = [];
    loading.value = false;
    loadError.value = '';
    activeMenu.value = null;
    loadedAt = 0;
    pending = undefined;
  });
  return realNavigation();
}
