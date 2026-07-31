<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Macy from 'macy';
import type { BookmarkView, FolderView } from '../../types/bookmark';
import BookmarkCard from './BookmarkCard.vue';

const props = defineProps<{ folders: FolderView[]; forceExpanded: boolean }>();

const emit = defineEmits<{
  'toggle-folder': [folderId: string];
  'open-bookmark': [bookmark: BookmarkView];
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
          trueOrder: false,
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

onMounted(scheduleLayout);
onBeforeUnmount(destroyLayout);

watch(
  () => props.folders.map((folder) => `${folder.id}:${folder.collapsed}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|'),
  scheduleLayout,
  { flush: 'post' }
);

watch(
  () => props.forceExpanded,
  scheduleLayout,
  { flush: 'post' }
);
</script>

<template>
  <section ref="boardEl" class="folder-board browse-folder-board">
    <article v-for="folder in folders" :key="folder.id" class="folder-section" :data-folder-id="folder.id">
      <header class="folder-head">
        <button class="folder-title" type="button" @click="emit('toggle-folder', folder.id)">
          <strong>{{ folder.title }}</strong>
        </button>
      </header>
      <div v-if="forceExpanded || !folder.collapsed" class="bookmark-list" :data-folder-id="folder.id">
        <BookmarkCard
          v-for="bookmark in folder.bookmarks"
          :key="bookmark.id"
          :bookmark="bookmark"
          :organize="false"
          @open="emit('open-bookmark', $event)"
        />
      </div>
      <button v-else class="folder-collapsed" type="button" @click="emit('toggle-folder', folder.id)">...</button>
    </article>
  </section>
</template>
