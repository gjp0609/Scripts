import { ref, type Ref } from 'vue';
import { moveBookmarkOrder, moveFolderOrder } from '../services/bookmarkRepository';
import type { useBookmarkWorkspace } from './useBookmarkWorkspace';
import type { BookmarkMoveRequest, FolderMoveRequest } from './organizeMoveModel';

type Workspace = ReturnType<typeof useBookmarkWorkspace>;

export function useOrganizeMove(options: { workspace: Workspace; collapsedFolderIds: Ref<Set<string>> }) {
    const error = ref('');
    const pendingMoveId = ref('');

    async function applyFolderMove(request: FolderMoveRequest) {
        if (pendingMoveId.value) return;
        pendingMoveId.value = request.folderId;
        error.value = '';
        try {
            options.workspace.moveFolder(request.folderId, request.desiredPosition);
            await moveFolderOrder({ folderId: request.folderId, index: request.apiIndex });
            await options.workspace.reload({ silent: true });
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : '目录排序失败';
            await options.workspace.reload({ silent: true });
        } finally {
            pendingMoveId.value = '';
        }
    }

    async function applyBookmarkMove(request: BookmarkMoveRequest) {
        if (pendingMoveId.value) return;
        const collapsedBeforeMove = new Set(options.collapsedFolderIds.value);
        pendingMoveId.value = request.bookmarkId;
        error.value = '';

        if (request.expandTarget) {
            const next = new Set(options.collapsedFolderIds.value);
            next.delete(request.toFolderId);
            options.collapsedFolderIds.value = next;
        }

        try {
            options.workspace.moveBookmark({
                bookmarkId: request.bookmarkId,
                parentId: request.toFolderId,
                index: request.desiredIndex,
            });
            const moved = await moveBookmarkOrder({
                bookmarkId: request.bookmarkId,
                parentId: request.toFolderId,
                index: request.apiIndex,
            });
            options.workspace.moveBookmark({
                bookmarkId: request.bookmarkId,
                parentId: moved.parentId ?? request.toFolderId,
                index: moved.index ?? request.desiredIndex,
            });
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : '书签移动失败';
            options.collapsedFolderIds.value = collapsedBeforeMove;
            await options.workspace.reload({ silent: true });
        } finally {
            pendingMoveId.value = '';
        }
    }

    return {
        error,
        pendingMoveId,
        applyFolderMove,
        applyBookmarkMove,
    };
}
