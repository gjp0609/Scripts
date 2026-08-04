import type { BookmarkExtra, BookmarkView, BrowserBookmarkNode, FolderView } from '../types/bookmark';
import { createBookmark, getDefaultBookmarkRoot, getSubTree, getTree, moveNode, removeBookmark, removeFolder, updateBookmark } from './bookmarkApi';
import { cleanupExtras, getExtras, removeExtra, removeExtras, saveExtra } from './extraStore';
import { getFaviconSources } from './favicon';
import { normalizeTag, SEARCH_SITE_TAG, SEARCH_TAG } from './searchService';

const accents = ['#4F6EF7', '#06B6D4', '#22C55E', '#E8853D', '#EF4444', '#8B5CF6', '#F59E0B'];

function emptyExtra(bookmarkId: string): BookmarkExtra {
  return {
    bookmarkId,
    tags: [],
    updatedAt: Date.now()
  };
}

export function getDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function accentForId(id: string): string {
  const total = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return accents[total % accents.length];
}

function toBookmarkView(node: BrowserBookmarkNode, extras: Record<string, BookmarkExtra>): BookmarkView {
  const extra = extras[node.id] ?? emptyExtra(node.id);
  return {
    ...node,
    extra,
    domain: getDomain(node.url),
    accent: accentForId(node.id),
    faviconUrls: getFaviconSources({
      url: node.url,
      override: extra.faviconOverride
    })
  };
}

export function buildBookmarkView(node: BrowserBookmarkNode, extra?: BookmarkExtra): BookmarkView {
  return toBookmarkView(node, extra ? { [node.id]: extra } : {});
}

export async function loadBookmarkWorkspace(): Promise<{ rootId: string; rootChildIds: string[]; folders: FolderView[] }> {
  const [tree, extras] = await Promise.all([getTree(), getExtras()]);
  const root = getDefaultBookmarkRoot(tree);

  if (!root) {
    throw new Error('未找到默认书签根目录');
  }

  const folders = (root.children ?? [])
    .filter((node) => !node.url && Array.isArray(node.children))
    .map((folder, index) => ({
      id: folder.id,
      title: folder.title || '未命名目录',
      index: folder.index ?? index,
      bookmarks: (folder.children ?? [])
        .filter((node) => Boolean(node.url))
        .map((bookmark) => toBookmarkView(bookmark, extras))
    }))
    .sort((a, b) => a.index - b.index);

  const validIds = new Set(folders.flatMap((folder) => folder.bookmarks.map((bookmark) => bookmark.id)));
  await cleanupExtras(validIds);

  return { rootId: root.id, rootChildIds: (root.children ?? []).map((node) => node.id), folders };
}

export async function addCurrentBookmark(parentId: string, title: string, url: string): Promise<BrowserBookmarkNode> {
  return createBookmark({ parentId, title, url });
}

export async function saveFolderDetails(input: { id?: string; parentId: string; title: string }): Promise<BrowserBookmarkNode> {
  if (input.id) {
    return updateBookmark(input.id, { title: input.title });
  }

  return createBookmark({ parentId: input.parentId, title: input.title });
}

export async function saveBookmarkDetails(input: {
  id?: string;
  parentId: string;
  title: string;
  url: string;
  tags: string[];
  description?: string;
  searchUrl?: string;
}): Promise<BookmarkView> {
  const tags = input.tags.reduce<string[]>((result, rawTag) => {
    const tag = rawTag.trim();
    if (!tag || result.some((current) => normalizeTag(current) === normalizeTag(tag))) return result;
    result.push(tag);
    return result;
  }, []);
  const hasSearch = tags.some((tag) => normalizeTag(tag) === SEARCH_TAG);
  const hasSearchSite = tags.some((tag) => normalizeTag(tag) === SEARCH_SITE_TAG);

  if (hasSearch && hasSearchSite) {
    throw new Error('search 与 search_site 不能同时使用');
  }
  if (hasSearch && !/\$\{keyword\}|\{keyword\}/.test(input.searchUrl?.trim() ?? '')) {
    throw new Error('search 标签需要包含 {keyword} 的搜索 URL 模板');
  }
  if (hasSearchSite) {
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('search_site 标签需要有效的 HTTP(S) 书签 URL');
    }
  }

  let node = input.id
    ? await updateBookmark(input.id, { title: input.title, url: input.url })
    : await createBookmark({ parentId: input.parentId, title: input.title, url: input.url });

  if (node.parentId !== input.parentId) {
    const targetFolder = await getSubTree(input.parentId);
    node = await moveNode(node.id, {
      parentId: input.parentId,
      index: targetFolder?.children?.length ?? 0
    });
  }

  const extra: BookmarkExtra = {
    bookmarkId: node.id,
    tags,
    description: input.description,
    searchUrl: hasSearch ? input.searchUrl?.trim() : undefined,
    updatedAt: Date.now()
  };

  await saveExtra(extra);

  return buildBookmarkView(
    {
      ...node,
      parentId: input.parentId
    },
    extra
  );
}

export async function deleteBookmarkDetails(bookmarkId: string): Promise<void> {
  await removeBookmark(bookmarkId);
  await removeExtra(bookmarkId).catch(() => undefined);
}

function collectBookmarkIds(node?: BrowserBookmarkNode): string[] {
  if (!node) return [];
  const ids: string[] = [];

  if (node.url) {
    ids.push(node.id);
  }

  node.children?.forEach((child) => {
    ids.push(...collectBookmarkIds(child));
  });

  return ids;
}

export async function deleteFolderDetails(folderId: string): Promise<void> {
  const subtree = await getSubTree(folderId);
  const bookmarkIds = collectBookmarkIds(subtree);
  await removeFolder(folderId);
  await removeExtras(bookmarkIds).catch(() => undefined);
}

export type BookmarkMoveSnapshot = {
  id: string;
  parentId?: string;
  index?: number;
};

export async function moveBookmarkOrder(input: {
  bookmarkId: string;
  parentId: string;
  index: number;
}): Promise<BrowserBookmarkNode> {
  return moveNode(input.bookmarkId, {
    parentId: input.parentId,
    index: input.index
  });
}

export async function moveFolderOrder(input: { folderId: string; index: number }): Promise<BrowserBookmarkNode> {
  return moveNode(input.folderId, { index: input.index });
}

export async function restoreBookmarkPosition(snapshot: BookmarkMoveSnapshot): Promise<BrowserBookmarkNode> {
  return moveNode(snapshot.id, {
    parentId: snapshot.parentId,
    index: snapshot.index
  });
}
