import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserBookmarkNode, ExportBookmarkNode } from '../src/types/bookmark.ts';
import { remapImportedPreferences, selectRestoreCandidate } from '../src/services/backupModel.ts';
import { selectDefaultBookmarkRoot } from '../src/services/bookmarkRootModel.ts';

test('备份恢复将目录和自定义引擎引用映射为新的 Chrome ID', () => {
    const idMap = new Map([
        ['folder-old', 'folder-new'],
        ['engine-old', 'engine-new'],
    ]);
    assert.deepEqual(
        remapImportedPreferences(
            { collapsedFolderIds: ['folder-old', 'missing'], searchEngine: 'bookmark:engine-old' },
            idMap,
            { collapsedFolderIds: [], searchEngine: 'builtin:bing' },
        ),
        { collapsedFolderIds: ['folder-new'], searchEngine: 'bookmark:engine-new' },
    );
});

test('备份恢复保持内置引擎 ID，自定义引擎缺失时保留当前选择', () => {
    const current = { collapsedFolderIds: [], searchEngine: 'builtin:google' };
    assert.equal(
        remapImportedPreferences({ collapsedFolderIds: [], searchEngine: 'builtin:bing' }, new Map(), current)
            .searchEngine,
        'builtin:bing',
    );
    assert.equal(
        remapImportedPreferences({ collapsedFolderIds: [], searchEngine: 'bookmark:missing' }, new Map(), current)
            .searchEngine,
        'builtin:google',
    );
});

test('同一实例恢复按 sourceId 找回被移动节点而不是创建副本', () => {
    const source: ExportBookmarkNode = { sourceId: 'source-id', title: '旧标题', url: 'https://source.example' };
    const moved: BrowserBookmarkNode = {
        id: 'source-id',
        parentId: 'other-folder',
        title: '已修改标题',
        url: 'https://changed.example',
    };
    const duplicate: BrowserBookmarkNode = {
        id: 'duplicate-id',
        parentId: 'target-folder',
        title: '旧标题',
        url: 'https://source.example',
    };
    assert.equal(
        selectRestoreCandidate(
            source,
            [duplicate],
            new Map([
                [moved.id, moved],
                [duplicate.id, duplicate],
            ]),
            new Set(),
            true,
        )?.id,
        'source-id',
    );
});

test('跨实例恢复忽略碰巧相同的 ID，并按父目录内重复项顺序匹配', () => {
    const source: ExportBookmarkNode = { sourceId: '42', title: '重复书签', url: 'https://same.example' };
    const unrelated: BrowserBookmarkNode = {
        id: '42',
        parentId: 'elsewhere',
        title: '其他书签',
        url: 'https://other.example',
    };
    const first: BrowserBookmarkNode = {
        id: '100',
        parentId: 'target',
        title: '重复书签',
        url: 'https://same.example',
    };
    const second: BrowserBookmarkNode = { ...first, id: '101' };
    const nodes = new Map([
        [unrelated.id, unrelated],
        [first.id, first],
        [second.id, second],
    ]);
    assert.equal(selectRestoreCandidate(source, [first, second], nodes, new Set(), false)?.id, '100');
    assert.equal(selectRestoreCandidate(source, [first, second], nodes, new Set(['100']), false)?.id, '101');
});

test('同一实例 sourceId 已不存在时不拿相同内容书签冒充原节点', () => {
    const source: ExportBookmarkNode = { sourceId: 'missing', title: '重复书签', url: 'https://same.example' };
    const duplicate: BrowserBookmarkNode = {
        id: 'other',
        parentId: 'target',
        title: '重复书签',
        url: 'https://same.example',
    };
    assert.equal(
        selectRestoreCandidate(source, [duplicate], new Map([[duplicate.id, duplicate]]), new Set(), true),
        undefined,
    );
});

test('恢复优先复用持久化映射', () => {
    const source: ExportBookmarkNode = {
        sourceId: 'foreign-source',
        title: '重复书签',
        url: 'https://same.example',
    };
    const duplicate: BrowserBookmarkNode = {
        id: 'duplicate',
        parentId: 'target',
        title: '重复书签',
        url: 'https://same.example',
    };
    const restored: BrowserBookmarkNode = {
        id: 'restored',
        parentId: 'target',
        title: '已被修改',
        url: 'https://changed.example',
    };
    const nodes = new Map([
        [duplicate.id, duplicate],
        [restored.id, restored],
    ]);
    assert.equal(
        selectRestoreCandidate(source, [duplicate, restored], nodes, new Set(), false, restored.id)?.id,
        restored.id,
    );
    assert.equal(selectRestoreCandidate(source, [restored], nodes, new Set(), true, restored.id)?.id, restored.id);
});

test('新版 Chrome 根目录按 folderType 识别并优先账号同步书签栏', () => {
    const localBar: BrowserBookmarkNode = {
        id: '1',
        title: '本地书签栏',
        folderType: 'bookmarks-bar',
        syncing: false,
        children: [],
    };
    const accountBar: BrowserBookmarkNode = {
        id: '101',
        title: '账号书签栏',
        folderType: 'bookmarks-bar',
        syncing: true,
        children: [],
    };
    const root: BrowserBookmarkNode = { id: '0', title: '', children: [localBar, accountBar] };
    assert.equal(selectDefaultBookmarkRoot([root])?.id, '101');
});

test('旧版 Chrome 根目录缺少 folderType 时保留兼容识别', () => {
    const bar: BrowserBookmarkNode = { id: '1', title: '书签栏', children: [] };
    const root: BrowserBookmarkNode = {
        id: '0',
        title: '',
        children: [{ id: '2', title: '其他书签', children: [] }, bar],
    };
    assert.equal(selectDefaultBookmarkRoot([root])?.id, '1');
});
