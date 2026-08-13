import type { BookmarkExtra } from '../types/bookmark';
import { normalizeFaviconPageUrl } from './favicon.ts';

function optionalTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
}

export function normalizeTag(tag: string): string {
    return tag.trim().toLowerCase();
}

export function normalizeTags(values: readonly unknown[]): string[] {
    return values.reduce<string[]>((result, value) => {
        if (typeof value !== 'string') return result;
        const tag = value.trim();
        if (!tag || result.some((current) => normalizeTag(current) === normalizeTag(tag))) return result;
        result.push(tag);
        return result;
    }, []);
}

export function normalizeBookmarkExtra(value: unknown, bookmarkId: string): BookmarkExtra | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const extra = value as Partial<BookmarkExtra>;
    return {
        bookmarkId,
        tags: normalizeTags(Array.isArray(extra.tags) ? extra.tags : []),
        description: optionalTrimmedString(extra.description),
        searchUrl: optionalTrimmedString(extra.searchUrl),
        faviconOverride: normalizeFaviconPageUrl(extra.faviconOverride),
        updatedAt:
            typeof extra.updatedAt === 'number' && Number.isFinite(extra.updatedAt) ? extra.updatedAt : Date.now(),
    };
}

export function emptyBookmarkExtra(bookmarkId: string): BookmarkExtra {
    return {
        bookmarkId,
        tags: [],
        updatedAt: Date.now(),
    };
}
