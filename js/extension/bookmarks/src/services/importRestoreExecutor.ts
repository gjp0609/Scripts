import type { BookmarkExtra, BrowserBookmarkNode, ExportBookmarkNode, ExportFolderNode } from '../types/bookmark';
import { createBookmark, moveNode, updateBookmark } from './bookmarkApi';
import { isExportUrlNode, selectRestoreCandidate } from './backupModel';

export type CreatedImportNode = {
    id: string;
    folder: boolean;
};

export type ChangedImportNode = {
    id: string;
    parentId?: string;
    index?: number;
    title: string;
    url?: string;
};

export type ImportJournal = {
    idMap: Map<string, string>;
    createdNodes: CreatedImportNode[];
    changedNodes: Map<string, ChangedImportNode>;
    extraChanges: Map<string, BookmarkExtra | undefined>;
    mappingChanges: Map<string, string>;
};

export function createImportJournal(): ImportJournal {
    return {
        idMap: new Map(),
        createdNodes: [],
        changedNodes: new Map(),
        extraChanges: new Map(),
        mappingChanges: new Map(),
    };
}

export function findBookmarkNodeById(nodes: BrowserBookmarkNode[], id: string): BrowserBookmarkNode | undefined {
    for (const node of nodes) {
        if (node.id === id) return node;
        const found = node.children?.length ? findBookmarkNodeById(node.children, id) : undefined;
        if (found) return found;
    }
    return undefined;
}

function indexNodes(
    nodes: BrowserBookmarkNode[],
    result = new Map<string, BrowserBookmarkNode>(),
): Map<string, BrowserBookmarkNode> {
    nodes.forEach((node) => {
        result.set(node.id, node);
        if (node.children) indexNodes(node.children, result);
    });
    return result;
}

function detachNode(nodes: BrowserBookmarkNode[], id: string): BrowserBookmarkNode | undefined {
    const index = nodes.findIndex((node) => node.id === id);
    if (index >= 0) return nodes.splice(index, 1)[0];
    for (const node of nodes) {
        const found = node.children ? detachNode(node.children, id) : undefined;
        if (found) return found;
    }
    return undefined;
}

export async function executeImportRestore(options: {
    tree: BrowserBookmarkNode[];
    root: BrowserBookmarkNode;
    sources: ExportBookmarkNode[];
    sameOrigin: boolean;
    originalNodeMappings: ReadonlyMap<string, string>;
    journal: ImportJournal;
}): Promise<void> {
    const nodesById = indexNodes(options.tree);
    const claimedTargetIds = new Set<string>();

    async function restoreChildren(
        targetParentId: string,
        sources: ExportBookmarkNode[],
        targetChildren: BrowserBookmarkNode[],
    ): Promise<void> {
        for (const [targetIndex, source] of sources.entries()) {
            let target = selectRestoreCandidate(
                source,
                targetChildren,
                nodesById,
                claimedTargetIds,
                options.sameOrigin,
                options.originalNodeMappings.get(source.sourceId),
            );

            if (!target) {
                target = await createBookmark({
                    parentId: targetParentId,
                    index: targetIndex,
                    title: source.title,
                    url: isExportUrlNode(source) ? source.url : undefined,
                });
                target.children = isExportUrlNode(source) ? undefined : [];
                targetChildren.splice(targetIndex, 0, target);
                nodesById.set(target.id, target);
                options.journal.createdNodes.push({ id: target.id, folder: !isExportUrlNode(source) });
            } else {
                if (!options.journal.changedNodes.has(target.id)) {
                    options.journal.changedNodes.set(target.id, {
                        id: target.id,
                        parentId: target.parentId,
                        index: target.index,
                        title: target.title,
                        url: target.url,
                    });
                }

                const nextUrl = isExportUrlNode(source) ? source.url : undefined;
                if (target.title !== source.title || target.url !== nextUrl) {
                    await updateBookmark(target.id, { title: source.title, ...(nextUrl ? { url: nextUrl } : {}) });
                    target.title = source.title;
                    target.url = nextUrl;
                }

                const needsMove = target.parentId !== targetParentId || targetChildren[targetIndex]?.id !== target.id;
                if (needsMove) {
                    await moveNode(target.id, { parentId: targetParentId, index: targetIndex });
                    detachNode(options.tree, target.id);
                    targetChildren.splice(targetIndex, 0, target);
                }
                target.parentId = targetParentId;
                target.index = targetIndex;
            }

            claimedTargetIds.add(target.id);
            options.journal.idMap.set(source.sourceId, target.id);
            options.journal.mappingChanges.set(source.sourceId, target.id);

            if (isExportUrlNode(source)) {
                if (options.sameOrigin && source.sourceId !== target.id) {
                    options.journal.extraChanges.set(source.sourceId, undefined);
                }
                options.journal.extraChanges.set(
                    target.id,
                    source.extra ? { ...source.extra, bookmarkId: target.id } : undefined,
                );
                continue;
            }

            await restoreChildren(
                target.id,
                (source as ExportFolderNode).children,
                target.children ?? (target.children = []),
            );
        }
    }

    await restoreChildren(options.root.id, options.sources, options.root.children ?? (options.root.children = []));
}
