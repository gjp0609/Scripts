import type { UiPreferences } from '../types/bookmark';

const BUILTIN_ENGINE_IDS = new Set(['auto', 'builtin:bing', 'builtin:google']);
const BOOKMARK_ENGINE_PREFIX = 'bookmark:';

// Chrome assigns new node IDs during restore; persisted node references must follow the import map.
export function remapImportedPreferences(
  source: UiPreferences,
  idMap: ReadonlyMap<string, string>,
  current: UiPreferences
): UiPreferences {
  const collapsedFolderIds = source.collapsedFolderIds
    .map((sourceId) => idMap.get(sourceId))
    .filter((id): id is string => Boolean(id));

  if (BUILTIN_ENGINE_IDS.has(source.searchEngine)) {
    return { collapsedFolderIds, searchEngine: source.searchEngine };
  }

  const sourceBookmarkId = source.searchEngine.startsWith(BOOKMARK_ENGINE_PREFIX)
    ? source.searchEngine.slice(BOOKMARK_ENGINE_PREFIX.length)
    : source.searchEngine;
  const targetBookmarkId = idMap.get(sourceBookmarkId);

  return {
    collapsedFolderIds,
    searchEngine: targetBookmarkId ? `${BOOKMARK_ENGINE_PREFIX}${targetBookmarkId}` : current.searchEngine
  };
}
