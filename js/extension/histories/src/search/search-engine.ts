export type SearchQuery = {
    keyword: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
};

export type SearchCursor = {
    matchedVisitTime: number;
    pageId: number;
    watermark: number;
};

export type SearchPageQuery = SearchQuery & {
    cursor?: SearchCursor;
};

export type SearchPage = {
    results: SearchResult[];
    nextCursor?: SearchCursor;
    watermark: number;
};

export type SearchResult = {
    pageId: number;
    url: string;
    title: string;
    visitCount: number;
    lastVisitTime: number;
    matchedVisitCount?: number;
    matchedVisitTime?: number;
};

export type SearchBuildProgress = {
    stage: 'reset' | 'pages' | 'snapshot' | 'done';
    pages: number;
    writtenPages: number;
};

export type SearchSnapshotInfo = {
    pageCount: number;
    snapshotSize: number;
    sqliteVersion: string;
};

export type SqliteSearchRuntime = {
    sqliteVersion: string;
    openMemoryDatabase: () => SqliteSearchDatabase;
    openSnapshotDatabase: (bytes: Uint8Array) => SqliteSearchDatabase;
    exportDatabase: (database: SqliteSearchDatabase) => Uint8Array;
};

export type SqliteSearchDatabase = {
    exec: (sql: string | string[]) => void;
    prepare: (sql: string) => SqliteSearchStatement;
    selectValue?: (sql: string) => unknown;
    close: () => void;
};

export type SqliteSearchStatement = {
    bind: (values: unknown[]) => SqliteSearchStatement;
    step: () => boolean;
    stepReset?: () => void;
    reset?: () => void;
    get: (target?: unknown[] | Record<string, unknown>) => unknown[];
    finalize: () => void;
};

export type SearchPageChunk = {
    id: string;
    firstPageId: number;
    count: number;
    urls: string[];
    normalizedUrls: string[];
    titles: string[];
    visitCounts: Uint32Array;
    lastVisitTimes: Float64Array;
};

export type SearchVisitChunk = {
    id: string;
    minVisitTime: number;
    maxVisitTime: number;
    count: number;
    pageIds: Uint32Array;
    visitTimes: Float64Array;
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
};

export type SearchStorage = {
    getPageChunks: () => Promise<SearchPageChunk[]>;
    getVisitChunks?: () => Promise<SearchVisitChunk[]>;
    getPageVisitStatsFromTimeRange: (
        query: SearchQuery,
        pageIds?: Iterable<number>,
    ) => Promise<Array<{ pageId: number; matchedVisitCount: number; matchedVisitTime: number }>>;
    putSearchSnapshot: (snapshot: SearchSnapshotRecord) => Promise<void>;
    getLatestSearchSnapshot: () => Promise<SearchSnapshotRecord | undefined>;
};

export type SearchEngineOptions = {
    storage: SearchStorage;
    runtime: SqliteSearchRuntime;
    now?: () => number;
    signal?: AbortSignal;
    onProgress?: (progress: SearchBuildProgress) => void | Promise<void>;
};

const SEARCH_SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 50;

export class SearchEngine {
    private database: SqliteSearchDatabase | undefined;
    private readonly storage: SearchStorage;
    private readonly runtime: SqliteSearchRuntime;
    private readonly now: () => number;
    private readonly signal?: AbortSignal;
    private readonly onProgress?: (progress: SearchBuildProgress) => void | Promise<void>;
    private visitChunksPromise?: Promise<SearchVisitChunk[]>;
    private readonly keywordCandidates = new Map<string, { bitmap: Uint8Array; count: number }>();
    private loadedPageCount = 0;

    constructor(options: SearchEngineOptions) {
        this.storage = options.storage;
        this.runtime = options.runtime;
        this.now = options.now ?? Date.now;
        this.signal = options.signal;
        this.onProgress = options.onProgress;
    }

