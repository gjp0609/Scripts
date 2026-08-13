import type { BookmarkExtra, BrowserBookmarkNode, UiPreferences } from '../types/bookmark';
import type { ImportJournal, ImportStorageAttempts } from './importTransactionTypes.ts';

export type ImportRollbackPorts = {
    getSubTree: (id: string) => Promise<BrowserBookmarkNode | undefined>;
    moveNode: (id: string, input: { parentId?: string; index?: number }) => Promise<BrowserBookmarkNode>;
    removeBookmark: (id: string) => Promise<void>;
    removeFolder: (id: string) => Promise<void>;
    updateBookmark: (id: string, input: { title?: string; url?: string }) => Promise<BrowserBookmarkNode>;
    applyBackupNodeMappingPatch: (originId: string, changes: ReadonlyMap<string, string | undefined>) => Promise<void>;
    applyExtraPatch: (changes: ReadonlyMap<string, BookmarkExtra | undefined>) => Promise<void>;
    savePreferences: (preferences: UiPreferences) => Promise<void>;
};

export type ImportRollbackOptions = {
    rootId: string;
    originalRoot: BrowserBookmarkNode;
    originId: string;
    originalExtras: Record<string, BookmarkExtra>;
    originalPreferences: UiPreferences;
    originalNodeMappings: ReadonlyMap<string, string>;
    journal: ImportJournal;
    storageAttempts: ImportStorageAttempts;
};

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

export async function rollbackImport(options: ImportRollbackOptions, ports: ImportRollbackPorts): Promise<string[]> {
    const failures: string[] = [];
    if (options.storageAttempts.preferences) {
        await ports.savePreferences(options.originalPreferences).catch((cause) => {
            failures.push(`回滚界面偏好失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }
    if (options.storageAttempts.mappings) {
        const patch = new Map(
            [...options.journal.mappingChanges.keys()].map(
                (sourceId) => [sourceId, options.originalNodeMappings.get(sourceId)] as const,
            ),
        );
        await ports.applyBackupNodeMappingPatch(options.originId, patch).catch((cause) => {
            failures.push(`回滚恢复映射失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }
    if (options.storageAttempts.extras) {
        const patch = new Map(
            [...options.journal.extraChanges.keys()].map(
                (bookmarkId) => [bookmarkId, options.originalExtras[bookmarkId]] as const,
            ),
        );
        await ports.applyExtraPatch(patch).catch((cause) => {
            failures.push(`回滚扩展数据失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        });
    }

    for (const node of [...options.journal.changedNodes.values()].reverse()) {
        await ports
            .updateBookmark(node.id, { title: node.title, ...(node.url ? { url: node.url } : {}) })
            .catch((cause) => {
                failures.push(`回滚节点 ${node.id} 的内容失败：${cause instanceof Error ? cause.message : '未知错误'}`);
            });
        if (node.parentId != null || node.index != null) {
            await ports.moveNode(node.id, { parentId: node.parentId, index: node.index }).catch((cause) => {
                failures.push(`回滚节点 ${node.id} 的位置失败：${cause instanceof Error ? cause.message : '未知错误'}`);
            });
        }
    }
    for (const node of [...options.journal.createdNodes].reverse()) {
        try {
            if (node.folder) await ports.removeFolder(node.id);
            else await ports.removeBookmark(node.id);
        } catch (cause) {
            failures.push(`回滚新建节点 ${node.id} 失败：${cause instanceof Error ? cause.message : '未知错误'}`);
        }
    }

    try {
        const restoredRoot = await ports.getSubTree(options.rootId);
        if (!restoredRoot || bookmarkTreeFingerprint(restoredRoot) !== bookmarkTreeFingerprint(options.originalRoot)) {
            failures.push('回滚后书签树校验不一致');
        }
    } catch (cause) {
        failures.push(`回滚后书签树校验失败：${cause instanceof Error ? cause.message : '未知错误'}`);
    }
    return failures;
}
