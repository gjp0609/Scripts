import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookmarkView, BrowserBookmarkNode, ExportBookmarkNode, FolderView } from '../src/types/bookmark.ts';
import { nextSelectedEngineIndex, normalizeSearchIndex } from '../src/app/searchStateModel.ts';
import {
  projectVisibleOrder,
  resolveFilteredMoveIndex,
  resolveFolderBrowserIndex,
  resolveRootMoveIndex,
  shouldInsertAfterToOccupySlot,
  toBrowserMoveIndex
} from '../src/app/organizeMoveModel.ts';
import { moveWorkspaceBookmark, moveWorkspaceFolder } from '../src/app/bookmarkWorkspaceModel.ts';
import { getFaviconPageUrls, withFaviconRefreshToken } from '../src/services/favicon.ts';
import { remapImportedPreferences, selectRestoreCandidate } from '../src/services/backupModel.ts';
import { selectDefaultBookmarkRoot } from '../src/services/bookmarkRootModel.ts';
import { buildMetadataRepairPlan } from '../src/services/metadataMaintenanceModel.ts';
import {
  buildQuickSearchUrl,
  filterFolders,
  filterFoldersByTitle,
  getSearchCapabilityValidationError,
  getQuickSearchTargets,
  getSearchEngineOptions,
  getTagSummaries,
  parseQuickSearch,
  parseTagSearch,
  resolveSearchEngine
} from '../src/services/searchService.ts';

function bookmark(id: string, title: string, tags: string[], extra: Partial<BookmarkView['extra']> = {}): BookmarkView {
  return {
    id,
    parentId: 'folder-1',
    index: Number(id.replace(/\D/g, '')) || 0,
    title,
    url: `https://${title.toLowerCase()}.example/path`,
    domain: `${title.toLowerCase()}.example`,
    accent: '#555555',
    faviconUrls: [],
    extra: { bookmarkId: id, tags, updatedAt: 0, ...extra }
  };
}

const folders: FolderView[] = [{
  id: 'folder-1',
  index: 0,
  title: '常用',
  bookmarks: [
    bookmark('1', 'Alpha', ['xxx', 'work']),
    bookmark('2', 'Beta', ['xxy']),
    bookmark('3', 'Docs', ['search_site']),
    bookmark('4', 'Engine', ['search'], { searchUrl: 'https://engine.example/?q={keyword}' })
  ]
}];

test('#xx 动态匹配候选并预览候选标签的书签并集', () => {
  const tags = getTagSummaries(folders);
  const state = parseTagSearch('#xx', tags);

  assert.deepEqual(state?.matches.map((tag) => tag.name), ['xxx', 'xxy']);
  assert.equal(state?.exactTag, undefined);
  assert.deepEqual(filterFolders(folders, '#xx', state).flatMap((folder) => folder.bookmarks.map((item) => item.title)), ['Alpha', 'Beta']);
});

test('完全同名 tag 自动切换为精确筛选', () => {
  const tags = getTagSummaries(folders);
  const state = parseTagSearch('#xxx', tags);

  assert.equal(state?.exactTag?.name, 'xxx');
  assert.deepEqual(filterFolders(folders, '#xxx', state).flatMap((folder) => folder.bookmarks.map((item) => item.title)), ['Alpha']);
});

test('叹号搜索按第一段筛选词和后续完整关键词解析', () => {
  assert.deepEqual(parseQuickSearch('!'), { siteQuery: '', keyword: '', hasKeyword: false });
  assert.deepEqual(parseQuickSearch('！docs'), { siteQuery: 'docs', keyword: '', hasKeyword: false });
  assert.deepEqual(parseQuickSearch('! 搜索 关键词'), { siteQuery: '', keyword: '搜索 关键词', hasKeyword: true });
  assert.deepEqual(parseQuickSearch('!docs 搜索 关键词'), { siteQuery: 'docs', keyword: '搜索 关键词', hasKeyword: true });
});

test('自定义 search 引擎优先，search_site 使用当前引擎生成 site 查询', () => {
  const engines = getSearchEngineOptions(folders);
  const selected = resolveSearchEngine(engines, 'auto');
  const siteTarget = getQuickSearchTargets(folders, '').find((target) => target.kind === 'search_site');

  assert.equal(selected.title, 'Engine');
  assert.ok(siteTarget);
  assert.equal(buildQuickSearchUrl(siteTarget, '中文 关键词', selected), 'https://engine.example/?q=site%3Adocs.example%20%E4%B8%AD%E6%96%87%20%E5%85%B3%E9%94%AE%E8%AF%8D');
  assert.deepEqual(getQuickSearchTargets(folders, '').map((target) => target.title), ['Docs']);
});

