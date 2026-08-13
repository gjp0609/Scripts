import type { BookmarkExtra, BrowserBookmarkNode, UiPreferences } from '../types/bookmark';
import { remapImportedPreferences } from './backupModel.ts';
import type { ValidatedImportData } from './importDataModel.ts';
import type { ImportRestoreOptions } from './importRestoreExecutor.ts';
import type { ImportRollbackOptions } from './importRollback.ts';
import { selectDefaultBookmarkRoot } from './bookmarkRootModel.ts';
import { createImportJournal, findBookmarkNodeById, type ImportStorageAttempts } from './importTransactionTypes.ts';

export type ImportTransactionPorts = {
    getTree: () => Promise<BrowserBookmarkNode[]>;
    getExtras: () => Promise<Record<string, BookmarkExtra>>;
    getPreferences: () => Promise<UiPreferences>;
    getBackupOriginId: () => Promise<string>;
    getBackupNodeMappings: (originId: string) => Promise<Map<string, string>>;
    applyExtraPatch: (changes: ReadonlyMap<string, BookmarkExtra | undefined>) => Promise<void>;
    applyBackupNodeMappingPatch: (originId: string, changes: ReadonlyMap<string, string | undefined>) => Promise<void>;
    savePreferences: (preferences: UiPreferences) => Promise<void>;
    executeRestore: (options: ImportRestoreOptions) => Promise<void>;
    rollback: (options: ImportRollbackOptions) => Promise<string[]>;
};

export async function runImportTransaction(
    parentId: string,
    parsed: ValidatedImportData,
    ports: ImportTransactionPorts,
): Promise<void> {
    const [tree, originalExtras, originalPreferences, currentOriginId, originalNodeMappings] = await Promise.all([
        ports.getTree(),
        ports.getExtras(),
        ports.getPreferences(),
        ports.getBackupOriginId(),
        ports.getBackupNodeMappings(parsed.originId),
    ]);
    const root = findBookmarkNodeById(tree, parentId) ?? selectDefaultBookmarkRoot(tree);
    if (!root) throw new Error('未找到可导入的书签根目录');

    const originalRoot: BrowserBookmarkNode = structuredClone(root);
    const journal = createImportJournal();
    const storageAttempts: ImportStorageAttempts = { extras: false, mappings: false, preferences: false };
    try {
        await ports.executeRestore({
            tree,
            root,
            sources: parsed.children,
            sameOrigin: parsed.originId === currentOriginId,
            originalNodeMappings,
            journal,
        });
        storageAttempts.extras = true;
        await ports.applyExtraPatch(journal.extraChanges);
        storageAttempts.mappings = true;
        await ports.applyBackupNodeMappingPatch(parsed.originId, journal.mappingChanges);
        storageAttempts.preferences = true;
        await ports.savePreferences(remapImportedPreferences(parsed.preferences, journal.idMap, originalPreferences));
    } catch (error) {
        const rollbackFailures = await ports.rollback({
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
