<script setup lang="ts">
import { Globe2 } from 'lucide-vue-next';
import { computed, inject, ref, watch } from 'vue';
import { withFaviconRefreshToken } from '../../services/favicon';
import { faviconRefreshTokenKey } from '../faviconRefresh';

const props = defineProps<{
  title: string;
  accent: string;
  sources?: string[];
}>();

const sourceIndex = ref(0);
const refreshToken = inject(faviconRefreshTokenKey, ref(0));

const currentSource = computed(() => {
  const source = props.sources?.[sourceIndex.value];
  return source ? withFaviconRefreshToken(source, refreshToken.value) : undefined;
});
const hasImage = computed(() => Boolean(currentSource.value));

watch(
  [() => props.sources, refreshToken],
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
    <span class="site-favicon__fallback" aria-hidden="true"><Globe2 :size="14" :stroke-width="1.6" /></span>
    <img
      v-if="hasImage"
      class="site-favicon__image"
      :src="currentSource"
      alt=""
      aria-hidden="true"
      @error="handleError"
    />
  </span>
</template>
