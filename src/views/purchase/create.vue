<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, Modal } from '@arco-design/web-vue';
import { Icon } from '@iconify/vue';
import { formatAmount } from '@shared';
import AftersaleEvidenceUploader from '@/components/aftersale/aftersale-evidence-uploader.vue';
import AddressSelector from '@/components/common/address-selector.vue';
import { fetchCategoryTree } from '@/service/api/category';
import * as purchaseApi from '@/service/api/purchase';
import { useUserStore } from '@/stores';
import { createLatestRequestGuard } from '@/utils/latest-request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

interface CategoryNode {
  id: string | number;
  name: string;
  children?: CategoryNode[];
}

const form = reactive<{
  productTitle: string;
  productDescription: string;
  categoryPath: Array<string | number>;
  addressId?: string | number;
  budgetAmount: number;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  evidenceUrls: string[];
}>({
  productTitle: (route.query.productHint as string) || '',
  productDescription: '',
  categoryPath: route.query.categoryId ? [String(route.query.categoryId)] : [],
  addressId: undefined,
  budgetAmount: 500,
  expectedDays: 14,
  overseasCustoms: false,
  aftersaleType: '7day-no-reason',
  appeal: '',
  evidenceUrls: []
});

const submitting = ref(false);
const confirmationOpen = ref(false);
const categoryLoadError = ref('');
const categoryGuard = createLatestRequestGuard();
let writeVersion = 0;

function mapToCascader(nodes: CategoryNode[]): { value: string | number; label: string; children?: any[] }[] {
  return nodes.map(n => ({
    value: n.id,
    label: n.name,
    children: n.children?.length ? mapToCascader(n.children) : undefined
  }));
}

const cascaderOptions = ref<any[]>([]);
onMounted(async () => {
  const isCurrent = categoryGuard.begin();
  categoryLoadError.value = '';
  try {
    const tree = (await fetchCategoryTree({ signal: isCurrent.signal })) as CategoryNode[];
    if (isCurrent()) cascaderOptions.value = mapToCascader(tree);
  } catch {
    if (!isCurrent()) return;
    cascaderOptions.value = [];
    categoryLoadError.value = '商品分类加载失败，请检查网络后重新加载。';
  }
});

async function reloadCategories() {
  const isCurrent = categoryGuard.begin();
  categoryLoadError.value = '';
  try {
    const tree = (await fetchCategoryTree({ signal: isCurrent.signal })) as CategoryNode[];
    if (isCurrent()) cascaderOptions.value = mapToCascader(tree);
  } catch {
    if (!isCurrent()) return;
    cascaderOptions.value = [];
    categoryLoadError.value = '商品分类加载失败，请检查网络后重新加载。';
  }
}

onBeforeUnmount(() => {
  writeVersion += 1;
  categoryGuard.invalidate();
});

watch([() => userStore.currentUser?.id, () => userStore.currentAudience], ([nextUserId, nextAudience], [previousUserId, previousAudience]) => {
  if (String(nextUserId) === String(previousUserId) && nextAudience === previousAudience) return;
  writeVersion += 1;
  submitting.value = false;
  confirmationOpen.value = false;
});

const CNY_RATE = 7.18;
const budgetCny = computed(() => Number.isFinite(form.budgetAmount)
  ? formatAmount((form.budgetAmount * CNY_RATE).toFixed(2))
  : '—');

function preventImplicitSubmit(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (['text', 'number', 'search', 'tel', 'email'].includes(target.type)) {
    event.preventDefault();
  }
}

