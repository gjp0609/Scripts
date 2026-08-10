import assert from 'node:assert/strict';
import test from 'node:test';
import type { FolderView } from '../src/types/bookmark.ts';
import { moveWorkspaceBookmark, moveWorkspaceFolder } from '../src/app/bookmarkWorkspaceModel.ts';
import {
    projectVisibleOrder,
    resolveFilteredMoveIndex,
    resolveRootMoveIndex,
    shouldInsertAfterToOccupySlot,
    toBrowserMoveIndex,
} from '../src/app/organizeMoveModel.ts';
import { bookmark, folders } from './fixtures.ts';

test('筛选拖拽按可见锚点映射到完整顺序', () => {
    assert.equal(resolveFilteredMoveIndex(['hidden-a', 'move', 'hidden-b', 'anchor'], ['anchor', 'move'], 'move'), 3);
    assert.equal(resolveFilteredMoveIndex(['hidden-a', 'move', 'hidden-b', 'anchor'], ['move', 'anchor'], 'move'), 2);
    assert.equal(toBrowserMoveIndex(3, 1, true), 4);
    assert.equal(toBrowserMoveIndex(0, 1, true), 0);
});

test('预测顺序与筛选后的真实落点共用同一结果', () => {
    const projected = projectVisibleOrder(['move', 'anchor'], 'move', 'anchor', true);
    assert.deepEqual(projected, ['anchor', 'move']);
    assert.equal(resolveFilteredMoveIndex(['hidden-a', 'move', 'hidden-b', 'anchor'], projected, 'move'), 3);
});

test('目录预占位直接占据目标原槽位', () => {
    const order = ['a', 'b', 'c', 'd'];
    assert.equal(shouldInsertAfterToOccupySlot(order, 'a', 'c'), true);
    assert.deepEqual(projectVisibleOrder(order, 'a', 'c', true), ['b', 'c', 'a', 'd']);
    assert.equal(shouldInsertAfterToOccupySlot(order, 'd', 'b'), false);
    assert.deepEqual(projectVisibleOrder(order, 'd', 'b', false), ['a', 'd', 'b', 'c']);
});

test('目录根节点索引先移除源项并保留直属书签位置', () => {
    const rootOrder = ['direct-a', 'folder-a', 'direct-b', 'folder-b', 'folder-c'];
    assert.equal(resolveRootMoveIndex(rootOrder, ['folder-b', 'folder-c', 'folder-a'], 'folder-a'), 5);
    assert.equal(resolveRootMoveIndex(rootOrder, ['folder-c', 'folder-a', 'folder-b'], 'folder-c'), 1);
});

test('工作区纯模型移动书签并规范化父级索引', () => {
    const input: FolderView[] = [
        { ...folders[0], bookmarks: [bookmark('1', 'Alpha', []), bookmark('2', 'Beta', [])] },
        { ...folders[0], id: 'folder-2', title: '目标', bookmarks: [bookmark('3', 'Gamma', [])] },
    ];
    moveWorkspaceBookmark(input, { bookmarkId: '2', parentId: 'folder-2', index: 1 });
    assert.deepEqual(
        input[0].bookmarks.map((item) => [item.id, item.index]),
        [['1', 0]],
    );
    assert.deepEqual(
        input[1].bookmarks.map((item) => [item.id, item.parentId, item.index]),
        [
            ['3', 'folder-2', 0],
            ['2', 'folder-2', 1],
        ],
    );
});

test('工作区纯模型移动目录保持相对顺序', () => {
    const input: FolderView[] = [
        { ...folders[0], id: 'a' },
        { ...folders[0], id: 'b' },
        { ...folders[0], id: 'c' },
    ];
    moveWorkspaceFolder(input, 'a', 2);
    assert.deepEqual(
        input.map((folder) => folder.id),
        ['b', 'c', 'a'],
    );
});
