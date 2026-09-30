import {
    getPageVisitStatsFromChunksByTimeRange,
    getLatestSearchSnapshot,
    getPageChunks,
    getVisitChunks,
    putSearchSnapshot,
} from '../storage/database';
import type { SearchStorage } from './search-engine';

export function createIndexedDbSearchStorage(): SearchStorage {
    return {
        getPageChunks,
        getVisitChunks,
        getPageVisitStatsFromTimeRange: getPageVisitStatsFromChunksByTimeRange,
        putSearchSnapshot,
        getLatestSearchSnapshot,
    };
}
