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
