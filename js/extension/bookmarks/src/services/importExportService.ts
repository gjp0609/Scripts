import type {
    BookmarkExtra,
    BrowserBookmarkNode,
    ExportBookmarkNode,
    FullExportData,
    UiPreferences,
} from '../types/bookmark';
import {
    createBookmark,
    getSubTree,
    getTree,
    moveNode,
    removeBookmark,
    removeFolder,
    updateBookmark,
} from './bookmarkApi';
import { normalizeBookmarkExtra } from './bookmarkExtraModel';
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
import { executeImportRestore } from './importRestoreExecutor';
import { rollbackImport } from './importRollback';
import { runImportTransaction, type ImportTransactionPorts } from './importTransactionModel';

function toExportNode(node: BrowserBookmarkNode, extras: Record<string, BookmarkExtra>): ExportBookmarkNode {
    if (node.url) {
        return {
            sourceId: node.id,
            title: node.title,
            url: node.url,
            extra: normalizeBookmarkExtra(extras[node.id], node.id),
        };
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
    const rollbackPorts = {
        getSubTree,
        moveNode,
        removeBookmark,
        removeFolder,
        updateBookmark,
        applyBackupNodeMappingPatch,
        applyExtraPatch,
        savePreferences,
    };
    const ports: ImportTransactionPorts = {
        getTree,
        getExtras,
        getPreferences,
        getBackupOriginId,
        getBackupNodeMappings,
        applyExtraPatch,
        applyBackupNodeMappingPatch,
        savePreferences,
        executeRestore: (options) => executeImportRestore(options, { createBookmark, moveNode, updateBookmark }),
        rollback: (options) => rollbackImport(options, rollbackPorts),
    };
    await runImportTransaction(parentId, parsed, ports);
}
