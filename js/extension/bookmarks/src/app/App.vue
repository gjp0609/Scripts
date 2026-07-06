<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { ChevronDown, Folder } from 'lucide-vue-next';
import type { BookmarkView, QuickSearchTarget, SearchResultItem } from '../types/bookmark';
import { createBookmark, removeBookmark } from '../services/bookmarkApi';
import { saveBookmarkDetails } from '../services/bookmarkRepository';
import { buildQuickSearchUrl, getQuickSearchTargets, parseQuickSearch, searchBookmarks } from '../services/searchService';
import { openUrl } from '../services/extensionRuntime';
import { useBookmarkWorkspace } from './useBookmarkWorkspace';
import BookmarkCard from './components/BookmarkCard.vue';
import BookmarkModal from './components/BookmarkModal.vue';
import EmptyState from './components/EmptyState.vue';
import FolderModal from './components/FolderModal.vue';
import HeaderBar from './components/HeaderBar.vue';
import OrganizeToolbar from './components/OrganizeToolbar.vue';
import QuickSearchOverlay from './components/QuickSearchOverlay.vue';
import SearchOverlay from './components/SearchOverlay.vue';
import Sidebar from './components/Sidebar.vue';

const workspace = useBookmarkWorkspace();
const mode = ref<'browse' | 'organize'>('browse');
const query = ref('');
const bookmarkModalOpen = ref(false);
const folderModalOpen = ref(false);
const editingBookmark = ref<BookmarkView | undefined>();
const searchBoxEl = ref<HTMLDivElement | null>(null);
const overlayStyle = ref<CSSProperties>({ visibility: 'hidden' });

const quickSearch = computed(() => parseQuickSearch(query.value));
const quickTargets = computed(() => getQuickSearchTargets(workspace.folders.value, quickSearch.value?.siteQuery ?? ''));
const searchResults = computed(() => searchBookmarks(workspace.folders.value, query.value, workspace.searchEngine.value));
const activeSearchIndex = ref(0);
const activeQuickIndex = ref(0);
const visibleFolders = computed(() => {
  if (!query.value.trim() || quickSearch.value) return workspace.folders.value;
  const ids = new Set(searchResults.value.filter((item) => item.type === 'bookmark').map((item) => item.id));
  return workspace.folders.value
    .map((folder) => ({
      ...folder,
      bookmarks: folder.bookmarks.filter((bookmark) => ids.has(bookmark.id))
    }))
    .filter((folder) => folder.bookmarks.length > 0);
});

function openBookmark(bookmark: BookmarkView) {
  if (bookmark.url) void openUrl(bookmark.url);
}

function openSearchResult(result: SearchResultItem) {
  void openUrl(result.url);
}

function openQuickSearch(target: QuickSearchTarget) {
  const url = buildQuickSearchUrl(target.searchUrl, quickSearch.value?.keyword ?? '');
  void openUrl(url);
}

function normalizeIndex(current: number, total: number): number {
  if (!total) return 0;
  return ((current % total) + total) % total;
}

function moveSearchSelection(delta: number) {
  const total = searchResults.value.length;
  if (!total) return;
  activeSearchIndex.value = normalizeIndex(activeSearchIndex.value + delta, total);
}

function moveQuickSelection(delta: number) {
  const total = quickTargets.value.length;
  if (!total) return;
  activeQuickIndex.value = normalizeIndex(activeQuickIndex.value + delta, total);
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && query.value) {
    event.preventDefault();
    query.value = '';
    return;
  }

  if (quickSearch.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveQuickSelection(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveQuickSelection(-1);
      return;
    }

    if (event.key === 'Enter') {
      if (!quickSearch.value.hasKeyword) {
        event.preventDefault();
        return;
      }

      const target = quickTargets.value[activeQuickIndex.value];
      if (!target) return;
      event.preventDefault();
      openQuickSearch(target);
    }
    return;
  }

  if (!query.value.trim()) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveSearchSelection(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveSearchSelection(-1);
    return;
  }

  if (event.key === 'Enter') {
    const result = searchResults.value[activeSearchIndex.value];
    if (!result) return;
    event.preventDefault();
    openSearchResult(result);
  }
}

function startAddBookmark() {
  editingBookmark.value = undefined;
  bookmarkModalOpen.value = true;
}

function startEditBookmark(bookmark: BookmarkView) {
  editingBookmark.value = bookmark;
  bookmarkModalOpen.value = true;
}

async function saveBookmark(value: Parameters<typeof saveBookmarkDetails>[0]) {
  await saveBookmarkDetails(value);
  bookmarkModalOpen.value = false;
  await workspace.reload();
}

