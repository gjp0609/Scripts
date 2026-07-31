import type { BookmarkView, BrowserBookmarkNode, FolderView } from '../types/bookmark';

export function clampWorkspaceIndex(index: number, total: number): number {
  return Math.min(Math.max(index, 0), total);
}

export function normalizeFolderBookmarks(folder: FolderView) {
  folder.bookmarks.forEach((bookmark, index) => {
    bookmark.parentId = folder.id;
    bookmark.index = index;
  });
}

export function normalizeWorkspaceFolders(folders: FolderView[]) {
  folders.sort((left, right) => left.index - right.index);
  folders.forEach(normalizeFolderBookmarks);
}

export function findWorkspaceBookmark(folders: FolderView[], bookmarkId: string) {
  for (const folder of folders) {
    const index = folder.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId);
    if (index >= 0) return { folder, index, bookmark: folder.bookmarks[index] };
  }
  return undefined;
}

export function upsertWorkspaceFolder(folders: FolderView[], node: BrowserBookmarkNode) {
  const existing = folders.find((folder) => folder.id === node.id);
  if (existing) {
    existing.title = node.title || '未命名目录';
    existing.index = node.index ?? existing.index;
  } else {
    folders.push({
      id: node.id,
      title: node.title || '未命名目录',
      index: node.index ?? folders.length,
      bookmarks: [],
      collapsed: false
    });
  }
  normalizeWorkspaceFolders(folders);
}

export function removeWorkspaceFolder(folders: FolderView[], folderId: string) {
  const index = folders.findIndex((folder) => folder.id === folderId);
  if (index >= 0) folders.splice(index, 1);
  normalizeWorkspaceFolders(folders);
}

export function upsertWorkspaceBookmark(folders: FolderView[], bookmark: BookmarkView) {
  const targetFolder = folders.find((folder) => folder.id === bookmark.parentId);
  const current = findWorkspaceBookmark(folders, bookmark.id);

  if (!targetFolder) {
    if (current) {
      current.folder.bookmarks.splice(current.index, 1);
      normalizeFolderBookmarks(current.folder);
    }
    return;
  }

  const view = current?.bookmark ?? { ...bookmark, faviconUrls: [...bookmark.faviconUrls] };
  Object.assign(view, bookmark, { faviconUrls: [...bookmark.faviconUrls] });
  if (current) current.folder.bookmarks.splice(current.index, 1);
  const index = clampWorkspaceIndex(bookmark.index ?? targetFolder.bookmarks.length, targetFolder.bookmarks.length);
  targetFolder.bookmarks.splice(index, 0, view);
  normalizeFolderBookmarks(targetFolder);
  if (current && current.folder.id !== targetFolder.id) normalizeFolderBookmarks(current.folder);
}

export function removeWorkspaceBookmark(folders: FolderView[], bookmarkId: string) {
  const current = findWorkspaceBookmark(folders, bookmarkId);
  if (!current) return;
  current.folder.bookmarks.splice(current.index, 1);
  normalizeFolderBookmarks(current.folder);
}

export function moveWorkspaceBookmark(folders: FolderView[], input: { bookmarkId: string; parentId: string; index: number }) {
  const current = findWorkspaceBookmark(folders, input.bookmarkId);
  if (!current) return;
  const targetFolder = folders.find((folder) => folder.id === input.parentId);
  if (!targetFolder) {
    removeWorkspaceBookmark(folders, input.bookmarkId);
    return;
  }
  if (current.folder.id === targetFolder.id && current.index === input.index) return;

  current.folder.bookmarks.splice(current.index, 1);
  const index = clampWorkspaceIndex(input.index, targetFolder.bookmarks.length);
  current.bookmark.parentId = targetFolder.id;
  targetFolder.bookmarks.splice(index, 0, current.bookmark);
  normalizeFolderBookmarks(current.folder);
  if (current.folder.id !== targetFolder.id) normalizeFolderBookmarks(targetFolder);
}

export function moveWorkspaceFolder(folders: FolderView[], folderId: string, index: number) {
  const currentIndex = folders.findIndex((folder) => folder.id === folderId);
  if (currentIndex < 0) return;
  const [folder] = folders.splice(currentIndex, 1);
  folders.splice(clampWorkspaceIndex(index, folders.length), 0, folder);
}
