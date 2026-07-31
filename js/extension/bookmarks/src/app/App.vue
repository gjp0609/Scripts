<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import Macy from 'macy';
import { FolderPlus, GripVertical, Maximize2, Menu, Minimize2, Pencil, Plus, RefreshCw, Settings, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui';
import Sortable from 'sortablejs';
import type { BookmarkView, FolderView, QuickSearchTarget, TagSummary } from '../types/bookmark';
import {
  deleteBookmarkDetails,
  deleteFolderDetails,
  moveBookmarkOrder,
  moveFolderOrder,
  restoreBookmarkPosition,
  saveBookmarkDetails,
  saveFolderDetails,
  type BookmarkMoveSnapshot
} from '../services/bookmarkRepository';
import { getExtras, getPreferences } from '../services/extraStore';
import { exportFullData, importFullData } from '../services/importExportService';
import {
  buildQuickSearchUrl,
  buildSearchEngineUrl,
  filterFolders,
  getQuickSearchTargets,
  getSearchEngineOptions,
  getTagSummaries,
  parseQuickSearch,
  parseTagSearch,
  resolveSearchEngine
} from '../services/searchService';
import { openUrl } from '../services/extensionRuntime';
import { useBookmarkWorkspace } from './useBookmarkWorkspace';
import { faviconRefreshTokenKey } from './faviconRefresh';
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
import TagPanel from './components/TagPanel.vue';

type MoveState = { kind: 'bookmark' | 'folder'; label: string; snapshot: BookmarkMoveSnapshot };

const workspace = useBookmarkWorkspace();
const mode = ref<'browse' | 'organize'>('browse');
const organizeKind = ref<'bookmark' | 'folder'>('bookmark');
const organizeCollapsedFolderIds = ref<Set<string>>(new Set());
const query = ref('');
const bookmarkModalOpen = ref(false);
const folderModalOpen = ref(false);
const importExportOpen = ref(false);
const editingBookmark = ref<BookmarkView>();
const editingFolder = ref<FolderView>();
const bookmarkPendingDelete = ref<BookmarkView>();
const folderPendingDelete = ref<FolderView>();
const importExportBusy = ref(false);
const importExportError = ref('');
const actionError = ref('');
const pendingMoveId = ref('');
const lastMove = ref<MoveState>();
const searchBoxEl = ref<HTMLDivElement>();
const searchInputEl = ref<HTMLInputElement>();
const pageContentEl = ref<HTMLElement>();
const boardEl = ref<HTMLElement>();
const folderListRefs = ref<Record<string, HTMLElement | null>>({});
const overlayStyle = ref<CSSProperties>({ visibility: 'hidden' });
const overlaySuppressed = ref(false);
const activeQuickIndex = ref(0);
const activeTagIndex = ref(0);
const faviconRefreshToken = ref(Date.now());
const faviconRefreshing = ref(false);
const utilityDockOpen = ref(false);
const engineMenuActive = ref(false);
const tagPanelActive = ref(false);
const resetToken = ref(0);
const sortableInstances = new Map<string, Sortable>();
let macy: Macy | undefined;
let macyTrueOrder: boolean | undefined;
let layoutFrame = 0;
let restoreScrollY = 0;
let faviconRefreshTimer: number | undefined;
let activeBookmarkDropList: HTMLElement | undefined;
let bookmarkDropLayoutTimer: number | undefined;

provide(faviconRefreshTokenKey, faviconRefreshToken);

function getPageViewport() {
  return pageContentEl.value?.closest<HTMLElement>('[data-reka-scroll-area-viewport]');
}

const tagSummaries = computed(() => getTagSummaries(workspace.folders.value));
const quickSearch = computed(() => parseQuickSearch(query.value));
const tagSearch = computed(() => parseTagSearch(query.value, tagSummaries.value));
const engineOptions = computed(() => getSearchEngineOptions(workspace.folders.value));
const currentEngine = computed(() => resolveSearchEngine(engineOptions.value, workspace.searchEngine.value));
const quickTargets = computed(() => getQuickSearchTargets(workspace.folders.value, quickSearch.value?.siteQuery ?? ''));
const normalSearch = computed(() => !quickSearch.value && !tagSearch.value && Boolean(query.value.trim()));
const visibleFolders = computed(() => {
  if (quickSearch.value) return workspace.folders.value;
  const filtered = filterFolders(workspace.folders.value, tagSearch.value ? query.value : normalSearch.value ? query.value : '', tagSearch.value);
  if (mode.value !== 'organize' || organizeKind.value !== 'bookmark' || !query.value.trim()) return filtered;

  const filteredByFolder = new Map(filtered.map((folder) => [folder.id, folder.bookmarks]));
  return workspace.folders.value.map((folder) => ({
    ...folder,
    bookmarks: filteredByFolder.get(folder.id) ?? []
  }));
});
const canUndo = computed(() => Boolean(lastMove.value) && !pendingMoveId.value);
const showOverlay = computed(() => Boolean(quickSearch.value || tagSearch.value) && !overlaySuppressed.value && !engineMenuActive.value);
const reorderEnabled = computed(() => mode.value === 'organize');
const folderGridMode = computed(() => mode.value === 'organize' && organizeKind.value === 'folder');

function updateQuery(value: string) {
  query.value = value;
  overlaySuppressed.value = false;
  activeQuickIndex.value = 0;
  activeTagIndex.value = 0;
  scheduleOverlayPosition();
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
  if (!total) return 0;
  return ((current % total) + total) % total;
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
  query.value = `#${tag.name}`;
  overlaySuppressed.value = true;
  activeTagIndex.value = 0;
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
    const currentIndex = engineOptions.value.findIndex((engine) => engine.id === currentEngine.value.id);
    const nextIndex = normalizeIndex((currentIndex < 0 ? 0 : currentIndex) + (event.key === 'ArrowDown' ? 1 : -1), engineOptions.value.length);
    void workspace.setSearchEngine(engineOptions.value[nextIndex].id);
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
  restoreScrollY = getPageViewport()?.scrollTop ?? window.scrollY;
  organizeCollapsedFolderIds.value = new Set();
  mode.value = 'organize';
  overlaySuppressed.value = true;
}

function exitOrganize() {
  mode.value = 'browse';
  void nextTick(() => {
    const viewport = getPageViewport();
    if (viewport) viewport.scrollTo({ top: restoreScrollY });
    else window.scrollTo({ top: restoreScrollY });
  });
}

function startAddBookmark() {
  editingBookmark.value = undefined;
  bookmarkModalOpen.value = true;
}

function startAddFolder() {
  editingFolder.value = undefined;
  folderModalOpen.value = true;
}

function startEditBookmark(bookmark: BookmarkView) {
  editingBookmark.value = bookmark;
  bookmarkModalOpen.value = true;
}

function startEditFolder(folder: FolderView) {
  editingFolder.value = folder;
  folderModalOpen.value = true;
}

async function saveBookmark(value: Parameters<typeof saveBookmarkDetails>[0]) {
  actionError.value = '';
  try {
    const bookmark = await saveBookmarkDetails(value);
    workspace.upsertBookmark(bookmark);
    bookmarkModalOpen.value = false;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '保存书签失败';
  }
}

async function saveFolder(value: { id?: string; title: string }) {
  if (!value.title || !workspace.rootId.value) return;
  actionError.value = '';
  try {
    const folder = await saveFolderDetails({ id: value.id, parentId: workspace.rootId.value, title: value.title });
    workspace.upsertFolder(folder);
    folderModalOpen.value = false;
    editingFolder.value = undefined;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '保存目录失败';
  }
}

async function confirmDeleteBookmark() {
  const bookmark = bookmarkPendingDelete.value;
  if (!bookmark) return;
  actionError.value = '';
  try {
    await deleteBookmarkDetails(bookmark.id);
    workspace.removeBookmark(bookmark.id);
    bookmarkPendingDelete.value = undefined;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '删除书签失败';
  }
}

async function confirmDeleteFolder() {
  const folder = folderPendingDelete.value;
  if (!folder) return;
  actionError.value = '';
  try {
    await deleteFolderDetails(folder.id);
    workspace.removeFolder(folder.id);
    folderPendingDelete.value = undefined;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '删除目录失败';
  }
}

async function undoLastMove() {
  const move = lastMove.value;
  if (!move) return;
  pendingMoveId.value = move.snapshot.id;
  try {
    const restored = await restoreBookmarkPosition(move.snapshot);
    if (move.kind === 'folder') await workspace.reload({ silent: true });
    else workspace.moveBookmark({ bookmarkId: restored.id, parentId: restored.parentId ?? move.snapshot.parentId ?? '', index: restored.index ?? move.snapshot.index ?? 0 });
    lastMove.value = undefined;
  } finally {
    pendingMoveId.value = '';
  }
}

function setFolderListRef(folderId: string, element: Element | { $el?: Element } | null) {
  const target = element instanceof Element ? element : element?.$el;
  folderListRefs.value[folderId] = target instanceof HTMLElement ? target : null;
}

function toggleFolderFromTitle(folderId: string) {
  if (mode.value === 'browse') {
    workspace.toggleFolder(folderId);
    return;
  }
  const next = new Set(organizeCollapsedFolderIds.value);
  if (next.has(folderId)) next.delete(folderId);
  else next.add(folderId);
  organizeCollapsedFolderIds.value = next;
}

function setOrganizeKind(kind: 'bookmark' | 'folder') {
  organizeKind.value = kind;
  organizeCollapsedFolderIds.value = kind === 'folder' ? new Set(workspace.folders.value.map((folder) => folder.id)) : new Set();
}

function setOrganizeFoldersCollapsed(collapsed: boolean) {
  organizeCollapsedFolderIds.value = collapsed ? new Set(workspace.folders.value.map((folder) => folder.id)) : new Set();
}

function isFolderContentVisible(folder: FolderView) {
  if (mode.value === 'organize') {
    if (organizeKind.value === 'folder') return !organizeCollapsedFolderIds.value.has(folder.id);
    return Boolean(query.value) || !organizeCollapsedFolderIds.value.has(folder.id);
  }
  return Boolean(query.value) || !folder.collapsed;
}

function shouldRenderBookmarkList(folder: FolderView) {
  return mode.value === 'organize' && organizeKind.value === 'bookmark' ? true : isFolderContentVisible(folder);
}

function destroySortables() {
  setActiveBookmarkDropList();
  sortableInstances.forEach((instance) => instance.destroy());
  sortableInstances.clear();
}

function setActiveBookmarkDropList(element?: HTMLElement) {
  const next = element?.classList.contains('bookmark-list-collapsed') ? element : undefined;
  if (activeBookmarkDropList === next) return;
  activeBookmarkDropList?.classList.remove('bookmark-drop-active');
  activeBookmarkDropList = next;
  activeBookmarkDropList?.classList.add('bookmark-drop-active');
  scheduleLayout();
  window.clearTimeout(bookmarkDropLayoutTimer);
  bookmarkDropLayoutTimer = window.setTimeout(scheduleLayout, 80);
}

function getVisibleOrder(container: HTMLElement, selector: string, attribute: string): string[] {
  return [...container.querySelectorAll<HTMLElement>(selector)]
    .map((element) => element.getAttribute(attribute) ?? '')
    .filter(Boolean);
}

function resolveFilteredMoveIndex(fullOrder: string[], visibleOrder: string[], movedId: string): number {
  const orderWithoutMoved = fullOrder.filter((id) => id !== movedId);
  const visibleIndex = visibleOrder.indexOf(movedId);
  if (visibleIndex < 0) return orderWithoutMoved.length;

  const nextId = visibleOrder[visibleIndex + 1];
  if (nextId) {
    const nextIndex = orderWithoutMoved.indexOf(nextId);
    if (nextIndex >= 0) return nextIndex;
  }

  const previousId = visibleOrder[visibleIndex - 1];
  if (previousId) {
    const previousIndex = orderWithoutMoved.indexOf(previousId);
    if (previousIndex >= 0) return previousIndex + 1;
  }

  return orderWithoutMoved.length;
}

function toBrowserMoveIndex(desiredIndex: number, sourceIndex: number, sameParent: boolean): number {
  return sameParent && desiredIndex > sourceIndex ? desiredIndex + 1 : desiredIndex;
}

function resolveFolderBrowserIndex(visibleOrder: string[], movedId: string): number {
  const visibleIndex = visibleOrder.indexOf(movedId);
  const nextId = visibleOrder[visibleIndex + 1];
  if (nextId) return workspace.folders.value.find((folder) => folder.id === nextId)?.index ?? 0;

  const previousId = visibleOrder[visibleIndex - 1];
  if (previousId) return (workspace.folders.value.find((folder) => folder.id === previousId)?.index ?? -1) + 1;

  return workspace.folders.value.find((folder) => folder.id === movedId)?.index ?? 0;
}

function setupFolderSortable() {
  if (!boardEl.value) return;
  const sortable = Sortable.create(boardEl.value, {
    animation: 150,
    draggable: '.folder-section',
    handle: '.folder-drag-handle',
    ghostClass: 'folder-ghost',
    chosenClass: 'folder-chosen',
    dragClass: 'folder-dragging',
    fallbackClass: 'folder-drag-preview',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    scroll: true,
    scrollSensitivity: 60,
    scrollSpeed: 12,
    onEnd: async (event) => {
      const folderId = event.item.getAttribute('data-folder-id');
      if (!folderId) return;
      const source = workspace.folders.value.find((folder) => folder.id === folderId);
      if (!source || !boardEl.value) return;
      const sourceIndex = source.index ?? workspace.folders.value.findIndex((folder) => folder.id === folderId);
      const visibleOrder = getVisibleOrder(boardEl.value, '.folder-section', 'data-folder-id');
      const sourcePosition = workspace.folders.value.findIndex((folder) => folder.id === folderId);
      const desiredPosition = resolveFilteredMoveIndex(workspace.folders.value.map((folder) => folder.id), visibleOrder, folderId);
      if (desiredPosition === sourcePosition) return;
      pendingMoveId.value = folderId;
      try {
        lastMove.value = { kind: 'folder', label: '目录排序', snapshot: { id: folderId, parentId: workspace.rootId.value, index: sourceIndex } };
        const apiIndex = resolveFolderBrowserIndex(visibleOrder, folderId);
        workspace.moveFolder(folderId, desiredPosition);
        await moveFolderOrder({ folderId, index: apiIndex });
        await workspace.reload({ silent: true });
      } catch (error) {
        actionError.value = error instanceof Error ? error.message : '目录排序失败';
        await workspace.reload({ silent: true });
      } finally {
        pendingMoveId.value = '';
      }
    }
  });
  sortableInstances.set('folders', sortable);
}

function setupBookmarkSortables() {
  workspace.folders.value.forEach((folder) => {
    const element = folderListRefs.value[folder.id];
    if (!element) return;
    const sortable = Sortable.create(element, {
      group: 'bookmark-folders',
      animation: 150,
      handle: '.drag-handle',
      draggable: '.bookmark-row',
      ghostClass: 'bookmark-ghost',
      chosenClass: 'bookmark-chosen',
      dragClass: 'bookmark-dragging',
      fallbackClass: 'bookmark-drag-preview',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      scroll: getPageViewport() ?? true,
      scrollSensitivity: 60,
      scrollSpeed: 12,
      emptyInsertThreshold: 32,
      onMove: (event) => {
        setActiveBookmarkDropList(event.to);
      },
      onUnchoose: () => setActiveBookmarkDropList(),
      onEnd: async (event) => {
        const bookmarkId = event.item.getAttribute('data-bookmark-id');
        const fromFolderId = event.from.getAttribute('data-folder-id');
        const toFolderId = event.to.getAttribute('data-folder-id');
        const expandTarget = Boolean(toFolderId) && organizeCollapsedFolderIds.value.has(toFolderId ?? '');
        setActiveBookmarkDropList();
        if (expandTarget && toFolderId) {
          const next = new Set(organizeCollapsedFolderIds.value);
          next.delete(toFolderId);
          organizeCollapsedFolderIds.value = next;
        }
        if (!bookmarkId || !fromFolderId || !toFolderId) return;
        const source = workspace.folders.value.find((folderItem) => folderItem.id === fromFolderId)?.bookmarks.find((bookmark) => bookmark.id === bookmarkId);
        const targetFolder = workspace.folders.value.find((folderItem) => folderItem.id === toFolderId);
        if (!source || !targetFolder) return;
        const sourceIndex = source.index ?? workspace.folders.value.find((folderItem) => folderItem.id === fromFolderId)?.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId) ?? 0;
        const visibleOrder = getVisibleOrder(event.to, '.bookmark-row', 'data-bookmark-id');
        const desiredIndex = resolveFilteredMoveIndex(targetFolder.bookmarks.map((bookmark) => bookmark.id), visibleOrder, bookmarkId);
        if (fromFolderId === toFolderId && desiredIndex === sourceIndex) return;
        pendingMoveId.value = bookmarkId;
        try {
          lastMove.value = { kind: 'bookmark', label: '书签移动', snapshot: { id: bookmarkId, parentId: fromFolderId, index: sourceIndex } };
          const apiIndex = toBrowserMoveIndex(desiredIndex, sourceIndex, fromFolderId === toFolderId);
          const moved = await moveBookmarkOrder({ bookmarkId, parentId: toFolderId, index: apiIndex });
          workspace.moveBookmark({ bookmarkId, parentId: moved.parentId ?? toFolderId, index: moved.index ?? desiredIndex });
        } catch (error) {
          actionError.value = error instanceof Error ? error.message : '书签移动失败';
          await workspace.reload({ silent: true });
        } finally {
          pendingMoveId.value = '';
        }
      }
    });
    sortableInstances.set(folder.id, sortable);
  });
}

