<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FolderPlus, Globe2, Plus, Search } from 'lucide-vue-next';
import type { SearchEngineId } from '../../types/bookmark';

defineProps<{
  mode: 'browse' | 'organize';
  query: string;
  engine: SearchEngineId;
}>();

const emit = defineEmits<{
  'update:mode': [value: 'browse' | 'organize'];
  'update:query': [value: string];
  'update:engine': [value: SearchEngineId];
  'add-bookmark': [];
  'add-folder': [];
  'search-box-ready': [element: HTMLDivElement];
  'search-keydown': [event: KeyboardEvent];
}>();

const searchBoxEl = ref<HTMLDivElement | null>(null);

onMounted(() => {
  if (searchBoxEl.value) {
    emit('search-box-ready', searchBoxEl.value);
  }
});
</script>

<template>
  <header class="topbar">
    <div class="mode-tabs">
      <button :class="{ active: mode === 'browse' }" type="button" @click="emit('update:mode', 'browse')">浏览</button>
      <button :class="{ active: mode === 'organize' }" type="button" @click="emit('update:mode', 'organize')">整理</button>
    </div>

    <div ref="searchBoxEl" class="search-box">
      <Search :size="16" />
      <input
        :value="query"
        type="text"
        placeholder="搜索书签... Ctrl K"
        autofocus
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        @keydown="emit('search-keydown', $event)"
      />
      <button class="engine-button" type="button" @click="emit('update:engine', engine === 'google' ? 'bing' : 'google')">
        <Globe2 :size="14" />
        <span>{{ engine === 'google' ? 'Google' : 'Bing' }}</span>
      </button>
    </div>

    <div class="top-actions">
      <button class="primary-action" type="button" @click="emit('add-bookmark')">
        <Plus :size="14" />
        <span>书签</span>
      </button>
      <button class="ghost-action" type="button" @click="emit('add-folder')">
        <FolderPlus :size="14" />
        <span>目录</span>
      </button>
    </div>
  </header>
</template>
