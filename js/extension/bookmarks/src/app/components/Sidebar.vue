<script setup lang="ts">
import { Bookmark, Clock3, Settings } from 'lucide-vue-next';

defineProps<{
  total: number;
  tags: Array<{ name: string; count: number }>;
}>();

const tagColors = ['#4F6EF7', '#E8853D', '#22C55E', '#8B5CF6', '#F59E0B', '#06B6D4'];
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <Bookmark :size="20" />
      <span>MarkHub</span>
    </div>

    <nav class="sidebar-nav">
      <a class="nav-item active" href="#">
        <Bookmark :size="16" />
        <span>全部书签</span>
        <strong>{{ total }}</strong>
      </a>
      <a class="nav-item" href="#">
        <Clock3 :size="16" />
        <span>最近访问</span>
        <strong>0</strong>
      </a>

      <div class="nav-divider"></div>
      <div class="nav-label">标签</div>

      <a v-for="(tag, index) in tags" :key="tag.name" class="nav-item" href="#">
        <i class="tag-dot" :style="{ background: tagColors[index % tagColors.length] }"></i>
        <span>{{ tag.name }}</span>
        <strong>{{ tag.count }}</strong>
      </a>
    </nav>

    <button class="settings-button" type="button">
      <Settings :size="16" />
      <span>设置与导入导出</span>
    </button>
  </aside>
</template>