test('无自定义 search 时默认回退 Bing', () => {
  const withoutEngine: FolderView[] = [{ ...folders[0], bookmarks: folders[0].bookmarks.filter((item) => item.title !== 'Engine') }];
  const selected = resolveSearchEngine(getSearchEngineOptions(withoutEngine), 'auto');

  assert.equal(selected.id, 'builtin:bing');
});

test('已有同名自定义搜索引擎时不再显示对应内置项', () => {
  const withCustomBuiltins: FolderView[] = [{
    ...folders[0],
    bookmarks: [
      ...folders[0].bookmarks,
      bookmark('5', 'Bing', ['search'], { searchUrl: 'https://cn.bing.com/search?q={keyword}' }),
      bookmark('6', 'Google', ['search'], { searchUrl: 'https://www.google.com/search?q={keyword}' })
    ]
  }];
  const options = getSearchEngineOptions(withCustomBuiltins);

  assert.equal(options.filter((option) => option.title === 'Bing').length, 1);
  assert.equal(options.filter((option) => option.title === 'Google').length, 1);
  assert.equal(options.some((option) => option.id === 'builtin:bing'), false);
  assert.equal(options.some((option) => option.id === 'builtin:google'), false);
});

test('favicon 缓存候选优先精确书签地址并回退无 fragment 地址与站点根地址', () => {
  assert.deepEqual(getFaviconPageUrls('http://223.71.240.240:380/ui/#/'), [
    'http://223.71.240.240:380/ui/#/',
    'http://223.71.240.240:380/ui/',
    'http://223.71.240.240:380/'
  ]);
});

test('全量 favicon 刷新只穿透扩展原生缓存地址', () => {
  const nativeSource = 'chrome-extension://extension-id/_favicon/?pageUrl=https%3A%2F%2Fwww.google.com%2F&size=32';

  assert.equal(
    withFaviconRefreshToken(nativeSource, 123),
    `${nativeSource}&_refresh=123`
  );
  assert.equal(withFaviconRefreshToken('https://cdn.example/icon.png', 123), 'https://cdn.example/icon.png');
});

test('搜索引擎索引循环由统一纯模型计算', () => {
  assert.equal(normalizeSearchIndex(-1, 3), 2);
  assert.equal(normalizeSearchIndex(3, 3), 0);
  assert.equal(nextSelectedEngineIndex(0, 1, 3), 1);
  assert.equal(nextSelectedEngineIndex(2, 1, 3), 0);
  assert.equal(nextSelectedEngineIndex(-1, -1, 3), 2);
});

test('目录整理普通搜索只匹配目录标题', () => {
  const input: FolderView[] = [
    folders[0],
    { ...folders[0], id: 'folder-2', title: '归档', bookmarks: [bookmark('9', '常用内容', [])] }
  ];

  assert.deepEqual(filterFoldersByTitle(input, '常用').map((folder) => folder.id), ['folder-1']);
});

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

test('目录预测顺序映射浏览器绝对索引', () => {
  const indexes = new Map([['a', 0], ['b', 2], ['c', 5]]);
  assert.equal(resolveFolderBrowserIndex(['a', 'c', 'b'], 'c', indexes), 2);
  assert.equal(resolveFolderBrowserIndex(['b', 'a', 'c'], 'c', indexes), 1);
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
    { ...folders[0], id: 'folder-2', title: '目标', bookmarks: [bookmark('3', 'Gamma', [])] }
  ];

  moveWorkspaceBookmark(input, { bookmarkId: '2', parentId: 'folder-2', index: 1 });

  assert.deepEqual(input[0].bookmarks.map((item) => [item.id, item.index]), [['1', 0]]);
  assert.deepEqual(input[1].bookmarks.map((item) => [item.id, item.parentId, item.index]), [
    ['3', 'folder-2', 0],
    ['2', 'folder-2', 1]
  ]);
});

test('工作区纯模型移动目录保持相对顺序', () => {
  const input: FolderView[] = [
    { ...folders[0], id: 'a' },
    { ...folders[0], id: 'b' },
    { ...folders[0], id: 'c' }
  ];

  moveWorkspaceFolder(input, 'a', 2);
  assert.deepEqual(input.map((folder) => folder.id), ['b', 'c', 'a']);
});