function setupSortables() {
  destroySortables();
  if (!reorderEnabled.value) return;
  if (organizeKind.value === 'folder') setupFolderSortable();
  else setupBookmarkSortables();
}

function destroyMacy() {
  cancelAnimationFrame(layoutFrame);
  macy?.remove();
  macy = undefined;
  macyTrueOrder = undefined;
  boardEl.value?.querySelectorAll<HTMLElement>('.folder-section').forEach((folder) => {
    folder.style.position = '';
    folder.style.left = '';
    folder.style.top = '';
    folder.style.width = '';
    folder.style.transform = '';
  });
}

function scheduleLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    void nextTick(() => {
      if (!boardEl.value || !visibleFolders.value.length) {
        destroyMacy();
        return;
      }
      if (folderGridMode.value) {
        destroyMacy();
        return;
      }
      const trueOrder = mode.value === 'organize';
      if (macy && macyTrueOrder !== trueOrder) destroyMacy();
      if (!macy) {
        macy = new Macy({
          container: boardEl.value,
          trueOrder,
          waitForImages: false,
          margin: { x: 24, y: 24 },
          columns: 5,
          useContainerForBreakpoints: true,
          breakAt: { 2400: 4, 1600: 3, 1200: 2, 800: 1 }
        });
        macyTrueOrder = trueOrder;
      }
      macy.recalculate(true, true);
    });
  });
}

