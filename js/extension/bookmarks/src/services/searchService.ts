import type {
    BookmarkView,
    FolderView,
    QuickSearchTarget,
    SearchEngineOption,
    TagSearchState,
    TagSummary,
} from '../types/bookmark';
import { normalizeTag } from './bookmarkExtraModel.ts';

export { normalizeTag } from './bookmarkExtraModel.ts';

export const SEARCH_TAG = 'search';
export const SEARCH_SITE_TAG = 'search_site';

function getBuiltinFaviconSources(pageUrl: string): string[] {
    if (globalThis.location?.protocol !== 'chrome-extension:') return [];
    const faviconUrl = new URL('/_favicon/', globalThis.location.origin);
    faviconUrl.searchParams.set('pageUrl', pageUrl);
    faviconUrl.searchParams.set('size', '32');
    return [faviconUrl.toString()];
}

const builtinEngines: SearchEngineOption[] = [
    {
        id: 'builtin:bing',
        title: 'Bing',
        searchUrl: 'https://www.bing.com/search?q={keyword}',
        domain: 'bing.com',
        faviconUrls: getBuiltinFaviconSources('https://www.bing.com/'),
        builtin: true,
    },
    {
        id: 'builtin:google',
        title: 'Google',
        searchUrl: 'https://www.google.com/search?q={keyword}',
        domain: 'google.com',
        faviconUrls: getBuiltinFaviconSources('https://www.google.com/'),
        builtin: true,
    },
];

function hasTag(bookmark: BookmarkView, tag: string): boolean {
    const normalized = normalizeTag(tag);
    return bookmark.extra.tags.some((item) => normalizeTag(item) === normalized);
}

function hasTemplate(template?: string): template is string {
    return Boolean(template && /\$\{keyword\}|\{keyword\}/.test(template));
}

function isHttpTemplate(template?: string): template is string {
    if (!hasTemplate(template)) return false;
    try {
        const probe = new URL(template.replace(/\$\{keyword\}|\{keyword\}/g, 'probe'));
        return probe.protocol === 'http:' || probe.protocol === 'https:';
    } catch {
        return false;
    }
}

function getHttpDomain(url?: string): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return undefined;
    }
}

export function getSearchCapabilityValidationError(input: {
    tags: readonly string[];
    url?: string;
    searchUrl?: string;
}): string | undefined {
    const normalizedTags = new Set(input.tags.map(normalizeTag));
    const hasSearch = normalizedTags.has(SEARCH_TAG);
    const hasSearchSite = normalizedTags.has(SEARCH_SITE_TAG);
    if (hasSearch && hasSearchSite) return 'search 与 search_site 不能同时使用';
    if (hasSearch && !isHttpTemplate(input.searchUrl?.trim())) {
        return 'search 标签需要有效的 HTTP(S) 搜索 URL 模板，并包含 {keyword}';
    }
    if (hasSearchSite && !getHttpDomain(input.url)) {
        return 'search_site 标签需要有效的 HTTP(S) 书签 URL';
    }
    return undefined;
}