test('备份恢复将目录和自定义引擎引用映射为新的 Chrome ID', () => {
  const idMap = new Map([
    ['folder-old', 'folder-new'],
    ['engine-old', 'engine-new']
  ]);

  assert.deepEqual(
    remapImportedPreferences(
      { collapsedFolderIds: ['folder-old', 'missing'], searchEngine: 'bookmark:engine-old' },
      idMap,
      { collapsedFolderIds: [], searchEngine: 'builtin:bing' }
    ),
    { collapsedFolderIds: ['folder-new'], searchEngine: 'bookmark:engine-new' }
  );
});

test('备份恢复保持内置引擎 ID，自定义引擎缺失时保留当前选择', () => {
  const current = { collapsedFolderIds: [], searchEngine: 'builtin:google' };
  assert.equal(remapImportedPreferences({ collapsedFolderIds: [], searchEngine: 'builtin:bing' }, new Map(), current).searchEngine, 'builtin:bing');
  assert.equal(remapImportedPreferences({ collapsedFolderIds: [], searchEngine: 'bookmark:missing' }, new Map(), current).searchEngine, 'builtin:google');
});

test('同一实例恢复按 sourceId 找回被移动节点而不是创建副本', () => {
  const source: ExportBookmarkNode = { sourceId: 'source-id', title: '旧标题', url: 'https://source.example' };
  const moved: BrowserBookmarkNode = {
    id: 'source-id',
    parentId: 'other-folder',
    title: '已修改标题',
    url: 'https://changed.example'
  };
  const duplicate: BrowserBookmarkNode = {
    id: 'duplicate-id',
    parentId: 'target-folder',
    title: '旧标题',
    url: 'https://source.example'
  };

  assert.equal(
    selectRestoreCandidate(source, [duplicate], new Map([[moved.id, moved], [duplicate.id, duplicate]]), new Set(), true)?.id,
    'source-id'
  );
});

test('跨实例恢复忽略碰巧相同的 ID，并按父目录内重复项顺序匹配', () => {
  const source: ExportBookmarkNode = { sourceId: '42', title: '重复书签', url: 'https://same.example' };
  const unrelatedSameId: BrowserBookmarkNode = { id: '42', parentId: 'elsewhere', title: '其他书签', url: 'https://other.example' };
  const first: BrowserBookmarkNode = { id: '100', parentId: 'target', title: '重复书签', url: 'https://same.example' };
  const second: BrowserBookmarkNode = { id: '101', parentId: 'target', title: '重复书签', url: 'https://same.example' };
  const nodesById = new Map([[unrelatedSameId.id, unrelatedSameId], [first.id, first], [second.id, second]]);

  assert.equal(selectRestoreCandidate(source, [first, second], nodesById, new Set(), false)?.id, '100');
  assert.equal(selectRestoreCandidate(source, [first, second], nodesById, new Set(['100']), false)?.id, '101');
});

test('同一实例 sourceId 已不存在时不拿相同内容书签冒充原节点', () => {
  const source: ExportBookmarkNode = { sourceId: 'missing', title: '重复书签', url: 'https://same.example' };
  const duplicate: BrowserBookmarkNode = { id: 'other', parentId: 'target', title: '重复书签', url: 'https://same.example' };

  assert.equal(selectRestoreCandidate(source, [duplicate], new Map([[duplicate.id, duplicate]]), new Set(), true), undefined);
});

test('同一实例 sourceId 被 Chrome 重建后复用持久化的恢复映射', () => {
  const source: ExportBookmarkNode = { sourceId: 'deleted-source', title: '恢复书签', url: 'https://restore.example' };
  const restored: BrowserBookmarkNode = {
    id: 'new-chrome-id',
    parentId: 'target',
    title: '恢复书签',
    url: 'https://restore.example'
  };

  assert.equal(
    selectRestoreCandidate(source, [restored], new Map([[restored.id, restored]]), new Set(), true, restored.id)?.id,
    restored.id
  );
});

