import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { FolderView, SearchEngineId } from '../types/bookmark';
import { onAnyBookmarkChanged } from '../services/bookmarkApi';
import { loadBookmarkWorkspace } from '../services/bookmarkRepository';
import { getPreferences, savePreferences } from '../services/extraStore';

export function useBookmarkWorkspace() {
  const rootId = ref('');
  const folders = ref<FolderView[]>([]);
  const loading = ref(true);
  const error = ref('');
  const searchEngine = ref<SearchEngineId>('google');
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

  async function reload() {
    loading.value = true;
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
      loading.value = false;
    }
  }

  async function setSearchEngine(engine: SearchEngineId) {
    searchEngine.value = engine;
    const preferences = await getPreferences();
    await savePreferences({ ...preferences, searchEngine: engine });
  }

  async function toggleFolder(folderId: string) {
    folders.value = folders.value.map((folder) => (folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder));
    const preferences = await getPreferences();
    const collapsedFolderIds = folders.value.filter((folder) => folder.collapsed).map((folder) => folder.id);
    await savePreferences({ ...preferences, collapsedFolderIds });
  }

  onMounted(() => {
    void reload();
    cleanup = onAnyBookmarkChanged(() => void reload());
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
    toggleFolder
  };
}
