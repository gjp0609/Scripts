import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookmarkExtra, BrowserBookmarkNode, UiPreferences } from '../src/types/bookmark.ts';
import { executeImportRestore, type ImportRestoreApi } from '../src/services/importRestoreExecutor.ts';
import { rollbackImport, type ImportRollbackPorts } from '../src/services/importRollback.ts';
import { runImportTransaction, type ImportTransactionPorts } from '../src/services/importTransactionModel.ts';
import { createImportJournal } from '../src/services/importTransactionTypes.ts';

const preferences: UiPreferences = { collapsedFolderIds: [], searchEngine: 'auto' };

function transactionPorts(failingStage?: 'restore' | 'extra' | 'mapping' | 'preferences') {
    const calls: string[] = [];
    let rollbackAttempts: { extras: boolean; mappings: boolean; preferences: boolean } | undefined;
    const root: BrowserBookmarkNode = { id: 'root', title: '书签栏', children: [] };
    const fail = (stage: typeof failingStage) => {
        calls.push(stage ?? '');
        if (failingStage === stage) throw new Error(`fail-${stage}`);
    };
    const ports: ImportTransactionPorts = {
        getTree: async () => [root],
        getExtras: async () => ({}),
        getPreferences: async () => preferences,
        getBackupOriginId: async () => 'current-origin',
        getBackupNodeMappings: async () => new Map(),
        executeRestore: async () => fail('restore'),
        applyExtraPatch: async () => fail('extra'),
        applyBackupNodeMappingPatch: async () => fail('mapping'),
        savePreferences: async () => fail('preferences'),
        rollback: async (options) => {
            calls.push('rollback');
            rollbackAttempts = { ...options.storageAttempts };
            return [];
        },
    };
    return { ports, calls, getRollbackAttempts: () => rollbackAttempts };
}

const parsed = {
    children: [],
    preferences,
    originId: 'backup-origin',
};

test('导入事务按固定阶段提交且成功时不回滚', async () => {
    const fixture = transactionPorts();
    await runImportTransaction('root', parsed, fixture.ports);
    assert.deepEqual(fixture.calls, ['restore', 'extra', 'mapping', 'preferences']);
    assert.equal(fixture.getRollbackAttempts(), undefined);
});

test('导入事务每个失败阶段都携带准确的补偿范围', async () => {
    const cases = [
        ['restore', { extras: false, mappings: false, preferences: false }],
        ['extra', { extras: true, mappings: false, preferences: false }],
        ['mapping', { extras: true, mappings: true, preferences: false }],
        ['preferences', { extras: true, mappings: true, preferences: true }],
    ] as const;
    for (const [stage, attempts] of cases) {
        const fixture = transactionPorts(stage);
        await assert.rejects(() => runImportTransaction('root', parsed, fixture.ports), new RegExp(`fail-${stage}`));
        assert.deepEqual(fixture.getRollbackAttempts(), attempts);
        assert.equal(fixture.calls.at(-1), 'rollback');
    }
});

test('补偿失败升级为明确的数据检查错误', async () => {
    const fixture = transactionPorts('mapping');
    fixture.ports.rollback = async () => ['回滚恢复映射失败', '回滚后书签树校验不一致'];
    await assert.rejects(
        () => runImportTransaction('root', parsed, fixture.ports),
        /自动恢复未完全成功.*回滚恢复映射失败.*回滚后书签树校验不一致/,
    );
});

test('恢复执行器在中途失败时保留已创建节点 journal', async () => {
    const root: BrowserBookmarkNode = { id: 'root', title: '书签栏', children: [] };
    const journal = createImportJournal();
    let nextId = 1;
    const api: ImportRestoreApi = {
        createBookmark: async (input) => {
            if (nextId === 2) throw new Error('second-create-failed');
            return { id: String(nextId++), parentId: input.parentId, index: input.index, title: input.title };
        },
        moveNode: async () => {
            throw new Error('unexpected move');
        },
        updateBookmark: async () => {
            throw new Error('unexpected update');
        },
    };
    await assert.rejects(
        () =>
            executeImportRestore(
                {
                    tree: [root],
                    root,
                    sources: [
                        {
                            sourceId: 'folder-source',
                            title: '目录',
                            children: [
                                {
                                    sourceId: 'bookmark-source',
                                    title: '书签',
                                    url: 'https://example.com',
                                },
                            ],
                        },
                    ],
                    sameOrigin: false,
                    originalNodeMappings: new Map(),
                    journal,
                },
                api,
            ),
        /second-create-failed/,
    );
    assert.deepEqual(journal.createdNodes, [{ id: '1', folder: true }]);
    assert.equal(journal.idMap.get('folder-source'), '1');
});

