import { reactive, watch } from 'vue';
import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { cancelProductFavorite, fetchFavoriteStates, toggleProductFavorite } from '@/service/api/product';

interface FavoriteEntry { value?: boolean; loading: boolean; writing: boolean; error: string; target?: boolean }

/** 同屏卡片合并读取，账号变化时清空；任何未知写入只按原目标状态恢复。 */
export const useProductFavoritesStore = defineStore('product-favorites', () => {
  const user = useUserStore();
  const entries = reactive<Record<string, FavoriteEntry>>(Object.create(null));
  const readVersions = new Map<string, number>();
  let generation = 0;
  let queued = new Map<string, Api.RealProduct.Id>();
  let scheduled = false;

  function entry(id: Api.RealProduct.Id) {
    return entries[String(id)] ??= { loading: false, writing: false, error: '' };
  }

  watch([() => user.currentUser?.id, () => user.sessionVersion], () => {
    generation += 1;
    queued.clear();
    readVersions.clear();
    for (const key of Object.keys(entries)) delete entries[key];
  }, { flush: 'sync' });

  async function refresh(ids: Api.RealProduct.Id[]) {
    if (user.currentUser?.id === undefined || !ids.length) return;
    const context = generation;
    const selected = [...new Map(ids.map(id => [String(id), id])).values()];
    const targets = selected.map(id => entry(id));
    const versions = selected.map(id => {
      const key = String(id);
      const version = (readVersions.get(key) ?? 0) + 1;
      readVersions.set(key, version);
      return version;
    });
    const isLatest = (index: number) => readVersions.get(String(selected[index])) === versions[index];
    targets.forEach(item => { item.loading = true; item.error = ''; });
    try {
      const states = await fetchFavoriteStates(selected);
      if (context !== generation) return;
      selected.forEach((id, index) => { if (isLatest(index)) targets[index].value = states.get(String(id)); });
    } catch (error) {
      if (context !== generation) return;
      targets.forEach((item, index) => { if (isLatest(index)) { item.value = undefined; item.error = '收藏状态读取失败，点击重试'; } });
      throw error;
    } finally {
      if (context === generation) targets.forEach((item, index) => { if (isLatest(index)) item.loading = false; });
    }
  }

  function ensure(id: Api.RealProduct.Id) {
    if (user.currentUser?.id === undefined) return;
    const item = entry(id);
    if (item.value !== undefined || item.loading || item.writing || queued.has(String(id))) return;
    queued.set(String(id), id);
    if (scheduled) return;
    scheduled = true;
    void Promise.resolve().then(async () => {
      scheduled = false;
      const ids = [...queued.values()].filter(id => !entry(id).loading && !entry(id).writing);
      queued = new Map();
      try { await refresh(ids); } catch { /* 每张卡片保留可重试的未知态。 */ }
    });
  }

  async function change(id: Api.RealProduct.Id, desired?: boolean) {
    if (user.currentUser?.id === undefined) throw new Error('请先登录后再收藏');
    const item = entry(id);
    if (item.loading || item.writing) return;
    queued.delete(String(id));
    const context = generation;
    item.writing = true;
    try {
      // 丢响应后先查原目标；用户这次点击不会把已成功的操作反向撤销。
      const pendingTarget = desired ?? item.target;
      if (item.value === undefined || pendingTarget !== undefined) await refresh([id]);
      if (context !== generation) return;
      if (pendingTarget !== undefined && item.value === pendingTarget) {
        item.target = undefined;
        return item.value;
      }
      const target = pendingTarget ?? !item.value;
      item.target = target;
      let writeError: unknown;
      try {
        if (target) await toggleProductFavorite(id, { showError: false });
        else await cancelProductFavorite(id, { showError: false });
      } catch (error) { writeError = error; }
      if (context !== generation) return;
      await refresh([id]);
      if (context !== generation) return;
      if (item.value !== target) {
        item.target = undefined;
        throw writeError ?? new Error('收藏状态尚未更新，请重试');
      }
      item.target = undefined;
      return item.value;
    } finally {
      if (context === generation) item.writing = false;
    }
  }

  return { entries, ensure, refresh, toggle: (id: Api.RealProduct.Id) => change(id), set: (id: Api.RealProduct.Id, target: boolean) => change(id, target) };
});
