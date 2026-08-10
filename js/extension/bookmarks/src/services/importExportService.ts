import type {
    BookmarkExtra,
    BrowserBookmarkNode,
    ExportBookmarkNode,
    FullExportData,
    UiPreferences,
} from '../types/bookmark';
import { getDefaultBookmarkRoot, getSubTree, getTree } from './bookmarkApi';
import { remapImportedPreferences } from './backupModel';
import { validateFullImportData } from './importDataModel';
import {
    applyBackupNodeMappingPatch,
    applyExtraPatch,
    getBackupNodeMappings,
    getBackupOriginId,
    getExtras,
    getPreferences,
    savePreferences,
} from './extraStore';
import { createImportJournal, executeImportRestore, findBookmarkNodeById } from './importRestoreExecutor';
import { cloneBookmarkNode, rollbackImport, type ImportStorageAttempts } from './importRollback';

function toExportNode(node: BrowserBookmarkNode, extras: Record<string, BookmarkExtra>): ExportBookmarkNode {
    if (node.url) {
        return { sourceId: node.id, title: node.title, url: node.url, extra: extras[node.id] };
    }
    return {
        sourceId: node.id,
        title: node.title,
        children: (node.children ?? []).map((child) => toExportNode(child, extras)),
    };
}

export async function exportFullData(rootId: string, preferences: UiPreferences): Promise<FullExportData> {
    const [root, extras, originId] = await Promise.all([getSubTree(rootId), getExtras(), getBackupOriginId()]);
    if (!root) throw new Error('未找到可导出的书签根目录');
    return {
        version: 3,
        exportedAt: new Date().toISOString(),
        originId,
        root: { children: (root.children ?? []).map((child) => toExportNode(child, extras)) },
        preferences,
    };
}

export async function importFullData(parentId: string, data: unknown): Promise<void> {
    const parsed = validateFullImportData(data);
    const [tree, originalExtras, originalPreferences, currentOriginId, originalNodeMappings] = await Promise.all([
        getTree(),
        getExtras(),
        getPreferences(),
        getBackupOriginId(),
        getBackupNodeMappings(parsed.originId),
    ]);
    const root = findBookmarkNodeById(tree, parentId) ?? getDefaultBookmarkRoot(tree);
    if (!root) throw new Error('未找到可导入的书签根目录');

    const originalRoot = cloneBookmarkNode(root);
    const journal = createImportJournal();
    const storageAttempts: ImportStorageAttempts = { extras: false, mappings: false, preferences: false };
    try {
        await executeImportRestore({
            tree,
            root,
            sources: parsed.children,
            sameOrigin: parsed.originId === currentOriginId,
            originalNodeMappings,
            journal,
        });
        storageAttempts.extras = true;
        await applyExtraPatch(journal.extraChanges);
        storageAttempts.mappings = true;
        await applyBackupNodeMappingPatch(parsed.originId, journal.mappingChanges);
        storageAttempts.preferences = true;
        await savePreferences(remapImportedPreferences(parsed.preferences, journal.idMap, originalPreferences));
    } catch (error) {
        const rollbackFailures = await rollbackImport({
            rootId: root.id,
            originalRoot,
            originId: parsed.originId,
            originalExtras,
            originalPreferences,
            originalNodeMappings,
            journal,
            storageAttempts,
        });
        if (rollbackFailures.length) {
            throw new Error(
                `导入失败，自动恢复未完全成功，请刷新后检查书签栏。${rollbackFailures.slice(0, 2).join('；')}`,
            );
        }
        throw error;
    }
}
