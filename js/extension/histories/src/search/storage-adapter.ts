import {
    getPageVisitStatsFromChunksByTimeRange,
    getLatestSearchSnapshot,
    getPageChunks,
    getVisitChunks,
    getActiveHistoryGeneration,
    putSearchSnapshot,
    listDirtyPages,
    clearDirtyPages,
} from '../storage/database';
import type { SearchStorage } from './search-engine';

export function createIndexedDbSearchStorage(): SearchStorage {
    return {
        getPageChunks,
        getVisitChunks,
        getPageVisitStatsFromTimeRange: getPageVisitStatsFromChunksByTimeRange,
        putSearchSnapshot,
        getLatestSearchSnapshot,
        listDirtyPages,
        clearDirtyPages,
        getSourceRevision: async () => {
            const generation = await getActiveHistoryGeneration();
            return `generation:${generation?.revision ?? 0}`;
        },
    };
}
