<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import Macy from 'macy';
import type { BookmarkView, FolderView } from '../../types/bookmark';
import BookmarkCard from './BookmarkCard.vue';

const props = defineProps<{
  folders: FolderView[];
  collapsedFolderIds: Set<string>;
  dropTargetFolderId: string;
  forceExpanded: boolean;
}>();

const emit = defineEmits<{
  'board-ready': [element: HTMLElement];
  'folder-list-ready': [folderId: string, element: HTMLElement | null];
  'toggle-folder': [folderId: string];
  'edit-folder': [folder: FolderView];
  'delete-folder': [folder: FolderView];
  'edit-bookmark': [bookmark: BookmarkView];
  'delete-bookmark': [bookmark: BookmarkView];
}>();

const boardEl = ref<HTMLElement>();
let layout: Macy | undefined;
let layoutFrame = 0;

function destroyLayout() {
  cancelAnimationFrame(layoutFrame);
  layout?.remove();
  layout = undefined;
}

function scheduleLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    void nextTick(() => {
      if (!boardEl.value || !props.folders.length) {
        destroyLayout();
        return;
      }
      if (!layout) {
        layout = new Macy({
          container: boardEl.value,
          trueOrder: true,
          waitForImages: false,
          margin: { x: 24, y: 24 },
          columns: 5,
          useContainerForBreakpoints: true,
          breakAt: { 2400: 4, 1600: 3, 1200: 2, 800: 1 }
        });
      }
      layout.recalculate(true, true);
    });
  });
}

onMounted(() => {
  if (boardEl.value) emit('board-ready', boardEl.value);
  scheduleLayout();
});
onBeforeUnmount(destroyLayout);

watch(
  () => [
    props.forceExpanded,
    props.dropTargetFolderId,
    [...props.collapsedFolderIds].sort().join(','),
    props.folders.map((folder) => `${folder.id}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|')
  ],
  scheduleLayout,
  { flush: 'post' }
);

function setFolderListRef(folderId: string, element: Element | { $el?: Element } | null) {
  const target = element instanceof Element ? element : element?.$el;
  emit('folder-list-ready', folderId, target instanceof HTMLElement ? target : null);
}
</script>

<template>
  <section ref="boardEl" class="folder-board bookmark-organize-board">
    <article v-for="folder in folders" :key="folder.id" class="folder-section" :data-folder-id="folder.id">
      <header class="folder-head">
        <button class="folder-title" type="button" @click="emit('toggle-folder', folder.id)">
          <strong>{{ folder.title }}</strong>
          <small>{{ folder.bookmarks.length }}</small>
        </button>
        <span class="folder-actions">
          <button type="button" title="编辑目录" @click="emit('edit-folder', folder)"><Pencil :size="13" /></button>
          <button class="danger" type="button" title="删除目录" @click="emit('delete-folder', folder)"><Trash2 :size="13" /></button>
        </span>
      </header>
      <div
        :ref="(element) => setFolderListRef(folder.id, element)"
        class="bookmark-list"
        :class="{ 'bookmark-list-collapsed': !forceExpanded && collapsedFolderIds.has(folder.id) }"
        :data-folder-id="folder.id"
        :data-drop-active="dropTargetFolderId === folder.id ? 'true' : undefined"
      >
        <template v-if="forceExpanded || !collapsedFolderIds.has(folder.id)">
          <BookmarkCard
            v-for="bookmark in folder.bookmarks"
            :key="bookmark.id"
            :bookmark="bookmark"
            organize
            @edit="emit('edit-bookmark', $event)"
            @delete="emit('delete-bookmark', $event)"
          />
        </template>
        <p v-if="(!forceExpanded && collapsedFolderIds.has(folder.id)) || !folder.bookmarks.length" class="empty-drop-zone" aria-label="书签投放区"></p>
      </div>
    </article>
  </section>
</template>
