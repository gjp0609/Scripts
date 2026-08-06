import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { BookmarkView, BrowserBookmarkNode, FolderView } from '../types/bookmark';
import { getNode, onBookmarkEvent, type BookmarkEvent } from '../services/bookmarkApi';
import { buildBookmarkView, loadBookmarkWorkspace } from '../services/bookmarkRepository';
import { getPreferences, removeExtra, saveCollapsedFolderIds, saveSearchEngine } from '../services/extraStore';
import {
  findWorkspaceBookmark,
  moveWorkspaceBookmark,
  moveWorkspaceFolder,
  removeWorkspaceBookmark,
  removeWorkspaceFolder,
  upsertWorkspaceBookmark,
  upsertWorkspaceFolder
} from './bookmarkWorkspaceModel';

export function useBookmarkWorkspace() {
  const rootId = ref('');
  const rootChildIds = ref<string[]>([]);
  const folders = ref<FolderView[]>([]);
  const loading = ref(true);
  const error = ref('');
  const searchEngine = ref('auto');
  let cleanup: (() => void) | undefined;
  let reloadVersion = 0;
  let eventQueue = Promise.resolve();

  const allBookmarks = computed(() => folders.value.flatMap((folder) => folder.bookmarks));

  function findFolder(folderId: string) {
    return folders.value.find((folder) => folder.id === folderId);
  }

  function findBookmark(bookmarkId: string) {
    return findWorkspaceBookmark(folders.value, bookmarkId);
  }

  function isVisibleFolderNode(node: BrowserBookmarkNode): boolean {
    return !node.url && Boolean(rootId.value) && node.parentId === rootId.value;
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
    const version = ++reloadVersion;
    const silent = options?.silent ?? false;
    if (!silent) {
      loading.value = true;
    }
    error.value = '';
    try {
      const [workspace, preferences] = await Promise.all([loadBookmarkWorkspace(), getPreferences()]);
      if (version !== reloadVersion) return;
      rootId.value = workspace.rootId;
      rootChildIds.value = workspace.rootChildIds;
      folders.value = workspace.folders.map((folder) => ({
        ...folder,
        collapsed: preferences.collapsedFolderIds.includes(folder.id)
      }));
      searchEngine.value = preferences.searchEngine;
    } catch (err) {
      if (version !== reloadVersion) return;
      error.value = err instanceof Error ? err.message : '读取书签失败';
      folders.value = [];
    } finally {
      if (!silent && version === reloadVersion) {
        loading.value = false;
      }
    }
  }

  async function setSearchEngine(engine: string) {
    const previous = searchEngine.value;
    searchEngine.value = engine;
    try {
      await saveSearchEngine(engine);
    } catch (cause) {
      searchEngine.value = previous;
      error.value = cause instanceof Error ? cause.message : '保存搜索引擎失败';
    }
  }

  async function toggleFolder(folderId: string) {
    const folder = findFolder(folderId);
    if (!folder) return;
    const previous = folder.collapsed;
    folder.collapsed = !folder.collapsed;
    const collapsedFolderIds = folders.value.filter((item) => item.collapsed).map((item) => item.id);
    try {
      await saveCollapsedFolderIds(collapsedFolderIds);
    } catch (cause) {
      folder.collapsed = previous;
      error.value = cause instanceof Error ? cause.message : '保存目录状态失败';
    }
  }

  async function setAllFoldersCollapsed(collapsed: boolean) {
    const previous = folders.value.map((folder) => [folder.id, Boolean(folder.collapsed)] as const);
    folders.value.forEach((folder) => {
      folder.collapsed = collapsed;
    });
    try {
      await saveCollapsedFolderIds(collapsed ? folders.value.map((folder) => folder.id) : []);
    } catch (cause) {
      previous.forEach(([id, value]) => {
        const folder = findFolder(id);
        if (folder) folder.collapsed = value;
      });
      error.value = cause instanceof Error ? cause.message : '保存目录状态失败';
    }
  }

  function upsertFolder(node: BrowserBookmarkNode) {
    if (!isVisibleFolderNode(node)) return;
    upsertWorkspaceFolder(folders.value, node);
    if (!rootChildIds.value.includes(node.id)) rootChildIds.value.splice(node.index ?? rootChildIds.value.length, 0, node.id);
  }

  function removeFolder(folderId: string) {
    removeWorkspaceFolder(folders.value, folderId);
    rootChildIds.value = rootChildIds.value.filter((id) => id !== folderId);
  }

  function upsertBookmark(bookmark: BookmarkView) {
    upsertWorkspaceBookmark(folders.value, bookmark);
  }

  function removeBookmark(bookmarkId: string) {
    removeWorkspaceBookmark(folders.value, bookmarkId);
  }

  function moveBookmark(input: { bookmarkId: string; parentId: string; index: number }) {
    moveWorkspaceBookmark(folders.value, input);
  }

  function moveFolder(folderId: string, index: number) {
    moveWorkspaceFolder(folders.value, folderId, index);
  }

  async function handleBookmarkEvent(event: BookmarkEvent) {
    try {
      if (!rootId.value) return;

      switch (event.type) {
        case 'created': {
          if (event.node.parentId === rootId.value && !rootChildIds.value.includes(event.id)) {
            rootChildIds.value.splice(event.node.index ?? rootChildIds.value.length, 0, event.id);
          }
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
          if (event.removeInfo.parentId === rootId.value) {
            rootChildIds.value = rootChildIds.value.filter((id) => id !== event.id);
          }
          if (findBookmark(event.id)) {
            removeBookmark(event.id);
            await removeExtra(event.id).catch(() => undefined);
          } else {
            removeFolder(event.id);
          }
          break;
        }
        case 'moved': {
          if (event.moveInfo.oldParentId === rootId.value || event.moveInfo.parentId === rootId.value) {
            const nextRootOrder = rootChildIds.value.filter((id) => id !== event.id);
            if (event.moveInfo.parentId === rootId.value) {
              nextRootOrder.splice(event.moveInfo.index ?? nextRootOrder.length, 0, event.id);
            }
            rootChildIds.value = nextRootOrder;
          }
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
          } else if (movedNode.parentId === rootId.value) {
            await reload({ silent: true });
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
      eventQueue = eventQueue.then(() => handleBookmarkEvent(event)).catch(() => reload({ silent: true }));
    });
  });

  onUnmounted(() => cleanup?.());

  return {
    rootId,
    rootChildIds,
    folders,
    loading,
    error,
    searchEngine,
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
