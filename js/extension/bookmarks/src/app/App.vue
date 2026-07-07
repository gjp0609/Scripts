<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { ChevronDown, Folder, Pencil, Trash2 } from 'lucide-vue-next';
import Sortable from 'sortablejs';
import type { BookmarkView, FolderView, QuickSearchTarget, SearchResultItem } from '../types/bookmark';
import {
  deleteBookmarkDetails,
  deleteFolderDetails,
  moveBookmarkOrder,
  restoreBookmarkPosition,
  saveBookmarkDetails,
  saveFolderDetails,
  type BookmarkMoveSnapshot
} from '../services/bookmarkRepository';
import { getExtras, getPreferences } from '../services/extraStore';
import { exportFullData, importFullData } from '../services/importExportService';
import { buildQuickSearchUrl, getQuickSearchTargets, parseQuickSearch, searchBookmarks } from '../services/searchService';
import { openUrl } from '../services/extensionRuntime';
import { useBookmarkWorkspace } from './useBookmarkWorkspace';
import BookmarkCard from './components/BookmarkCard.vue';
import BookmarkModal from './components/BookmarkModal.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import EmptyState from './components/EmptyState.vue';
import FolderModal from './components/FolderModal.vue';
import HeaderBar from './components/HeaderBar.vue';
import ImportExportModal from './components/ImportExportModal.vue';
import OrganizeToolbar from './components/OrganizeToolbar.vue';
import QuickSearchOverlay from './components/QuickSearchOverlay.vue';
import SearchOverlay from './components/SearchOverlay.vue';
import Sidebar from './components/Sidebar.vue';

const workspace = useBookmarkWorkspace();
const mode = ref<'browse' | 'organize'>('browse');
const query = ref('');
const bookmarkModalOpen = ref(false);
const folderModalOpen = ref(false);
const importExportOpen = ref(false);
const editingBookmark = ref<BookmarkView | undefined>();
const editingFolder = ref<FolderView | undefined>();
const folderPendingDelete = ref<FolderView | undefined>();
const searchBoxEl = ref<HTMLDivElement | null>(null);
const overlayStyle = ref<CSSProperties>({ visibility: 'hidden' });
const folderListRefs = ref<Record<string, HTMLElement | null>>({});
const sortableInstances = new Map<string, Sortable>();
const lastMoveSnapshot = ref<BookmarkMoveSnapshot | undefined>();
const importExportBusy = ref(false);
const importExportError = ref('');

const quickSearch = computed(() => parseQuickSearch(query.value));
const quickTargets = computed(() => getQuickSearchTargets(workspace.folders.value, quickSearch.value?.siteQuery ?? ''));
const searchResults = computed(() => searchBookmarks(workspace.folders.value, query.value, workspace.searchEngine.value));
const activeSearchIndex = ref(0);
const activeQuickIndex = ref(0);
const canUndo = computed(() => Boolean(lastMoveSnapshot.value));
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"], [contenteditable=""], select'));
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

function startAddFolder() {
  editingFolder.value = undefined;
  folderModalOpen.value = true;
}

function openImportExport() {
  importExportError.value = '';
  importExportOpen.value = true;
}

function startEditBookmark(bookmark: BookmarkView) {
  editingBookmark.value = bookmark;
  bookmarkModalOpen.value = true;
}

function startEditFolder(folder: FolderView) {
  editingFolder.value = folder;
  folderModalOpen.value = true;
}

function setFolderListRef(folderId: string, element: Element | { $el?: Element } | null) {
  const target = element instanceof Element ? element : element?.$el;
  folderListRefs.value[folderId] = target instanceof HTMLElement ? target : null;
}

async function saveBookmark(value: Parameters<typeof saveBookmarkDetails>[0]) {
  const savedBookmark = await saveBookmarkDetails(value);
  bookmarkModalOpen.value = false;
  workspace.upsertBookmark(savedBookmark);
}

async function saveFolder(value: { id?: string; title: string }) {
  if (!value.title || !workspace.rootId.value) return;
  const folder = await saveFolderDetails({
    id: value.id,
    parentId: workspace.rootId.value,
    title: value.title
  });
  folderModalOpen.value = false;
  editingFolder.value = undefined;
  workspace.upsertFolder(folder);
}

