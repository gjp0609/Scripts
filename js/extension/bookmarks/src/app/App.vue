<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { FolderPlus, Maximize2, Menu, Minimize2, Plus, RefreshCw, Settings, SlidersHorizontal } from 'lucide-vue-next';
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui';
import type { BookmarkView, QuickSearchTarget, TagSummary } from '../types/bookmark';
import { moveBookmarkOrder, moveFolderOrder } from '../services/bookmarkRepository';
import {
  buildQuickSearchUrl,
  buildSearchEngineUrl,
  filterFolders,
  filterFoldersByTitle
} from '../services/searchService';
import { openUrl } from '../services/extensionRuntime';
import { useBookmarkWorkspace } from './useBookmarkWorkspace';
import { useBookmarkCrud } from './useBookmarkCrud';
import { useImportExport } from './useImportExport';
import { useOrganizeMode } from './useOrganizeMode';
import { normalizeSearchIndex } from './searchStateModel';
import { useSearchState } from './useSearchState';
import { useOrganizeDrag, type BookmarkMoveRequest, type FolderMoveRequest } from './useOrganizeDrag';
import { faviconRefreshTokenKey } from './faviconRefresh';
import BookmarkOrganizeCanvas from './components/BookmarkOrganizeCanvas.vue';
import BookmarkModal from './components/BookmarkModal.vue';
import BrowseCanvas from './components/BrowseCanvas.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import EmptyState from './components/EmptyState.vue';
import FolderModal from './components/FolderModal.vue';
import FolderOrganizeCanvas from './components/FolderOrganizeCanvas.vue';
import HeaderBar from './components/HeaderBar.vue';
import ImportExportModal from './components/ImportExportModal.vue';
import OrganizeToolbar from './components/OrganizeToolbar.vue';
import QuickSearchOverlay from './components/QuickSearchOverlay.vue';
import SearchOverlay from './components/SearchOverlay.vue';
import TagPanel from './components/TagPanel.vue';

const workspace = useBookmarkWorkspace();
const search = useSearchState({
  folders: workspace.folders,
  selectedEngineId: workspace.searchEngine,
  setSearchEngine: workspace.setSearchEngine
});
const organize = useOrganizeMode({ folders: workspace.folders, getScrollContainer: getPageViewport });
const mode = organize.mode;
const organizeKind = organize.kind;
const organizeCollapsedFolderIds = organize.collapsedFolderIds;
const crud = useBookmarkCrud(workspace);
const {
  bookmarkModalOpen,
  folderModalOpen,
  editingBookmark,
  editingFolder,
  bookmarkPendingDelete,
  folderPendingDelete,
  bookmarkError,
  folderError,
  bookmarkDeleteError,
  folderDeleteError,
  startAddBookmark,
  startEditBookmark,
  closeBookmark,
  startAddFolder,
  startEditFolder,
  closeFolder,
  requestBookmarkDelete,
  closeBookmarkDelete,
  requestFolderDelete,
  closeFolderDelete,
  saveBookmark,
  saveFolder,
  confirmDeleteBookmark,
  confirmDeleteFolder
} = crud;
const importExport = useImportExport(workspace);
const query = search.query;
const moveError = ref('');
const pendingMoveId = ref('');
const searchBoxEl = ref<HTMLDivElement>();
const searchInputEl = ref<HTMLInputElement>();
const pageContentEl = ref<HTMLElement>();
const overlayStyle = ref<CSSProperties>({ visibility: 'hidden' });
const overlaySuppressed = search.overlaySuppressed;
const activeQuickIndex = search.activeQuickIndex;
const activeTagIndex = search.activeTagIndex;
const activeEngineIndex = search.activeEngineIndex;
const faviconRefreshToken = ref(Date.now());
const faviconRefreshing = ref(false);
const utilityDockOpen = ref(false);
const engineMenuActive = search.engineMenuActive;
const tagPanelActive = ref(false);
const resetToken = ref(0);
let faviconRefreshTimer: number | undefined;

provide(faviconRefreshTokenKey, faviconRefreshToken);

