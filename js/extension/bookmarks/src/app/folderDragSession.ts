import type { FolderView } from '../types/bookmark';
import {
    projectVisibleOrder,
    resolveFilteredMoveIndex,
    resolveRootMoveIndex,
    shouldInsertAfterToOccupySlot,
    type FolderMoveRequest,
} from './organizeMoveModel';

function getVisibleFolderOrder(board: HTMLElement): string[] {
    return [...board.querySelectorAll<HTMLElement>('.folder-section')]
        .map((element) => element.getAttribute('data-folder-id') ?? '')
        .filter(Boolean);
}

export function createFolderDragSession(options: {
    getBoard: () => HTMLElement | undefined;
    getFolders: () => FolderView[];
    getRootChildIds: () => string[];
    setProjectedOrder: (order: string[]) => void;
}) {
    let draggedId = '';
    let dragOrder: string[] = [];
    let moveRequest: FolderMoveRequest | undefined;

    function begin(folderId: string) {
        const board = options.getBoard();
        draggedId = folderId;
        dragOrder = board ? getVisibleFolderOrder(board) : [];
        options.setProjectedOrder([...dragOrder]);
    }

    function update(clientX: number, clientY: number) {
        const board = options.getBoard();
        if (!board || !draggedId) return;
        const related = [...board.querySelectorAll<HTMLElement>('.folder-section')].find((element) => {
            const rect = element.getBoundingClientRect();
            return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        });
        const anchorId = related?.getAttribute('data-folder-id') ?? undefined;
        if (!anchorId || anchorId === draggedId) return;

        const projectedOrder = projectVisibleOrder(
            dragOrder,
            draggedId,
            anchorId,
            shouldInsertAfterToOccupySlot(dragOrder, draggedId, anchorId),
        );
        const source = options.getFolders().find((folder) => folder.id === draggedId);
        if (!source) return;
        options.setProjectedOrder(projectedOrder);
        moveRequest = {
            folderId: draggedId,
            sourceIndex: source.index,
            desiredPosition: resolveFilteredMoveIndex(
                options.getFolders().map((folder) => folder.id),
                projectedOrder,
                draggedId,
            ),
            apiIndex: resolveRootMoveIndex(options.getRootChildIds(), projectedOrder, draggedId),
        };
    }

    function reset() {
        draggedId = '';
        dragOrder = [];
        moveRequest = undefined;
        options.setProjectedOrder([]);
    }

    return {
        begin,
        update,
        reset,
        getMoveRequest: () => moveRequest,
    };
}
