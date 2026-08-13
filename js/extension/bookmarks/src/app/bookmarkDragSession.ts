import type { FolderView } from '../types/bookmark';
import {
    projectVisibleOrder,
    resolveFilteredMoveIndex,
    toBrowserMoveIndex,
    type BookmarkDropProjection,
    type BookmarkMoveRequest,
} from './organizeMoveModel';

export function createBookmarkDragSession(options: {
    getBoard: () => HTMLElement | undefined;
    getFolderList: (folderId: string) => HTMLElement | undefined;
    getFolders: () => FolderView[];
    getCollapsedFolderIds: () => Set<string>;
    setProjection: (projection: BookmarkDropProjection | undefined) => void;
}) {
    let draggedId = '';
    let sourceFolderId = '';
    let moveRequest: BookmarkMoveRequest | undefined;

    function begin(bookmarkId: string, parentId: string) {
        draggedId = bookmarkId;
        sourceFolderId = parentId;
    }

    function clearProjection() {
        options.setProjection(undefined);
        moveRequest = undefined;
    }

    function update(clientX: number, clientY: number) {
        const board = options.getBoard();
        if (!board || !draggedId || !sourceFolderId) return;
        const candidate = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.folder-section');
        const folderElement = candidate && board.contains(candidate) ? candidate : undefined;
        const toFolderId = folderElement?.getAttribute('data-folder-id') ?? '';
        if (!folderElement || !toFolderId) {
            clearProjection();
            return;
        }

        const list = options.getFolderList(toFolderId);
        const rows = list
            ? [...list.querySelectorAll<HTMLElement>('.bookmark-row')].filter(
                  (row) => row.getAttribute('data-bookmark-id') !== draggedId,
              )
            : [];
        const anchor = rows.find((row) => clientY <= row.getBoundingClientRect().bottom);
        const anchorId = anchor?.getAttribute('data-bookmark-id') ?? undefined;
        const anchorRect = anchor?.getBoundingClientRect();
        const insertAfter = Boolean(anchorRect && clientY >= anchorRect.top + anchorRect.height / 2);
        const source = options
            .getFolders()
            .find((folder) => folder.id === sourceFolderId)
            ?.bookmarks.find((bookmark) => bookmark.id === draggedId);
        const targetFolder = options.getFolders().find((folder) => folder.id === toFolderId);
        if (!source || !targetFolder) {
            clearProjection();
            return;
        }

        const projectedOrder = projectVisibleOrder(
            rows.map((row) => row.getAttribute('data-bookmark-id') ?? '').filter(Boolean),
            draggedId,
            anchorId,
            insertAfter,
        );
        const desiredIndex = resolveFilteredMoveIndex(
            targetFolder.bookmarks.map((bookmark) => bookmark.id),
            projectedOrder,
            draggedId,
        );
        options.setProjection({ folderId: toFolderId, anchorId, insertAfter });
        moveRequest = {
            bookmarkId: draggedId,
            fromFolderId: sourceFolderId,
            toFolderId,
            sourceIndex: source.index ?? 0,
            desiredIndex,
            apiIndex: toBrowserMoveIndex(desiredIndex, source.index ?? 0, sourceFolderId === toFolderId),
            expandTarget: options.getCollapsedFolderIds().has(toFolderId),
        };
    }

    function reset() {
        draggedId = '';
        sourceFolderId = '';
        clearProjection();
    }

    return {
        begin,
        update,
        reset,
        getMoveRequest: () => moveRequest,
    };
}
