export const DATABASE_NAME = 'histories';
export const DATABASE_VERSION = 6;
export const HISTORY_DATA_FORMAT_VERSION = 1;
export const NATIVE_BACKUP_FORMAT_VERSION = 1;
export const SEARCH_SNAPSHOT_FORMAT_VERSION = 1;

export type PageRecord = {
    id: number;
    url: string;
    normalizedUrl: string;
    title: string;
    host: string;
    domain: string;
    visitCount: number;
    lastVisitTime: number;
    createdAt: number;
    updatedAt: number;
};

export type PageInput = {
    url: string;
    normalizedUrl?: string;
    title?: string;
    visitCount?: number;
    lastVisitTime?: number;
};

export type PageChunkRecord = {
    id: string;
    firstPageId: number;
    count: number;
    urls: string[];
    normalizedUrls: string[];
    titles: string[];
    visitCounts: Uint32Array;
    lastVisitTimes: Float64Array;
};

export type VisitRecord = {
    id: IDBValidKey;
    pageId: number;
    visitTime: number;
    transition: string;
};

export type VisitInput = Omit<VisitRecord, 'id'> & {
    id?: IDBValidKey;
};

export type VisitChunkRecord = {
    id: string;
    minVisitTime: number;
    maxVisitTime: number;
    count: number;
    pageIds: Uint32Array;
    visitTimes: Float64Array;
    transitionCodes: Uint8Array;
    sourceIndexes: Uint32Array;
    titles?: string[];
    sourceKeys?: string[];
    sourceIds?: string[];
    sourceRefOffsets?: Uint32Array;
    sourceRefs?: Uint32Array;
};

export type HistoryGenerationRecord = {
    id: string;
    status: 'staging' | 'active' | 'retired';
    reason: 'htu-import' | 'browser-sync' | 'native-restore' | 'compaction' | 'migration';
    parentGenerationId?: string;
    revision?: number;
    dataFormatVersion: number;
    sourceIds?: string[];
    importBatchId?: string;
    dirtyPages?: Array<{
        pageId: number;
        reason: DirtyPageRecord['reason'];
    }>;
    createdAt: number;
    committedAt?: number;
    pageCount: number;
    visitCount: number;
    pageSegmentCount: number;
    visitSegmentCount: number;
};

export type HistoryMetadataRecord = {
    key: 'activeGeneration' | 'localBrowserSource';
    value: string;
    updatedAt: number;
};

export type GenerationPageChunkRecord = PageChunkRecord & {
    generationId: string;
    ordinal: number;
    logicalId: string;
};

export type GenerationVisitChunkRecord = VisitChunkRecord & {
    generationId: string;
    ordinal: number;
    logicalId: string;
};

export type SearchSnapshotRecord = {
    key: 'latest';
    schemaVersion: number;
    sqliteVersion: string;
    createdAt: number;
    sourceRevision: string;
    bytes: Uint8Array;
    pageCount: number;
    snapshotSize: number;
    sha256?: string;
};

export type JobRecord = {
    id: string;
    type: 'history-sync' | 'htu-import' | 'htu-export' | 'search-rebuild' | 'stats-build';
    status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
    startedAt?: number;
    updatedAt: number;
    cursor?: unknown;
    progress?: unknown;
    error?: string;
    ownerId?: string;
    leaseUntil?: number;
    retryCount?: number;
    resumable?: boolean;
};

export type DirtyPageRecord = {
    pageId: number;
    revision: number;
    reason: 'new-page' | 'search-text-changed' | 'deleted-from-generation';
    updatedAt: number;
};

export type HistorySourceRecord = {
    id: string;
    kind: 'htu-file' | 'browser-history' | 'native-backup';
    label?: string;
    fingerprint?: string;
    browser?: 'chromium' | 'firefox' | 'unknown';
    createdAt: number;
    metadata?: Record<string, unknown>;
};

export type ImportBatchRecord = {
    id: string;
    status: 'staging' | 'complete' | 'failed' | 'cancelled';
    sourceIds: string[];
    createdAt: number;
    updatedAt: number;
    inputRows: number;
    addedVisits: number;
    duplicateVisits: number;
    ignoredVisits: number;
    errorCount: number;
    generationId?: string;
    files?: Array<{
        sourceId: string;
        name: string;
        sha256: string;
        format: string[];
        inputRows: number;
        addedVisits: number;
        duplicateVisits: number;
        ignoredVisits: number;
        errorCount: number;
        minVisitTime?: number;
        maxVisitTime?: number;
    }>;
};
