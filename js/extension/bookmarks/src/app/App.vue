<script setup lang="ts">
    import { computed, ref } from 'vue';
    import {
        FolderPlus,
        Maximize2,
        Menu,
        Minimize2,
        Plus,
        RefreshCw,
        Settings,
        SlidersHorizontal,
    } from 'lucide-vue-next';
    import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui';
    import { filterFolders, filterFoldersByTitle } from '../services/searchService';
    import { useBookmarkWorkspace } from './useBookmarkWorkspace';
    import { useBookmarkCrud } from './useBookmarkCrud';
    import { useImportExport } from './useImportExport';
    import { useOrganizeMode } from './useOrganizeMode';
    import { useOrganizeMove } from './useOrganizeMove';
    import { useSearchState } from './useSearchState';
    import { useOrganizeDrag } from './useOrganizeDrag';
    import { useBookmarkKeyboard } from './useBookmarkKeyboard';
    import { useFaviconRefresh } from './useFaviconRefresh';
    import { useSearchCommands } from './useSearchCommands';
    import { useSearchOverlayPosition } from './useSearchOverlayPosition';
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
        setSearchEngine: workspace.setSearchEngine,
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
        bookmarkSaving,
        folderSaving,
        bookmarkDeleting,
        folderDeleting,
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
        confirmDeleteFolder,
    } = crud;
    const importExport = useImportExport(workspace);
    const query = search.query;
    const searchCommands = useSearchCommands({ search, mode });
    const searchInputEl = searchCommands.searchInputElement;
    const pageContentEl = ref<HTMLElement>();
    const overlaySuppressed = search.overlaySuppressed;
    const activeQuickIndex = search.activeQuickIndex;
    const activeTagIndex = search.activeTagIndex;
    const activeEngineIndex = search.activeEngineIndex;
    const faviconRefresh = useFaviconRefresh();
    const faviconRefreshing = faviconRefresh.refreshing;
    const utilityDockOpen = ref(false);
    const engineMenuActive = search.engineMenuActive;
    const tagPanelActive = ref(false);

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
        const filtered = filterFolders(
            workspace.folders.value,
            tagSearch.value ? query.value : normalSearch.value ? query.value : '',
            tagSearch.value,
        );
        if (mode.value !== 'organize' || organizeKind.value !== 'bookmark' || !query.value.trim()) return filtered;

        const filteredByFolder = new Map(filtered.map((folder) => [folder.id, folder.bookmarks]));
        return workspace.folders.value.map((folder) => ({
            ...folder,
            bookmarks: filteredByFolder.get(folder.id) ?? [],
        }));
    });
    const showOverlay = search.showOverlay;
    const reorderEnabled = computed(() => mode.value === 'organize');
    const overlayPosition = useSearchOverlayPosition({
        currentEngineId: computed(() => currentEngine.value.id),
        visible: showOverlay,
    });
    const overlayStyle = overlayPosition.style;

    function updateQuery(value: string) {
        search.updateQuery(value);
        overlayPosition.schedule();
    }

    function syncEngineActive(index: number) {
        search.syncEngineActive(index);
    }

    function setEngineMenuOpen(open: boolean) {
        engineMenuActive.value = open;
        if (!open) return;
        tagPanelActive.value = false;
        utilityDockOpen.value = false;
    }

    function setTagPanelOpen(open: boolean) {
        tagPanelActive.value = open;
        if (!open) return;
        engineMenuActive.value = false;
        utilityDockOpen.value = false;
        overlaySuppressed.value = true;
    }

    function setUtilityDockOpen(open: boolean) {
        utilityDockOpen.value = open;
        if (!open) return;
        engineMenuActive.value = false;
        tagPanelActive.value = false;
        overlaySuppressed.value = true;
    }

    function handleSearchKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            keyboard.handleEscape(event);
            return;
        }
        searchCommands.handleSearchKeydown(event);
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

    const organizeMove = useOrganizeMove({ workspace, collapsedFolderIds: organizeCollapsedFolderIds });
    const moveError = organizeMove.error;

    const organizeDrag = useOrganizeDrag({
        enabled: reorderEnabled,
        kind: organizeKind,
        folders: workspace.folders,
        rootChildIds: workspace.rootChildIds,
        collapsedFolderIds: organizeCollapsedFolderIds,
        getScrollContainer: getPageViewport,
        onFolderMove: organizeMove.applyFolderMove,
        onBookmarkMove: organizeMove.applyBookmarkMove,
    });
    const keyboard = useBookmarkKeyboard({
        query,
        showOverlay,
        overlaySuppressed,
        activeQuickIndex,
        activeTagIndex,
        engineMenuActive,
        tagPanelActive,
        utilityDockOpen,
        searchInputElement: searchInputEl,
        mode,
        importBusy: importExport.busy,
        hasOpenModal,
        cancelDrag: organizeDrag.cancelDrag,
        exitOrganize,
        updateQuery,
    });
    const organizeForceExpanded = computed(() => Boolean(query.value.trim()) && !quickSearch.value);

    function openImportExport() {
        importExport.show();
    }

    function runUtilityAction(action: () => unknown) {
        utilityDockOpen.value = false;
        void action();
    }

    function handleUtilityFocusOut(event: FocusEvent) {
        const dock = event.currentTarget as HTMLElement;
        if (!(event.relatedTarget instanceof Node) || !dock.contains(event.relatedTarget))
            utilityDockOpen.value = false;
    }

    function hasOpenModal() {
        return Boolean(
            bookmarkModalOpen.value ||
            folderModalOpen.value ||
            bookmarkPendingDelete.value ||
            folderPendingDelete.value ||
            importExport.open.value,
        );
    }
