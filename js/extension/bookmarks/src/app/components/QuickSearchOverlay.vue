<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import type { QuickSearchTarget } from '../../types/bookmark';

defineProps<{
  targets: QuickSearchTarget[];
  keyword: string;
}>();

const emit = defineEmits<{
  open: [target: QuickSearchTarget];
}>();
</script>

<template>
  <div class="search-overlay quick-overlay">
    <div class="overlay-head">
      <span>快捷站内搜索</span>
      <span>{{ targets.length }} 个站点</span>
    </div>

    <button v-for="target in targets" :key="target.bookmarkId" class="search-row" type="button" @click="emit('open', target)">
      <span class="result-icon" :style="{ background: target.accent }">{{ target.title.slice(0, 1).toUpperCase() }}</span>
      <span class="result-text">
        <strong>{{ target.title }}</strong>
        <small>{{ target.domain }} · {{ keyword || '输入关键词' }}</small>
      </span>
      <Search :size="14" />
    </button>
  </div>
</template>