    async rebuildSnapshot(): Promise<SearchSnapshotInfo> {
        throwIfAborted(this.signal);
        this.createFreshDatabase(this.runtime.openMemoryDatabase());
        await this.emitProgress({ stage: 'reset', pages: 0, writtenPages: 0 });

        const pageChunks = await this.storage.getPageChunks();
        throwIfAborted(this.signal);
        const pageCount = pageChunks.reduce((total, chunk) => total + chunk.count, 0);
        this.loadedPageCount = pageCount;
        const statement = this.requireDatabase().prepare(
            'INSERT INTO pages_fts(rowid, search_text, url, title, visit_count, last_visit_time) VALUES(?, ?, ?, ?, ?, ?)',
        );
        let writtenPages = 0;
        let transactionOpen = false;

        try {
            this.requireDatabase().exec('BEGIN');
            transactionOpen = true;
            for (const chunk of pageChunks) {
                throwIfAborted(this.signal);
                for (let index = 0; index < chunk.count; index += 1) {
                    throwIfAborted(this.signal);
                    const pageId = chunk.firstPageId + index;
                    const url = chunk.urls[index] ?? '';
                    const title = chunk.titles[index] ?? '';
                    executeInsert(
                        statement.bind([
                            pageId,
                            normalizeSearchText(url, title),
                            url,
                            title,
                            chunk.visitCounts[index] ?? 0,
                            chunk.lastVisitTimes[index] ?? 0,
                        ]),
                    );
                    writtenPages += 1;
                }

                await this.emitProgress({ stage: 'pages', pages: pageCount, writtenPages });
            }
            this.requireDatabase().exec('COMMIT');
            transactionOpen = false;
        } catch (error) {
            if (transactionOpen) this.requireDatabase().exec('ROLLBACK');
            throw error;
        } finally {
            statement.finalize();
        }

        throwIfAborted(this.signal);
        const bytes = this.runtime.exportDatabase(this.requireDatabase());
        await this.emitProgress({ stage: 'snapshot', pages: pageCount, writtenPages });
        throwIfAborted(this.signal);
        await this.storage.putSearchSnapshot({
            key: 'latest',
            schemaVersion: SEARCH_SCHEMA_VERSION,
            sqliteVersion: this.runtime.sqliteVersion,
            createdAt: this.now(),
            sourceRevision: makeSourceRevision(pageChunks),
            bytes,
            pageCount,
            snapshotSize: bytes.byteLength,
        });
        await this.preloadVisitChunks();
        await this.emitProgress({ stage: 'done', pages: pageCount, writtenPages });

        return {
            pageCount,
            snapshotSize: bytes.byteLength,
            sqliteVersion: this.runtime.sqliteVersion,
        };
    }

    async loadSnapshot(): Promise<void> {
        const snapshot = await this.storage.getLatestSearchSnapshot();
        if (!snapshot?.bytes?.byteLength) {
            throw new Error('No latest search snapshot is available.');
        }
        if (snapshot.schemaVersion !== SEARCH_SCHEMA_VERSION) {
            throw new Error(
                `Unsupported search snapshot schema: ${snapshot.schemaVersion}; expected ${SEARCH_SCHEMA_VERSION}.`,
            );
        }
        if (snapshot.snapshotSize !== snapshot.bytes.byteLength) {
            throw new Error(
                `Search snapshot size mismatch: metadata=${snapshot.snapshotSize}, bytes=${snapshot.bytes.byteLength}.`,
            );
        }

        const database = this.runtime.openSnapshotDatabase(snapshot.bytes);
        try {
            const pageCount = selectPageCount(database);
            if (pageCount !== snapshot.pageCount) {
                throw new Error(
                    `Search snapshot page count mismatch: metadata=${snapshot.pageCount}, database=${pageCount}.`,
                );
            }
            this.loadedPageCount = snapshot.pageCount;
            this.setDatabase(database);
            await this.preloadVisitChunks();
        } catch (error) {
            database.close();
            throw error;
        }
    }

    async search(query: SearchQuery): Promise<SearchResult[]> {
        const keyword = normalizeKeyword(query.keyword);
        if (!keyword) return [];

        const limit = normalizeLimit(query.limit);
        if (!hasVisitTimeFilter(query)) {
            return await this.searchPagesByKeyword(keyword, limit);
        }

        const candidates = await this.searchPagesByKeyword(keyword);
        if (candidates.length === 0) return [];

        const pageVisitStats = await this.storage.getPageVisitStatsFromTimeRange(
            query,
            candidates.map((row) => row.pageId),
        );
        if (pageVisitStats.length === 0) return [];

        const statsByPageId = new Map(pageVisitStats.map((item) => [item.pageId, item]));
        return candidates
            .filter((row) => statsByPageId.has(row.pageId))
            .map((row) => {
                const stats = statsByPageId.get(row.pageId);
                return {
                    ...row,
                    matchedVisitCount: stats?.matchedVisitCount,
                    matchedVisitTime: stats?.matchedVisitTime,
                };
            })
            .sort(compareTimeFilteredResults)
            .slice(0, limit);
    }

