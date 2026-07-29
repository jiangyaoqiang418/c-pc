<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import * as categoryApi from '@/service/api/category';

interface CategoryNode {
  id: string | number;
  name: string;
  level: 1 | 2 | 3;
  children?: CategoryNode[];
}

const router = useRouter();
const route = useRoute();
const categories = ref<CategoryNode[]>([]);
const hovered = ref<string | number | undefined>();
const subHovered = ref<string | number | undefined>();

const subMenuOpen = ref(false);

onMounted(async () => {
  categories.value = (await categoryApi.fetchCategoryTree()) as CategoryNode[];
});

interface NavItem {
  name: string;
  label: string;
  path: string;
  hover?: boolean;
  phase?: number;
}

const navItems: NavItem[] = [
  { name: 'home', label: '首页', path: '/' },
  { name: 'category', label: '全部分类', path: '/category', hover: true },
  { name: 'product-list', label: '商品列表', path: '/product/list' },
  { name: 'purchase-hall', label: '求购大厅', path: '/purchase/hall' },
  { name: 'announcement', label: '公告中心', path: '/announcement' },
  { name: 'help', label: '帮助中心', path: '/help' }
];

function go(item: NavItem) {
  if (item.phase) {
    Message.info(`「${item.label}」将在 Phase ${item.phase} 实现`);
    return;
  }
  router.push(item.path);
}

function isActive(item: { path: string; name: string }) {
  return route.name === item.name || route.path === item.path;
}

function gotoCategory(rootId?: string | number, subId?: string | number, brandId?: string | number) {
  const id = brandId || subId || rootId;
  router.push({ name: 'product-list', query: { categoryId: id ? String(id) : undefined } });
  subMenuOpen.value = false;
}
</script>

<template>
  <nav class="nav-menu" @mouseleave="subMenuOpen = false">
    <div
      v-for="item in navItems"
      :key="item.name"
      class="nav-item"
      :class="{ active: isActive(item) }"
      @click="go(item)"
      @mouseenter="item.hover ? (subMenuOpen = true) : (subMenuOpen = false)"
    >
      {{ item.label }}
    </div>

    <Transition name="fade">
      <div v-if="subMenuOpen" class="mega" @mouseenter="subMenuOpen = true">
        <div class="mega-inner">
          <ul class="col col-root">
            <li
              v-for="root in categories"
              :key="root.id"
              class="root-row"
              :class="{ active: hovered === root.id }"
              @mouseenter="hovered = root.id; subHovered = undefined"
              @click="gotoCategory(root.id)"
            >
              {{ root.name }}
              <span class="arrow">›</span>
            </li>
          </ul>
          <div v-if="hovered" class="col col-sub">
            <div v-for="sub in categories.find(r => r.id === hovered)?.children || []" :key="sub.id" class="sub-block">
              <div class="sub-title" @click="gotoCategory(undefined, sub.id)">{{ sub.name }}</div>
              <div class="brand-list">
                <a
                  v-for="brand in (sub.children || []).slice(0, 12)"
                  :key="brand.id"
                  class="brand-link"
                  @click="gotoCategory(undefined, undefined, brand.id)"
                >
                  {{ brand.name }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </nav>
</template>

<style scoped>
.nav-menu {
  display: flex;
  align-items: center;
  gap: 28px;
  position: relative;
}
.nav-item {
  font-size: 14px;
  color: #1d2129;
  cursor: pointer;
  padding: 8px 0;
  font-weight: 500;
  transition: color 0.15s;
}
.nav-item:hover,
.nav-item.active {
  color: var(--bw-brand-primary);
}
.mega {
  position: absolute;
  top: 100%;
  left: 0;
  width: 920px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  z-index: 100;
  padding: 12px 0;
  display: flex;
}
.mega-inner {
  display: flex;
  width: 100%;
}
.col {
  padding: 8px 16px;
}
.col-root {
  width: 200px;
  border-right: 1px solid #f2f3f5;
  list-style: none;
  margin: 0;
}
.root-row {
  padding: 10px 8px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #4e5969;
  font-size: 13px;
}
.root-row:hover,
.root-row.active {
  background: #f3f7ff;
  color: var(--bw-brand-primary);
}
.arrow {
  font-size: 14px;
  opacity: 0.6;
}
.col-sub {
  flex: 1;
  max-height: 480px;
  overflow-y: auto;
}
.sub-block {
  margin-bottom: 12px;
}
.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 6px;
  cursor: pointer;
  padding-bottom: 4px;
  border-bottom: 1px solid #f7f8fa;
}
.sub-title:hover {
  color: var(--bw-brand-primary);
}
.brand-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.brand-link {
  font-size: 12px;
  color: #86909c;
  cursor: pointer;
  padding: 2px 0;
}
.brand-link:hover {
  color: var(--bw-brand-primary);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
