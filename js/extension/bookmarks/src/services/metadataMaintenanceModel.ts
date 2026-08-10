import type { BookmarkExtra, BrowserBookmarkNode, UiPreferences } from '../types/bookmark';
import type { BackupNodeMappingEntry } from './extraStore';
import { normalizeBookmarkExtra } from './bookmarkExtraModel.ts';

const BUILTIN_ENGINE_IDS = new Set(['auto', 'builtin:bing', 'builtin:google']);

export type MetadataRepairReport = {
    extrasScanned: number;
    extrasRepaired: number;
    extrasRemoved: number;
    mappingsScanned: number;
    mappingsRemoved: number;
    preferencesRepaired: boolean;
};

export type MetadataRepairPlan = {
    extraPatch: Map<string, BookmarkExtra | undefined>;
    staleMappings: BackupNodeMappingEntry[];
    repairedPreferences: UiPreferences;
    report: MetadataRepairReport;
};

function collectNodes(nodes: BrowserBookmarkNode[], result = new Map<string, BrowserBookmarkNode>()) {
    for (const node of nodes) {
        result.set(node.id, node);
        if (node.children) collectNodes(node.children, result);
    }
    return result;
}

function repairPreferences(preferences: UiPreferences, nodes: Map<string, BrowserBookmarkNode>): UiPreferences {
    const collapsedFolderIds = [...new Set(preferences.collapsedFolderIds)].filter((id) => {
        const node = nodes.get(id);
        return Boolean(node && !node.url && node.children);
    });
    let searchEngine = preferences.searchEngine;
    if (!BUILTIN_ENGINE_IDS.has(searchEngine)) {
        const bookmarkId = searchEngine.startsWith('bookmark:') ? searchEngine.slice('bookmark:'.length) : searchEngine;
        if (!nodes.get(bookmarkId)?.url) searchEngine = 'auto';
    }
    return { collapsedFolderIds, searchEngine };
}

export function buildMetadataRepairPlan(input: {
    tree: BrowserBookmarkNode[];
    extras: Record<string, BookmarkExtra>;
    preferences: UiPreferences;
    mappings: BackupNodeMappingEntry[];
}): MetadataRepairPlan {
    const nodes = collectNodes(input.tree);
    const extraPatch = new Map<string, BookmarkExtra | undefined>();
    let extrasRepaired = 0;
    let extrasRemoved = 0;

    for (const [bookmarkId, extra] of Object.entries(input.extras)) {
        if (!nodes.get(bookmarkId)?.url) {
            extraPatch.set(bookmarkId, undefined);
            extrasRemoved += 1;
            continue;
        }
        const normalized = normalizeBookmarkExtra(extra, bookmarkId) ?? extra;
        if (JSON.stringify(normalized) !== JSON.stringify(extra)) {
            extraPatch.set(bookmarkId, normalized);
            extrasRepaired += 1;
        }
    }

    const staleMappings = input.mappings.filter((mapping) => !nodes.has(mapping.targetId));
    const repairedPreferences = repairPreferences(input.preferences, nodes);
    const preferencesRepaired = JSON.stringify(repairedPreferences) !== JSON.stringify(input.preferences);

    return {
        extraPatch,
        staleMappings,
        repairedPreferences,
        report: {
            extrasScanned: Object.keys(input.extras).length,
            extrasRepaired,
            extrasRemoved,
            mappingsScanned: input.mappings.length,
            mappingsRemoved: staleMappings.length,
            preferencesRepaired,
        },
    };
}