test('补偿器按 storage、变更节点和新建节点逆序恢复', async () => {
    const calls: string[] = [];
    const originalRoot: BrowserBookmarkNode = {
        id: 'root',
        title: '书签栏',
        children: [],
    };
    const journal = createImportJournal();
    journal.mappingChanges.set('source', 'target');
    journal.extraChanges.set('target', { bookmarkId: 'target', tags: [], updatedAt: 2 });
    journal.changedNodes.set('first', { id: 'first', parentId: 'root', index: 0, title: 'First' });
    journal.changedNodes.set('second', { id: 'second', parentId: 'root', index: 1, title: 'Second' });
    journal.createdNodes.push({ id: 'folder-created', folder: true }, { id: 'bookmark-created', folder: false });
    const node = (id: string): BrowserBookmarkNode => ({ id, title: id });
    const ports: ImportRollbackPorts = {
        savePreferences: async () => void calls.push('preferences'),
        applyBackupNodeMappingPatch: async () => void calls.push('mapping'),
        applyExtraPatch: async () => void calls.push('extra'),
        updateBookmark: async (id) => {
            calls.push(`update:${id}`);
            return node(id);
        },
        moveNode: async (id) => {
            calls.push(`move:${id}`);
            return node(id);
        },
        removeFolder: async (id) => void calls.push(`remove-folder:${id}`),
        removeBookmark: async (id) => void calls.push(`remove-bookmark:${id}`),
        getSubTree: async () => originalRoot,
    };
    const failures = await rollbackImport(
        {
            rootId: 'root',
            originalRoot,
            originId: 'origin',
            originalExtras: { target: { bookmarkId: 'target', tags: [], updatedAt: 1 } },
            originalPreferences: preferences,
            originalNodeMappings: new Map([['source', 'old-target']]),
            journal,
            storageAttempts: { extras: true, mappings: true, preferences: true },
        },
        ports,
    );
    assert.deepEqual(failures, []);
    assert.deepEqual(calls, [
        'preferences',
        'mapping',
        'extra',
        'update:second',
        'move:second',
        'update:first',
        'move:first',
        'remove-bookmark:bookmark-created',
        'remove-folder:folder-created',
    ]);
});

test('补偿器同时报告 API 回滚失败和最终树不一致', async () => {
    const root: BrowserBookmarkNode = { id: 'root', title: '原目录', children: [] };
    const journal = createImportJournal();
    journal.createdNodes.push({ id: 'created', folder: false });
    const ports: ImportRollbackPorts = {
        savePreferences: async () => undefined,
        applyBackupNodeMappingPatch: async () => undefined,
        applyExtraPatch: async () => undefined,
        updateBookmark: async () => root,
        moveNode: async () => root,
        removeFolder: async () => undefined,
        removeBookmark: async () => {
            throw new Error('remove failed');
        },
        getSubTree: async () => ({ ...root, title: '错误目录' }),
    };
    const failures = await rollbackImport(
        {
            rootId: 'root',
            originalRoot: root,
            originId: 'origin',
            originalExtras: {} as Record<string, BookmarkExtra>,
            originalPreferences: preferences,
            originalNodeMappings: new Map(),
            journal,
            storageAttempts: { extras: false, mappings: false, preferences: false },
        },
        ports,
    );
    assert.equal(
        failures.some((message) => message.includes('remove failed')),
        true,
    );
    assert.equal(failures.includes('回滚后书签树校验不一致'), true);
});