export function getTagSummaries(folders: FolderView[]): TagSummary[] {
    const values = new Map<string, TagSummary>();

    folders
        .flatMap((folder) => folder.bookmarks)
        .forEach((bookmark) => {
            const seen = new Set<string>();
            bookmark.extra.tags.forEach((rawTag) => {
                const name = rawTag.trim();
                const normalizedName = normalizeTag(name);
                if (!normalizedName || seen.has(normalizedName)) return;
                seen.add(normalizedName);
                const current = values.get(normalizedName);
                if (current) {
                    current.count += 1;
                } else {
                    values.set(normalizedName, {
                        name,
                        normalizedName,
                        count: 1,
                        searchCapability: normalizedName === SEARCH_TAG || normalizedName === SEARCH_SITE_TAG,
                    });
                }
            });
        });

    return [...values.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function parseTagSearch(input: string, tags: TagSummary[]): TagSearchState | undefined {
    const trimmedStart = input.trimStart();
    if (!trimmedStart.startsWith('#')) return undefined;

    const query = normalizeTag(trimmedStart.slice(1));
    const exactTag = tags.find((tag) => tag.normalizedName === query);
    const matches = tags
        .filter((tag) => !query || tag.normalizedName.includes(query))
        .sort((left, right) => {
            const leftPrefix = left.normalizedName.startsWith(query) ? 0 : 1;
            const rightPrefix = right.normalizedName.startsWith(query) ? 0 : 1;
            return leftPrefix - rightPrefix || right.count - left.count || left.name.localeCompare(right.name);
        });

    return { query, matches, exactTag };
}

function bookmarkMatchesText(bookmark: BookmarkView, keyword: string): boolean {
    return [bookmark.title, bookmark.url, bookmark.domain, bookmark.extra.description, ...bookmark.extra.tags]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword);
}

export function filterFolders(folders: FolderView[], input: string, tagSearch?: TagSearchState): FolderView[] {
    if (tagSearch) {
        const acceptedTags = new Set(
            (tagSearch.exactTag ? [tagSearch.exactTag] : tagSearch.matches).map((tag) => tag.normalizedName),
        );
        if (!acceptedTags.size) return [];

        return folders
            .map((folder) => ({
                ...folder,
                bookmarks: folder.bookmarks.filter((bookmark) =>
                    bookmark.extra.tags.some((tag) => acceptedTags.has(normalizeTag(tag))),
                ),
            }))
            .filter((folder) => folder.bookmarks.length > 0);
    }

    const keyword = input.trim().toLocaleLowerCase();
    if (!keyword) return folders;

    return folders
        .map((folder) => {
            const folderMatches = folder.title.toLocaleLowerCase().includes(keyword);
            return {
                ...folder,
                bookmarks: folderMatches
                    ? folder.bookmarks
                    : folder.bookmarks.filter((bookmark) => bookmarkMatchesText(bookmark, keyword)),
            };
        })
        .filter((folder) => folder.bookmarks.length > 0);
}

export function filterFoldersByTitle(folders: FolderView[], input: string): FolderView[] {
    const keyword = input.trim().toLocaleLowerCase();
    if (!keyword) return folders;
    return folders.filter((folder) => folder.title.toLocaleLowerCase().includes(keyword));
}

export function getSearchEngineOptions(folders: FolderView[]): SearchEngineOption[] {
    const custom = folders
        .flatMap((folder) => folder.bookmarks)
        .filter(
            (bookmark) =>
                hasTag(bookmark, SEARCH_TAG) &&
                !hasTag(bookmark, SEARCH_SITE_TAG) &&
                isHttpTemplate(bookmark.extra.searchUrl),
        )
        .map<SearchEngineOption>((bookmark) => ({
            id: `bookmark:${bookmark.id}`,
            title: bookmark.title,
            searchUrl: bookmark.extra.searchUrl ?? '',
            domain: bookmark.domain,
            faviconUrls: bookmark.faviconUrls,
            builtin: false,
            bookmarkId: bookmark.id,
        }));
    const remainingBuiltins = builtinEngines.filter(
        (builtin) =>
            !custom.some((option) => {
                const customTitle = option.title.trim().toLocaleLowerCase();
                const builtinTitle = builtin.title.toLocaleLowerCase();
                const customDomain = option.domain.toLocaleLowerCase();
                return (
                    customTitle === builtinTitle ||
                    customDomain === builtin.domain ||
                    customDomain.endsWith(`.${builtin.domain}`)
                );
            }),
    );
    return [...custom, ...remainingBuiltins];
}

export function resolveSearchEngine(options: SearchEngineOption[], selectedId: string): SearchEngineOption {
    return (
        options.find((option) => option.id === selectedId) ??
        options.find((option) => !option.builtin) ??
        options.find((option) => option.id === 'builtin:bing') ??
        builtinEngines[0]
    );
}

export function buildSearchEngineUrl(engine: SearchEngineOption, keyword: string): string {
    return engine.searchUrl.replace(/\$\{keyword\}|\{keyword\}/g, encodeURIComponent(keyword));
}

export function getQuickSearchTargets(folders: FolderView[], keyword: string): QuickSearchTarget[] {
    const normalized = keyword.trim().toLocaleLowerCase();
    return folders
        .flatMap((folder) => folder.bookmarks)
        .flatMap<QuickSearchTarget>((bookmark) => {
            const site = hasTag(bookmark, SEARCH_SITE_TAG);
            if (!site || hasTag(bookmark, SEARCH_TAG) || !getHttpDomain(bookmark.url)) return [];
            return [
                {
                    bookmarkId: bookmark.id,
                    title: bookmark.title,
                    domain: bookmark.domain,
                    kind: 'search_site',
                    url: bookmark.url ?? '',
                    tags: bookmark.extra.tags,
                    accent: bookmark.accent,
                    faviconUrls: bookmark.faviconUrls,
                },
            ];
        })
        .filter((target) => {
            if (!normalized) return true;
            const ordinaryTags = target.tags.filter(
                (tag) => ![SEARCH_TAG, SEARCH_SITE_TAG].includes(normalizeTag(tag)),
            );
            return `${target.title} ${target.domain} ${ordinaryTags.join(' ')}`
                .toLocaleLowerCase()
                .includes(normalized);
        })
        .slice(0, 12);
}

export function buildQuickSearchUrl(target: QuickSearchTarget, keyword: string, engine: SearchEngineOption): string {
    const domain = getHttpDomain(target.url);
    if (!domain) return '';
    return buildSearchEngineUrl(engine, `site:${domain} ${keyword}`);
}

export function parseQuickSearch(
    input: string,
): { siteQuery: string; keyword: string; hasKeyword: boolean } | undefined {
    const trimmedStart = input.trimStart();
    if (!trimmedStart.startsWith('!') && !trimmedStart.startsWith('！')) return undefined;
    const body = trimmedStart.slice(1);
    const firstWhitespaceIndex = body.search(/\s/);

    if (firstWhitespaceIndex === -1) {
        return { siteQuery: body.trim(), keyword: '', hasKeyword: false };
    }

    const siteQuery = body.slice(0, firstWhitespaceIndex).trim();
    const keyword = body.slice(firstWhitespaceIndex + 1).trim();
    return { siteQuery, keyword, hasKeyword: keyword.length > 0 };
}