</script>

<template>
    <div class="bookmarks-page" :class="[`mode-${mode}`, `organize-${organizeKind}`]">
        <HeaderBar
            :query="query"
            :engines="engineOptions"
            :engine="currentEngine"
            :active-engine-index="activeEngineIndex"
            :engine-menu-open="engineMenuActive"
            @update:query="updateQuery"
            @update:engine="workspace.setSearchEngine"
            @search-keydown="handleSearchKeydown"
            @search-focus="overlaySuppressed = false"
            @update:engine-menu-open="setEngineMenuOpen"
            @engine-active-change="syncEngineActive"
            @engine-keydown="searchCommands.handleEngineKeydown"
            @search-box-ready="overlayPosition.setSearchBoxElement"
            @search-input-ready="searchCommands.setSearchInputElement"
        />

        <TagPanel
            :tags="tagSummaries"
            :query="query"
            :open="tagPanelActive"
            @select="searchCommands.selectTag"
            @update:open="setTagPanelOpen"
        />

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
            :class="{ 'open': utilityDockOpen, 'with-tags': tagSummaries.length > 0 }"
            aria-label="书签工具"
            @pointerenter="setUtilityDockOpen(true)"
            @pointerleave="setUtilityDockOpen(false)"
            @focusin="setUtilityDockOpen(true)"
            @focusout="handleUtilityFocusOut"
        >
            <button class="utility-dock-trigger" type="button" aria-label="书签工具" @click="setUtilityDockOpen(true)"
                ><Menu :size="15"
            /></button>
            <div class="utility-dock-actions">
                <button type="button" aria-label="添加书签" @click="runUtilityAction(startAddBookmark)"
                    ><Plus :size="15"
                /></button>
                <button type="button" aria-label="添加目录" @click="runUtilityAction(startAddFolder)"
                    ><FolderPlus :size="15"
                /></button>
                <button type="button" aria-label="整理书签" @click="runUtilityAction(enterOrganize)"
                    ><SlidersHorizontal :size="15"
                /></button>
                <button
                    type="button"
                    aria-label="全部展开"
                    @click="runUtilityAction(() => workspace.setAllFoldersCollapsed(false))"
                    ><Maximize2 :size="15"
                /></button>
                <button
                    type="button"
                    aria-label="全部收缩"
                    @click="runUtilityAction(() => workspace.setAllFoldersCollapsed(true))"
                    ><Minimize2 :size="15"
                /></button>
                <button
                    type="button"
                    aria-label="刷新全部图标"
                    :class="{ refreshing: faviconRefreshing }"
                    @click="runUtilityAction(faviconRefresh.refreshAll)"
                    ><RefreshCw :size="15"
                /></button>
                <button type="button" aria-label="备份与设置" @click="runUtilityAction(openImportExport)"
                    ><Settings :size="15"
                /></button>
            </div>
        </nav>

        <ScrollAreaRoot class="page-scroll-area" type="hover" :scroll-hide-delay="350">
            <ScrollAreaViewport class="page-scroll-viewport">
                <main ref="pageContentEl" class="page-content">
                    <p v-if="moveError" class="page-error">{{ moveError }}</p>
                    <p v-if="searchCommands.error.value" class="page-error">{{ searchCommands.error.value }}</p>
                    <EmptyState
                        v-if="workspace.loading.value"
                        title="正在读取书签"
                        description="正在同步浏览器书签。"
                    />
                    <EmptyState
                        v-else-if="workspace.error.value"
                        title="无法读取书签"
                        :description="workspace.error.value"
                    />
                    <EmptyState
                        v-else-if="!visibleFolders.length"
                        :title="query ? '没有匹配结果' : '还没有书签'"
                        :description="query ? '修改搜索内容后继续。' : '请在书签栏下创建一层目录和书签。'"
                    />

                    <BrowseCanvas
                        v-else-if="mode === 'browse'"
                        :folders="visibleFolders"
                        :force-expanded="Boolean(query)"
                        @toggle-folder="toggleFolderFromTitle"
                        @open-bookmark="searchCommands.openBookmark"
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
            @open="searchCommands.openQuickSearch"
            @activate="activeQuickIndex = $event"
        />
        <SearchOverlay
            v-else-if="showOverlay && tagSearch"
            :tag-search="tagSearch"
            :active-index="activeTagIndex"
            :overlay-style="overlayStyle"
            @select-tag="searchCommands.selectTag"
            @activate="activeTagIndex = $event"
        />

        <BookmarkModal
            :open="bookmarkModalOpen"
            :folders="workspace.folders.value"
            :tags="tagSummaries"
            :bookmark="editingBookmark"
            :error="bookmarkError"
            :pending="bookmarkSaving"
            @close="closeBookmark"
            @save="saveBookmark"
        />
        <FolderModal
            :open="folderModalOpen"
            :folder="editingFolder"
            :error="folderError"
            :pending="folderSaving"
            @close="closeFolder"
            @save="saveFolder"
        />
        <ConfirmModal
            :open="Boolean(bookmarkPendingDelete)"
            title="删除书签"
            :description="bookmarkPendingDelete ? `确认删除“${bookmarkPendingDelete.title}”？` : ''"
            :error="bookmarkDeleteError"
            :pending="bookmarkDeleting"
            confirm-text="删除"
            danger
            @close="closeBookmarkDelete"
            @confirm="confirmDeleteBookmark"
        />
        <ConfirmModal
            :open="Boolean(folderPendingDelete)"
            title="删除目录"
            :description="folderPendingDelete ? `目录“${folderPendingDelete.title}”及其中书签都会删除。` : ''"
            :error="folderDeleteError"
            :pending="folderDeleting"
            confirm-text="删除"
            danger
            @close="closeFolderDelete"
            @confirm="confirmDeleteFolder"
        />
        <ImportExportModal
            :open="importExport.open.value"
            :busy="importExport.busy.value"
            :error="importExport.error.value"
            :maintenance-result="importExport.maintenanceResult.value"
            @close="importExport.close"
            @export-full="importExport.exportAll"
            @import-full="importExport.importAll"
            @repair-data="importExport.repairData"
        />
    </div>
</template>
