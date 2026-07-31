import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookmarkView, FolderView } from '../src/types/bookmark.ts';
import { getFaviconPageUrls, withFaviconRefreshToken } from '../src/services/favicon.ts';
import {
  buildQuickSearchUrl,
  filterFolders,
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
    extra: { tags, ...extra }
  };
}

const folders: FolderView[] = [{
  id: 'folder-1',
  parentId: '1',
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