async function submit() {
  if (submitting.value || confirmationOpen.value) return;
  if (!form.productTitle.trim()) {
    Message.warning('请填写商品标题');
    return;
  }
  if (!form.categoryPath.length) {
    Message.warning('请选择商品分类');
    return;
  }
  if (form.addressId === undefined || form.addressId === null || form.addressId === '') {
    Message.warning('请选择收货地址');
    return;
  }
  if (!Number.isFinite(form.budgetAmount) || form.budgetAmount < 10) {
    Message.warning('求购预算不得低于 10 U');
    return;
  }
  if (!Number.isFinite(form.expectedDays) || form.expectedDays < 1 || form.expectedDays > 60) {
    Message.warning('期望发货天数需为 1-60 天');
    return;
  }
  const addressId = form.addressId;
  if (form.appeal.trim().length < 10) {
    Message.warning('求购说明至少 10 字');
    return;
  }
  if (!userStore.currentUser) return;

  const requestedUserId = userStore.currentUser.id;
  const operation = ++writeVersion;
  const isCurrentWrite = () => operation === writeVersion
    && String(userStore.currentUser?.id) === String(requestedUserId);

  confirmationOpen.value = true;
  Modal.confirm({
    title: '确认发起求购？',
    content: `预算 U ${form.budgetAmount} · 期望 ${form.expectedDays} 天内发货`,
    onCancel() {
      confirmationOpen.value = false;
    },
    async onOk() {
      if (!isCurrentWrite()) {
        confirmationOpen.value = false;
        return;
      }
      submitting.value = true;
      try {
        try {
          const r = await purchaseApi.createPurchase({
            productTitle: form.productTitle.trim(),
            productDescription: form.productDescription.trim() || form.appeal.trim(),
            categoryId: form.categoryPath[form.categoryPath.length - 1],
            addressId,
            budgetAmount: String(form.budgetAmount),
            expectedDays: form.expectedDays,
            overseasCustoms: form.overseasCustoms,
            aftersaleType: form.aftersaleType,
            appeal: form.appeal.trim(),
            evidenceUrls: form.evidenceUrls
          });
          if (r && isCurrentWrite()) {
            Message.success(`求购已发起，编号 ${r.code}`);
            router.push({ name: 'purchase-detail', params: { id: String(r.id) } });
          }
        } catch {
          // 请求层已展示错误，保留表单内容供用户修正后重试。
        }
      } finally {
        if (operation === writeVersion) {
          submitting.value = false;
          confirmationOpen.value = false;
        }
      }
    }
  });
}
</script>

