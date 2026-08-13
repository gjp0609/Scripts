import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type Sortable from 'sortablejs';
import type { FolderView } from '../types/bookmark';
import type { BookmarkDropProjection, BookmarkMoveRequest, FolderMoveRequest } from './organizeMoveModel';
import { createBookmarkSortable, createFolderSortable } from './organizeSortableAdapters';
import { createBookmarkDragSession } from './bookmarkDragSession';
import { createFolderDragSession } from './folderDragSession';
import { createOrganizeDragScrollController } from './organizeDragScrollController';

type OrganizeDragOptions = {
    enabled: Ref<boolean>;
    kind: Ref<'bookmark' | 'folder'>;
    folders: Ref<FolderView[]>;
    rootChildIds: Ref<string[]>;
    collapsedFolderIds: Ref<Set<string>>;
    getScrollContainer: () => HTMLElement | null | undefined;
    onFolderMove: (request: FolderMoveRequest) => Promise<void>;
    onBookmarkMove: (request: BookmarkMoveRequest) => Promise<void>;
};

export function useOrganizeDrag(options: OrganizeDragOptions) {
    const isDragging = ref(false);
    const draggingItemId = ref('');
    const bookmarkProjection = ref<BookmarkDropProjection>();
    const folderProjectedOrder = ref<string[]>([]);
    const writePending = ref(false);
    const folderLists = new Map<string, HTMLElement>();
    const instances = new Map<string, Sortable>();
    let board: HTMLElement | undefined;
    let cancelled = false;

    const folderSession = createFolderDragSession({
        getBoard: () => board,
        getFolders: () => options.folders.value,
        getRootChildIds: () => options.rootChildIds.value,
        setProjectedOrder: (order) => {
            if (
                order.length === folderProjectedOrder.value.length &&
                order.every((id, index) => folderProjectedOrder.value[index] === id)
            ) {
                return;
            }
            folderProjectedOrder.value = order;
        },
    });
    const bookmarkSession = createBookmarkDragSession({
        getBoard: () => board,
        getFolderList: (folderId) => folderLists.get(folderId),
        getFolders: () => options.folders.value,
        getCollapsedFolderIds: () => options.collapsedFolderIds.value,
        setProjection: (projection) => {
            bookmarkProjection.value = projection;
        },
    });

    function updateProjection(clientX?: number, clientY?: number) {
        if (clientX == null || clientY == null || !isDragging.value) return;
        if (options.kind.value === 'folder') folderSession.update(clientX, clientY);
        else bookmarkSession.update(clientX, clientY);
    }

    const scrollController = createOrganizeDragScrollController({
        getScrollContainer: options.getScrollContainer,
        getKind: () => options.kind.value,
        isDragging: () => isDragging.value,
        project: updateProjection,
    });

    function beginDrag(event: Sortable.SortableEvent) {
        cancelled = false;
        isDragging.value = true;
        const attribute = options.kind.value === 'folder' ? 'data-folder-id' : 'data-bookmark-id';
        draggingItemId.value = event.item.getAttribute(attribute) ?? '';
        if (options.kind.value === 'folder') folderSession.begin(draggingItemId.value);
        else bookmarkSession.begin(draggingItemId.value, event.from.getAttribute('data-folder-id') ?? '');
        scrollController.start();
    }

    function finishDrag() {
        isDragging.value = false;
        draggingItemId.value = '';
        folderSession.reset();
        bookmarkSession.reset();
        scrollController.stop();
    }

    function destroyInstances() {
        instances.forEach((instance) => instance.destroy());
        instances.clear();
    }

    function destroy() {
        cancelled = true;
        destroyInstances();
        finishDrag();
    }

    function cancelDrag() {
        if (!isDragging.value) return false;
        cancelled = true;
        destroyInstances();
        finishDrag();
        void nextTick(setup);
        return true;
    }

    function registerBoard(element: HTMLElement) {
        board = element;
        if (!isDragging.value) void nextTick(setup);
    }

    function registerFolderList(folderId: string, element: HTMLElement | null) {
        if (element) folderLists.set(folderId, element);
        else folderLists.delete(folderId);
        if (!isDragging.value) void nextTick(setup);
    }

    function finishWrite(write: () => Promise<void>) {
        destroyInstances();
        writePending.value = true;
        void write().finally(() => {
            writePending.value = false;
            void nextTick(setup);
        });
    }

    function setupFolderDrag() {
        if (!board) return;
        const instance = createFolderSortable(board, {
            onStart: beginDrag,
            onMove: scrollController.updateFromEvent,
            onEnd: () => {
                const request = folderSession.getMoveRequest();
                const shouldApply =
                    !cancelled &&
                    request &&
                    options.folders.value.findIndex((folder) => folder.id === request.folderId) !==
                        request.desiredPosition;
                finishDrag();
                if (!shouldApply || !request) {
                    void nextTick(setup);
                    return;
                }
                finishWrite(() => options.onFolderMove(request));
            },
        });
        instances.set('folders', instance);
    }

    function setupBookmarkDrag() {
        options.folders.value.forEach((folder) => {
            const element = folderLists.get(folder.id);
            if (!element) return;
            const instance = createBookmarkSortable(element, {
                onStart: beginDrag,
                onMove: scrollController.projectCurrent,
                onEnd: () => {
                    const request = bookmarkSession.getMoveRequest();
                    const shouldApply =
                        !cancelled &&
                        request &&
                        (request.fromFolderId !== request.toFolderId || request.desiredIndex !== request.sourceIndex);
                    finishDrag();
                    if (!shouldApply || !request) {
                        void nextTick(setup);
                        return;
                    }
                    finishWrite(() => options.onBookmarkMove(request));
                },
            });
            instances.set(folder.id, instance);
        });
    }

    function setup() {
        destroyInstances();
        if (!options.enabled.value || writePending.value) return;
        if (options.kind.value === 'folder') setupFolderDrag();
        else setupBookmarkDrag();
    }

    watch(
        () => [
            options.enabled.value,
            options.kind.value,
            [...options.collapsedFolderIds.value].sort().join(','),
            options.folders.value
                .map((folder) => `${folder.id}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`)
                .join('|'),
        ],
        () => {
            if (!isDragging.value) void nextTick(setup);
        },
        { immediate: true },
    );

    onBeforeUnmount(destroy);

    return {
        isDragging,
        draggingItemId,
        bookmarkProjection,
        folderProjectedOrder,
        writePending,
        registerBoard,
        registerFolderList,
        cancelDrag,
        destroy,
    };
}
