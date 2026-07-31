<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next';
import type { FolderView } from '../../types/bookmark';
import BookmarkCard from './BookmarkCard.vue';

defineProps<{ folders: FolderView[]; collapsedFolderIds: Set<string> }>();

const emit = defineEmits<{
  'board-ready': [element: HTMLElement];
  'toggle-folder': [folderId: string];
  'edit-folder': [folder: FolderView];
  'delete-folder': [folder: FolderView];
}>();

const boardEl = ref<HTMLElement>();
onMounted(() => { if (boardEl.value) emit('board-ready', boardEl.value); });
</script>

<template>
  <section ref="boardEl" class="folder-board folder-organize-board">
    <article v-for="folder in folders" :key="folder.id" class="folder-section" :data-folder-id="folder.id">
      <header class="folder-head">
        <button class="folder-drag-handle" type="button" aria-label="拖拽目录"><GripVertical :size="15" /></button>
        <button class="folder-title" type="button" @click="emit('toggle-folder', folder.id)">
          <strong>{{ folder.title }}</strong>
          <small>{{ folder.bookmarks.length }}</small>
        </button>
        <span class="folder-actions">
          <button type="button" title="编辑目录" @click="emit('edit-folder', folder)"><Pencil :size="13" /></button>
          <button class="danger" type="button" title="删除目录" @click="emit('delete-folder', folder)"><Trash2 :size="13" /></button>
        </span>
      </header>
      <div v-if="!collapsedFolderIds.has(folder.id)" class="bookmark-list" :data-folder-id="folder.id">
        <BookmarkCard v-for="bookmark in folder.bookmarks" :key="bookmark.id" :bookmark="bookmark" :organize="false" />
      </div>
    </article>
  </section>
</template>
