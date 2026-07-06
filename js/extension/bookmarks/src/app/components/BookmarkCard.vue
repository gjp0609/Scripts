<script setup lang="ts">
import { Copy, GripVertical, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next';
import type { BookmarkView } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

defineProps<{
  bookmark: BookmarkView;
  organize?: boolean;
}>();

const emit = defineEmits<{
  open: [bookmark: BookmarkView];
  edit: [bookmark: BookmarkView];
  copy: [bookmark: BookmarkView];
  delete: [bookmark: BookmarkView];
}>();
</script>

<template>
  <article class="bookmark-card" :class="{ organizing: organize, 'has-tags': bookmark.extra.tags.length > 0 }" @click="emit('open', bookmark)">
    <button v-if="organize" class="drag-handle" type="button" aria-label="拖拽排序" @click.stop>
      <GripVertical :size="16" />
    </button>

    <div class="card-actions" @click.stop>
      <button v-if="organize" type="button" aria-label="编辑" @click="emit('edit', bookmark)">
        <Pencil :size="12" />
      </button>
      <button v-if="organize" type="button" aria-label="复制 URL" @click="emit('copy', bookmark)">
        <Copy :size="12" />
      </button>
      <button v-if="organize" type="button" aria-label="删除" @click="emit('delete', bookmark)">
        <Trash2 :size="12" />
      </button>
      <button v-else type="button" aria-label="更多">
        <MoreVertical :size="14" />
      </button>
    </div>

    <div class="card-main">
      <div class="card-heading">
        <SiteFavicon :title="bookmark.title" :accent="bookmark.accent" :sources="bookmark.faviconUrls" />
        <h3 :title="bookmark.title">{{ bookmark.title }}</h3>
      </div>
      <p class="card-url" :title="bookmark.url || bookmark.domain">{{ bookmark.url || bookmark.domain }}</p>
    </div>

    <div v-if="bookmark.extra.tags.length" class="tag-row">
      <span v-for="tag in bookmark.extra.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
    </div>
  </article>
</template>
