import { onBeforeUnmount, ref, watch } from 'vue';
import { fetchCurrentProductCards } from '@/service/api/product-cards';

/** 页面内合并查询，跨会话、身份或权限变化立即清空，不缓存可购买状态。 */
export function useAiProductCards(ids: () => string[], scope: () => unknown, enabled = () => true) {
  const products = ref<Record<string, Api.Ai.CurrentProduct>>({});
  const loading = ref(false);
  const error = ref('');
  let controller: AbortController | undefined;
  let version = 0;
  async function refresh() {
    controller?.abort();
    const operation = ++version;
    const owner = JSON.stringify(scope());
    const requested = [...new Set(ids())];
    products.value = {};
    error.value = '';
    loading.value = false;
    if (!enabled() || !requested.length) return;
    controller = new AbortController();
    loading.value = true;
    try {
      const result = await fetchCurrentProductCards(requested, controller.signal);
      if (operation === version && owner === JSON.stringify(scope()) && enabled()) products.value = result;
    } catch {
      if (operation === version && owner === JSON.stringify(scope()) && enabled()) error.value = '商品信息暂时无法加载';
    } finally { if (operation === version) loading.value = false; }
  }
  watch(() => JSON.stringify([ids(), scope(), enabled()]), () => { void refresh(); }, { immediate: true, flush: 'sync' });
  onBeforeUnmount(() => { version++; controller?.abort(); products.value = {}; });
  return { products, loading, error, refresh };
}
