import assert from 'node:assert/strict';
import test from 'node:test';
import type { FolderView } from '../src/types/bookmark.ts';
import { nextSelectedEngineIndex, normalizeSearchIndex } from '../src/app/searchStateModel.ts';
import {
    getFaviconPageUrls,
    getFaviconPageUrlValidationError,
    normalizeFaviconPageUrl,
    withFaviconRefreshToken,
} from '../src/services/favicon.ts';
import {
    buildQuickSearchUrl,
    filterFolders,
    filterFoldersByTitle,
    getQuickSearchTargets,
    getSearchEngineOptions,
    getTagSummaries,
    parseQuickSearch,
    parseTagSearch,
    resolveSearchEngine,
} from '../src/services/searchService.ts';
import { bookmark, folders } from './fixtures.ts';

test('#xx 动态匹配候选并预览候选标签的书签并集', () => {
    const state = parseTagSearch('#xx', getTagSummaries(folders));
    assert.deepEqual(
        state?.matches.map((tag) => tag.name),
        ['xxx', 'xxy'],
    );
    assert.equal(state?.exactTag, undefined);
    assert.deepEqual(
        filterFolders(folders, '#xx', state).flatMap((folder) => folder.bookmarks.map((item) => item.title)),
        ['Alpha', 'Beta'],
    );
});

test('完全同名 tag 自动切换为精确筛选', () => {
    const state = parseTagSearch('#xxx', getTagSummaries(folders));
    assert.equal(state?.exactTag?.name, 'xxx');
    assert.deepEqual(
        filterFolders(folders, '#xxx', state).flatMap((folder) => folder.bookmarks.map((item) => item.title)),
        ['Alpha'],
    );
});

test('叹号搜索按第一段筛选词和后续完整关键词解析', () => {
    assert.deepEqual(parseQuickSearch('!'), { siteQuery: '', keyword: '', hasKeyword: false });
    assert.deepEqual(parseQuickSearch('！docs'), { siteQuery: 'docs', keyword: '', hasKeyword: false });
    assert.deepEqual(parseQuickSearch('! 搜索 关键词'), { siteQuery: '', keyword: '搜索 关键词', hasKeyword: true });
    assert.deepEqual(parseQuickSearch('!docs 搜索 关键词'), {
        siteQuery: 'docs',
        keyword: '搜索 关键词',
        hasKeyword: true,
    });
});

test('自定义 search 引擎优先，search_site 使用当前引擎生成 site 查询', () => {
    const engines = getSearchEngineOptions(folders);
    const selected = resolveSearchEngine(engines, 'auto');
    const siteTarget = getQuickSearchTargets(folders, '').find((target) => target.kind === 'search_site');
    assert.equal(selected.title, 'Engine');
    assert.ok(siteTarget);
    assert.equal(
        buildQuickSearchUrl(siteTarget, '中文 关键词', selected),
        'https://engine.example/?q=site%3Adocs.example%20%E4%B8%AD%E6%96%87%20%E5%85%B3%E9%94%AE%E8%AF%8D',
    );
    assert.deepEqual(
        getQuickSearchTargets(folders, '').map((target) => target.title),
        ['Docs'],
    );
});

test('无自定义 search 时默认回退 Bing', () => {
    const withoutEngine: FolderView[] = [
        { ...folders[0], bookmarks: folders[0].bookmarks.filter((item) => item.title !== 'Engine') },
    ];
    assert.equal(resolveSearchEngine(getSearchEngineOptions(withoutEngine), 'auto').id, 'builtin:bing');
});

test('已有同名自定义搜索引擎时不再显示对应内置项', () => {
    const input: FolderView[] = [
        {
            ...folders[0],
            bookmarks: [
                ...folders[0].bookmarks,
                bookmark('5', 'Bing', ['search'], { searchUrl: 'https://cn.bing.com/search?q={keyword}' }),
                bookmark('6', 'Google', ['search'], { searchUrl: 'https://www.google.com/search?q={keyword}' }),
            ],
        },
    ];
    const options = getSearchEngineOptions(input);
    assert.equal(options.filter((option) => option.title === 'Bing').length, 1);
    assert.equal(options.filter((option) => option.title === 'Google').length, 1);
    assert.equal(
        options.some((option) => option.id === 'builtin:bing'),
        false,
    );
    assert.equal(
        options.some((option) => option.id === 'builtin:google'),
        false,
    );
});

test('favicon 缓存候选优先精确地址并回退无 fragment 地址与站点根地址', () => {
    assert.deepEqual(getFaviconPageUrls('http://223.71.240.240:380/ui/#/'), [
        'http://223.71.240.240:380/ui/#/',
        'http://223.71.240.240:380/ui/',
        'http://223.71.240.240:380/',
    ]);
});

test('自定义图标地址按替代页面地址规范化并拒绝非 HTTP(S) 协议', () => {
    assert.equal(normalizeFaviconPageUrl(' zentao.net '), 'https://zentao.net/');
    assert.equal(normalizeFaviconPageUrl('intranet.example:8080/app'), 'https://intranet.example:8080/app');
    assert.equal(normalizeFaviconPageUrl('10.8.8.1:88/zentao/'), 'https://10.8.8.1:88/zentao/');
    assert.equal(normalizeFaviconPageUrl('http://10.8.8.1:88/zentao/#home'), 'http://10.8.8.1:88/zentao/#home');
    assert.equal(normalizeFaviconPageUrl('javascript:alert(1)'), undefined);
    assert.match(getFaviconPageUrlValidationError('file:///tmp/favicon.ico') ?? '', /HTTP\(S\)/);
    assert.equal(getFaviconPageUrlValidationError(''), undefined);
});

test('全量 favicon 刷新只穿透扩展原生缓存地址', () => {
    const nativeSource = 'chrome-extension://extension-id/_favicon/?pageUrl=https%3A%2F%2Fwww.google.com%2F&size=32';
    assert.equal(withFaviconRefreshToken(nativeSource, 123), `${nativeSource}&_refresh=123`);
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
        { ...folders[0], id: 'folder-2', title: '归档', bookmarks: [bookmark('9', '常用内容', [])] },
    ];
    assert.deepEqual(
        filterFoldersByTitle(input, '常用').map((folder) => folder.id),
        ['folder-1'],
    );
});
