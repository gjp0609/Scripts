import type { BrowserBookmarkNode, ExportBookmarkNode, ExportUrlNode, UiPreferences } from '../types/bookmark';

const BUILTIN_ENGINE_IDS = new Set(['auto', 'builtin:bing', 'builtin:google']);
const BOOKMARK_ENGINE_PREFIX = 'bookmark:';

export function isExportUrlNode(node: ExportBookmarkNode): node is ExportUrlNode {
  return 'url' in node;
}

function hasSameKind(source: ExportBookmarkNode, target: BrowserBookmarkNode): boolean {
  return isExportUrlNode(source) === Boolean(target.url);
}

function hasSameContent(source: ExportBookmarkNode, target: BrowserBookmarkNode): boolean {
  if (!hasSameKind(source, target) || source.title !== target.title) return false;
  return isExportUrlNode(source) && target.url === source.url || !isExportUrlNode(source);
}

export function selectRestoreCandidate(
  source: ExportBookmarkNode,
  siblingCandidates: BrowserBookmarkNode[],
  nodesById: ReadonlyMap<string, BrowserBookmarkNode>,
  claimedIds: ReadonlySet<string>,
  sameOrigin: boolean
): BrowserBookmarkNode | undefined {
  if (sameOrigin) {
    const original = nodesById.get(source.sourceId);
    return original && !claimedIds.has(original.id) && hasSameKind(source, original) ? original : undefined;
  }

  return siblingCandidates.find((candidate) => !claimedIds.has(candidate.id) && hasSameContent(source, candidate));
}

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
