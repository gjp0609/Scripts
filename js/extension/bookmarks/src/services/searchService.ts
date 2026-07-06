import type { FolderView, QuickSearchTarget, SearchEngineId, SearchResultItem } from '../types/bookmark';

const engineUrls: Record<SearchEngineId, (keyword: string) => string> = {
  google: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  bing: (keyword) => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`
};

export function getSearchEngineUrl(engine: SearchEngineId, keyword: string): string {
  return engineUrls[engine](keyword);
}

export function searchBookmarks(folders: FolderView[], keyword: string, engine: SearchEngineId): SearchResultItem[] {
  const normalized = keyword.trim().toLocaleLowerCase();
  if (!normalized) return [];

  const bookmarkResults = folders.flatMap((folder) =>
    folder.bookmarks
      .filter((bookmark) => {
        const haystack = [
          bookmark.title,
          bookmark.url,
          bookmark.domain,
          bookmark.extra.description,
          ...bookmark.extra.tags
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        return haystack.includes(normalized);
      })
      .map<SearchResultItem>((bookmark) => ({
        type: 'bookmark',
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url ?? '',
        domain: bookmark.domain,
        folderTitle: folder.title,
        tags: bookmark.extra.tags,
        accent: bookmark.accent
      }))
  );

  const engineResult: SearchResultItem = {
    type: 'engine',
    id: engine,
    title: `${engine === 'google' ? 'Google' : 'Bing'} 搜索 ${keyword}`,
    url: getSearchEngineUrl(engine, keyword),
    domain: engine === 'google' ? 'google.com' : 'bing.com',
    tags: ['搜索引擎'],
    accent: engine === 'google' ? '#4285F4' : '#008373'
  };

  return [
    ...bookmarkResults,
    engineResult
  ].slice(0, 10);
}

export function getQuickSearchTargets(folders: FolderView[], keyword: string): QuickSearchTarget[] {
  const normalized = keyword.trim().toLocaleLowerCase();
  return folders
    .flatMap((folder) => folder.bookmarks)
    .filter((bookmark) => Boolean(bookmark.extra.searchUrl))
    .filter((bookmark) => {
      if (!normalized) return true;
      return `${bookmark.title} ${bookmark.domain} ${bookmark.extra.tags.join(' ')}`.toLocaleLowerCase().includes(normalized);
    })
    .map((bookmark) => ({
      bookmarkId: bookmark.id,
      title: bookmark.title,
      domain: bookmark.domain,
      searchUrl: bookmark.extra.searchUrl ?? '',
      accent: bookmark.accent
    }))
    .slice(0, 8);
}

export function buildQuickSearchUrl(template: string, keyword: string): string {
  return template.replace(/\$\{keyword\}|\{keyword\}/g, encodeURIComponent(keyword));
}

export function parseQuickSearch(input: string): { siteQuery: string; keyword: string } | undefined {
  if (!input.startsWith('!') && !input.startsWith('！')) return undefined;
  const body = input.slice(1).trim();
  const [siteQuery = '', ...keywordParts] = body.split(/\s+/);
  return {
    siteQuery,
    keyword: keywordParts.join(' ')
  };
}
