import type { BrowserBookmarkNode, ExportBookmarkNode, ExportFolderNode } from '../types/bookmark';
import { isExportUrlNode, selectRestoreCandidate } from './backupModel.ts';
import type { ImportJournal } from './importTransactionTypes.ts';

export type ImportRestoreApi = {
    createBookmark: (input: {
        parentId: string;
        index?: number;
        title: string;
        url?: string;
    }) => Promise<BrowserBookmarkNode>;
    moveNode: (id: string, input: { parentId?: string; index?: number }) => Promise<BrowserBookmarkNode>;
    updateBookmark: (id: string, input: { title?: string; url?: string }) => Promise<BrowserBookmarkNode>;
};

export type ImportRestoreOptions = {
    tree: BrowserBookmarkNode[];
    root: BrowserBookmarkNode;
    sources: ExportBookmarkNode[];
    sameOrigin: boolean;
    originalNodeMappings: ReadonlyMap<string, string>;
    journal: ImportJournal;
};

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

export async function executeImportRestore(options: ImportRestoreOptions, api: ImportRestoreApi): Promise<void> {
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
                target = await api.createBookmark({
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
                    await api.updateBookmark(target.id, {
                        title: source.title,
                        ...(nextUrl ? { url: nextUrl } : {}),
                    });
                    target.title = source.title;
                    target.url = nextUrl;
                }

                const needsMove = target.parentId !== targetParentId || targetChildren[targetIndex]?.id !== target.id;
                if (needsMove) {
                    await api.moveNode(target.id, { parentId: targetParentId, index: targetIndex });
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