async function deleteBookmark(bookmark: BookmarkView) {
  if (!confirm(`删除书签“${bookmark.title}”？`)) return;
  await deleteBookmarkDetails(bookmark.id);
  workspace.removeBookmark(bookmark.id);
}

async function copyUrl(bookmark: BookmarkView) {
  if (bookmark.url) await navigator.clipboard.writeText(bookmark.url);
}

function requestDeleteFolder(folder: FolderView) {
  folderPendingDelete.value = folder;
}

async function confirmDeleteFolder() {
  const folder = folderPendingDelete.value;
  if (!folder) return;
  await deleteFolderDetails(folder.id);
  folderPendingDelete.value = undefined;
  workspace.removeFolder(folder.id);
}

async function undoLastMove() {
  if (!lastMoveSnapshot.value) return;
  const snapshot = lastMoveSnapshot.value;
  const restoredBookmark = await restoreBookmarkPosition(snapshot);
  lastMoveSnapshot.value = undefined;
  workspace.moveBookmark({
    bookmarkId: restoredBookmark.id,
    parentId: restoredBookmark.parentId ?? snapshot.parentId ?? '',
    index: restoredBookmark.index ?? snapshot.index ?? 0
  });
}

function ensureRootId(): string {
  if (!workspace.rootId.value) {
    throw new Error('当前未读取到可导入的书签根目录');
  }
  return workspace.rootId.value;
}