    async searchPage(query: SearchPageQuery): Promise<SearchPage> {
        const keyword = normalizeKeyword(query.keyword);
        const limit = normalizeLimit(query.limit);
        const watermark = query.cursor?.watermark ?? query.endTime ?? this.now();
        if (query.cursor && query.endTime !== undefined && query.endTime !== query.cursor.watermark) {
            throw new Error('Search cursor watermark does not match the requested end time.');
        }

        if (this.storage.getVisitChunks) {
            return await this.searchPageFromVisitIndex(query, keyword, limit, watermark);
        }

        const rangeQuery = {
            ...query,
            endTime: watermark,
        };
        const candidates = keyword
            ? await this.searchPagesByKeyword(keyword)
            : pageResultsFromChunks(await this.storage.getPageChunks());
        if (candidates.length === 0) return { results: [], watermark };

        const pageVisitStats = await this.storage.getPageVisitStatsFromTimeRange(
            rangeQuery,
            keyword ? candidates.map((row) => row.pageId) : undefined,
        );
        const statsByPageId = new Map(pageVisitStats.map((item) => [item.pageId, item]));
        const ordered = candidates
            .filter((row) => statsByPageId.has(row.pageId))
            .map((row) => {
                const stats = statsByPageId.get(row.pageId);
                return {
                    ...row,
                    matchedVisitCount: stats?.matchedVisitCount,
                    matchedVisitTime: stats?.matchedVisitTime,
                };
            })
            .sort(compareStableTimeResults)
            .filter((row) => isAfterCursor(row, query.cursor));

        const results = ordered.slice(0, limit);
        const last = results.at(-1);
        return {
            results,
            watermark,
            nextCursor:
                last && ordered.length > results.length
                    ? {
                          matchedVisitTime: last.matchedVisitTime ?? 0,
                          pageId: last.pageId,
                          watermark,
                      }
                    : undefined,
        };
    }

    private async searchPageFromVisitIndex(
        query: SearchPageQuery,
        keyword: string,
        limit: number,
        watermark: number,
    ): Promise<SearchPage> {
        const chunks = await this.preloadVisitChunks();
        const candidateIds = keyword ? this.getKeywordCandidates(keyword) : undefined;
        if (candidateIds?.count === 0) return { results: [], watermark };
        const selected = selectPageIdsFromVisits(chunks, {
            startTime: query.startTime ?? 0,
            endTime: watermark,
            cursor: query.cursor,
            candidateIds: candidateIds?.bitmap,
            limit,
        });
        if (selected.pageIds.length === 0) return { results: [], watermark };

        const counts = countSelectedVisits(chunks, new Set(selected.pageIds), query.startTime ?? 0, watermark);
        const metadata = this.searchPagesByIds(selected.pageIds);
        const metadataById = new Map(metadata.map((row) => [row.pageId, row]));
        const results = selected.pageIds.map((pageId) => {
            const row = metadataById.get(pageId);
            if (!row) throw new Error(`Search metadata is missing for page ${pageId}.`);
            return {
                ...row,
                matchedVisitCount: counts.get(pageId) ?? 0,
                matchedVisitTime: selected.matchedTimes.get(pageId) ?? 0,
            };
        });
        const last = results.at(-1);
        return {
            results,
            watermark,
            nextCursor:
                last && selected.hasNext
                    ? {
                          matchedVisitTime: last.matchedVisitTime ?? 0,
                          pageId: last.pageId,
                          watermark,
                      }
                    : undefined,
        };
    }

    close(): void {
        this.database?.close();
        this.database = undefined;
    }

    private createFreshDatabase(database: SqliteSearchDatabase): void {
        this.setDatabase(database);
        database.exec([
            'PRAGMA temp_store = MEMORY;',
            'PRAGMA journal_mode = OFF;',
            'PRAGMA synchronous = OFF;',
            "CREATE VIRTUAL TABLE pages_fts USING fts5(search_text, url UNINDEXED, title UNINDEXED, visit_count UNINDEXED, last_visit_time UNINDEXED, tokenize='trigram');",
        ]);
    }

    private setDatabase(database: SqliteSearchDatabase): void {
        this.close();
        this.database = database;
    }

    private requireDatabase(): SqliteSearchDatabase {
        if (!this.database) {
            throw new Error('Search snapshot is not loaded. Call loadSnapshot() or rebuildSnapshot() first.');
        }

        return this.database;
    }

    private async emitProgress(progress: SearchBuildProgress): Promise<void> {
        throwIfAborted(this.signal);
        await this.onProgress?.(progress);
    }

