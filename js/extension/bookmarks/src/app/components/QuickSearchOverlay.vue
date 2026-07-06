<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { Search } from 'lucide-vue-next';
import type { QuickSearchTarget } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

defineProps<{
  targets: QuickSearchTarget[];
  keyword: string;
  activeIndex?: number;
  overlayStyle?: CSSProperties;
}>();

const emit = defineEmits<{
  open: [target: QuickSearchTarget];
}>();
</script>

<template>
  <div class="search-overlay quick-overlay" :style="overlayStyle">
    <div class="overlay-head">
      <span>快捷站内搜索</span>
      <span>{{ targets.length }} 个站点</span>
    </div>

    <button
      v-for="(target, index) in targets"
      :key="target.bookmarkId"
      class="search-row"
      :class="{ active: index === activeIndex }"
      type="button"
      :aria-selected="index === activeIndex"
      @click="emit('open', target)"
    >
      <SiteFavicon class="overlay-favicon" :title="target.title" :accent="target.accent" :sources="target.faviconUrls" />
      <span class="result-text">
        <strong>{{ target.title }}</strong>
        <small>{{ target.domain }} · {{ keyword || '输入关键词' }}</small>
      </span>
      <Search :size="14" />
    </button>
  </div>
</template>
