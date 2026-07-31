import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import Sortable from 'sortablejs';
import type { FolderView } from '../types/bookmark';
import { resolveFilteredMoveIndex, resolveFolderBrowserIndex, toBrowserMoveIndex } from './organizeMoveModel';

export type FolderMoveRequest = {
  folderId: string;
  sourceIndex: number;
  desiredPosition: number;
  apiIndex: number;
};

export type BookmarkMoveRequest = {
  bookmarkId: string;
  fromFolderId: string;
  toFolderId: string;
  sourceIndex: number;
  desiredIndex: number;
  apiIndex: number;
  expandTarget: boolean;
};

type OrganizeDragOptions = {
  enabled: Ref<boolean>;
  kind: Ref<'bookmark' | 'folder'>;
  folders: Ref<FolderView[]>;
  collapsedFolderIds: Ref<Set<string>>;
  getScrollContainer: () => HTMLElement | null | undefined;
  onFolderMove: (request: FolderMoveRequest) => Promise<void>;
  onBookmarkMove: (request: BookmarkMoveRequest) => Promise<void>;
};

function getVisibleOrder(container: HTMLElement, selector: string, attribute: string): string[] {
  return [...container.querySelectorAll<HTMLElement>(selector)]
    .map((element) => element.getAttribute(attribute) ?? '')
    .filter(Boolean);
}

export function useOrganizeDrag(options: OrganizeDragOptions) {
  const dropTargetFolderId = ref('');
  const folderLists = new Map<string, HTMLElement>();
  const instances = new Map<string, Sortable>();
  let board: HTMLElement | undefined;

  function destroy() {
    dropTargetFolderId.value = '';
    instances.forEach((instance) => instance.destroy());
    instances.clear();
  }

  function registerBoard(element: HTMLElement) {
    board = element;
    void nextTick(setup);
  }

  function registerFolderList(folderId: string, element: HTMLElement | null) {
    if (element) folderLists.set(folderId, element);
    else folderLists.delete(folderId);
    void nextTick(setup);
  }

  function setupFolderDrag() {
    if (!board) return;
    const instance = Sortable.create(board, {
      animation: 150,
      draggable: '.folder-section',
      handle: '.folder-drag-handle',
      ghostClass: 'folder-ghost',
      chosenClass: 'folder-chosen',
      dragClass: 'folder-dragging',
      fallbackClass: 'folder-drag-preview',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      scroll: true,
      scrollSensitivity: 60,
      scrollSpeed: 12,
      onEnd: (event) => {
        const folderId = event.item.getAttribute('data-folder-id');
        if (!folderId || !board) return;
        const source = options.folders.value.find((folder) => folder.id === folderId);
        if (!source) return;
        const visibleOrder = getVisibleOrder(board, '.folder-section', 'data-folder-id');
        const sourcePosition = options.folders.value.findIndex((folder) => folder.id === folderId);
        const desiredPosition = resolveFilteredMoveIndex(options.folders.value.map((folder) => folder.id), visibleOrder, folderId);
        if (desiredPosition === sourcePosition) return;
        const apiIndex = resolveFolderBrowserIndex(
          visibleOrder,
          folderId,
          new Map(options.folders.value.map((folder) => [folder.id, folder.index]))
        );
        void options.onFolderMove({ folderId, sourceIndex: source.index, desiredPosition, apiIndex });
      }
    });
    instances.set('folders', instance);
  }

  function setupBookmarkDrag() {
    options.folders.value.forEach((folder) => {
      const element = folderLists.get(folder.id);
      if (!element) return;
      const instance = Sortable.create(element, {
        group: 'bookmark-folders',
        animation: 150,
        handle: '.drag-handle',
        draggable: '.bookmark-row',
        ghostClass: 'bookmark-ghost',
        chosenClass: 'bookmark-chosen',
        dragClass: 'bookmark-dragging',
        fallbackClass: 'bookmark-drag-preview',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 3,
        scroll: options.getScrollContainer() ?? true,
        scrollSensitivity: 60,
        scrollSpeed: 12,
        emptyInsertThreshold: 32,
        onMove: (event) => {
          const folderId = event.to.getAttribute('data-folder-id') ?? '';
          dropTargetFolderId.value = options.collapsedFolderIds.value.has(folderId) ? folderId : '';
        },
        onUnchoose: () => { dropTargetFolderId.value = ''; },
        onEnd: (event) => {
          const bookmarkId = event.item.getAttribute('data-bookmark-id');
          const fromFolderId = event.from.getAttribute('data-folder-id');
          const toFolderId = event.to.getAttribute('data-folder-id');
          const expandTarget = Boolean(toFolderId) && options.collapsedFolderIds.value.has(toFolderId ?? '');
          dropTargetFolderId.value = '';
          if (!bookmarkId || !fromFolderId || !toFolderId) return;
          const source = options.folders.value.find((item) => item.id === fromFolderId)?.bookmarks.find((item) => item.id === bookmarkId);
          const targetFolder = options.folders.value.find((item) => item.id === toFolderId);
          if (!source || !targetFolder) return;
          const sourceIndex = source.index ?? 0;
          const visibleOrder = getVisibleOrder(event.to, '.bookmark-row', 'data-bookmark-id');
          const desiredIndex = resolveFilteredMoveIndex(targetFolder.bookmarks.map((item) => item.id), visibleOrder, bookmarkId);
          if (fromFolderId === toFolderId && desiredIndex === sourceIndex) return;
          void options.onBookmarkMove({
            bookmarkId,
            fromFolderId,
            toFolderId,
            sourceIndex,
            desiredIndex,
            apiIndex: toBrowserMoveIndex(desiredIndex, sourceIndex, fromFolderId === toFolderId),
            expandTarget
          });
        }
      });
      instances.set(folder.id, instance);
    });
  }

  function setup() {
    destroy();
    if (!options.enabled.value) return;
    if (options.kind.value === 'folder') setupFolderDrag();
    else setupBookmarkDrag();
  }

  watch(
    () => [
      options.enabled.value,
      options.kind.value,
      [...options.collapsedFolderIds.value].sort().join(','),
      options.folders.value.map((folder) => `${folder.id}:${folder.bookmarks.map((bookmark) => bookmark.id).join(',')}`).join('|')
    ],
    () => void nextTick(setup),
    { immediate: true }
  );

  onBeforeUnmount(destroy);

  return { dropTargetFolderId, registerBoard, registerFolderList, destroy };
}
