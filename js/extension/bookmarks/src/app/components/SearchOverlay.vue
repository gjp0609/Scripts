<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { Hash } from 'lucide-vue-next';
import type { TagSearchState, TagSummary } from '../../types/bookmark';

defineProps<{
  tagSearch: TagSearchState;
  activeIndex: number;
  overlayStyle: CSSProperties;
}>();

const emit = defineEmits<{
  selectTag: [tag: TagSummary];
  activate: [index: number];
}>();
</script>

<template>
  <section class="search-overlay" :style="overlayStyle">
    <button
      v-for="(tag, index) in tagSearch.matches"
      :key="tag.normalizedName"
      class="search-result tag-result"
      :class="{ active: index === activeIndex, exact: tagSearch.exactTag?.normalizedName === tag.normalizedName }"
      type="button"
      @mousedown.prevent
      @pointerenter="emit('activate', index)"
      @focus="emit('activate', index)"
      @click="emit('selectTag', tag)"
    >
      <Hash :size="15" />
      <span class="result-copy"><strong>{{ tag.name }}</strong><small>{{ tag.searchCapability ? '搜索能力' : `${tag.count} 个书签` }}</small></span>
      <span class="result-count">{{ tag.count }}</span>
    </button>
    <div v-if="!tagSearch.matches.length" class="search-empty">没有匹配标签</div>
  </section>
</template>
