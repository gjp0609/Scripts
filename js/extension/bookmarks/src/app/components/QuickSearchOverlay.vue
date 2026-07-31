<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { Search } from 'lucide-vue-next';
import type { QuickSearchTarget } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

defineProps<{
  targets: QuickSearchTarget[];
  keyword: string;
  activeIndex: number;
  overlayStyle: CSSProperties;
}>();

const emit = defineEmits<{
  open: [target: QuickSearchTarget];
  activate: [index: number];
}>();
</script>

<template>
  <section class="search-overlay quick-overlay" :style="overlayStyle">
    <button
      v-for="(target, index) in targets"
      :key="target.bookmarkId"
      class="search-result"
      :class="{ active: index === activeIndex }"
      type="button"
      @mousedown.prevent
      @pointerenter="emit('activate', index)"
      @focus="emit('activate', index)"
      @click="emit('open', target)"
    >
      <SiteFavicon :title="target.title" :accent="target.accent" :sources="target.faviconUrls" />
      <span class="result-copy">
        <strong>{{ target.title }}</strong>
        <small>site:{{ target.domain }}</small>
      </span>
      <Search :size="14" />
    </button>
    <div v-if="!targets.length" class="search-empty">还没有配置搜索目标</div>
  </section>
</template>