function downloadFile(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatExportTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function readFileText(file: File): Promise<string> {
  return file.text();
}

async function runImportExport(task: () => Promise<void>, options?: { closeOnSuccess?: boolean }) {
  importExportBusy.value = true;
  importExportError.value = '';

  try {
    await task();
    if (options?.closeOnSuccess) {
      importExportOpen.value = false;
    }
  } catch (error) {
    importExportError.value = error instanceof Error ? error.message : '导入导出失败';
  } finally {
    importExportBusy.value = false;
  }
}

async function exportFullBookmarkData() {
  await runImportExport(async () => {
    const [extras, preferences] = await Promise.all([getExtras(), getPreferences()]);
    const data = exportFullData(workspace.folders.value, extras, preferences);
    downloadFile(`markhub-full-export-${formatExportTimestamp()}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  });
}

async function importFullBookmarkData(file: File) {
  await runImportExport(async () => {
    const text = await readFileText(file);
    const data = JSON.parse(text);
    await importFullData(ensureRootId(), data);
    await workspace.reload();
  }, { closeOnSuccess: true });
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (mode.value !== 'organize' || !canUndo.value) return;
  if (bookmarkModalOpen.value || folderModalOpen.value) return;
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return;
  if (event.key.toLowerCase() !== 'z') return;
  if (isEditableTarget(event.target)) return;

  event.preventDefault();
  void undoLastMove();
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

function destroySortables() {
  sortableInstances.forEach((instance) => instance.destroy());
  sortableInstances.clear();
}

function setupSortables() {
  destroySortables();
  if (mode.value !== 'organize') return;

  workspace.folders.value.forEach((folder) => {
    const element = folderListRefs.value[folder.id];
    if (!element) return;

    const sortable = Sortable.create(element, {
      group: 'bookmark-folders',
      animation: 150,
      handle: '.drag-handle',
      draggable: '.bookmark-card',
      ghostClass: 'bookmark-card-ghost',
      chosenClass: 'bookmark-card-chosen',
      dragClass: 'bookmark-card-dragging',
      onEnd: async (event) => {
        const bookmarkId = event.item.getAttribute('data-bookmark-id');
        const toFolderId = event.to.getAttribute('data-folder-id');
        const fromFolderId = event.from.getAttribute('data-folder-id');

        if (!bookmarkId || !toFolderId || !fromFolderId || event.newIndex == null) {
          await workspace.reload({ silent: true });
          return;
        }

        const sourceFolder = workspace.folders.value.find((folderItem) => folderItem.id === fromFolderId);
        const sourceBookmark = sourceFolder?.bookmarks.find((bookmark) => bookmark.id === bookmarkId);
        if (!sourceBookmark) {
          await workspace.reload({ silent: true });
          return;
        }

        lastMoveSnapshot.value = {
          id: bookmarkId,
          parentId: sourceBookmark.parentId,
          index: sourceBookmark.index
        };

        const targetIndex =
          fromFolderId === toFolderId && event.oldIndex != null && event.newIndex > event.oldIndex
            ? event.newIndex + 1
            : event.newIndex;

        const movedBookmark = await moveBookmarkOrder({
          bookmarkId,
          parentId: toFolderId,
          index: targetIndex
        });
        workspace.moveBookmark({
          bookmarkId,
          parentId: movedBookmark.parentId ?? toFolderId,
          index: movedBookmark.index ?? targetIndex
        });
      }
    });

    sortableInstances.set(folder.id, sortable);
  });
}

onMounted(() => {
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition, { passive: true });
  window.addEventListener('keydown', handleGlobalKeydown);
  void nextTick().then(updateOverlayPosition);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateOverlayPosition);
  window.removeEventListener('scroll', updateOverlayPosition);
  window.removeEventListener('keydown', handleGlobalKeydown);
  destroySortables();
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

watch(
  () => [mode.value, workspace.folders.value.map((folder) => `${folder.id}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|')],
  () => {
    void nextTick().then(setupSortables);
  },
  { immediate: true }
);
</script>

<template>
  <div class="markhub-shell">
    <Sidebar :total="workspace.totalBookmarks.value" :tags="workspace.tags.value" @open-settings="openImportExport" />
    <HeaderBar
      :mode="mode"
      :query="query"
      :engine="workspace.searchEngine.value"
      @update:mode="mode = $event"
      @update:query="query = $event"
      @update:engine="workspace.setSearchEngine($event)"
      @add-bookmark="startAddBookmark"
      @add-folder="startAddFolder"
      @search-keydown="handleSearchKeydown"
      @search-box-ready="setSearchBoxElement"
    />

    <main class="content-area">
      <OrganizeToolbar
        v-if="mode === 'organize'"
        :can-undo="canUndo"
        @add-bookmark="startAddBookmark"
        @add-folder="startAddFolder"
        @undo="undoLastMove"
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
          <div class="folder-head">
            <button class="folder-head-main" type="button" @click="workspace.toggleFolder(folder.id)">
              <Folder :size="16" />
              <strong>{{ folder.title }}</strong>
              <span>{{ folder.bookmarks.length }}</span>
              <ChevronDown :size="14" :class="{ collapsed: folder.collapsed }" />
            </button>
            <div v-if="mode === 'organize'" class="folder-head-actions">
              <button type="button" aria-label="编辑目录" @click="startEditFolder(folder)">
                <Pencil :size="12" />
              </button>
              <button type="button" aria-label="删除目录" @click="requestDeleteFolder(folder)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <div
            v-if="!folder.collapsed"
            :ref="(element) => setFolderListRef(folder.id, element)"
            class="bookmark-grid"
            :class="{ 'bookmark-grid-organizing': mode === 'organize' }"
            :data-folder-id="folder.id"
          >
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
    <FolderModal
      :open="folderModalOpen"
      :folder="editingFolder"
      @close="
        folderModalOpen = false;
        editingFolder = undefined
      "
      @save="saveFolder"
    />
    <ConfirmModal
      :open="Boolean(folderPendingDelete)"
      title="删除目录"
      :description="folderPendingDelete ? `删除目录“${folderPendingDelete.title}”后，目录内书签也会一并删除。` : ''"
      confirm-text="确认删除"
      danger
      @close="folderPendingDelete = undefined"
      @confirm="confirmDeleteFolder"
    />
    <ImportExportModal
      :open="importExportOpen"
      :busy="importExportBusy"
      :error="importExportError"
      @close="importExportOpen = false"
      @export-full="exportFullBookmarkData"
      @import-full="importFullBookmarkData"
    />
  </div>
</template>