async function saveFolder(title: string) {
  if (!title || !workspace.rootId.value) return;
  await createBookmark({ parentId: workspace.rootId.value, title });
  folderModalOpen.value = false;
  await workspace.reload();
}

async function deleteBookmark(bookmark: BookmarkView) {
  if (!confirm(`删除书签“${bookmark.title}”？`)) return;
  await removeBookmark(bookmark.id);
  await workspace.reload();
}

async function copyUrl(bookmark: BookmarkView) {
  if (bookmark.url) await navigator.clipboard.writeText(bookmark.url);
}

function updateOverlayPosition() {
  const element = searchBoxEl.value;
  if (!element) {
    overlayStyle.value = { visibility: 'hidden' };
    return;
  }

  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);

  overlayStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    width: `${width}px`,
    visibility: 'visible'
  };
}

function setSearchBoxElement(element: HTMLDivElement) {
  searchBoxEl.value = element;
  void nextTick().then(updateOverlayPosition);
}

onMounted(() => {
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition, { passive: true });
  void nextTick().then(updateOverlayPosition);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateOverlayPosition);
  window.removeEventListener('scroll', updateOverlayPosition);
});

watch(query, () => {
  activeSearchIndex.value = 0;
  activeQuickIndex.value = 0;
});

watch(searchResults, (results) => {
  activeSearchIndex.value = normalizeIndex(activeSearchIndex.value, results.length);
});

watch(quickTargets, (targets) => {
  activeQuickIndex.value = normalizeIndex(activeQuickIndex.value, targets.length);
});
</script>

<template>
  <div class="markhub-shell">
    <Sidebar :total="workspace.totalBookmarks.value" :tags="workspace.tags.value" />
    <HeaderBar
      :mode="mode"
      :query="query"
      :engine="workspace.searchEngine.value"
      @update:mode="mode = $event"
      @update:query="query = $event"
      @update:engine="workspace.setSearchEngine($event)"
      @add-bookmark="startAddBookmark"
      @add-folder="folderModalOpen = true"
      @search-keydown="handleSearchKeydown"
      @search-box-ready="setSearchBoxElement"
    />

    <main class="content-area">
      <OrganizeToolbar
        v-if="mode === 'organize'"
        @add-bookmark="startAddBookmark"
        @add-folder="folderModalOpen = true"
        @undo="undefined"
      />

      <div class="content-pad">
        <EmptyState v-if="workspace.loading.value" title="正在读取书签" description="正在从浏览器书签 API 同步数据。" />
        <EmptyState v-else-if="workspace.error.value" title="无法读取书签" :description="workspace.error.value" />
        <EmptyState
          v-else-if="visibleFolders.length === 0"
          :title="query ? '没有匹配结果' : '还没有可展示的书签'"
          :description="query ? '换一个关键词，或使用当前搜索引擎继续搜索。' : '请先在默认书签栏下创建一层目录和书签。'"
        />

        <section v-for="folder in visibleFolders" v-else :key="folder.id" class="folder-section">
          <button class="folder-head" type="button" @click="workspace.toggleFolder(folder.id)">
            <Folder :size="16" />
            <strong>{{ folder.title }}</strong>
            <span>{{ folder.bookmarks.length }}</span>
            <ChevronDown :size="14" :class="{ collapsed: folder.collapsed }" />
          </button>

          <div v-if="!folder.collapsed" class="bookmark-grid">
            <BookmarkCard
              v-for="bookmark in folder.bookmarks"
              :key="bookmark.id"
              :bookmark="bookmark"
              :organize="mode === 'organize'"
              @open="openBookmark"
              @edit="startEditBookmark"
              @copy="copyUrl"
              @delete="deleteBookmark"
            />
          </div>
        </section>
      </div>
    </main>

    <QuickSearchOverlay
      v-if="quickSearch"
      :targets="quickTargets"
      :keyword="quickSearch.keyword"
      :active-index="activeQuickIndex"
      :overlay-style="overlayStyle"
      @open="openQuickSearch"
    />
    <SearchOverlay
      v-else
      :query="query"
      :results="searchResults"
      :active-index="activeSearchIndex"
      :overlay-style="overlayStyle"
      @open="openSearchResult"
    />

    <BookmarkModal
      :open="bookmarkModalOpen"
      :folders="workspace.folders.value"
      :bookmark="editingBookmark"
      @close="bookmarkModalOpen = false"
      @save="saveBookmark"
    />
    <FolderModal :open="folderModalOpen" @close="folderModalOpen = false" @save="saveFolder" />
  </div>
</template>
