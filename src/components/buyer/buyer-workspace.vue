<script setup lang="ts">
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';

defineProps<{ enabled: boolean }>();
const route = useRoute();
const links = [
  { to: '/buyer/dashboard', label: '工作台', icon: 'lucide:layout-dashboard' },
  { to: '/buyer/products', label: '商品管理', icon: 'lucide:package' },
  { to: '/buyer/orders', label: '买手订单', icon: 'lucide:clipboard-list' },
  { to: '/buyer/claimable', label: '可接求购', icon: 'lucide:handshake' },
  { to: '/buyer/aftersales', label: '售后记录', icon: 'lucide:rotate-ccw' },
  { to: '/buyer/deposit', label: '押金管理', icon: 'lucide:shield-check' },
  { to: '/buyer/wallet', label: '买手钱包', icon: 'lucide:wallet' },
  { to: '/buyer/categories/apply', label: '分类申请', icon: 'lucide:folder-plus' },
  { to: '/buyer/flash-sales', label: '秒杀报名', icon: 'lucide:zap' }
];
const isActive = (path: string) => route.path === path || (path === '/buyer/products' && route.path.startsWith('/buyer/products/'));
</script>

<template>
  <div class="buyer-workspace" :class="{ enabled }">
    <aside v-if="enabled" class="workspace-sidebar">
      <div class="workspace-brand"><Icon icon="lucide:store" /><div><strong>买手工作室</strong><small>BUYER STUDIO</small></div></div>
      <nav aria-label="买手导航"><RouterLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }" :aria-current="isActive(link.to) ? 'page' : undefined"><Icon :icon="link.icon" /><span>{{ link.label }}</span><Icon icon="lucide:chevron-right" /></RouterLink></nav>
      <div class="workspace-note"><Icon icon="lucide:shield-check" /><strong>认真选品，安心履约。</strong><p>每一个细节，<br>都成就一份信任。</p><RouterLink to="/help">买手帮助 <Icon icon="lucide:arrow-right" /></RouterLink></div>
    </aside>
    <div class="workspace-content"><slot /></div>
  </div>
</template>

<style scoped>
.buyer-workspace:not(.enabled), .buyer-workspace:not(.enabled)>.workspace-content { display:contents; }
.buyer-workspace.enabled { display:grid; grid-template-columns:208px minmax(0,1fr); gap:32px; align-items:start; }
.workspace-sidebar { position:sticky; top:170px; padding:20px 14px; border:1px solid var(--yb-hairline); border-radius:16px; background:var(--yb-fill); }
.workspace-brand { display:flex; align-items:center; gap:12px; padding:8px 10px 24px; }
.workspace-brand>svg { width:34px; height:34px; padding:7px; border-radius:9px; background:var(--yb-primary-soft); color:var(--yb-primary); }
.workspace-brand strong { display:block; font-size:16px; }.workspace-brand small { display:block; margin-top:4px; color:var(--yb-muted); font-size:10px; letter-spacing:1.5px; }
nav { display:grid; gap:5px; }nav a { display:flex; align-items:center; gap:10px; padding:14px 12px; border-radius:8px; color:var(--yb-muted); font-size:14px; transition:background 150ms var(--um-ease),color 150ms var(--um-ease); }nav a>svg { width:17px; height:17px; }nav a>svg:last-child { width:13px; margin-left:auto; opacity:.5; }nav a:hover,nav a.active { background:var(--yb-paper); color:var(--yb-primary); }nav a.active { font-weight:600; }
.workspace-note { display:grid; gap:12px; padding:22px 16px; margin-top:25px; border-top:1px solid var(--yb-hairline); }.workspace-note>svg { color:var(--yb-gold); width:23px; }.workspace-note strong { font-size:13px; }.workspace-note p { font-size:12px; line-height:1.9; color:var(--yb-muted); margin:0; }.workspace-note a { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--yb-primary); }.workspace-note a>svg { width:13px; }
.workspace-content { min-width:0; }.enabled>.workspace-content :deep(.shop-container) { width:100%; max-width:none; margin:0; padding:0; }
@media(max-width:1150px) { .buyer-workspace.enabled { grid-template-columns:170px minmax(0,1fr); gap:22px; } }
@media(max-width:900px) { .buyer-workspace.enabled { display:block; }.workspace-sidebar { position:static; margin-bottom:22px; }.workspace-brand,.workspace-note { display:none; }nav { display:flex; overflow-x:auto; }nav a { flex-shrink:0; }nav a>svg:last-child { display:none; } }
@media(prefers-reduced-motion:reduce) { nav a { transition:none; } }
</style>
