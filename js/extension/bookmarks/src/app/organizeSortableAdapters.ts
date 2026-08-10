import Sortable from 'sortablejs';

type SharedCallbacks = {
    onStart: (event: Sortable.SortableEvent) => void;
    onEnd: () => void;
};

export function createFolderSortable(
    board: HTMLElement,
    callbacks: SharedCallbacks & { onMove: (originalEvent: Event | undefined) => void },
): Sortable {
    return Sortable.create(board, {
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
        scroll: false,
        onStart: callbacks.onStart,
        onMove: (_event, originalEvent) => {
            callbacks.onMove(originalEvent);
            return false;
        },
        onEnd: callbacks.onEnd,
    });
}

export function createBookmarkSortable(
    element: HTMLElement,
    callbacks: SharedCallbacks & { onMove: () => void },
): Sortable {
    return Sortable.create(element, {
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
        scroll: false,
        emptyInsertThreshold: 48,
        onStart: callbacks.onStart,
        onMove: () => {
            callbacks.onMove();
            return false;
        },
        onEnd: callbacks.onEnd,
    });
}
