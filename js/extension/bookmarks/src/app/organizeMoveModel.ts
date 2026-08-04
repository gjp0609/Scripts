export function resolveFilteredMoveIndex(fullOrder: string[], visibleOrder: string[], movedId: string): number {
  const orderWithoutMoved = fullOrder.filter((id) => id !== movedId);
  const visibleIndex = visibleOrder.indexOf(movedId);
  if (visibleIndex < 0) return orderWithoutMoved.length;

  const nextId = visibleOrder[visibleIndex + 1];
  if (nextId) {
    const index = orderWithoutMoved.indexOf(nextId);
    if (index >= 0) return index;
  }

  const previousId = visibleOrder[visibleIndex - 1];
  if (previousId) {
    const index = orderWithoutMoved.indexOf(previousId);
    if (index >= 0) return index + 1;
  }

  return orderWithoutMoved.length;
}

export function projectVisibleOrder(
  visibleOrder: string[],
  movedId: string,
  anchorId: string | undefined,
  insertAfter: boolean
): string[] {
  const order = visibleOrder.filter((id) => id !== movedId);
  if (!anchorId) return [...order, movedId];
  const anchorIndex = order.indexOf(anchorId);
  if (anchorIndex < 0) return [...order, movedId];
  order.splice(anchorIndex + (insertAfter ? 1 : 0), 0, movedId);
  return order;
}

export function toBrowserMoveIndex(desiredIndex: number, sourceIndex: number, sameParent: boolean): number {
  return sameParent && desiredIndex > sourceIndex ? desiredIndex + 1 : desiredIndex;
}

export function resolveFolderBrowserIndex(
  visibleOrder: string[],
  movedId: string,
  absoluteIndexes: ReadonlyMap<string, number>
): number {
  const visibleIndex = visibleOrder.indexOf(movedId);
  const nextId = visibleOrder[visibleIndex + 1];
  if (nextId) return absoluteIndexes.get(nextId) ?? 0;
  const previousId = visibleOrder[visibleIndex - 1];
  if (previousId) return (absoluteIndexes.get(previousId) ?? -1) + 1;
  return absoluteIndexes.get(movedId) ?? 0;
}

export function resolveRootMoveIndex(rootOrder: string[], projectedFolderOrder: string[], movedId: string): number {
  const rootWithoutMoved = rootOrder.filter((id) => id !== movedId);
  const sourceIndex = rootOrder.indexOf(movedId);
  const movedIndex = projectedFolderOrder.indexOf(movedId);
  if (movedIndex < 0) return rootWithoutMoved.length;

  let desiredIndex: number;
  const nextFolderId = projectedFolderOrder[movedIndex + 1];
  if (nextFolderId) {
    const nextIndex = rootWithoutMoved.indexOf(nextFolderId);
    if (nextIndex >= 0) desiredIndex = nextIndex;
    else desiredIndex = rootWithoutMoved.length;
  } else {
    const previousFolderId = projectedFolderOrder[movedIndex - 1];
    if (previousFolderId) {
      const previousIndex = rootWithoutMoved.indexOf(previousFolderId);
      desiredIndex = previousIndex >= 0 ? previousIndex + 1 : rootWithoutMoved.length;
    } else {
      desiredIndex = Math.min(movedIndex, rootWithoutMoved.length);
    }
  }
  return sourceIndex >= 0 && desiredIndex > sourceIndex ? desiredIndex + 1 : desiredIndex;
}
