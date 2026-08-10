import type { BookmarkExtra, BrowserBookmarkNode, UiPreferences } from '../types/bookmark';
import { getSubTree, moveNode, removeBookmark, removeFolder, updateBookmark } from './bookmarkApi';
import { applyBackupNodeMappingPatch, applyExtraPatch, savePreferences } from './extraStore';
import type { ImportJournal } from './importRestoreExecutor';

export type ImportStorageAttempts = {
    extras: boolean;
    mappings: boolean;
    preferences: boolean;
};

export function cloneBookmarkNode(node: BrowserBookmarkNode): BrowserBookmarkNode {
    return { ...node, children: node.children?.map(cloneBookmarkNode) };
}

function bookmarkTreeFingerprint(node: BrowserBookmarkNode): string {
    return JSON.stringify({
        id: node.id,
        parentId: node.parentId,
        index: node.index,
        title: node.title,
        url: node.url,
        children: node.children?.map(bookmarkTreeFingerprint) ?? undefined,
    });
}

export async function rollbackImport(options: {
    rootId: string;
    originalRoot: BrowserBookmarkNode;
    originId: string;
    originalExtras: Record<string, BookmarkExtra>;
    originalPreferences: UiPreferences;
    originalNodeMappings: ReadonlyMap<string, string>;
    journal: ImportJournal;
    storageAttempts: ImportStorageAttempts;
}): Promise<string[]> {
    const failures: string[] = [];
    if (options.storageAttempts.preferences) {
        await savePreferences(options.originalPreferences).catch((cause) => {
            failures.push(`回滚界面偏好失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }
    if (options.storageAttempts.mappings) {
        const patch = new Map(
            [...options.journal.mappingChanges.keys()].map(
                (sourceId) => [sourceId, options.originalNodeMappings.get(sourceId)] as const,
            ),
        );
        await applyBackupNodeMappingPatch(options.originId, patch).catch((cause) => {
            failures.push(`回滚恢复映射失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }
    if (options.storageAttempts.extras) {
        const patch = new Map(
            [...options.journal.extraChanges.keys()].map(
                (bookmarkId) => [bookmarkId, options.originalExtras[bookmarkId]] as const,
            ),
        );
        await applyExtraPatch(patch).catch((cause) => {
            failures.push(`回滚扩展数据失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }

    for (const node of [...options.journal.changedNodes.values()].reverse()) {
        await updateBookmark(node.id, { title: node.title, ...(node.url ? { url: node.url } : {}) }).catch((cause) => {
            failures.push(`回滚节点 ${node.id} 的内容失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
        if (node.parentId != null || node.index != null) {
            await moveNode(node.id, { parentId: node.parentId, index: node.index }).catch((cause) => {
                failures.push(`回滚节点 ${node.id} 的位置失败：${cause instanceof Error ? cause.message : '未知错误'}`);
            });
        }
    }
    for (const node of [...options.journal.createdNodes].reverse()) {
        try {
            if (node.folder) await removeFolder(node.id);
            else await removeBookmark(node.id);
        } catch (cause) {
            failures.push(`回滚新建节点 ${node.id} 失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        }
    }

    try {
        const restoredRoot = await getSubTree(options.rootId);
        if (!restoredRoot || bookmarkTreeFingerprint(restoredRoot) !== bookmarkTreeFingerprint(options.originalRoot)) {
            failures.push('回滚后书签树校验不一致');
        }
    } catch (cause) {
        failures.push(`回滚后书签树校验失败：${cause instanceof Error ? cause.message : '未知错误'}`);
    }
    return failures;
}