test('跨实例重复导入优先复用持久化映射而不是相同内容的其他书签', () => {
  const source: ExportBookmarkNode = { sourceId: 'foreign-source', title: '重复书签', url: 'https://same.example' };
  const duplicate: BrowserBookmarkNode = { id: 'duplicate', parentId: 'target', title: '重复书签', url: 'https://same.example' };
  const restored: BrowserBookmarkNode = { id: 'restored', parentId: 'target', title: '已被修改', url: 'https://changed.example' };
  const nodesById = new Map([[duplicate.id, duplicate], [restored.id, restored]]);

  assert.equal(selectRestoreCandidate(source, [duplicate, restored], nodesById, new Set(), false, restored.id)?.id, restored.id);
});

test('新版 Chrome 根目录按 folderType 识别并优先账号同步书签栏', () => {
  const localBar: BrowserBookmarkNode = { id: '1', title: '本地书签栏', folderType: 'bookmarks-bar', syncing: false, children: [] };
  const accountBar: BrowserBookmarkNode = { id: '101', title: '账号书签栏', folderType: 'bookmarks-bar', syncing: true, children: [] };
  const other: BrowserBookmarkNode = { id: '2', title: '其他书签', folderType: 'other', syncing: true, children: [] };
  const root: BrowserBookmarkNode = { id: '0', title: '', children: [other, localBar, accountBar] };

  assert.equal(selectDefaultBookmarkRoot([root])?.id, '101');
});

test('旧版 Chrome 根目录缺少 folderType 时保留兼容识别', () => {
  const bar: BrowserBookmarkNode = { id: '1', title: '书签栏', children: [] };
  const root: BrowserBookmarkNode = { id: '0', title: '', children: [{ id: '2', title: '其他书签', children: [] }, bar] };

  assert.equal(selectDefaultBookmarkRoot([root])?.id, '1');
});

test('维护计划只清理孤立扩展数据并规范有效引用', () => {
  const bookmarkNode: BrowserBookmarkNode = { id: 'bookmark-1', parentId: 'folder-1', title: '有效书签', url: 'https://valid.example' };
  const folderNode: BrowserBookmarkNode = { id: 'folder-1', parentId: '1', title: '目录', children: [bookmarkNode] };
  const tree: BrowserBookmarkNode[] = [{ id: '0', title: '', children: [{ id: '1', title: '书签栏', children: [folderNode] }] }];
  const plan = buildMetadataRepairPlan({
    tree,
    extras: {
      'bookmark-1': { bookmarkId: 'wrong-id', tags: [' work ', 'WORK', ''], updatedAt: 1 },
      orphan: { bookmarkId: 'orphan', tags: ['old'], updatedAt: 1 }
    },
    preferences: { collapsedFolderIds: ['folder-1', 'missing-folder'], searchEngine: 'bookmark:missing-engine' },
    mappings: [
      { originId: 'origin', sourceId: 'valid', targetId: 'bookmark-1' },
      { originId: 'origin', sourceId: 'missing', targetId: 'missing-target' }
    ]
  });

  assert.equal(plan.extraPatch.has('orphan'), true);
  assert.equal(plan.extraPatch.get('orphan'), undefined);
  assert.deepEqual(plan.extraPatch.get('bookmark-1')?.tags, ['work']);
  assert.equal(plan.extraPatch.get('bookmark-1')?.bookmarkId, 'bookmark-1');
  assert.deepEqual(plan.repairedPreferences, { collapsedFolderIds: ['folder-1'], searchEngine: 'auto' });
  assert.deepEqual(plan.staleMappings.map((item) => item.sourceId), ['missing']);
  assert.deepEqual(plan.report, {
    extrasScanned: 2,
    extrasRepaired: 1,
    extrasRemoved: 1,
    mappingsScanned: 2,
    mappingsRemoved: 1,
    preferencesRepaired: true
  });
});

test('搜索能力在编辑、导入和运行时共用 HTTP(S) 模板校验', () => {
  assert.equal(getSearchCapabilityValidationError({
    tags: ['search'],
    url: 'https://example.com',
    searchUrl: 'https://example.com/search?q={keyword}'
  }), undefined);
  assert.match(getSearchCapabilityValidationError({
    tags: ['search'],
    url: 'https://example.com',
    searchUrl: 'javascript:alert({keyword})'
  }) ?? '', /HTTP\(S\)/);
  assert.match(getSearchCapabilityValidationError({
    tags: ['search', 'search_site'],
    url: 'https://example.com',
    searchUrl: 'https://example.com/search?q={keyword}'
  }) ?? '', /不能同时使用/);
});