    private async searchPagesByKeyword(keyword: string, limit?: number): Promise<SearchResult[]> {
        const database = this.requireDatabase();
        const statement = database.prepare(`
      SELECT rowid, url, title, visit_count, last_visit_time
      FROM pages_fts
      WHERE pages_fts MATCH ?
      ORDER BY CAST(visit_count AS INTEGER) DESC, CAST(last_visit_time AS REAL) DESC
      ${limit === undefined ? '' : 'LIMIT ?'}
    `);
        const rows: SearchResult[] = [];

        try {
            const binds = limit === undefined ? [makeFtsMatchQuery(keyword)] : [makeFtsMatchQuery(keyword), limit];
            statement.bind(binds);
            while (statement.step()) {
                rows.push(searchResultFromRow(statement.get([])));
            }
        } finally {
            statement.finalize();
        }

        return rows;
    }

    private getKeywordCandidates(keyword: string): { bitmap: Uint8Array; count: number } {
        const cached = this.keywordCandidates.get(keyword);
        if (cached) return cached;
        const bitmap = new Uint8Array(this.loadedPageCount + 1);
        const statement = this.requireDatabase().prepare('SELECT rowid FROM pages_fts WHERE pages_fts MATCH ?');
        let count = 0;
        try {
            statement.bind([makeFtsMatchQuery(keyword)]);
            while (statement.step()) {
                const pageId = Number(statement.get([])[0]);
                if (pageId >= bitmap.length || bitmap[pageId] === 1) continue;
                bitmap[pageId] = 1;
                count += 1;
            }
        } finally {
            statement.finalize();
        }
        const result = { bitmap, count };
        this.keywordCandidates.set(keyword, result);
        return result;
    }

    private searchPagesByIds(pageIds: number[]): SearchResult[] {
        if (pageIds.length === 0) return [];
        const placeholders = pageIds.map(() => '?').join(',');
        const statement = this.requireDatabase().prepare(`
      SELECT rowid, url, title, visit_count, last_visit_time
      FROM pages_fts
      WHERE rowid IN (${placeholders})
    `);
        const results: SearchResult[] = [];
        try {
            statement.bind(pageIds);
            while (statement.step()) results.push(searchResultFromRow(statement.get([])));
        } finally {
            statement.finalize();
        }
        return results;
    }

    private async preloadVisitChunks(): Promise<SearchVisitChunk[]> {
        if (!this.storage.getVisitChunks) return [];
        this.visitChunksPromise ??= this.storage
            .getVisitChunks()
            .then((chunks) => chunks.sort((left, right) => left.minVisitTime - right.minVisitTime));
        return await this.visitChunksPromise;
    }
}

export function normalizeSearchText(url: string, title = ''): string {
    return `${url} ${safeDecodeUrl(url)} ${title}`.toLowerCase().normalize('NFKC');
}

export function normalizeKeyword(keyword: string): string {
    return String(keyword ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKC');
}

export function makeFtsMatchQuery(keyword: string): string {
    return `"${keyword.replace(/"/g, '""')}"`;
}

function normalizeLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit) || (limit as number) < 1) return DEFAULT_LIMIT;
    return Math.floor(limit as number);
}

function searchResultFromRow(row: unknown[]): SearchResult {
    return {
        pageId: Number(row[0]),
        url: String(row[1] ?? ''),
        title: String(row[2] ?? ''),
        visitCount: Number(row[3] ?? 0),
        lastVisitTime: Number(row[4] ?? 0),
    };
}

function executeInsert(statement: SqliteSearchStatement): void {
    if (statement.stepReset) {
        statement.stepReset();
        return;
    }

    statement.step();
    statement.reset?.();
}

function selectPageCount(database: SqliteSearchDatabase): number {
    const statement = database.prepare('SELECT COUNT(*) FROM pages_fts');
    try {
        return statement.step() ? Number(statement.get([])[0] ?? 0) : 0;
    } finally {
        statement.finalize();
    }
}

function makeSourceRevision(chunks: SearchPageChunk[]): string {
    const pages = chunks.reduce((total, chunk) => total + chunk.count, 0);
    const lastVisitTime = chunks.reduce((max, chunk) => {
        const chunkMax = chunk.lastVisitTimes.length ? Math.max(...chunk.lastVisitTimes) : 0;
        return Math.max(max, chunkMax);
    }, 0);

    return `page-chunks:${chunks.length}:pages:${pages}:last:${lastVisitTime}`;
}

