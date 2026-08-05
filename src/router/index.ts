import { Message } from '@arco-design/web-vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores';

export type LayoutName = 'default' | 'checkout' | 'auth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    layout?: LayoutName;
    requiresAuth?: boolean;
    requiresBuyer?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home/index.vue'),
    meta: { layout: 'default', title: '首页' }
  },
  {
    path: '/category',
    name: 'category',
    component: () => import('@/views/category/index.vue'),
    meta: { layout: 'default', title: '全部分类' }
  },
  {
    path: '/product/list',
    name: 'product-list',
    component: () => import('@/views/product/list.vue'),
    meta: { layout: 'default', title: '商品列表' }
  },
  {
    path: '/product/:id',
    name: 'product-detail',
    component: () => import('@/views/product/detail.vue'),
    meta: { layout: 'default', title: '商品详情' }
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('@/views/product/favorites.vue'),
    meta: { layout: 'default', title: '我的收藏', requiresAuth: true }
  },
  {
    path: '/cart',
    name: 'cart',
    component: () => import('@/views/cart/index.vue'),
    meta: { layout: 'default', title: '购物车', requiresAuth: true }
  },
  {
    path: '/order',
    name: 'order-list',
    component: () => import('@/views/order/index.vue'),
    meta: { layout: 'default', title: '我的订单', requiresAuth: true }
  },
  {
    path: '/order/:id',
    name: 'order-detail',
    component: () => import('@/views/order/detail.vue'),
    meta: { layout: 'default', title: '订单详情', requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/profile/index.vue'),
    meta: { layout: 'default', title: '个人中心', requiresAuth: true }
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: () => import('@/views/checkout/index.vue'),
    meta: { layout: 'checkout', title: '订单结算', requiresAuth: true }
  },
  {
    path: '/checkout/success/:orderId',
    name: 'checkout-success',
    component: () => import('@/views/checkout/success.vue'),
    meta: { layout: 'checkout', title: '支付成功', requiresAuth: true }
  },
  {
    path: '/auth/login',
    name: 'login',
    component: () => import('@/views/auth/login.vue'),
    meta: { layout: 'auth', title: '登录' }
  },
  {
    path: '/auth/register',
    name: 'register',
    component: () => import('@/views/auth/register.vue'),
    meta: { layout: 'auth', title: '注册' }
  },

  // ===== Phase 2 — 钱包 + 理财 + KYC + VIP =====
  {
    path: '/wallet',
    name: 'wallet',
    component: () => import('@/views/wallet/index.vue'),
    meta: { layout: 'default', title: '我的钱包', requiresAuth: true }
  },
  {
    path: '/wallet/history',
    name: 'wallet-history',
    component: () => import('@/views/wallet/history.vue'),
    meta: { layout: 'default', title: '资金流水', requiresAuth: true }
  },
  {
    path: '/wallet/deposit',
    name: 'wallet-deposit',
    component: () => import('@/views/wallet/deposit.vue'),
    meta: { layout: 'default', title: '链上充值', requiresAuth: true }
  },
  {
    path: '/wallet/withdraw',
    name: 'wallet-withdraw',
    component: () => import('@/views/wallet/withdraw.vue'),
    meta: { layout: 'default', title: '转出', requiresAuth: true }
  },
  {
    path: '/finance',
    name: 'finance-products',
    component: () => import('@/views/finance/products.vue'),
    meta: { layout: 'default', title: '小金库', requiresAuth: true }
  },
  {
    // 注意：my-lockups 必须放在 /finance/:id 前面，否则会被 :id 路由吞掉
    path: '/finance/my-lockups',
    name: 'finance-my-lockups',
    component: () => import('@/views/finance/my-lockups.vue'),
    meta: { layout: 'default', title: '我的锁仓', requiresAuth: true }
  },
  {
    path: '/finance/lockup/:id',
    name: 'finance-lockup-detail',
    component: () => import('@/views/finance/lockup-detail.vue'),
    meta: { layout: 'default', title: '锁仓详情', requiresAuth: true }
  },
  {
    path: '/finance/:id',
    name: 'finance-detail',
    component: () => import('@/views/finance/detail.vue'),
    meta: { layout: 'default', title: '小金库详情', requiresAuth: true }
  },
  {
    path: '/kyc',
    name: 'kyc',
    component: () => import('@/views/kyc/index.vue'),
    meta: { layout: 'default', title: 'KYC 认证', requiresAuth: true }
  },
  {
    path: '/vip',
    name: 'vip',
    component: () => import('@/views/vip/index.vue'),
    meta: { layout: 'default', title: 'VIP 特权', requiresAuth: true }
  },

  // ===== Phase 3 — 售后 / 求购 / 评价 / IM / CMS =====
  // 公开页
  { path: '/announcement', name: 'announcement', component: () => import('@/views/announcement/index.vue'),
    meta: { layout: 'default', title: '公告中心' } },
  { path: '/help', name: 'help', component: () => import('@/views/help/index.vue'),
    meta: { layout: 'default', title: '帮助中心' } },
  // 售后 (3)
  { path: '/aftersale', name: 'aftersale-list', component: () => import('@/views/aftersale/index.vue'),
    meta: { layout: 'default', title: '我的售后', requiresAuth: true } },
  { path: '/aftersale/create/:orderId', name: 'aftersale-create', component: () => import('@/views/aftersale/create.vue'),
    meta: { layout: 'default', title: '申请售后', requiresAuth: true } },
  { path: '/aftersale/:id', name: 'aftersale-detail', component: () => import('@/views/aftersale/detail.vue'),
    meta: { layout: 'default', title: '售后详情', requiresAuth: true } },
  // 求购 — 注意：hall / my / create 必须在 :id 前
  { path: '/purchase/hall', name: 'purchase-hall', component: () => import('@/views/purchase/hall.vue'),
    meta: { layout: 'default', title: '求购大厅' } },
  { path: '/purchase', name: 'purchase-my', component: () => import('@/views/purchase/my-list.vue'),
    meta: { layout: 'default', title: '我的求购', requiresAuth: true } },
  { path: '/purchase/create', name: 'purchase-create', component: () => import('@/views/purchase/create.vue'),
    meta: { layout: 'default', title: '发起求购', requiresAuth: true } },
  { path: '/purchase/:id', name: 'purchase-detail', component: () => import('@/views/purchase/detail.vue'),
    meta: { layout: 'default', title: '求购详情' } },
  // 评价 (2)
  { path: '/review', name: 'review-list', component: () => import('@/views/review/index.vue'),
    meta: { layout: 'default', title: '我的评价', requiresAuth: true } },
  { path: '/review/write/:orderId', name: 'review-write', component: () => import('@/views/review/write.vue'),
    meta: { layout: 'default', title: '写评价', requiresAuth: true } },
  // IM (2)
  { path: '/im', name: 'im', component: () => import('@/views/im/index.vue'),
    meta: { layout: 'default', title: '消息中心', requiresAuth: true } },
  { path: '/im/order-group/:orderCode', name: 'im-order-group', component: () => import('@/views/im/order-group.vue'),
    meta: { layout: 'default', title: '订单三方群', requiresAuth: true } },

  // ===== Phase 4 — 买手中心 + AI / 地址 / 积分 =====
  // 公开
  { path: '/ai-guide', name: 'ai-guide', component: () => import('@/views/ai/index.vue'),
    meta: { layout: 'default', title: 'AI 导购' } },
  // 顾客（requiresAuth）
  { path: '/address', name: 'address-mgmt', component: () => import('@/views/address/index.vue'),
    meta: { layout: 'default', title: '地址管理', requiresAuth: true } },
  { path: '/points', name: 'points', component: () => import('@/views/points/index.vue'),
    meta: { layout: 'default', title: '我的积分', requiresAuth: true } },
  { path: '/buyer/apply', name: 'buyer-apply', component: () => import('@/views/buyer/apply.vue'),
    meta: { layout: 'default', title: '申请成为买手', requiresAuth: true } },
  // 买手 (requiresAuth + requiresBuyer)
  { path: '/buyer/dashboard', name: 'buyer-dashboard', component: () => import('@/views/buyer/dashboard.vue'),
    meta: { layout: 'default', title: '买手仪表盘', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/products/create', name: 'buyer-product-create', component: () => import('@/views/buyer/product-create.vue'),
    meta: { layout: 'default', title: '创建商品', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/categories/apply', name: 'buyer-category-applications', component: () => import('@/views/buyer/category-applications.vue'),
    meta: { layout: 'default', title: '分类申请', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/flash-sales', name: 'buyer-flash-sales', component: () => import('@/views/buyer/flash-sales.vue'),
    meta: { layout: 'default', title: '秒杀报名', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/products', name: 'buyer-products', component: () => import('@/views/buyer/products.vue'),
    meta: { layout: 'default', title: '商品管理', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/deposit', name: 'buyer-deposit', component: () => import('@/views/buyer/deposit.vue'),
    meta: { layout: 'default', title: '买手押金', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/orders', name: 'buyer-orders', component: () => import('@/views/buyer/orders.vue'),
    meta: { layout: 'default', title: '买手订单', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/claimable', name: 'buyer-claimable', component: () => import('@/views/buyer/claimable.vue'),
    meta: { layout: 'default', title: '求购接单', requiresAuth: true, requiresBuyer: true } },
  { path: '/buyer/wallet', name: 'buyer-wallet', component: () => import('@/views/buyer/wallet.vue'),
    meta: { layout: 'default', title: '买手钱包', requiresAuth: true, requiresBuyer: true } }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

router.beforeEach(async to => {
  const userStore = useUserStore();
  await userStore.init();
  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresBuyer) {
    if (!userStore.currentUser?.isBuyer) {
      Message.warning('您还不是买手，请先提交申请并等待审核');
      return { name: 'buyer-apply' };
    }
    if (!userStore.isBuyerActive) {
      userStore.setAudience('buyer');
    }
  }
  return true;
});

router.afterEach(to => {
  if (to.meta.title) {
    document.title = `${to.meta.title} · 油宝`;
  }
});