function openImportExport() {
  importExportError.value = '';
  importExportOpen.value = true;
}

function refreshAllFavicons() {
  faviconRefreshToken.value = Date.now();
  faviconRefreshing.value = true;
  window.clearTimeout(faviconRefreshTimer);
  window.clearTimeout(bookmarkDropLayoutTimer);
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

function ensureRootId() {
  if (!workspace.rootId.value) throw new Error('当前未读取到可导入的书签根目录');
  return workspace.rootId.value;
}

function downloadFile(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportFullBookmarkData() {
  importExportBusy.value = true;
  try {
    const [extras, preferences] = await Promise.all([getExtras(), getPreferences()]);
    const data = exportFullData(workspace.folders.value, extras, preferences);
    downloadFile(`markhub-bookmarks-${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  } catch (error) {
    importExportError.value = error instanceof Error ? error.message : '导出失败';
  } finally {
    importExportBusy.value = false;
  }
}

async function importFullBookmarkData(file: File) {
  importExportBusy.value = true;
  try {
    await importFullData(ensureRootId(), JSON.parse(await file.text()));
    await workspace.reload();
    importExportOpen.value = false;
  } catch (error) {
    importExportError.value = error instanceof Error ? error.message : '导入失败';
  } finally {
    importExportBusy.value = false;
  }
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function hasOpenModal() {
  return Boolean(bookmarkModalOpen.value || folderModalOpen.value || bookmarkPendingDelete.value || folderPendingDelete.value || importExportOpen.value);
}

function resetTransientSurfaces() {
  resetToken.value += 1;
  engineMenuActive.value = false;
  tagPanelActive.value = false;
  utilityDockOpen.value = false;
}

function handleEscape(event: KeyboardEvent) {
  if (hasOpenModal()) {
    if (importExportBusy.value) {
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
  if (mode.value === 'organize' && canUndo.value && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !isEditableTarget(event.target)) {
    event.preventDefault();
    void undoLastMove();
  }
}

onMounted(() => {
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition, { passive: true });
  window.addEventListener('keydown', handleGlobalKeydown, true);
  scheduleLayout();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateOverlayPosition);
  window.removeEventListener('scroll', updateOverlayPosition);
  window.removeEventListener('keydown', handleGlobalKeydown, true);
  window.clearTimeout(faviconRefreshTimer);
  destroySortables();
  destroyMacy();
});

watch([quickTargets, () => tagSearch.value?.matches], () => {
  activeQuickIndex.value = normalizeIndex(activeQuickIndex.value, quickTargets.value.length);
  activeTagIndex.value = normalizeIndex(activeTagIndex.value, tagSearch.value?.matches.length ?? 0);
});

watch(
  () => [currentEngine.value.id, showOverlay.value],
  scheduleOverlayPosition,
  { flush: 'post' }
);

watch(
  () => [mode.value, organizeKind.value, reorderEnabled.value, [...organizeCollapsedFolderIds.value].sort().join(','), visibleFolders.value.map((folder) => `${folder.id}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|')],
  () => void nextTick(setupSortables),
  { immediate: true }
);

watch(
  () => [mode.value, organizeKind.value, query.value, [...organizeCollapsedFolderIds.value].sort().join(','), visibleFolders.value.map((folder) => `${folder.id}:${folder.collapsed}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|')],
  scheduleLayout,
  { immediate: true }
);
</script>

<template>
  <div class="bookmarks-page" :class="[`mode-${mode}`, `organize-${organizeKind}`]">
    <HeaderBar
      :query="query"
      :engines="engineOptions"
      :engine="currentEngine"
      :reset-token="resetToken"
      @update:query="updateQuery"
      @update:engine="workspace.setSearchEngine"
      @search-keydown="handleSearchKeydown"
      @search-focus="overlaySuppressed = false"
      @engine-menu-open="engineMenuActive = $event"
      @search-box-ready="setSearchBoxElement"
      @search-input-ready="setSearchInputElement"
    />

    <TagPanel :tags="tagSummaries" :query="query" :reset-token="resetToken" @select="selectTag" @open-change="tagPanelActive = $event" />

    <OrganizeToolbar
      v-if="mode === 'organize'"
      :kind="organizeKind"
      :can-undo="canUndo"
      @update:kind="setOrganizeKind"
      @add-bookmark="startAddBookmark"
      @add-folder="startAddFolder"
      @expand-all="setOrganizeFoldersCollapsed(false)"
      @collapse-all="setOrganizeFoldersCollapsed(true)"
      @undo="undoLastMove"
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
      <p v-if="actionError" class="page-error">{{ actionError }}</p>
      <EmptyState v-if="workspace.loading.value" title="正在读取书签" description="正在同步浏览器书签。" />
      <EmptyState v-else-if="workspace.error.value" title="无法读取书签" :description="workspace.error.value" />
      <EmptyState v-else-if="!visibleFolders.length" :title="query ? '没有匹配结果' : '还没有书签'" :description="query ? '修改搜索内容后继续。' : '请在书签栏下创建一层目录和书签。'" />

      <section v-else ref="boardEl" class="folder-board">
        <article v-for="folder in visibleFolders" :key="folder.id" class="folder-section" :data-folder-id="folder.id">
          <header class="folder-head">
            <button v-if="reorderEnabled && organizeKind === 'folder'" class="folder-drag-handle" type="button" aria-label="拖拽目录"><GripVertical :size="15" /></button>
            <button class="folder-title" type="button" @click="toggleFolderFromTitle(folder.id)">
              <strong>{{ folder.title }}</strong>
              <small v-if="mode === 'organize'">{{ folder.bookmarks.length }}</small>
            </button>
            <span v-if="mode === 'organize'" class="folder-actions">
              <button type="button" title="编辑目录" @click="startEditFolder(folder)"><Pencil :size="13" /></button>
              <button class="danger" type="button" title="删除目录" @click="folderPendingDelete = folder"><Trash2 :size="13" /></button>
            </span>
          </header>
          <div
            v-if="shouldRenderBookmarkList(folder)"
            :ref="(element) => setFolderListRef(folder.id, element)"
            class="bookmark-list"
            :class="{ 'bookmark-list-collapsed': mode === 'organize' && organizeKind === 'bookmark' && !isFolderContentVisible(folder) }"
            :data-folder-id="folder.id"
          >
            <template v-if="isFolderContentVisible(folder)">
              <BookmarkCard
                v-for="bookmark in folder.bookmarks"
                :key="bookmark.id"
                :bookmark="bookmark"
                :organize="reorderEnabled && organizeKind === 'bookmark'"
                @open="openBookmark"
                @edit="startEditBookmark"
                @delete="bookmarkPendingDelete = $event"
              />
            </template>
            <p v-if="reorderEnabled && organizeKind === 'bookmark' && (!isFolderContentVisible(folder) || !folder.bookmarks.length)" class="empty-drop-zone" aria-label="书签投放区"></p>
          </div>
          <button v-else-if="mode === 'browse'" class="folder-collapsed" type="button" @click="toggleFolderFromTitle(folder.id)">...</button>
        </article>
      </section>
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

    <BookmarkModal :open="bookmarkModalOpen" :folders="workspace.folders.value" :tags="tagSummaries" :bookmark="editingBookmark" @close="bookmarkModalOpen = false" @save="saveBookmark" />
    <FolderModal :open="folderModalOpen" :folder="editingFolder" @close="folderModalOpen = false; editingFolder = undefined" @save="saveFolder" />
    <ConfirmModal :open="Boolean(bookmarkPendingDelete)" title="删除书签" :description="bookmarkPendingDelete ? `确认删除“${bookmarkPendingDelete.title}”？` : ''" confirm-text="删除" danger @close="bookmarkPendingDelete = undefined" @confirm="confirmDeleteBookmark" />
    <ConfirmModal :open="Boolean(folderPendingDelete)" title="删除目录" :description="folderPendingDelete ? `目录“${folderPendingDelete.title}”及其中书签都会删除。` : ''" confirm-text="删除" danger @close="folderPendingDelete = undefined" @confirm="confirmDeleteFolder" />
    <ImportExportModal :open="importExportOpen" :busy="importExportBusy" :error="importExportError" @close="importExportOpen = false" @export-full="exportFullBookmarkData" @import-full="importFullBookmarkData" />
  </div>
</template>
