import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import Sortable from 'sortablejs';
import type { FolderView } from '../types/bookmark';
import {
  projectVisibleOrder,
  resolveFilteredMoveIndex,
  resolveRootMoveIndex,
  shouldInsertAfterToOccupySlot,
  toBrowserMoveIndex
} from './organizeMoveModel';

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

export type BookmarkDropProjection = {
  folderId: string;
  anchorId?: string;
  insertAfter: boolean;
};

type OrganizeDragOptions = {
  enabled: Ref<boolean>;
  kind: Ref<'bookmark' | 'folder'>;
  folders: Ref<FolderView[]>;
  rootChildIds: Ref<string[]>;
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

function eventClientY(event: Event | undefined): number | undefined {
  if (event instanceof MouseEvent) return event.clientY;
  if (event instanceof TouchEvent) return event.touches[0]?.clientY;
  return undefined;
}

export function useOrganizeDrag(options: OrganizeDragOptions) {
  const isDragging = ref(false);
  const draggingItemId = ref('');
  const bookmarkProjection = ref<BookmarkDropProjection>();
  const folderProjectedOrder = ref<string[]>([]);
  const folderLists = new Map<string, HTMLElement>();
  const instances = new Map<string, Sortable>();
  let board: HTMLElement | undefined;
  let bookmarkPlan: BookmarkMoveRequest | undefined;
  let folderPlan: FolderMoveRequest | undefined;
  let cancelled = false;
  let pointerY: number | undefined;
  let draggedId = '';
  let sourceFolderId = '';
  let folderDragOrder: string[] = [];
  let scrollFrame = 0;

  function stopAutoScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    pointerY = undefined;
    window.removeEventListener('mousemove', trackPointer, true);
    window.removeEventListener('touchmove', trackPointer, true);
    window.removeEventListener('wheel', forwardWheel, true);
  }

  function autoScroll() {
    if (!isDragging.value) return;
    const viewport = options.getScrollContainer();
    if (viewport && pointerY != null) {
      const rect = viewport.getBoundingClientRect();
      const edge = Math.min(96, rect.height * 0.18);
      let delta = 0;
      if (pointerY < rect.top + edge) delta = -Math.ceil((rect.top + edge - pointerY) / 5);
      else if (pointerY > rect.bottom - edge) delta = Math.ceil((pointerY - (rect.bottom - edge)) / 5);
      if (delta) viewport.scrollTop += Math.max(-18, Math.min(18, delta));
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function trackPointer(event: MouseEvent | TouchEvent) {
    pointerY = eventClientY(event);
    updateProjection(event instanceof MouseEvent ? event.clientX : event.touches[0]?.clientX, pointerY);
  }

  function forwardWheel(event: WheelEvent) {
    const viewport = options.getScrollContainer();
    if (!viewport || !isDragging.value) return;
    event.preventDefault();
    viewport.scrollTop += event.deltaY;
  }

  function beginDrag(event: Sortable.SortableEvent) {
    cancelled = false;
    isDragging.value = true;
    draggingItemId.value = event.item.getAttribute(options.kind.value === 'folder' ? 'data-folder-id' : 'data-bookmark-id') ?? '';
    draggedId = draggingItemId.value;
    sourceFolderId = event.from.getAttribute('data-folder-id') ?? '';
    if (options.kind.value === 'folder' && board) {
      folderDragOrder = getVisibleOrder(board, '.folder-section', 'data-folder-id');
      folderProjectedOrder.value = [...folderDragOrder];
    }
    window.addEventListener('mousemove', trackPointer, true);
    window.addEventListener('touchmove', trackPointer, { capture: true, passive: true });
    window.addEventListener('wheel', forwardWheel, { capture: true, passive: false });
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function finishDrag() {
    isDragging.value = false;
    draggingItemId.value = '';
    draggedId = '';
    sourceFolderId = '';
    folderDragOrder = [];
    bookmarkProjection.value = undefined;
    folderProjectedOrder.value = [];
    bookmarkPlan = undefined;
    folderPlan = undefined;
    stopAutoScroll();
  }

  function destroyInstances() {
    instances.forEach((instance) => instance.destroy());
    instances.clear();
  }

  function destroy() {
    cancelled = true;
    destroyInstances();
    finishDrag();
  }

  function cancelDrag() {
    if (!isDragging.value) return false;
    cancelled = true;
    destroyInstances();
    finishDrag();
    void nextTick(setup);
    return true;
  }

  function registerBoard(element: HTMLElement) {
    board = element;
    if (!isDragging.value) void nextTick(setup);
  }

  function registerFolderList(folderId: string, element: HTMLElement | null) {
    if (element) folderLists.set(folderId, element);
    else folderLists.delete(folderId);
    if (!isDragging.value) void nextTick(setup);
  }

  function updateFolderProjection(clientX: number, clientY: number) {
    if (!board || !draggedId) return;
    const folders = [...board.querySelectorAll<HTMLElement>('.folder-section')];
    const related = folders.find((element) => {
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!related) return;
    const anchorId = related.getAttribute('data-folder-id') ?? undefined;
    if (!anchorId || anchorId === draggedId) return;
    const projectedOrder = projectVisibleOrder(
      folderDragOrder,
      draggedId,
      anchorId,
      shouldInsertAfterToOccupySlot(folderDragOrder, draggedId, anchorId)
    );
    if (projectedOrder.every((id, index) => folderProjectedOrder.value[index] === id)) return;
    folderProjectedOrder.value = projectedOrder;
    const source = options.folders.value.find((folder) => folder.id === draggedId);
    if (!source) return;
    folderPlan = {
      folderId: draggedId,
      sourceIndex: source.index,
      desiredPosition: resolveFilteredMoveIndex(options.folders.value.map((folder) => folder.id), projectedOrder, draggedId),
      apiIndex: resolveRootMoveIndex(options.rootChildIds.value, projectedOrder, draggedId)
    };
  }

  function updateBookmarkProjection(clientX: number, clientY: number) {
    if (!board || !draggedId || !sourceFolderId) return;
    const folderElements = [...board.querySelectorAll<HTMLElement>('.folder-section')];
    const folderElement = folderElements.find((element) => {
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    const toFolderId = folderElement?.getAttribute('data-folder-id') ?? '';
    if (!folderElement || !toFolderId) return;
    const list = folderLists.get(toFolderId);
    const rows = list ? [...list.querySelectorAll<HTMLElement>('.bookmark-row')].filter((row) => row.getAttribute('data-bookmark-id') !== draggedId) : [];
    const anchor = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY <= rect.bottom;
    });
    const anchorId = anchor?.getAttribute('data-bookmark-id') ?? undefined;
    const anchorRect = anchor?.getBoundingClientRect();
    const insertAfter = Boolean(anchorRect && clientY >= anchorRect.top + anchorRect.height / 2);
    const source = options.folders.value.find((item) => item.id === sourceFolderId)?.bookmarks.find((item) => item.id === draggedId);
    const targetFolder = options.folders.value.find((item) => item.id === toFolderId);
    if (!source || !targetFolder) return;
    const projectedOrder = projectVisibleOrder(rows.map((row) => row.getAttribute('data-bookmark-id') ?? '').filter(Boolean), draggedId, anchorId, insertAfter);
    const desiredIndex = resolveFilteredMoveIndex(targetFolder.bookmarks.map((item) => item.id), projectedOrder, draggedId);
    bookmarkProjection.value = { folderId: toFolderId, anchorId, insertAfter };
    bookmarkPlan = {
      bookmarkId: draggedId,
      fromFolderId: sourceFolderId,
      toFolderId,
      sourceIndex: source.index ?? 0,
      desiredIndex,
      apiIndex: toBrowserMoveIndex(desiredIndex, source.index ?? 0, sourceFolderId === toFolderId),
      expandTarget: options.collapsedFolderIds.value.has(toFolderId)
    };
  }

  function updateProjection(clientX?: number, clientY?: number) {
    if (clientX == null || clientY == null || !isDragging.value) return;
    if (options.kind.value === 'folder') updateFolderProjection(clientX, clientY);
    else updateBookmarkProjection(clientX, clientY);
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
      scroll: false,
      onStart: beginDrag,
      onMove: (event, originalEvent) => {
        pointerY = eventClientY(originalEvent);
        const clientX = originalEvent instanceof MouseEvent ? originalEvent.clientX : originalEvent instanceof TouchEvent ? originalEvent.touches[0]?.clientX : undefined;
        updateProjection(clientX, pointerY);
        return false;
      },
      onEnd: () => {
        const plan = folderPlan;
        const shouldApply = !cancelled && plan && options.folders.value.findIndex((folder) => folder.id === plan.folderId) !== plan.desiredPosition;
        finishDrag();
        void nextTick(setup);
        if (shouldApply && plan) void options.onFolderMove(plan);
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
        scroll: false,
        emptyInsertThreshold: 48,
        onStart: beginDrag,
      onMove: (event, originalEvent) => {
        pointerY = eventClientY(originalEvent);
          const clientX = originalEvent instanceof MouseEvent ? originalEvent.clientX : originalEvent instanceof TouchEvent ? originalEvent.touches[0]?.clientX : undefined;
          updateProjection(clientX, pointerY);
          return false;
        },
        onEnd: () => {
          const plan = bookmarkPlan;
          const shouldApply = !cancelled && plan && (plan.fromFolderId !== plan.toFolderId || plan.desiredIndex !== plan.sourceIndex);
          finishDrag();
          void nextTick(setup);
          if (shouldApply && plan) void options.onBookmarkMove(plan);
        }
      });
      instances.set(folder.id, instance);
    });
  }

  function setup() {
    destroyInstances();
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
    () => { if (!isDragging.value) void nextTick(setup); },
    { immediate: true }
  );

  onBeforeUnmount(destroy);

  return {
    isDragging,
    draggingItemId,
    bookmarkProjection,
    folderProjectedOrder,
    registerBoard,
    registerFolderList,
    cancelDrag,
    destroy
  };
}
