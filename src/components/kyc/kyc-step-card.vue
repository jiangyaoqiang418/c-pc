<script setup lang="ts">
interface Props {
  index: number;
  total: number;
  title: string;
  description?: string;
  active?: boolean;
  done?: boolean;
}
defineProps<Props>();
</script>

<template>
  <div class="step-card" :class="{ active, done }">
    <div class="badge">{{ done ? '✓' : index }}</div>
    <div class="info">
      <div class="step-num">第 {{ index }} / {{ total }} 步</div>
      <div class="title">{{ title }}</div>
      <div v-if="description" class="desc">{{ description }}</div>
      <div class="content">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-card {
  display: flex;
  gap: 16px;
  padding: 20px 24px;
  background: #fff;
  border-radius: var(--bw-card-radius);
  border: 2px solid transparent;
  transition: border-color 0.18s;
}
.step-card.active {
  border-color: var(--bw-brand-primary);
  background: linear-gradient(135deg, #f3f7ff 0%, #fff 60%);
}
.badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #c9cdd4;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}
.step-card.active .badge {
  background: var(--bw-brand-primary);
}
.step-card.done .badge {
  background: #00b42a;
}
.info {
  flex: 1;
}
.step-num {
  font-size: 11px;
  color: #86909c;
  margin-bottom: 2px;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 4px;
}
.desc {
  font-size: 12px;
  color: #86909c;
  margin-bottom: 12px;
}
.content {
  margin-top: 8px;
}
</style>
