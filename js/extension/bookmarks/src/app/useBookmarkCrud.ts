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
  const bookmarkSaving = ref(false);
  const folderSaving = ref(false);
  const bookmarkDeleting = ref(false);
  const folderDeleting = ref(false);
  let bookmarkSession = 0;
  let folderSession = 0;
  let bookmarkDeleteSession = 0;
  let folderDeleteSession = 0;

  function startAddBookmark() {
    bookmarkSession += 1;
    bookmarkError.value = '';
    editingBookmark.value = undefined;
    bookmarkModalOpen.value = true;
  }

  function startEditBookmark(bookmark: BookmarkView) {
    bookmarkSession += 1;
    bookmarkError.value = '';
    editingBookmark.value = bookmark;
    bookmarkModalOpen.value = true;
  }

  function closeBookmark() {
    if (bookmarkSaving.value) return;
    bookmarkSession += 1;
    bookmarkModalOpen.value = false;
    editingBookmark.value = undefined;
    bookmarkError.value = '';
  }

  function startAddFolder() {
    folderSession += 1;
    folderError.value = '';
    editingFolder.value = undefined;
    folderModalOpen.value = true;
  }

  function startEditFolder(folder: FolderView) {
    folderSession += 1;
    folderError.value = '';
    editingFolder.value = folder;
    folderModalOpen.value = true;
  }

  function closeFolder() {
    if (folderSaving.value) return;
    folderSession += 1;
    folderModalOpen.value = false;
    editingFolder.value = undefined;
    folderError.value = '';
  }

  function requestBookmarkDelete(bookmark: BookmarkView) {
    bookmarkDeleteSession += 1;
    bookmarkDeleteError.value = '';
    bookmarkPendingDelete.value = bookmark;
  }

  function closeBookmarkDelete() {
    if (bookmarkDeleting.value) return;
    bookmarkDeleteSession += 1;
    bookmarkPendingDelete.value = undefined;
    bookmarkDeleteError.value = '';
  }

  function requestFolderDelete(folder: FolderView) {
    folderDeleteSession += 1;
    folderDeleteError.value = '';
    folderPendingDelete.value = folder;
  }

  function closeFolderDelete() {
    if (folderDeleting.value) return;
    folderDeleteSession += 1;
    folderPendingDelete.value = undefined;
    folderDeleteError.value = '';
  }

  async function saveBookmark(value: Parameters<typeof saveBookmarkDetails>[0]) {
    if (bookmarkSaving.value) return;
    const session = bookmarkSession;
    bookmarkSaving.value = true;
    bookmarkError.value = '';
    try {
      workspace.upsertBookmark(await saveBookmarkDetails(value));
      if (session === bookmarkSession) {
        bookmarkSaving.value = false;
        closeBookmark();
      }
    } catch (error) {
      if (session === bookmarkSession) bookmarkError.value = error instanceof Error ? error.message : '保存书签失败';
    } finally {
      if (session === bookmarkSession) bookmarkSaving.value = false;
    }
  }

  async function saveFolder(value: { id?: string; title: string }) {
    if (!value.title || !workspace.rootId.value || folderSaving.value) return;
    const session = folderSession;
    folderSaving.value = true;
    folderError.value = '';
    try {
      workspace.upsertFolder(await saveFolderDetails({ id: value.id, parentId: workspace.rootId.value, title: value.title }));
      if (session === folderSession) {
        folderSaving.value = false;
        closeFolder();
      }
    } catch (error) {
      if (session === folderSession) folderError.value = error instanceof Error ? error.message : '保存目录失败';
    } finally {
      if (session === folderSession) folderSaving.value = false;
    }
  }

  async function confirmDeleteBookmark() {
    const bookmark = bookmarkPendingDelete.value;
    if (!bookmark || bookmarkDeleting.value) return;
    const session = bookmarkDeleteSession;
    bookmarkDeleting.value = true;
    bookmarkDeleteError.value = '';
    try {
      await deleteBookmarkDetails(bookmark.id);
      workspace.removeBookmark(bookmark.id);
      if (session === bookmarkDeleteSession) {
        bookmarkDeleting.value = false;
        closeBookmarkDelete();
      }
    } catch (error) {
      if (session === bookmarkDeleteSession) bookmarkDeleteError.value = error instanceof Error ? error.message : '删除书签失败';
    } finally {
      if (session === bookmarkDeleteSession) bookmarkDeleting.value = false;
    }
  }

  async function confirmDeleteFolder() {
    const folder = folderPendingDelete.value;
    if (!folder || folderDeleting.value) return;
    const session = folderDeleteSession;
    folderDeleting.value = true;
    folderDeleteError.value = '';
    try {
      await deleteFolderDetails(folder.id);
      workspace.removeFolder(folder.id);
      if (session === folderDeleteSession) {
        folderDeleting.value = false;
        closeFolderDelete();
      }
    } catch (error) {
      if (session === folderDeleteSession) folderDeleteError.value = error instanceof Error ? error.message : '删除目录失败';
    } finally {
      if (session === folderDeleteSession) folderDeleting.value = false;
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
    bookmarkSaving,
    folderSaving,
    bookmarkDeleting,
    folderDeleting,
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