function safeDecodeUrl(url: string): string {
    try {
        return decodeURIComponent(url);
    } catch {
        return url;
    }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
    }
}

function hasVisitTimeFilter(query: SearchQuery): boolean {
    return Number.isFinite(query.startTime) || Number.isFinite(query.endTime);
}

function compareTimeFilteredResults(left: SearchResult, right: SearchResult): number {
    return (
        (right.matchedVisitTime ?? 0) - (left.matchedVisitTime ?? 0) ||
        (right.matchedVisitCount ?? 0) - (left.matchedVisitCount ?? 0) ||
        right.visitCount - left.visitCount ||
        right.lastVisitTime - left.lastVisitTime ||
        left.pageId - right.pageId
    );
}

function compareStableTimeResults(left: SearchResult, right: SearchResult): number {
    return (right.matchedVisitTime ?? 0) - (left.matchedVisitTime ?? 0) || right.pageId - left.pageId;
}

function isAfterCursor(row: SearchResult, cursor: SearchCursor | undefined): boolean {
    if (!cursor) return true;
    const matchedVisitTime = row.matchedVisitTime ?? 0;
    return (
        matchedVisitTime < cursor.matchedVisitTime ||
        (matchedVisitTime === cursor.matchedVisitTime && row.pageId < cursor.pageId)
    );
}

function pageResultsFromChunks(chunks: SearchPageChunk[]): SearchResult[] {
    const results: SearchResult[] = [];
    for (const chunk of chunks) {
        for (let index = 0; index < chunk.count; index += 1) {
            results.push({
                pageId: chunk.firstPageId + index,
                url: chunk.urls[index] ?? '',
                title: chunk.titles[index] ?? '',
                visitCount: chunk.visitCounts[index] ?? 0,
                lastVisitTime: chunk.lastVisitTimes[index] ?? 0,
            });
        }
    }
    return results;
}

function selectPageIdsFromVisits(
    chunks: SearchVisitChunk[],
    options: {
        startTime: number;
        endTime: number;
        cursor?: SearchCursor;
        candidateIds?: Uint8Array;
        limit: number;
    },
) {
    const seen = new Set<number>();
    const pageIds: number[] = [];
    const matchedTimes = new Map<number, number>();
    let boundaryTime: number | undefined;

    outer: for (let chunkIndex = chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
        const chunk = chunks[chunkIndex];
        if (chunk.minVisitTime > options.endTime || chunk.maxVisitTime < options.startTime) continue;
        for (let index = chunk.count - 1; index >= 0; index -= 1) {
            const visitTime = chunk.visitTimes[index];
            if (visitTime > options.endTime) continue;
            if (visitTime < options.startTime) break;
            if (boundaryTime !== undefined && visitTime < boundaryTime) break outer;
            const pageId = chunk.pageIds[index];
            if (options.candidateIds && options.candidateIds[pageId] !== 1) continue;
            if (seen.has(pageId)) continue;
            seen.add(pageId);
            if (!isTupleAfterCursor(visitTime, pageId, options.cursor)) continue;
            pageIds.push(pageId);
            matchedTimes.set(pageId, visitTime);
            if (pageIds.length === options.limit + 1) boundaryTime = visitTime;
        }
    }
    pageIds.sort((left, right) => (matchedTimes.get(right) ?? 0) - (matchedTimes.get(left) ?? 0) || right - left);
    const hasNext = pageIds.length > options.limit;
    return { pageIds: pageIds.slice(0, options.limit), matchedTimes, hasNext };
}

function countSelectedVisits(
    chunks: SearchVisitChunk[],
    selected: Set<number>,
    startTime: number,
    endTime: number,
): Map<number, number> {
    const counts = new Map<number, number>();
    for (const chunk of chunks) {
        if (chunk.minVisitTime > endTime || chunk.maxVisitTime < startTime) continue;
        for (let index = 0; index < chunk.count; index += 1) {
            const visitTime = chunk.visitTimes[index];
            if (visitTime < startTime) continue;
            if (visitTime > endTime) break;
            const pageId = chunk.pageIds[index];
            if (selected.has(pageId)) counts.set(pageId, (counts.get(pageId) ?? 0) + 1);
        }
    }
    return counts;
}

function isTupleAfterCursor(matchedVisitTime: number, pageId: number, cursor: SearchCursor | undefined): boolean {
    if (!cursor) return true;
    return (
        matchedVisitTime < cursor.matchedVisitTime ||
        (matchedVisitTime === cursor.matchedVisitTime && pageId < cursor.pageId)
    );
}
