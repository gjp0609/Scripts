<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  title: string;
  accent: string;
  sources?: string[];
}>();

const sourceIndex = ref(0);

const fallbackText = computed(() => props.title.trim().slice(0, 1).toUpperCase() || '?');
const currentSource = computed(() => props.sources?.[sourceIndex.value]);
const hasImage = computed(() => Boolean(currentSource.value));

watch(
  () => props.sources,
  () => {
    sourceIndex.value = 0;
  },
  { deep: true }
);

function handleError() {
  if (!props.sources?.length) return;
  sourceIndex.value += 1;
}
</script>

<template>
  <span class="site-favicon" :style="{ '--favicon-accent': accent }">
    <img
      v-if="hasImage"
      class="site-favicon__image"
      :src="currentSource"
      :alt="`${title} 图标`"
      loading="lazy"
      @error="handleError"
    />
    <span v-else class="site-favicon__fallback">{{ fallbackText }}</span>
  </span>
</template>
