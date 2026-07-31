<script setup lang="ts">
import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next';
import type { BookmarkView } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

defineProps<{
  bookmark: BookmarkView;
  organize?: boolean;
}>();

const emit = defineEmits<{
  open: [bookmark: BookmarkView];
  edit: [bookmark: BookmarkView];
  delete: [bookmark: BookmarkView];
}>();
</script>

<template>
  <article
    class="bookmark-row"
    :class="{ organizing: organize }"
    :data-bookmark-id="bookmark.id"
    tabindex="0"
    role="link"
    @click="emit('open', bookmark)"
    @keydown.enter="emit('open', bookmark)"
  >
    <button v-if="organize" class="drag-handle" type="button" aria-label="拖拽书签" @click.stop>
      <GripVertical :size="15" />
    </button>
    <span class="bookmark-copy">
      <span class="bookmark-title-line">
        <SiteFavicon :title="bookmark.title" :accent="bookmark.accent" :sources="bookmark.faviconUrls" />
        <strong :title="bookmark.title">{{ bookmark.title }}</strong>
      </span>
      <small :title="bookmark.url || bookmark.domain">{{ bookmark.url || bookmark.domain }}</small>
    </span>
    <span v-if="organize" class="bookmark-actions" @click.stop>
      <button type="button" title="编辑" aria-label="编辑书签" @click="emit('edit', bookmark)"><Pencil :size="13" /></button>
      <button class="danger" type="button" title="删除" aria-label="删除书签" @click="emit('delete', bookmark)"><Trash2 :size="13" /></button>
    </span>
  </article>
</template>
