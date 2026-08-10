import type { BookmarkView, FolderView } from '../src/types/bookmark.ts';

export function bookmark(
    id: string,
    title: string,
    tags: string[],
    extra: Partial<BookmarkView['extra']> = {},
): BookmarkView {
    return {
        id,
        parentId: 'folder-1',
        index: Number(id.replace(/\D/g, '')) || 0,
        title,
        url: `https://${title.toLowerCase()}.example/path`,
        domain: `${title.toLowerCase()}.example`,
        accent: '#555555',
        faviconUrls: [],
        extra: { bookmarkId: id, tags, updatedAt: 0, ...extra },
    };
}

export const folders: FolderView[] = [
    {
        id: 'folder-1',
        index: 0,
        title: '常用',
        bookmarks: [
            bookmark('1', 'Alpha', ['xxx', 'work']),
            bookmark('2', 'Beta', ['xxy']),
            bookmark('3', 'Docs', ['search_site']),
            bookmark('4', 'Engine', ['search'], { searchUrl: 'https://engine.example/?q={keyword}' }),
        ],
    },
];
