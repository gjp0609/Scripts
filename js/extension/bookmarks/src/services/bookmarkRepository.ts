import type { BookmarkExtra, BookmarkView, BrowserBookmarkNode, FolderView } from '../types/bookmark';
import { createBookmark, getDefaultBookmarkRoot, getTree, moveNode, removeBookmark, updateBookmark } from './bookmarkApi';
import { cleanupExtras, getExtras, removeExtra, saveExtra } from './extraStore';
import { getFaviconSources } from './favicon';

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

export async function loadBookmarkWorkspace(): Promise<{ rootId: string; folders: FolderView[] }> {
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

  return { rootId: root.id, folders };
}

export async function addCurrentBookmark(parentId: string, title: string, url: string): Promise<BrowserBookmarkNode> {
  return createBookmark({ parentId, title, url });
}

export async function saveBookmarkDetails(input: {
  id?: string;
  parentId: string;
  title: string;
  url: string;
  tags: string[];
  description?: string;
  searchUrl?: string;
}): Promise<BrowserBookmarkNode> {
  const node = input.id
    ? await updateBookmark(input.id, { title: input.title, url: input.url })
    : await createBookmark({ parentId: input.parentId, title: input.title, url: input.url });

  if (node.parentId !== input.parentId) {
    await moveNode(node.id, { parentId: input.parentId });
  }

  await saveExtra({
    bookmarkId: node.id,
    tags: input.tags,
    description: input.description,
    searchUrl: input.searchUrl,
    updatedAt: Date.now()
  });

  return node;
}

export async function deleteBookmarkDetails(bookmarkId: string): Promise<void> {
  await removeBookmark(bookmarkId);
  await removeExtra(bookmarkId);
}