<template>
  <div class="purchase-create-page">
    <!-- ============ Form Header ============ -->
    <section class="header-card">
      <div class="header-main">
        <div class="header-eyebrow">CREATE PURCHASE · 求购发起</div>
        <h1 class="header-title">发起求购</h1>
        <p class="header-sub">说清楚商品要求 · 全球买手为你匹配 · 24h 内接单</p>
      </div>
      <button class="back-btn" @click="router.push('/purchase/hall')">
        <Icon icon="lucide:arrow-left" width="14" /> 返回求购大厅
      </button>
    </section>

    <!-- ============ Form Body ============ -->
    <a-form :model="form" layout="vertical" class="form-body" @submit.prevent @keydown.enter.capture="preventImplicitSubmit">
      <!-- ─── BASIC INFO ─── -->
      <div class="form-block">
        <div class="block-eyebrow">
          <span class="block-num">01</span>
          <span class="block-label">BASIC INFO · 基本信息</span>
        </div>
        <a-form-item label="商品标题" required>
          <a-input v-model="form.productTitle" placeholder="如 iPhone 16 Pro Max 256GB 沙漠钛" size="large" />
        </a-form-item>
        <a-form-item label="收货地址" required>
          <AddressSelector
            v-if="userStore.currentUser"
            v-model="form.addressId"
            :user-id="userStore.currentUser.id"
          />
        </a-form-item>
        <a-form-item label="商品分类" required>
          <a-cascader
            v-model="form.categoryPath"
            :options="cascaderOptions"
            placeholder="选择三级分类"
            expand-trigger="hover"
            allow-clear
            check-strictly
          />
          <div v-if="categoryLoadError" class="form-error">
            {{ categoryLoadError }} <a-link role="button" tabindex="0" @click="reloadCategories" @keydown.enter="reloadCategories" @keydown.space.prevent="reloadCategories">重新加载</a-link>
          </div>
        </a-form-item>
        <a-form-item label="商品描述">
          <a-textarea v-model="form.productDescription" :rows="3" placeholder="可选，详细描述商品规格、版本、颜色等" />
        </a-form-item>
      </div>

      <!-- ─── PRICE & TIME ─── -->
      <div class="form-block">
        <div class="block-eyebrow">
          <span class="block-num">02</span>
          <span class="block-label">PRICE &amp; TIME · 预算与期限</span>
        </div>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="预算 (USDT)" required>
              <a-input-number v-model="form.budgetAmount" :min="10" :precision="2" size="large">
                <template #suffix>U</template>
              </a-input-number>
              <div class="cny-hint">
                <Icon icon="lucide:calculator" width="11" />
                <span class="yb-mono">≈ ¥{{ budgetCny }}</span>
                <span class="rate">· 1 USDT = ¥{{ CNY_RATE.toFixed(2) }}</span>
              </div>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="期望发货天数" required>
              <a-input-number v-model="form.expectedDays" :min="1" :max="60" size="large">
                <template #suffix>天</template>
              </a-input-number>
              <div class="tip-line">
                <Icon icon="lucide:info" width="11" />
                建议 7-30 天，超期不接单会自动作废
              </div>
            </a-form-item>
          </a-col>
        </a-row>
      </div>

      <!-- ─── DELIVERY & AFTERSALE ─── -->
      <div class="form-block">
        <div class="block-eyebrow">
          <span class="block-num">03</span>
          <span class="block-label">DELIVERY &amp; AFTERSALE · 物流与售后</span>
        </div>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="是否海外过关">
              <a-switch v-model="form.overseasCustoms" />
              <span class="switch-hint">海外直邮过关后不可退</span>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="售后类型" required>
              <a-select v-model="form.aftersaleType" size="large">
                <a-option value="none">无售后</a-option>
                <a-option value="7day-no-reason">7 天无理由</a-option>
                <a-option value="shop-warranty">店铺保修</a-option>
                <a-option value="national-warranty">全国联保</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="求购说明" required>
          <a-textarea
            v-model="form.appeal"
            :rows="4"
            :max-length="500"
            show-word-limit
            placeholder="说明对买手的特殊要求（≥ 10 字），如：必须正品 / 海外发货 / 含运费"
          />
        </a-form-item>
        <a-form-item label="参考图片（可选）">
          <AftersaleEvidenceUploader v-model="form.evidenceUrls" scene="DEMAND" :max="4" />
        </a-form-item>
      </div>

      <!-- ─── Actions ─── -->
      <div class="actions">
        <button type="button" class="btn ghost" @click="router.back()">
          <Icon icon="lucide:x" width="14" /> 取消
        </button>
        <button type="button" class="btn primary" :disabled="submitting || confirmationOpen" @click="submit">
          <Icon icon="lucide:send" width="14" />
          {{ submitting || confirmationOpen ? '提交中…' : '立即提交求购' }}
        </button>
      </div>
    </a-form>
  </div>
</template>

<style scoped>
.purchase-create-page {
  padding: 0;
  padding-bottom: 40px;
  max-width: 960px;
  margin: 0 auto;
}

/* ========== Header ========== */
.header-card {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 28px 36px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 16px;
}
.header-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--yb-muted);
  margin-bottom: 8px;
}
.header-title {
  font-family: var(--yb-font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}
.header-sub {
  font-size: 13px;
  color: var(--yb-muted);
  margin: 0;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--yb-bg);
  color: var(--yb-ink);
  border: 1px solid var(--yb-hairline);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.back-btn:hover {
  border-color: var(--yb-ink);
  background: var(--yb-surface);
}

/* ========== Form body ========== */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-block {
  background: var(--yb-surface);
  border: 1px solid var(--yb-hairline);
  border-radius: 20px;
  padding: 24px 32px 20px;
}
.block-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--yb-hairline);
}
.block-num {
  font-family: var(--yb-font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--yb-gold);
  padding: 3px 8px;
  background: var(--yb-champagne);
  border-radius: 6px;
}
.block-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--yb-ink);
}

.cny-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--yb-muted);
  margin-top: 4px;
}
.cny-hint .rate { color: var(--yb-faint); }

.tip-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--yb-faint);
  margin-top: 4px;
}

.switch-hint {
  margin-left: 8px;
  color: var(--yb-muted);
  font-size: 12px;
}

/* ========== Actions ========== */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}
.btn.primary {
  background: var(--yb-brand-pink);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: var(--yb-brand-pink-2);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(250, 36, 60, 0.24);
}
.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
