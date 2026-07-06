<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { CornerDownLeft } from 'lucide-vue-next';
import type { SearchResultItem } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

defineProps<{
  query: string;
  results: SearchResultItem[];
  overlayStyle?: CSSProperties;
}>();

const emit = defineEmits<{
  open: [result: SearchResultItem];
}>();
</script>

<template>
  <div v-if="query.trim()" class="search-overlay" :style="overlayStyle">
    <div class="overlay-head">
      <span>搜索结果</span>
      <span>{{ results.length }} 个结果</span>
    </div>

    <button v-for="result in results" :key="`${result.type}-${result.id}`" class="search-row" type="button" @click="emit('open', result)">
      <SiteFavicon class="overlay-favicon" :title="result.title" :accent="result.accent" :sources="result.faviconUrls" />
      <span class="result-text">
        <strong>{{ result.title }}</strong>
        <small>{{ result.domain }}</small>
      </span>
      <CornerDownLeft :size="14" />
    </button>

    <div class="overlay-foot">↑↓ 选择&nbsp;&nbsp;Enter 打开&nbsp;&nbsp;Esc 关闭</div>
  </div>
</template>
