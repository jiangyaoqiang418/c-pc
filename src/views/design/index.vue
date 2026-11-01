<script setup lang="ts">
import { useRouter } from 'vue-router';
import UmIcon from '@/components/common/um-icon.vue';

const router = useRouter();
const pageLinks = [
  { path: '/', title: '首页' },
  { path: '/category', title: '全部分类' },
  { path: '/product/list', title: '商品列表' },
  { path: '/brand', title: '品牌专区' },
  { path: '/favorites', title: '我的收藏' },
  { path: '/cart', title: '购物袋' },
  { path: '/checkout', title: '订单结算' },
  { path: '/order', title: '我的订单' },
  { path: '/profile', title: '个人中心' },
  { path: '/address', title: '地址管理' },
  { path: '/wallet', title: '我的钱包' },
  { path: '/wallet/history', title: '资金流水' },
  { path: '/wallet/deposit', title: '链上充值' },
  { path: '/wallet/withdraw', title: '转出' },
  { path: '/purchase/hall', title: '求购大厅' },
  { path: '/purchase', title: '我的求购' },
  { path: '/purchase/create', title: '发起求购' },
  { path: '/aftersale', title: '我的售后' },
  { path: '/review', title: '我的评价' },
  { path: '/notifications', title: '站内通知' },
  { path: '/im', title: '消息中心' },
  { path: '/help', title: '帮助中心' },
  { path: '/announcement', title: '公告中心' },
  { path: '/ai-guide', title: 'AI 导购' },
  { path: '/kyc', title: 'KYC 认证' },
  { path: '/vip', title: 'VIP 特权' },
  { path: '/points', title: '我的积分' },
  { path: '/finance', title: '小金库' },
  { path: '/finance/my-lockups', title: '我的锁仓' },
  { path: '/buyer/dashboard', title: '买手工作台' },
  { path: '/buyer/apply', title: '申请成为买手' },
  { path: '/buyer/products', title: '商品管理' },
  { path: '/buyer/products/create', title: '创建商品' },
  { path: '/buyer/orders', title: '买手订单' },
  { path: '/buyer/categories/apply', title: '分类申请' },
  { path: '/buyer/flash-sales', title: '秒杀报名' },
  { path: '/buyer/deposit', title: '保证金管理' },
  { path: '/buyer/wallet', title: '买手钱包' },
  { path: '/buyer/aftersales', title: '卖出商品售后' },
  { path: '/buyer/claimable', title: '求购接单' },
  { path: '/profile/pay-password', title: '支付密码' },
  { path: '/profile/login-password', title: '设置登录密码' },
  { path: '/auth/login', title: '登录' },
  { path: '/auth/register', title: '注册' }
];
</script>

<template>
  <div class="design-page">
    <h1 class="sr-only">页面与状态总览</h1>
    <nav class="design-links" aria-label="页面总览">
      <button v-for="page in pageLinks" :key="page.path" type="button" @click="router.push(page.path)">
        <span>{{ page.title }}</span><code>{{ page.path }}</code><UmIcon name="arrow" />
      </button>
    </nav>
  </div>
</template>
