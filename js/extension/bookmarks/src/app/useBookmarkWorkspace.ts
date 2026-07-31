import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { BookmarkView, BrowserBookmarkNode, FolderView } from '../types/bookmark';
import { getNode, onBookmarkEvent, type BookmarkEvent } from '../services/bookmarkApi';
import { buildBookmarkView, loadBookmarkWorkspace } from '../services/bookmarkRepository';
import { getPreferences, savePreferences } from '../services/extraStore';

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function useBookmarkWorkspace() {
  const rootId = ref('');
  const folders = ref<FolderView[]>([]);
  const loading = ref(true);
  const error = ref('');
  const searchEngine = ref('auto');
  let cleanup: (() => void) | undefined;

  const allBookmarks = computed(() => folders.value.flatMap((folder) => folder.bookmarks));
  const totalBookmarks = computed(() => allBookmarks.value.length);
  const tags = computed(() => {
    const counts = new Map<string, number>();
    allBookmarks.value.forEach((bookmark) => {
      bookmark.extra.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    });
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  });

  function clampIndex(index: number, total: number): number {
    return Math.min(Math.max(index, 0), total);
  }

  function normalizeBookmarks(folder: FolderView) {
    folder.bookmarks.forEach((bookmark, bookmarkIndex) => {
      bookmark.parentId = folder.id;
      bookmark.index = bookmarkIndex;
    });
  }

  function normalizeFolders() {
    folders.value.sort((a, b) => a.index - b.index);
    folders.value.forEach((folder) => {
      normalizeBookmarks(folder);
    });
  }

  function findFolder(folderId: string) {
    return folders.value.find((folder) => folder.id === folderId);
  }

  function findFolderIndex(folderId: string) {
    return folders.value.findIndex((folder) => folder.id === folderId);
  }

  function findBookmark(bookmarkId: string) {
    for (const folder of folders.value) {
      const index = folder.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId);
      if (index >= 0) {
        return { folder, index, bookmark: folder.bookmarks[index] };
      }
    }
    return undefined;
  }

  function isVisibleFolderNode(node: BrowserBookmarkNode): boolean {
    return !node.url && Boolean(rootId.value) && node.parentId === rootId.value;
  }

  function patchBookmark(current: BookmarkView, next: BookmarkView) {
    current.title = next.title;
    current.url = next.url;
    current.parentId = next.parentId;
    current.index = next.index;
    current.domain = next.domain;
    current.accent = next.accent;
    current.extra = next.extra;
    if (!sameStringArray(current.faviconUrls, next.faviconUrls)) {
      current.faviconUrls = [...next.faviconUrls];
    }
  }

  function toBrowserNode(bookmark: BookmarkView): BrowserBookmarkNode {
    return {
      id: bookmark.id,
      parentId: bookmark.parentId,
      index: bookmark.index,
      title: bookmark.title,
      url: bookmark.url
    };
  }

  async function reload(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) {
      loading.value = true;
    }
    error.value = '';
    try {
      const [workspace, preferences] = await Promise.all([loadBookmarkWorkspace(), getPreferences()]);
      rootId.value = workspace.rootId;
      folders.value = workspace.folders.map((folder) => ({
        ...folder,
        collapsed: preferences.collapsedFolderIds.includes(folder.id)
      }));
      searchEngine.value = preferences.searchEngine;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '读取书签失败';
      folders.value = [];
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  }

  async function setSearchEngine(engine: string) {
    searchEngine.value = engine;
    const preferences = await getPreferences();
    await savePreferences({ ...preferences, searchEngine: engine });
  }

  async function toggleFolder(folderId: string) {
    const folder = findFolder(folderId);
    if (!folder) return;
    folder.collapsed = !folder.collapsed;
    const preferences = await getPreferences();
    const collapsedFolderIds = folders.value.filter((item) => item.collapsed).map((item) => item.id);
    await savePreferences({ ...preferences, collapsedFolderIds });
  }

  async function setAllFoldersCollapsed(collapsed: boolean) {
    folders.value.forEach((folder) => {
      folder.collapsed = collapsed;
    });
    const preferences = await getPreferences();
    await savePreferences({
      ...preferences,
      collapsedFolderIds: collapsed ? folders.value.map((folder) => folder.id) : []
    });
  }

  function upsertFolder(node: BrowserBookmarkNode) {
    if (!isVisibleFolderNode(node)) return;

    const existing = findFolder(node.id);
    if (existing) {
      existing.title = node.title || '未命名目录';
      existing.index = node.index ?? existing.index;
    } else {
      folders.value.push({
        id: node.id,
        title: node.title || '未命名目录',
        index: node.index ?? folders.value.length,
        bookmarks: [],
        collapsed: false
      });
    }

    normalizeFolders();
  }

  function removeFolder(folderId: string) {
    const folderIndex = findFolderIndex(folderId);
    if (folderIndex < 0) return;
    folders.value.splice(folderIndex, 1);
    normalizeFolders();
  }

  function upsertBookmark(bookmark: BookmarkView) {
    const targetFolder = findFolder(bookmark.parentId ?? '');
    const current = findBookmark(bookmark.id);

    if (!targetFolder) {
      if (current) {
        current.folder.bookmarks.splice(current.index, 1);
        normalizeBookmarks(current.folder);
      }
      return;
    }

    if (current) {
      patchBookmark(current.bookmark, bookmark);
      const desiredIndex = clampIndex(bookmark.index ?? current.index, Math.max(targetFolder.bookmarks.length - 1, 0));

      if (current.folder.id === targetFolder.id && current.index === desiredIndex) {
        return;
      }

      current.folder.bookmarks.splice(current.index, 1);
      const insertIndex = clampIndex(bookmark.index ?? targetFolder.bookmarks.length, targetFolder.bookmarks.length);
      targetFolder.bookmarks.splice(insertIndex, 0, current.bookmark);
      normalizeBookmarks(current.folder);
      if (current.folder.id !== targetFolder.id) {
        normalizeBookmarks(targetFolder);
      }
      return;
    }

    const insertIndex = clampIndex(bookmark.index ?? targetFolder.bookmarks.length, targetFolder.bookmarks.length);
    targetFolder.bookmarks.splice(insertIndex, 0, {
      ...bookmark,
      faviconUrls: [...bookmark.faviconUrls]
    });
    normalizeBookmarks(targetFolder);
  }

  function removeBookmark(bookmarkId: string) {
    const current = findBookmark(bookmarkId);
    if (!current) return;
    current.folder.bookmarks.splice(current.index, 1);
    normalizeBookmarks(current.folder);
  }

  function moveBookmark(input: { bookmarkId: string; parentId: string; index: number }) {
    const current = findBookmark(input.bookmarkId);
    if (!current) return;

    const targetFolder = findFolder(input.parentId);
    if (!targetFolder) {
      current.folder.bookmarks.splice(current.index, 1);
      normalizeBookmarks(current.folder);
      return;
    }

    const desiredIndex = clampIndex(
      input.index,
      current.folder.id === targetFolder.id ? Math.max(targetFolder.bookmarks.length - 1, 0) : targetFolder.bookmarks.length
    );

    if (current.folder.id === targetFolder.id && current.index === desiredIndex) {
      return;
    }

    current.folder.bookmarks.splice(current.index, 1);
    const insertIndex = clampIndex(input.index, targetFolder.bookmarks.length);
    current.bookmark.parentId = targetFolder.id;
    targetFolder.bookmarks.splice(insertIndex, 0, current.bookmark);
    normalizeBookmarks(current.folder);
    if (current.folder.id !== targetFolder.id) {
      normalizeBookmarks(targetFolder);
    }
  }

  function moveFolder(folderId: string, index: number) {
    const currentIndex = findFolderIndex(folderId);
    if (currentIndex < 0) return;
    const [folder] = folders.value.splice(currentIndex, 1);
    folders.value.splice(clampIndex(index, folders.value.length), 0, folder);
    folders.value.forEach(normalizeBookmarks);
  }

  async function handleBookmarkEvent(event: BookmarkEvent) {
    try {
      if (!rootId.value) return;

      switch (event.type) {
        case 'created': {
          if (event.node.url) {
            if (findFolder(event.node.parentId ?? '')) {
              upsertBookmark(buildBookmarkView(event.node));
            }
          } else {
            upsertFolder(event.node);
          }
          break;
        }
        case 'changed': {
          const currentBookmark = findBookmark(event.id);
          if (currentBookmark) {
            upsertBookmark(
              buildBookmarkView(
                {
                  ...toBrowserNode(currentBookmark.bookmark),
                  title: event.changes.title ?? currentBookmark.bookmark.title,
                  url: event.changes.url ?? currentBookmark.bookmark.url
                },
                currentBookmark.bookmark.extra
              )
            );
            break;
          }

          const folder = findFolder(event.id);
          if (folder && event.changes.title != null) {
            folder.title = event.changes.title || '未命名目录';
          }
          break;
        }
        case 'removed': {
          if (findBookmark(event.id)) {
            removeBookmark(event.id);
          } else {
            removeFolder(event.id);
          }
          break;
        }
        case 'moved': {
          const currentBookmark = findBookmark(event.id);
          if (currentBookmark) {
            moveBookmark({
              bookmarkId: event.id,
              parentId: event.moveInfo.parentId ?? '',
              index: event.moveInfo.index ?? currentBookmark.index
            });
            break;
          }

          const currentFolder = findFolder(event.id);
          if (currentFolder) {
            if (event.moveInfo.parentId !== rootId.value) {
              removeFolder(event.id);
            } else {
              await reload({ silent: true });
            }
            break;
          }

          const movedNode = await getNode(event.id);
          if (!movedNode) break;

          if (movedNode.url) {
            if (findFolder(movedNode.parentId ?? '')) {
              upsertBookmark(buildBookmarkView(movedNode));
            }
          } else {
            upsertFolder(movedNode);
          }
          break;
        }
      }
    } catch {
      await reload({ silent: true });
    }
  }

  onMounted(() => {
    void reload();
    cleanup = onBookmarkEvent((event) => {
      void handleBookmarkEvent(event);
    });
  });

  onUnmounted(() => cleanup?.());

  return {
    rootId,
    folders,
    loading,
    error,
    searchEngine,
    totalBookmarks,
    tags,
    reload,
    setSearchEngine,
    toggleFolder,
    setAllFoldersCollapsed,
    upsertFolder,
    upsertBookmark,
    removeFolder,
    removeBookmark,
    moveBookmark,
    moveFolder
  };
}
