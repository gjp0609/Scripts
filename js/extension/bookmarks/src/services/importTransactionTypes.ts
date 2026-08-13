import type { BookmarkExtra, BrowserBookmarkNode } from '../types/bookmark';

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

export type ImportStorageAttempts = {
    extras: boolean;
    mappings: boolean;
    preferences: boolean;
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
