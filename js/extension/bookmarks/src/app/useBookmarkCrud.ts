import { ref } from 'vue';
import type { BookmarkView, FolderView } from '../types/bookmark';
import {
  deleteBookmarkDetails,
  deleteFolderDetails,
  saveBookmarkDetails,
  saveFolderDetails
} from '../services/bookmarkRepository';
import type { useBookmarkWorkspace } from './useBookmarkWorkspace';

type Workspace = ReturnType<typeof useBookmarkWorkspace>;

export function useBookmarkCrud(workspace: Workspace) {
  const bookmarkModalOpen = ref(false);
  const folderModalOpen = ref(false);
  const editingBookmark = ref<BookmarkView>();
  const editingFolder = ref<FolderView>();
  const bookmarkPendingDelete = ref<BookmarkView>();
  const folderPendingDelete = ref<FolderView>();
  const bookmarkError = ref('');
  const folderError = ref('');
  const bookmarkDeleteError = ref('');
  const folderDeleteError = ref('');

  function startAddBookmark() {
    bookmarkError.value = '';
    editingBookmark.value = undefined;
    bookmarkModalOpen.value = true;
  }

  function startEditBookmark(bookmark: BookmarkView) {
    bookmarkError.value = '';
    editingBookmark.value = bookmark;
    bookmarkModalOpen.value = true;
  }

  function closeBookmark() {
    bookmarkModalOpen.value = false;
    editingBookmark.value = undefined;
    bookmarkError.value = '';
  }

  function startAddFolder() {
    folderError.value = '';
    editingFolder.value = undefined;
    folderModalOpen.value = true;
  }

  function startEditFolder(folder: FolderView) {
    folderError.value = '';
    editingFolder.value = folder;
    folderModalOpen.value = true;
  }

  function closeFolder() {
    folderModalOpen.value = false;
    editingFolder.value = undefined;
    folderError.value = '';
  }

  function requestBookmarkDelete(bookmark: BookmarkView) {
    bookmarkDeleteError.value = '';
    bookmarkPendingDelete.value = bookmark;
  }

  function closeBookmarkDelete() {
    bookmarkPendingDelete.value = undefined;
    bookmarkDeleteError.value = '';
  }

  function requestFolderDelete(folder: FolderView) {
    folderDeleteError.value = '';
    folderPendingDelete.value = folder;
  }

  function closeFolderDelete() {
    folderPendingDelete.value = undefined;
    folderDeleteError.value = '';
  }

  async function saveBookmark(value: Parameters<typeof saveBookmarkDetails>[0]) {
    bookmarkError.value = '';
    try {
      workspace.upsertBookmark(await saveBookmarkDetails(value));
      closeBookmark();
    } catch (error) {
      bookmarkError.value = error instanceof Error ? error.message : '保存书签失败';
    }
  }

  async function saveFolder(value: { id?: string; title: string }) {
    if (!value.title || !workspace.rootId.value) return;
    folderError.value = '';
    try {
      workspace.upsertFolder(await saveFolderDetails({ id: value.id, parentId: workspace.rootId.value, title: value.title }));
      closeFolder();
    } catch (error) {
      folderError.value = error instanceof Error ? error.message : '保存目录失败';
    }
  }

  async function confirmDeleteBookmark() {
    const bookmark = bookmarkPendingDelete.value;
    if (!bookmark) return;
    bookmarkDeleteError.value = '';
    try {
      await deleteBookmarkDetails(bookmark.id);
      workspace.removeBookmark(bookmark.id);
      closeBookmarkDelete();
    } catch (error) {
      bookmarkDeleteError.value = error instanceof Error ? error.message : '删除书签失败';
    }
  }

  async function confirmDeleteFolder() {
    const folder = folderPendingDelete.value;
    if (!folder) return;
    folderDeleteError.value = '';
    try {
      await deleteFolderDetails(folder.id);
      workspace.removeFolder(folder.id);
      closeFolderDelete();
    } catch (error) {
      folderDeleteError.value = error instanceof Error ? error.message : '删除目录失败';
    }
  }

  return {
    bookmarkModalOpen,
    folderModalOpen,
    editingBookmark,
    editingFolder,
    bookmarkPendingDelete,
    folderPendingDelete,
    bookmarkError,
    folderError,
    bookmarkDeleteError,
    folderDeleteError,
    startAddBookmark,
    startEditBookmark,
    closeBookmark,
    startAddFolder,
    startEditFolder,
    closeFolder,
    requestBookmarkDelete,
    closeBookmarkDelete,
    requestFolderDelete,
    closeFolderDelete,
    saveBookmark,
    saveFolder,
    confirmDeleteBookmark,
    confirmDeleteFolder
  };
}
