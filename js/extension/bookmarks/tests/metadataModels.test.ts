import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserBookmarkNode } from '../src/types/bookmark.ts';
import { normalizeBookmarkExtra, normalizeTags } from '../src/services/bookmarkExtraModel.ts';
import { validateFullImportData } from '../src/services/importDataModel.ts';
import { buildMetadataRepairPlan } from '../src/services/metadataMaintenanceModel.ts';
import { getSearchCapabilityValidationError } from '../src/services/searchService.ts';

test('tag 和 extra 共用大小写无关的规范化规则', () => {
    assert.deepEqual(normalizeTags([' work ', 'WORK', '', 1]), ['work']);
    const extra = normalizeBookmarkExtra({ tags: [' work ', 'WORK'], description: ' note ' }, 'bookmark-1');
    assert.equal(extra?.bookmarkId, 'bookmark-1');
    assert.deepEqual(extra?.tags, ['work']);
    assert.equal(extra?.description, 'note');
    assert.equal(Number.isFinite(extra?.updatedAt), true);
});

test('导入校验使用统一 extra 规范化并拒绝无效搜索模板', () => {
    const valid = validateFullImportData({
        version: 3,
        originId: 'origin',
        root: {
            children: [
                {
                    sourceId: 'bookmark-1',
                    title: '引擎',
                    url: 'https://example.com',
                    extra: {
                        bookmarkId: 'bookmark-1',
                        tags: [' search ', 'SEARCH'],
                        searchUrl: ' https://example.com?q={keyword} ',
                        updatedAt: 1,
                    },
                },
            ],
        },
        preferences: { collapsedFolderIds: [], searchEngine: 'auto' },
    });
    assert.deepEqual(valid.children[0] && 'extra' in valid.children[0] ? valid.children[0].extra?.tags : [], [
        'search',
    ]);
    assert.throws(
        () =>
            validateFullImportData({
                version: 3,
                originId: 'origin',
                root: {
                    children: [
                        {
                            sourceId: 'bookmark-1',
                            title: '引擎',
                            url: 'https://example.com',
                            extra: {
                                bookmarkId: 'bookmark-1',
                                tags: ['search'],
                                searchUrl: 'javascript:alert({keyword})',
                                updatedAt: 1,
                            },
                        },
                    ],
                },
                preferences: { collapsedFolderIds: [], searchEngine: 'auto' },
            }),
        /HTTP\(S\)/,
    );
});

test('导入严格拒绝损坏的 v3 extra schema', () => {
    const createData = (extra: unknown) => ({
        version: 3,
        originId: 'origin',
        root: {
            children: [{ sourceId: 'bookmark-1', title: '书签', url: 'https://example.com', extra }],
        },
        preferences: { collapsedFolderIds: [], searchEngine: 'auto' },
    });
    assert.throws(
        () => validateFullImportData(createData({ bookmarkId: 'bookmark-1', tags: 'work', updatedAt: 1 })),
        /tag 格式无效/,
    );
    assert.throws(
        () => validateFullImportData(createData({ bookmarkId: 'other', tags: [], updatedAt: 1 })),
        /书签 ID 不匹配/,
    );
    assert.throws(
        () => validateFullImportData(createData({ bookmarkId: 'bookmark-1', tags: [], updatedAt: -1 })),
        /updatedAt 格式无效/,
    );
    assert.throws(
        () => validateFullImportData(createData({ bookmarkId: 'bookmark-1', tags: [], description: 1, updatedAt: 1 })),
        /description 格式无效/,
    );
});

test('维护计划只清理孤立扩展数据并规范有效引用', () => {
    const bookmarkNode: BrowserBookmarkNode = {
        id: 'bookmark-1',
        parentId: 'folder-1',
        title: '有效书签',
        url: 'https://valid.example',
    };
    const folderNode: BrowserBookmarkNode = {
        id: 'folder-1',
        parentId: '1',
        title: '目录',
        children: [bookmarkNode],
    };
    const tree: BrowserBookmarkNode[] = [
        { id: '0', title: '', children: [{ id: '1', title: '书签栏', children: [folderNode] }] },
    ];
    const plan = buildMetadataRepairPlan({
        tree,
        extras: {
            'bookmark-1': { bookmarkId: 'wrong-id', tags: [' work ', 'WORK', ''], updatedAt: 1 },
            'orphan': { bookmarkId: 'orphan', tags: ['old'], updatedAt: 1 },
        },
        preferences: {
            collapsedFolderIds: ['folder-1', 'missing-folder'],
            searchEngine: 'bookmark:missing-engine',
        },
        mappings: [
            { originId: 'origin', sourceId: 'valid', targetId: 'bookmark-1' },
            { originId: 'origin', sourceId: 'missing', targetId: 'missing-target' },
        ],
    });
    assert.equal(plan.extraPatch.get('orphan'), undefined);
    assert.deepEqual(plan.extraPatch.get('bookmark-1')?.tags, ['work']);
    assert.deepEqual(plan.repairedPreferences, { collapsedFolderIds: ['folder-1'], searchEngine: 'auto' });
    assert.deepEqual(
        plan.staleMappings.map((item) => item.sourceId),
        ['missing'],
    );
});

test('搜索能力在编辑、导入和运行时共用 HTTP(S) 模板校验', () => {
    assert.equal(
        getSearchCapabilityValidationError({
            tags: ['search'],
            url: 'https://example.com',
            searchUrl: 'https://example.com/search?q={keyword}',
        }),
        undefined,
    );
    assert.match(
        getSearchCapabilityValidationError({
            tags: ['search'],
            url: 'https://example.com',
            searchUrl: 'javascript:alert({keyword})',
        }) ?? '',
        /HTTP\(S\)/,
    );
    assert.match(
        getSearchCapabilityValidationError({
            tags: ['search', 'search_site'],
            url: 'https://example.com',
            searchUrl: 'https://example.com/search?q={keyword}',
        }) ?? '',
        /不能同时使用/,
    );
});
