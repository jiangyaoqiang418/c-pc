<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const router = useRouter();
const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.PurchaseRequest.RequestStatus[];
}

const TABS: TabDef[] = [
  { key: 'all',       label: '全部' },
  { key: 'pending',   label: '待审核', statuses: ['pending_audit'] },
  { key: 'pushing',   label: '推送中', statuses: ['pushing'] },
  { key: 'claimed',   label: '已接单', statuses: ['claimed'] },
  { key: 'rejected',  label: '已驳回', statuses: ['rejected'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled'] }
];

const activeKey = ref('all');
const list = ref<Api.RealPurchase.Record[]>([]);
const loading = ref(false);
const allList = ref<Api.RealPurchase.Record[]>([]);
const loadError = ref('');
const cancelingId = ref<string | number>();
const allListGuard = createLatestRequestGuard();
const listGuard = createLatestRequestGuard();
let writeVersion = 0;
let disposed = false;

async function loadAll() {
  await userStore.init();
  if (disposed) return;
  const user = userStore.currentUser;
  const isCurrent = allListGuard.begin();
  if (!user || disposed) {
    allList.value = [];
    return;
  }
  try {
    const r = await purchaseApi.fetchMyPurchases(user.id, undefined, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    allList.value = r.records;
  } catch {
    if (!isCurrent()) return;
    allList.value = [];
  }
}

async function load() {
  await userStore.init();
  if (disposed) return;
  const user = userStore.currentUser;
  const isCurrent = listGuard.begin();
  if (!user || disposed) {
    loading.value = false;
    list.value = [];
    loadError.value = '';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await purchaseApi.fetchMyPurchases(user.id, tab?.statuses, { signal: isCurrent.signal });
    if (!isCurrent()) return;
    list.value = r.records;
  } catch {
    if (!isCurrent()) return;
    list.value = [];
    loadError.value = '求购列表加载失败，请检查网络后重试。';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

onMounted(async () => {
  await loadAll();
  if (disposed) return;
  await load();
});
onBeforeUnmount(() => {
  disposed = true;
  writeVersion += 1;
  allListGuard.invalidate();
  listGuard.invalidate();
});
watch(() => userStore.currentUser?.id, async (next, previous) => {
  if (disposed) return;
  if (String(next) === String(previous)) return;
  writeVersion += 1;
  allListGuard.invalidate();
  listGuard.invalidate();
  allList.value = [];
  list.value = [];
  loadError.value = '';
  cancelingId.value = undefined;
  await loadAll();
  if (disposed) return;
  await load();
});
watch(activeKey, () => {
  if (!disposed) void load();
});

const counts = computed(() => {
  const c: Record<string, number> = { all: allList.value.length };
  for (const t of TABS) {
    if (!t.statuses) continue;
    c[t.key] = allList.value.filter(r => t.statuses!.includes(r.status)).length;
  }
  return c;
});

function onCancel(req: Api.RealPurchase.Record) {
  if (cancelingId.value !== undefined) return;
  const requestedUserId = userStore.currentUser?.id;
  if (requestedUserId === undefined) return;
  const requestId = req.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion && String(userStore.currentUser?.id) === String(requestedUserId);
  cancelingId.value = requestId;
  Modal.confirm({
    title: '撤销求购？',
    content: '撤销后该求购将不可恢复',
    okText: '确认撤销',
    okButtonProps: { status: 'danger' },
    onCancel() {
      writeVersion += 1;
      cancelingId.value = undefined;
    },
    async onOk() {
      if (!isCurrentWrite()) {
        cancelingId.value = undefined;
        return;
      }
      try {
        const r = await purchaseApi.cancelPurchase(requestId);
        if (!isCurrentWrite()) return;
        if (r.ok) {
          Message.success('已撤销');
          await loadAll();
          if (!isCurrentWrite() || disposed) return;
          await load();
        } else {
          Message.error(r.message || '撤销求购失败');
        }
      } catch {
        // 请求层已展示错误，保留当前求购，避免撤销失败却从列表消失。
      } finally {
        if (operation === writeVersion) cancelingId.value = undefined;
      }
    }
  });
}
</script>

<template>
  <div class="my-purchase-page">
    <!-- ============ Hero ============ -->
    <section class="hero">
      <div class="hero-main">
        <div class="hero-eyebrow">MY PURCHASE REQUESTS</div>
        <h1 class="hero-title">我的求购</h1>
        <p class="hero-sub">跟踪求购状态 · 接单进度 · 关联订单</p>
      </div>
      <div class="hero-side">
        <button class="btn primary" @click="router.push('/purchase/create')">
          <Icon icon="lucide:plus" width="15" /> 发起新求购
        </button>
        <button class="btn ghost" @click="router.push('/purchase/hall')">
          <Icon icon="lucide:megaphone" width="15" /> 求购大厅
        </button>
      </div>
    </section>

    <!-- ============ Tab Pills (自定义) ============ -->
    <section class="tabs-bar" role="tablist" aria-label="我的求购状态">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="tab-pill"
        :class="{ active: activeKey === t.key }"
        :id="`purchase-tab-${t.key}`"
        role="tab"
        :aria-selected="activeKey === t.key"
        @click="activeKey = t.key"
      >
        <span class="tab-label">{{ t.label }}</span>
        <span v-if="counts[t.key] != null && counts[t.key] > 0" class="tab-count">{{ counts[t.key] }}</span>
      </button>
    </section>

    <!-- ============ 列表 ============ -->
    <a-spin :loading="loading" style="width: 100%">
      <div class="tab-panel" role="tabpanel" :aria-labelledby="`purchase-tab-${activeKey}`">
        <div v-if="list.length" class="req-grid">
        <PurchaseRequestCard
          v-for="r in list"
          :key="r.id"
          :request="r"
          mode="mine"
          :canceling="String(cancelingId) === String(r.id)"
          @cancel="onCancel"
        />
        </div>
        <EmptyState
          v-else
          icon="lucide:inbox"
          :title="loadError || '暂无该状态下的求购'"
          :description="loadError ? '不会把请求失败误显示为没有求购。' : '想要平台没有的商品？发起求购，全球买手为您代购'"
          :action-text="loadError ? '重新加载' : '发起求购'"
          @action="loadError ? load() : router.push('/purchase/create')"
        />
      </div>
    </a-spin>
  </div>
</template>

<style scoped>
.my-purchase-page {
  padding: 0;
  padding-bottom: 40px;
}

/* ========== Hero ========== */
.hero {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 28px 40px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 40px;
  align-items: center;
  margin-bottom: 16px;
}
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 8px;
}
.hero-title {
  font-family: var(--yb-font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}
.hero-sub {
  font-size: 13px;
  color: var(--yb-muted);
  margin: 0;
}
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ========== Buttons ========== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  white-space: nowrap;
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(91, 92, 231, 0.24);
}
.btn.ghost {
  background: transparent;
  color: var(--yb-ink);
  border-color: var(--yb-hairline-2);
}
.btn.ghost:hover {
  border-color: var(--yb-ink);
  background: var(--yb-bg);
}

/* ========== Tabs Pills ========== */
.tabs-bar {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 999px;
  padding: 6px;
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  overflow-x: auto;
  max-width: 100%;
}
.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--yb-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tab-pill:hover {
  background: var(--yb-bg);
  color: var(--yb-ink);
}
.tab-pill:focus-visible {
  outline: 2px solid var(--yb-brand-pink);
  outline-offset: 2px;
}
.tab-pill.active {
  background: var(--yb-brand-pink);
  color: #fff;
  font-weight: 700;
}
.tab-label {
  line-height: 1;
}
.tab-count {
  padding: 2px 8px;
  background: var(--yb-hairline);
  color: var(--yb-muted);
  border-radius: 999px;
  font-family: var(--yb-font-mono);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tab-pill.active .tab-count {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

/* ========== Grid ========== */
.req-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (max-width: 1200px) {
  .hero { grid-template-columns: 1fr; }
}
</style>