function getPageViewport() {
  return pageContentEl.value?.closest<HTMLElement>('[data-reka-scroll-area-viewport]') ?? undefined;
}

const tagSummaries = search.tagSummaries;
const quickSearch = search.quickSearch;
const tagSearch = search.tagSearch;
const engineOptions = search.engineOptions;
const currentEngine = search.currentEngine;
const quickTargets = search.quickTargets;
const normalSearch = search.normalSearch;
const visibleFolders = computed(() => {
  if (quickSearch.value) return workspace.folders.value;
  if (mode.value === 'organize' && organizeKind.value === 'folder' && normalSearch.value) {
    return filterFoldersByTitle(workspace.folders.value, query.value);
  }
  const filtered = filterFolders(workspace.folders.value, tagSearch.value ? query.value : normalSearch.value ? query.value : '', tagSearch.value);
  if (mode.value !== 'organize' || organizeKind.value !== 'bookmark' || !query.value.trim()) return filtered;

  const filteredByFolder = new Map(filtered.map((folder) => [folder.id, folder.bookmarks]));
  return workspace.folders.value.map((folder) => ({
    ...folder,
    bookmarks: filteredByFolder.get(folder.id) ?? []
  }));
});
const showOverlay = search.showOverlay;
const reorderEnabled = computed(() => mode.value === 'organize');

function updateQuery(value: string) {
  search.updateQuery(value);
  scheduleOverlayPosition();
}

function syncEngineActive(index: number) {
  search.syncEngineActive(index);
}

function handleEngineKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!engineOptions.value.length) return;
  if (event.key === 'Enter') {
    void search.selectEngineAt(activeEngineIndex.value);
    return;
  }
  const offset = event.key === 'ArrowDown' ? 1 : -1;
  search.moveActiveEngine(offset);
}

function setSearchBoxElement(element: HTMLDivElement) {
  searchBoxEl.value = element;
  scheduleOverlayPosition();
}

function setSearchInputElement(element: HTMLInputElement) {
  searchInputEl.value = element;
}

function updateOverlayPosition() {
  const element = searchBoxEl.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width, window.innerWidth - 24);
  overlayStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)}px`,
    width: `${width}px`,
    visibility: 'visible'
  };
}

function scheduleOverlayPosition() {
  void nextTick().then(updateOverlayPosition);
}

function normalizeIndex(current: number, total: number): number {
  return normalizeSearchIndex(current, total);
}

function openBookmark(bookmark: BookmarkView) {
  if (mode.value === 'browse' && bookmark.url) void openUrl(bookmark.url);
}

function openQuickSearch(target: QuickSearchTarget) {
  const keyword = quickSearch.value?.keyword ?? '';
  if (!keyword) return;
  const url = buildQuickSearchUrl(target, keyword, currentEngine.value);
  if (url) void openUrl(url);
}

function selectTag(tag: TagSummary) {
  search.selectTag(tag.name);
  void nextTick(() => {
    searchInputEl.value?.focus();
    overlaySuppressed.value = true;
  });
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    handleEscape(event);
    return;
  }

  if (!quickSearch.value && !tagSearch.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    if (!engineOptions.value.length) return;
    void search.moveSelectedEngine(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (quickSearch.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeQuickIndex.value = normalizeIndex(activeQuickIndex.value + (event.key === 'ArrowDown' ? 1 : -1), quickTargets.value.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = quickTargets.value[activeQuickIndex.value];
      if (target && quickSearch.value.hasKeyword) openQuickSearch(target);
    }
    return;
  }

  if (tagSearch.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeTagIndex.value = normalizeIndex(activeTagIndex.value + (event.key === 'ArrowDown' ? 1 : -1), tagSearch.value.matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const tag = tagSearch.value.matches[activeTagIndex.value];
      if (tag) selectTag(tag);
    }
    return;
  }

  if (!query.value.trim()) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    void openUrl(buildSearchEngineUrl(currentEngine.value, query.value.trim()));
  }
}

function enterOrganize() {
  organize.enter();
  overlaySuppressed.value = true;
}

function exitOrganize() {
  organize.exit();
}

function toggleFolderFromTitle(folderId: string) {
  if (mode.value === 'browse') {
    workspace.toggleFolder(folderId);
    return;
  }
  organize.toggleFolder(folderId);
}

function setOrganizeKind(kind: 'bookmark' | 'folder') {
  organize.setKind(kind);
}

function setOrganizeFoldersCollapsed(collapsed: boolean) {
  organize.setAllCollapsed(collapsed);
}

async function applyFolderMove(request: FolderMoveRequest) {
  pendingMoveId.value = request.folderId;
  moveError.value = '';
  try {
    workspace.moveFolder(request.folderId, request.desiredPosition);
    await moveFolderOrder({ folderId: request.folderId, index: request.apiIndex });
    await workspace.reload({ silent: true });
  } catch (error) {
    moveError.value = error instanceof Error ? error.message : '目录排序失败';
    await workspace.reload({ silent: true });
  } finally {
    pendingMoveId.value = '';
  }
}

async function applyBookmarkMove(request: BookmarkMoveRequest) {
  if (request.expandTarget) {
    const next = new Set(organizeCollapsedFolderIds.value);
    next.delete(request.toFolderId);
    organizeCollapsedFolderIds.value = next;
  }
  pendingMoveId.value = request.bookmarkId;
  moveError.value = '';
  try {
    workspace.moveBookmark({ bookmarkId: request.bookmarkId, parentId: request.toFolderId, index: request.desiredIndex });
    const moved = await moveBookmarkOrder({ bookmarkId: request.bookmarkId, parentId: request.toFolderId, index: request.apiIndex });
    workspace.moveBookmark({ bookmarkId: request.bookmarkId, parentId: moved.parentId ?? request.toFolderId, index: moved.index ?? request.desiredIndex });
  } catch (error) {
    moveError.value = error instanceof Error ? error.message : '书签移动失败';
    await workspace.reload({ silent: true });
  } finally {
    pendingMoveId.value = '';
  }
}

const organizeDrag = useOrganizeDrag({
  enabled: reorderEnabled,
  kind: organizeKind,
  folders: workspace.folders,
  rootChildIds: workspace.rootChildIds,
  collapsedFolderIds: organizeCollapsedFolderIds,
  getScrollContainer: getPageViewport,
  onFolderMove: applyFolderMove,
  onBookmarkMove: applyBookmarkMove
});
const organizeForceExpanded = computed(() => Boolean(query.value.trim()) && !quickSearch.value);

function openImportExport() {
  importExport.show();
}

function refreshAllFavicons() {
  faviconRefreshToken.value = Date.now();
  faviconRefreshing.value = true;
  window.clearTimeout(faviconRefreshTimer);
  faviconRefreshTimer = window.setTimeout(() => {
    faviconRefreshing.value = false;
  }, 650);
}

function runUtilityAction(action: () => unknown) {
  utilityDockOpen.value = false;
  void action();
}

function handleUtilityFocusOut(event: FocusEvent) {
  const dock = event.currentTarget as HTMLElement;
  if (!(event.relatedTarget instanceof Node) || !dock.contains(event.relatedTarget)) utilityDockOpen.value = false;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function hasOpenModal() {
  return Boolean(bookmarkModalOpen.value || folderModalOpen.value || bookmarkPendingDelete.value || folderPendingDelete.value || importExport.open.value);
}

function resetTransientSurfaces() {
  resetToken.value += 1;
  engineMenuActive.value = false;
  tagPanelActive.value = false;
  utilityDockOpen.value = false;
}

function handleEscape(event: KeyboardEvent) {
  if (organizeDrag.cancelDrag()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (hasOpenModal()) {
    if (importExport.busy.value) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (engineMenuActive.value || tagPanelActive.value || utilityDockOpen.value) {
    resetTransientSurfaces();
    return;
  }
  if (showOverlay.value) {
    overlaySuppressed.value = true;
    return;
  }
  if (query.value) {
    query.value = '';
    overlaySuppressed.value = false;
    activeQuickIndex.value = 0;
    activeTagIndex.value = 0;
    return;
  }
  if (mode.value === 'organize') {
    exitOrganize();
    return;
  }
  void nextTick(() => searchInputEl.value?.focus());
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if (event.key === 'Escape') {
    handleEscape(event);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInputEl.value?.focus();
    return;
  }
  if (!hasOpenModal() && !isEditableTarget(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.isComposing || event.key === 'Process' || event.key === 'Unidentified' || event.keyCode === 229) {
      searchInputEl.value?.focus();
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      resetTransientSurfaces();
      updateQuery(`${query.value}${event.key}`);
      void nextTick(() => {
        const input = searchInputEl.value;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
      return;
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition, { passive: true });
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateOverlayPosition);
  window.removeEventListener('scroll', updateOverlayPosition);
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.clearTimeout(faviconRefreshTimer);
});

watch(
  () => [currentEngine.value.id, showOverlay.value],
  scheduleOverlayPosition,
  { flush: 'post' }
);

</script>

<template>
  <div class="bookmarks-page" :class="[`mode-${mode}`, `organize-${organizeKind}`]">
    <HeaderBar
      :query="query"
      :engines="engineOptions"
      :engine="currentEngine"
      :active-engine-index="activeEngineIndex"
      :reset-token="resetToken"
      @update:query="updateQuery"
      @update:engine="workspace.setSearchEngine"
      @search-keydown="handleSearchKeydown"
      @search-focus="overlaySuppressed = false"
      @engine-menu-open="engineMenuActive = $event"
      @engine-active-change="syncEngineActive"
      @engine-keydown="handleEngineKeydown"
      @search-box-ready="setSearchBoxElement"
      @search-input-ready="setSearchInputElement"
    />

    <TagPanel :tags="tagSummaries" :query="query" :reset-token="resetToken" @select="selectTag" @open-change="tagPanelActive = $event" />

    <OrganizeToolbar
      v-if="mode === 'organize'"
      :kind="organizeKind"
      @update:kind="setOrganizeKind"
      @add-bookmark="startAddBookmark"
      @add-folder="startAddFolder"
      @expand-all="setOrganizeFoldersCollapsed(false)"
      @collapse-all="setOrganizeFoldersCollapsed(true)"
      @exit="exitOrganize"
    />

    <nav
      v-if="mode === 'browse'"
      class="utility-dock"
      :class="{ open: utilityDockOpen, 'with-tags': tagSummaries.length > 0 }"
      aria-label="书签工具"
      @pointerenter="utilityDockOpen = true"
      @pointerleave="utilityDockOpen = false"
      @focusin="utilityDockOpen = true"
      @focusout="handleUtilityFocusOut"
    >
      <button class="utility-dock-trigger" type="button" aria-label="书签工具" @click="utilityDockOpen = true"><Menu :size="15" /></button>
      <div class="utility-dock-actions">
        <button type="button" aria-label="添加书签" @click="runUtilityAction(startAddBookmark)"><Plus :size="15" /></button>
        <button type="button" aria-label="添加目录" @click="runUtilityAction(startAddFolder)"><FolderPlus :size="15" /></button>
        <button type="button" aria-label="整理书签" @click="runUtilityAction(enterOrganize)"><SlidersHorizontal :size="15" /></button>
        <button type="button" aria-label="全部展开" @click="runUtilityAction(() => workspace.setAllFoldersCollapsed(false))"><Maximize2 :size="15" /></button>
        <button type="button" aria-label="全部收缩" @click="runUtilityAction(() => workspace.setAllFoldersCollapsed(true))"><Minimize2 :size="15" /></button>
        <button type="button" aria-label="刷新全部图标" :class="{ refreshing: faviconRefreshing }" @click="runUtilityAction(refreshAllFavicons)"><RefreshCw :size="15" /></button>
        <button type="button" aria-label="备份与设置" @click="runUtilityAction(openImportExport)"><Settings :size="15" /></button>
      </div>
    </nav>

    <ScrollAreaRoot class="page-scroll-area" type="hover" :scroll-hide-delay="350">
      <ScrollAreaViewport class="page-scroll-viewport">
        <main ref="pageContentEl" class="page-content">
      <p v-if="moveError" class="page-error">{{ moveError }}</p>
      <EmptyState v-if="workspace.loading.value" title="正在读取书签" description="正在同步浏览器书签。" />
      <EmptyState v-else-if="workspace.error.value" title="无法读取书签" :description="workspace.error.value" />
      <EmptyState v-else-if="!visibleFolders.length" :title="query ? '没有匹配结果' : '还没有书签'" :description="query ? '修改搜索内容后继续。' : '请在书签栏下创建一层目录和书签。'" />

      <BrowseCanvas
        v-else-if="mode === 'browse'"
        :folders="visibleFolders"
        :force-expanded="Boolean(query)"
        @toggle-folder="toggleFolderFromTitle"
        @open-bookmark="openBookmark"
      />

      <BookmarkOrganizeCanvas
        v-else-if="organizeKind === 'bookmark'"
        :folders="visibleFolders"
        :collapsed-folder-ids="organizeCollapsedFolderIds"
        :dragging="organizeDrag.isDragging.value"
        :drop-projection="organizeDrag.bookmarkProjection.value"
        :force-expanded="organizeForceExpanded"
        @board-ready="organizeDrag.registerBoard"
        @folder-list-ready="organizeDrag.registerFolderList"
        @toggle-folder="toggleFolderFromTitle"
        @edit-folder="startEditFolder"
        @delete-folder="requestFolderDelete"
        @edit-bookmark="startEditBookmark"
        @delete-bookmark="requestBookmarkDelete"
      />

      <FolderOrganizeCanvas
        v-else
        :folders="visibleFolders"
        :projected-order="organizeDrag.folderProjectedOrder.value"
        :dragging-folder-id="organizeDrag.draggingItemId.value"
        @board-ready="organizeDrag.registerBoard"
        @edit-folder="startEditFolder"
        @delete-folder="requestFolderDelete"
      />
        </main>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar class="page-scrollbar" orientation="vertical">
        <ScrollAreaThumb class="page-scrollbar-thumb" />
      </ScrollAreaScrollbar>
    </ScrollAreaRoot>

    <QuickSearchOverlay
      v-if="showOverlay && quickSearch"
      :targets="quickTargets"
      :keyword="quickSearch.keyword"
      :active-index="activeQuickIndex"
      :overlay-style="overlayStyle"
      @open="openQuickSearch"
      @activate="activeQuickIndex = $event"
    />
    <SearchOverlay
      v-else-if="showOverlay && tagSearch"
      :tag-search="tagSearch"
      :active-index="activeTagIndex"
      :overlay-style="overlayStyle"
      @select-tag="selectTag"
      @activate="activeTagIndex = $event"
    />

    <BookmarkModal :open="bookmarkModalOpen" :folders="workspace.folders.value" :tags="tagSummaries" :bookmark="editingBookmark" :error="bookmarkError" @close="closeBookmark" @save="saveBookmark" />
    <FolderModal :open="folderModalOpen" :folder="editingFolder" :error="folderError" @close="closeFolder" @save="saveFolder" />
    <ConfirmModal :open="Boolean(bookmarkPendingDelete)" title="删除书签" :description="bookmarkPendingDelete ? `确认删除“${bookmarkPendingDelete.title}”？` : ''" :error="bookmarkDeleteError" confirm-text="删除" danger @close="closeBookmarkDelete" @confirm="confirmDeleteBookmark" />
    <ConfirmModal :open="Boolean(folderPendingDelete)" title="删除目录" :description="folderPendingDelete ? `目录“${folderPendingDelete.title}”及其中书签都会删除。` : ''" :error="folderDeleteError" confirm-text="删除" danger @close="closeFolderDelete" @confirm="confirmDeleteFolder" />
    <ImportExportModal :open="importExport.open.value" :busy="importExport.busy.value" :error="importExport.error.value" @close="importExport.close" @export-full="importExport.exportAll" @import-full="importExport.importAll" />
  </div>
</template>
