import {
    DATABASE_NAME,
    DATABASE_VERSION,
    HISTORY_DATA_FORMAT_VERSION,
    type GenerationPageChunkRecord,
    type GenerationVisitChunkRecord,
    type DirtyPageRecord,
    type HistoryGenerationRecord,
    type HistoryMetadataRecord,
    type HistorySourceRecord,
    type ImportBatchRecord,
    type JobRecord,
    type PageChunkRecord,
    type PageInput,
    type PageRecord,
    type SearchSnapshotRecord,
    type VisitChunkRecord,
    type VisitInput,
    type VisitRecord,
} from './schema';

export type HistoriesDatabase = IDBDatabase;

const MAX_TIME = Number.MAX_SAFE_INTEGER;

export type PageChunkRow = {
    id: number;
    url: string;
    normalizedUrl: string;
    title: string;
    visitCount: number;
    lastVisitTime: number;
    chunkId: string;
    chunkIndex: number;
};

export type VisitChunkRow = {
    id: string;
    pageId: number;
    visitTime: number;
    transition: string;
    sourceIndex: number;
    sourceKey?: string;
    chunkId: string;
    chunkIndex: number;
};

export type PageVisitStats = {
    pageId: number;
    matchedVisitCount: number;
    matchedVisitTime: number;
};

export function openHistoriesDatabase(): Promise<HistoriesDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = (event) => {
            migrate(request.result, event.oldVersion);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function upsertPage(input: PageInput): Promise<PageRecord> {
    const [record] = await upsertPages([input]);
    return record;
}

export async function addPages(inputs: PageInput[]): Promise<PageRecord[]> {
    if (inputs.length === 0) return [];

    const mergedInputs = mergePageInputs(inputs);
    const db = await openHistoriesDatabase();

    try {
        const now = Date.now();
        const transaction = db.transaction('pages', 'readwrite');
        const store = transaction.objectStore('pages');
        const pendingAdds: Array<{
            recordWithoutId: Omit<PageRecord, 'id'>;
            idPromise: Promise<IDBValidKey>;
        }> = [];

        for (const input of mergedInputs) {
            const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
            const urlParts = parseUrlParts(input.url);
            const recordWithoutId = {
                url: input.url,
                normalizedUrl,
                title: input.title ?? '',
                host: urlParts.host,
                domain: urlParts.domain,
                visitCount: input.visitCount ?? 0,
                lastVisitTime: input.lastVisitTime ?? 0,
                createdAt: now,
                updatedAt: now,
            };
            pendingAdds.push({
                recordWithoutId,
                idPromise: requestToPromise(store.add(recordWithoutId)),
            });
        }

        const results: PageRecord[] = [];
        for (const pendingAdd of pendingAdds) {
            results.push({
                id: Number(await pendingAdd.idPromise),
                ...pendingAdd.recordWithoutId,
            });
        }

        await transactionDone(transaction);
        return results;
    } finally {
        db.close();
    }
}

export async function upsertPages(inputs: PageInput[]): Promise<PageRecord[]> {
    if (inputs.length === 0) return [];

    const mergedInputs = mergePageInputs(inputs);
    const db = await openHistoriesDatabase();

    try {
        const now = Date.now();
        const transaction = db.transaction('pages', 'readwrite');
        const store = transaction.objectStore('pages');
        const index = store.index('normalizedUrl');
        const existingRecords = await Promise.all(
            mergedInputs.map((input) =>
                requestToPromise(index.get(input.normalizedUrl ?? normalizeHistoryUrl(input.url))),
            ),
        );
        const results: PageRecord[] = [];
        const pendingAdds: Array<{
            recordWithoutId: Omit<PageRecord, 'id'>;
            idPromise: Promise<IDBValidKey>;
            resultIndex: number;
        }> = [];

        for (let indexOffset = 0; indexOffset < mergedInputs.length; indexOffset += 1) {
            const input = mergedInputs[indexOffset];
            const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
            const urlParts = parseUrlParts(input.url);
            const existing = existingRecords[indexOffset] as PageRecord | undefined;

            if (existing) {
                const nextRecord: PageRecord = {
                    ...existing,
                    url: input.url,
                    normalizedUrl,
                    title: input.title ?? existing.title,
                    host: urlParts.host,
                    domain: urlParts.domain,
                    visitCount: input.visitCount ?? existing.visitCount,
                    lastVisitTime:
                        input.lastVisitTime === undefined
                            ? existing.lastVisitTime
                            : Math.max(existing.lastVisitTime, input.lastVisitTime),
                    updatedAt: now,
                };

                store.put(nextRecord);
                results.push(nextRecord);
                continue;
            }

            const recordWithoutId = {
                url: input.url,
                normalizedUrl,
                title: input.title ?? '',
                host: urlParts.host,
                domain: urlParts.domain,
                visitCount: input.visitCount ?? 0,
                lastVisitTime: input.lastVisitTime ?? 0,
                createdAt: now,
                updatedAt: now,
            };
            const resultIndex = results.length;
            results.push(undefined as unknown as PageRecord);
            pendingAdds.push({
                recordWithoutId,
                idPromise: requestToPromise(store.add(recordWithoutId)),
                resultIndex,
            });
        }

        for (const pendingAdd of pendingAdds) {
            const id = Number(await pendingAdd.idPromise);
            results[pendingAdd.resultIndex] = {
                id,
                ...pendingAdd.recordWithoutId,
            };
        }

        await transactionDone(transaction);
        return results;
    } finally {
        db.close();
    }
}

export async function replacePageChunks(chunks: PageChunkRecord[]): Promise<number> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('pageChunks', 'readwrite');
        const store = transaction.objectStore('pageChunks');
        store.clear();

        for (const chunk of chunks) {
            store.put(chunk);
        }

        await transactionDone(transaction);
        return chunks.reduce((total, chunk) => total + chunk.count, 0);
    } finally {
        db.close();
    }
}

export type PublishHistoryGenerationOptions = {
    pageChunks: PageChunkRecord[];
    visitChunks: VisitChunkRecord[];
    reason: HistoryGenerationRecord['reason'];
    parentGenerationId?: string;
    sourceIds?: string[];
    importBatchId?: string;
    dirtyPages?: HistoryGenerationRecord['dirtyPages'];
    signal?: AbortSignal;
    beforeActivate?: (generationId: string) => void | Promise<void>;
    beforeStageChunk?: (kind: 'page' | 'visit', ordinal: number) => void;
};

export async function publishHistoryGeneration(
    options: PublishHistoryGenerationOptions,
): Promise<HistoryGenerationRecord> {
    throwIfAborted(options.signal);
    const generation = await stageHistoryGeneration(options);
    try {
        throwIfAborted(options.signal);
        await options.beforeActivate?.(generation.id);
        throwIfAborted(options.signal);
        return await activateHistoryGeneration(generation.id);
    } catch (error) {
        // A staging generation is intentionally invisible and can be inspected or cleaned after failure.
        throw error;
    }
}

export async function stageHistoryGeneration(
    options: Omit<PublishHistoryGenerationOptions, 'beforeActivate'>,
): Promise<HistoryGenerationRecord> {
    throwIfAborted(options.signal);
    const generationId = createGenerationId();
    const generation: HistoryGenerationRecord = {
        id: generationId,
        status: 'staging',
        reason: options.reason,
        parentGenerationId: options.parentGenerationId,
        dataFormatVersion: HISTORY_DATA_FORMAT_VERSION,
        sourceIds: options.sourceIds,
        importBatchId: options.importBatchId,
        dirtyPages: options.dirtyPages,
        createdAt: Date.now(),
        pageCount: options.pageChunks.reduce((total, chunk) => total + chunk.count, 0),
        visitCount: options.visitChunks.reduce((total, chunk) => total + chunk.count, 0),
        pageSegmentCount: options.pageChunks.length,
        visitSegmentCount: options.visitChunks.length,
    };
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction(
            ['historyGenerations', 'generationPageChunks', 'generationVisitChunks'],
            'readwrite',
        );
        const done = transactionDone(transaction);
        try {
            transaction.objectStore('historyGenerations').put(generation);
            const pageStore = transaction.objectStore('generationPageChunks');
            options.pageChunks.forEach((chunk, ordinal) => {
                options.beforeStageChunk?.('page', ordinal);
                throwIfAborted(options.signal);
                pageStore.put({
                    ...chunk,
                    id: `${generationId}:page:${ordinal}`,
                    logicalId: chunk.id,
                    generationId,
                    ordinal,
                } satisfies GenerationPageChunkRecord);
            });
            const visitStore = transaction.objectStore('generationVisitChunks');
            options.visitChunks.forEach((chunk, ordinal) => {
                options.beforeStageChunk?.('visit', ordinal);
                throwIfAborted(options.signal);
                visitStore.put({
                    ...chunk,
                    id: `${generationId}:visit:${ordinal}`,
                    logicalId: chunk.id,
                    generationId,
                    ordinal,
                } satisfies GenerationVisitChunkRecord);
            });
            await done;
        } catch (error) {
            try {
                transaction.abort();
            } catch {
                // The transaction may already have aborted because an IndexedDB request failed.
            }
            await done.catch(() => undefined);
            throw error;
        }
        return generation;
    } finally {
        db.close();
    }
}

export async function activateHistoryGeneration(generationId: string): Promise<HistoryGenerationRecord> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction(['historyGenerations', 'historyMetadata', 'dirtyPages'], 'readwrite');
        const generationStore = transaction.objectStore('historyGenerations');
        const metadataStore = transaction.objectStore('historyMetadata');
        const generation = (await requestToPromise(generationStore.get(generationId))) as
            | HistoryGenerationRecord
            | undefined;
        if (!generation || generation.status !== 'staging') {
            transaction.abort();
            throw new Error(`History generation is not available for activation: ${generationId}`);
        }
        const activeMetadata = (await requestToPromise(metadataStore.get('activeGeneration'))) as
            | HistoryMetadataRecord
            | undefined;
        if (generation.parentGenerationId !== activeMetadata?.value) {
            transaction.abort();
            throw new Error(
                `History generation parent is stale: expected ${activeMetadata?.value ?? 'none'}, received ${generation.parentGenerationId ?? 'none'}`,
            );
        }
        const committedAt = Date.now();
        if (activeMetadata?.value && activeMetadata.value !== generationId) {
            const previous = (await requestToPromise(generationStore.get(activeMetadata.value))) as
                | HistoryGenerationRecord
                | undefined;
            if (previous) generationStore.put({ ...previous, status: 'retired' });
        }
        const previousRevision = activeMetadata?.value
            ? Number(
                  (
                      (await requestToPromise(generationStore.get(activeMetadata.value))) as
                          | HistoryGenerationRecord
                          | undefined
                  )?.revision ?? 0,
              )
            : 0;
        const revision = previousRevision + 1;
        const activeGeneration: HistoryGenerationRecord = {
            ...generation,
            status: 'active',
            revision,
            committedAt,
        };
        generationStore.put(activeGeneration);
        metadataStore.put({
            key: 'activeGeneration',
            value: generationId,
            updatedAt: committedAt,
        } satisfies HistoryMetadataRecord);
        const dirtyStore = transaction.objectStore('dirtyPages');
        for (const dirtyPage of generation.dirtyPages ?? []) {
            dirtyStore.put({
                pageId: dirtyPage.pageId,
                revision,
                reason: dirtyPage.reason,
                updatedAt: committedAt,
            } satisfies DirtyPageRecord);
        }
        await transactionDone(transaction);
        return activeGeneration;
    } finally {
        db.close();
    }
}

export async function getActiveHistoryGeneration(): Promise<HistoryGenerationRecord | undefined> {
    const db = await openHistoriesDatabase();
    try {
        const generationId = await getActiveGenerationId(db);
        if (!generationId) return undefined;
        const transaction = db.transaction('historyGenerations', 'readonly');
        return (await requestToPromise(transaction.objectStore('historyGenerations').get(generationId))) as
            | HistoryGenerationRecord
            | undefined;
    } finally {
        db.close();
    }
}

export async function listHistoryGenerations(): Promise<HistoryGenerationRecord[]> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('historyGenerations', 'readonly');
        const generations = await readCursor<HistoryGenerationRecord>(
            transaction.objectStore('historyGenerations'),
            undefined,
            { limit: Number.POSITIVE_INFINITY },
        );
        return generations.sort((left, right) => right.createdAt - left.createdAt);
    } finally {
        db.close();
    }
}

export async function cleanupHistoryGenerations(
    options: {
        stagingOlderThan?: number;
        keepRetired?: number;
        now?: number;
    } = {},
): Promise<string[]> {
    const now = options.now ?? Date.now();
    const stagingOlderThan = Math.max(0, options.stagingOlderThan ?? 24 * 60 * 60 * 1000);
    const keepRetired = Math.max(0, Math.floor(options.keepRetired ?? 1));
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction(
            ['historyGenerations', 'generationPageChunks', 'generationVisitChunks'],
            'readwrite',
        );
        const generationStore = transaction.objectStore('historyGenerations');
        const generations = await readCursor<HistoryGenerationRecord>(generationStore, undefined, {
            limit: Number.POSITIVE_INFINITY,
        });
        const retainedRetired = generations
            .filter((generation) => generation.status === 'retired')
            .sort((left, right) => (right.committedAt ?? right.createdAt) - (left.committedAt ?? left.createdAt))
            .slice(0, keepRetired)
            .map((generation) => generation.id);
        const retainedIds = new Set(retainedRetired);
        const deletedIds = generations
            .filter(
                (generation) =>
                    (generation.status === 'staging' && generation.createdAt <= now - stagingOlderThan) ||
                    (generation.status === 'retired' && !retainedIds.has(generation.id)),
            )
            .map((generation) => generation.id);

        for (const generationId of deletedIds) {
            generationStore.delete(generationId);
            await deleteIndexRange(
                transaction.objectStore('generationPageChunks').index('generationId'),
                IDBKeyRange.only(generationId),
            );
            await deleteIndexRange(
                transaction.objectStore('generationVisitChunks').index('generationId'),
                IDBKeyRange.only(generationId),
            );
        }
        await transactionDone(transaction);
        return deletedIds;
    } finally {
        db.close();
    }
}

export async function getPageChunks(): Promise<PageChunkRecord[]> {
    const db = await openHistoriesDatabase();

    try {
        const generationId = await getActiveGenerationId(db);
        if (generationId) return await readGenerationPageChunks(db, generationId);
        const transaction = db.transaction('pageChunks', 'readonly');
        const chunks = await readCursor<PageChunkRecord>(transaction.objectStore('pageChunks'), undefined, {
            limit: Number.POSITIVE_INFINITY,
        });
        if (chunks.length > 0) return chunks;

        return await synthesizePageChunksFromRecords(db);
    } finally {
        db.close();
    }
}

export async function getPageFromChunksById(pageId: number): Promise<PageChunkRow | undefined> {
    const chunk = (await getPageChunks()).find(
        (candidate) => pageId >= candidate.firstPageId && pageId < candidate.firstPageId + candidate.count,
    );
    return chunk ? decodePageChunkRow(chunk, pageId - chunk.firstPageId) : undefined;
}

export function decodePageChunkRows(chunk: PageChunkRecord): PageChunkRow[] {
    const rows: PageChunkRow[] = [];

    for (let index = 0; index < chunk.count; index += 1) {
        rows.push(decodePageChunkRow(chunk, index));
    }

    return rows;
}

export async function getPageById(id: number): Promise<PageRecord | undefined> {
    if (await hasActiveGeneration()) {
        const chunkPage = await getPageFromChunksById(id);
        return chunkPage ? pageChunkRowToRecord(chunkPage) : undefined;
    }
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('pages', 'readonly');
        return (await requestToPromise(transaction.objectStore('pages').get(id))) as PageRecord | undefined;
    } finally {
        db.close();
    }
}

export async function getPageByNormalizedUrl(normalizedUrl: string): Promise<PageRecord | undefined> {
    if (await hasActiveGeneration()) {
        for (const chunk of await getPageChunks()) {
            const index = chunk.normalizedUrls.indexOf(normalizedUrl);
            if (index >= 0) return pageChunkRowToRecord(decodePageChunkRow(chunk, index));
        }
        return undefined;
    }
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('pages', 'readonly');
        return (await requestToPromise(transaction.objectStore('pages').index('normalizedUrl').get(normalizedUrl))) as
            | PageRecord
            | undefined;
    } finally {
        db.close();
    }
}

export async function putVisits(visits: VisitInput[]): Promise<number> {
    if (visits.length === 0) return 0;

    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('visits', 'readwrite');
        const store = transaction.objectStore('visits');

        for (const visit of visits) {
            if (visit.id === undefined) {
                store.add(visit);
            } else {
                store.put(visit);
            }
        }

        await transactionDone(transaction);
        return visits.length;
    } finally {
        db.close();
    }
}

export async function replaceVisitChunks(chunks: VisitChunkRecord[]): Promise<number> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('visitChunks', 'readwrite');
        const store = transaction.objectStore('visitChunks');
        store.clear();

        for (const chunk of chunks) {
            store.put(chunk);
        }

        await transactionDone(transaction);
        return chunks.reduce((total, chunk) => total + chunk.count, 0);
    } finally {
        db.close();
    }
}

export type VisitRangeQuery = {
    startTime?: number;
    endTime?: number;
    limit?: number;
    reverse?: boolean;
};

export async function getVisitChunks(): Promise<VisitChunkRecord[]> {
    const db = await openHistoriesDatabase();

    try {
        const generationId = await getActiveGenerationId(db);
        if (generationId) return await readGenerationVisitChunks(db, generationId);
        const transaction = db.transaction('visitChunks', 'readonly');
        const chunks = await readCursor<VisitChunkRecord>(transaction.objectStore('visitChunks'), undefined, {
            limit: Number.POSITIVE_INFINITY,
        });
        if (chunks.length > 0) return chunks;

        return await synthesizeVisitChunksFromRecords(db);
    } finally {
        db.close();
    }
}

export async function getVisitChunksByTimeRange(query: VisitRangeQuery = {}): Promise<VisitChunkRecord[]> {
    return filterVisitChunksByTimeRange(await getVisitChunks(), query);
}

export async function getVisitsFromChunksByTimeRange(query: VisitRangeQuery = {}): Promise<VisitChunkRow[]> {
    {
        const chunks = await getVisitChunksByTimeRange(query);
        const orderedChunks = query.reverse ? chunks.reverse() : chunks;
        const results: VisitChunkRow[] = [];
        const startTime = query.startTime ?? 0;
        const endTime = query.endTime ?? MAX_TIME;
        const limit = query.limit ?? 1000;

        for (const chunk of orderedChunks) {
            const rows = decodeVisitChunkRows(chunk);
            if (query.reverse) rows.reverse();

            for (const row of rows) {
                if (row.visitTime < startTime || row.visitTime > endTime) continue;
                results.push(row);
                if (results.length >= limit) return results;
            }
        }

        return results;
    }
}

export async function getPageVisitStatsFromChunksByTimeRange(
    query: VisitRangeQuery = {},
    pageIds?: Iterable<number>,
): Promise<PageVisitStats[]> {
    {
        const chunks = await getVisitChunksByTimeRange(query);
        const startTime = query.startTime ?? 0;
        const endTime = query.endTime ?? MAX_TIME;
        const pageIdFilter = pageIds ? new Set(pageIds) : undefined;
        const stats = new Map<number, PageVisitStats>();

        for (const chunk of chunks) {
            for (let index = 0; index < chunk.count; index += 1) {
                const pageId = chunk.pageIds[index];
                const visitTime = chunk.visitTimes[index];
                if (visitTime < startTime || visitTime > endTime) continue;
                if (pageIdFilter && !pageIdFilter.has(pageId)) continue;

                const existing = stats.get(pageId);
                if (existing) {
                    existing.matchedVisitCount += 1;
                    existing.matchedVisitTime = Math.max(existing.matchedVisitTime, visitTime);
                    continue;
                }

                stats.set(pageId, {
                    pageId,
                    matchedVisitCount: 1,
                    matchedVisitTime: visitTime,
                });
            }
        }

        return [...stats.values()];
    }
}

export function decodeVisitChunkRows(chunk: VisitChunkRecord): VisitChunkRow[] {
    const rows: VisitChunkRow[] = [];

    for (let index = 0; index < chunk.count; index += 1) {
        rows.push({
            id: makeVisitChunkRowId(
                chunk.pageIds[index],
                chunk.visitTimes[index],
                chunk.transitionCodes[index],
                chunk.sourceIndexes[index],
            ),
            pageId: chunk.pageIds[index],
            visitTime: chunk.visitTimes[index],
            transition: decodeTransition(chunk.transitionCodes[index]),
            sourceIndex: chunk.sourceIndexes[index],
            sourceKey: chunk.sourceKeys?.[index],
            chunkId: chunk.id,
            chunkIndex: index,
        });
    }

    return rows;
}

export function decodeVisitChunkSourceIds(chunk: VisitChunkRecord, index: number): string[] {
    if (!chunk.sourceIds || !chunk.sourceRefOffsets || !chunk.sourceRefs) return [];
    const start = chunk.sourceRefOffsets[index] ?? 0;
    const end = chunk.sourceRefOffsets[index + 1] ?? start;
    const result: string[] = [];
    for (let offset = start; offset < end; offset += 1) {
        const sourceId = chunk.sourceIds[chunk.sourceRefs[offset]];
        if (sourceId !== undefined) result.push(sourceId);
    }
    return result;
}

export async function getVisitsByTimeRange(query: VisitRangeQuery = {}): Promise<VisitRecord[]> {
    if (await hasActiveGeneration()) {
        return (await getVisitsFromChunksByTimeRange(query)).map(visitChunkRowToRecord);
    }
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('visits', 'readonly');
        const index = transaction.objectStore('visits').index('visitTime');
        return await readCursor<VisitRecord>(index, timeKeyRange(query), query);
    } finally {
        db.close();
    }
}

export async function getVisitsByPageAndTimeRange(pageId: number, query: VisitRangeQuery = {}): Promise<VisitRecord[]> {
    if (await hasActiveGeneration()) {
        return (await getVisitsFromChunksByTimeRange(query))
            .filter((visit) => visit.pageId === pageId)
            .map(visitChunkRowToRecord);
    }
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('visits', 'readonly');
        const index = transaction.objectStore('visits').index('pageTime');
        const startTime = query.startTime ?? 0;
        const endTime = query.endTime ?? MAX_TIME;
        return await readCursor<VisitRecord>(index, IDBKeyRange.bound([pageId, startTime], [pageId, endTime]), query);
    } finally {
        db.close();
    }
}

export async function getVisitsByTransitionAndTimeRange(
    transition: string,
    query: VisitRangeQuery = {},
): Promise<VisitRecord[]> {
    if (await hasActiveGeneration()) {
        return (await getVisitsFromChunksByTimeRange(query))
            .filter((visit) => visit.transition === transition)
            .map(visitChunkRowToRecord);
    }
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('visits', 'readonly');
        const index = transaction.objectStore('visits').index('transitionTime');
        const startTime = query.startTime ?? 0;
        const endTime = query.endTime ?? MAX_TIME;
        return await readCursor<VisitRecord>(
            index,
            IDBKeyRange.bound([transition, startTime], [transition, endTime]),
            query,
        );
    } finally {
        db.close();
    }
}

export async function putJob(job: JobRecord): Promise<void> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('jobs', 'readwrite');
        transaction.objectStore('jobs').put(withReleasedTerminalLease(job));
        await transactionDone(transaction);
    } finally {
        db.close();
    }
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('jobs', 'readonly');
        return (await requestToPromise(transaction.objectStore('jobs').get(id))) as JobRecord | undefined;
    } finally {
        db.close();
    }
}

export async function listJobs(limit = 20): Promise<JobRecord[]> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('jobs', 'readonly');
        const results = await readCursor<JobRecord>(transaction.objectStore('jobs'), undefined, {
            limit: Number.POSITIVE_INFINITY,
        });
        results.sort((left, right) => right.updatedAt - left.updatedAt);
        return results.slice(0, limit);
    } finally {
        db.close();
    }
}

export async function claimJob(jobId: string, ownerId: string, leaseMs = 30_000): Promise<JobRecord | undefined> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('jobs', 'readwrite');
        const store = transaction.objectStore('jobs');
        const job = (await requestToPromise(store.get(jobId))) as JobRecord | undefined;
        const now = Date.now();
        if (!job || job.status === 'complete' || job.status === 'cancelled') return undefined;
        if (job.ownerId && job.ownerId !== ownerId && Number(job.leaseUntil) > now) return undefined;
        const claimed: JobRecord = {
            ...job,
            status: 'running',
            ownerId,
            leaseUntil: now + normalizeLeaseMs(leaseMs),
            retryCount: (job.retryCount ?? 0) + (job.ownerId && job.ownerId !== ownerId ? 1 : 0),
            updatedAt: now,
        };
        store.put(claimed);
        await transactionDone(transaction);
        return claimed;
    } finally {
        db.close();
    }
}

export async function renewJobLease(jobId: string, ownerId: string, leaseMs = 30_000): Promise<boolean> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('jobs', 'readwrite');
        const store = transaction.objectStore('jobs');
        const job = (await requestToPromise(store.get(jobId))) as JobRecord | undefined;
        if (!job || job.ownerId !== ownerId || job.status !== 'running') return false;
        store.put({ ...job, leaseUntil: Date.now() + normalizeLeaseMs(leaseMs), updatedAt: Date.now() });
        await transactionDone(transaction);
        return true;
    } finally {
        db.close();
    }
}

export async function listRecoverableJobs(now = Date.now()): Promise<JobRecord[]> {
    const jobs = await listJobs(Number.POSITIVE_INFINITY);
    return jobs.filter(
        (job) =>
            job.resumable === true &&
            (job.status === 'queued' ||
                job.status === 'failed' ||
                (job.status === 'running' && Number(job.leaseUntil ?? 0) <= now)),
    );
}

export async function markDirtyPages(records: DirtyPageRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('dirtyPages', 'readwrite');
        const store = transaction.objectStore('dirtyPages');
        for (const record of records) store.put(record);
        await transactionDone(transaction);
        return records.length;
    } finally {
        db.close();
    }
}

export async function listDirtyPages(limit = Number.POSITIVE_INFINITY): Promise<DirtyPageRecord[]> {
    const db = await openHistoriesDatabase();
    try {
        return await readCursor<DirtyPageRecord>(
            db.transaction('dirtyPages', 'readonly').objectStore('dirtyPages'),
            undefined,
            { limit },
        );
    } finally {
        db.close();
    }
}

export async function clearDirtyPages(pageIds: number[]): Promise<void> {
    if (pageIds.length === 0) return;
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('dirtyPages', 'readwrite');
        const store = transaction.objectStore('dirtyPages');
        for (const pageId of pageIds) store.delete(pageId);
        await transactionDone(transaction);
    } finally {
        db.close();
    }
}

export async function putHistorySource(source: HistorySourceRecord): Promise<void> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('historySources', 'readwrite');
        transaction.objectStore('historySources').put(source);
        await transactionDone(transaction);
    } finally {
        db.close();
    }
}

export async function getHistorySource(id: string): Promise<HistorySourceRecord | undefined> {
    const db = await openHistoriesDatabase();
    try {
        return (await requestToPromise(
            db.transaction('historySources', 'readonly').objectStore('historySources').get(id),
        )) as HistorySourceRecord | undefined;
    } finally {
        db.close();
    }
}

export async function listHistorySources(): Promise<HistorySourceRecord[]> {
    const db = await openHistoriesDatabase();
    try {
        return await readCursor<HistorySourceRecord>(
            db.transaction('historySources', 'readonly').objectStore('historySources'),
            undefined,
            { limit: Number.POSITIVE_INFINITY },
        );
    } finally {
        db.close();
    }
}

export async function getHistorySourceByFingerprint(fingerprint: string): Promise<HistorySourceRecord | undefined> {
    const db = await openHistoriesDatabase();
    try {
        return (await requestToPromise(
            db
                .transaction('historySources', 'readonly')
                .objectStore('historySources')
                .index('fingerprint')
                .get(fingerprint),
        )) as HistorySourceRecord | undefined;
    } finally {
        db.close();
    }
}

export async function getOrCreateBrowserHistorySource(
    browser: HistorySourceRecord['browser'] = 'unknown',
): Promise<HistorySourceRecord> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction(['historyMetadata', 'historySources'], 'readwrite');
        const metadataStore = transaction.objectStore('historyMetadata');
        const sourceStore = transaction.objectStore('historySources');
        const pointer = (await requestToPromise(metadataStore.get('localBrowserSource'))) as
            | HistoryMetadataRecord
            | undefined;
        if (pointer?.value) {
            const existing = (await requestToPromise(sourceStore.get(pointer.value))) as
                | HistorySourceRecord
                | undefined;
            if (existing) return existing;
        }

        const instanceId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
        const source: HistorySourceRecord = {
            id: `source:browser-history:${instanceId}`,
            kind: 'browser-history',
            browser,
            createdAt: Date.now(),
            metadata: { instanceId },
        };
        sourceStore.put(source);
        metadataStore.put({
            key: 'localBrowserSource',
            value: source.id,
            updatedAt: Date.now(),
        } satisfies HistoryMetadataRecord);
        await transactionDone(transaction);
        return source;
    } finally {
        db.close();
    }
}

export async function putImportBatch(batch: ImportBatchRecord): Promise<void> {
    const db = await openHistoriesDatabase();
    try {
        const transaction = db.transaction('importBatches', 'readwrite');
        transaction.objectStore('importBatches').put(batch);
        await transactionDone(transaction);
    } finally {
        db.close();
    }
}

export async function getImportBatch(id: string): Promise<ImportBatchRecord | undefined> {
    const db = await openHistoriesDatabase();
    try {
        return (await requestToPromise(
            db.transaction('importBatches', 'readonly').objectStore('importBatches').get(id),
        )) as ImportBatchRecord | undefined;
    } finally {
        db.close();
    }
}

export async function listImportBatches(): Promise<ImportBatchRecord[]> {
    const db = await openHistoriesDatabase();
    try {
        return await readCursor<ImportBatchRecord>(
            db.transaction('importBatches', 'readonly').objectStore('importBatches'),
            undefined,
            { limit: Number.POSITIVE_INFINITY },
        );
    } finally {
        db.close();
    }
}

export async function putSearchSnapshot(snapshot: SearchSnapshotRecord): Promise<void> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('searchSnapshot', 'readwrite');
        transaction.objectStore('searchSnapshot').put(snapshot);
        await transactionDone(transaction);
    } finally {
        db.close();
    }
}

export async function getLatestSearchSnapshot(): Promise<SearchSnapshotRecord | undefined> {
    const db = await openHistoriesDatabase();

    try {
        const transaction = db.transaction('searchSnapshot', 'readonly');
        return (await requestToPromise(transaction.objectStore('searchSnapshot').get('latest'))) as
            | SearchSnapshotRecord
            | undefined;
    } finally {
        db.close();
    }
}

export type DatabaseSummary = {
    pages: number;
    pageChunks: number;
    visits: number;
    visitChunks: number;
    jobs: number;
    hasSearchSnapshot: boolean;
    activeGenerationId?: string;
};

export async function getDatabaseSummary(): Promise<DatabaseSummary> {
    const db = await openHistoriesDatabase();

    try {
        const activeGenerationId = await getActiveGenerationId(db);
        if (activeGenerationId) {
            const generation = (await requestToPromise(
                db
                    .transaction('historyGenerations', 'readonly')
                    .objectStore('historyGenerations')
                    .get(activeGenerationId),
            )) as HistoryGenerationRecord | undefined;
            const [jobs, snapshots] = await Promise.all([countStore(db, 'jobs'), countStore(db, 'searchSnapshot')]);
            return {
                pages: generation?.pageCount ?? 0,
                pageChunks: generation?.pageSegmentCount ?? 0,
                visits: generation?.visitCount ?? 0,
                visitChunks: generation?.visitSegmentCount ?? 0,
                jobs,
                hasSearchSnapshot: snapshots > 0,
                activeGenerationId,
            };
        }
        const [pages, pageChunkSummary, visits, chunkSummary, jobs, snapshots] = await Promise.all([
            countStore(db, 'pages'),
            getPageChunkSummary(db),
            countStore(db, 'visits'),
            getVisitChunkSummary(db),
            countStore(db, 'jobs'),
            countStore(db, 'searchSnapshot'),
        ]);

        return {
            pages: pages + pageChunkSummary.pages,
            pageChunks: pageChunkSummary.chunks,
            visits: visits + chunkSummary.visits,
            visitChunks: chunkSummary.chunks,
            jobs,
            hasSearchSnapshot: snapshots > 0,
            activeGenerationId: undefined,
        };
    } finally {
        db.close();
    }
}

async function getActiveGenerationId(db: IDBDatabase): Promise<string | undefined> {
    if (!db.objectStoreNames.contains('historyMetadata')) return undefined;
    const transaction = db.transaction('historyMetadata', 'readonly');
    const metadata = (await requestToPromise(transaction.objectStore('historyMetadata').get('activeGeneration'))) as
        | HistoryMetadataRecord
        | undefined;
    return metadata?.value;
}

async function hasActiveGeneration(): Promise<boolean> {
    const db = await openHistoriesDatabase();
    try {
        return Boolean(await getActiveGenerationId(db));
    } finally {
        db.close();
    }
}

async function readGenerationPageChunks(db: IDBDatabase, generationId: string): Promise<PageChunkRecord[]> {
    const transaction = db.transaction('generationPageChunks', 'readonly');
    const index = transaction.objectStore('generationPageChunks').index('generationOrdinal');
    const chunks = await readCursor<GenerationPageChunkRecord>(
        index,
        IDBKeyRange.bound([generationId, 0], [generationId, Number.MAX_SAFE_INTEGER]),
        { limit: Number.POSITIVE_INFINITY },
    );
    return chunks.map(({ logicalId, generationId: _generationId, ordinal: _ordinal, ...chunk }) => ({
        ...chunk,
        id: logicalId,
    }));
}

async function readGenerationVisitChunks(db: IDBDatabase, generationId: string): Promise<VisitChunkRecord[]> {
    const transaction = db.transaction('generationVisitChunks', 'readonly');
    const index = transaction.objectStore('generationVisitChunks').index('generationOrdinal');
    const chunks = await readCursor<GenerationVisitChunkRecord>(
        index,
        IDBKeyRange.bound([generationId, 0], [generationId, Number.MAX_SAFE_INTEGER]),
        { limit: Number.POSITIVE_INFINITY },
    );
    return chunks.map(({ logicalId, generationId: _generationId, ordinal: _ordinal, ...chunk }) => ({
        ...chunk,
        id: logicalId,
    }));
}

function createGenerationId(): string {
    const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    return `generation:${Date.now()}:${randomId}`;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function normalizeLeaseMs(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30_000;
}

function withReleasedTerminalLease(job: JobRecord): JobRecord {
    if (job.status !== 'complete' && job.status !== 'failed' && job.status !== 'cancelled') return job;
    const { ownerId: _ownerId, leaseUntil: _leaseUntil, ...released } = job;
    return released;
}

function deleteIndexRange(index: IDBIndex, range: IDBKeyRange): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = index.openCursor(range);
        request.onsuccess = () => {
            try {
                const cursor = request.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                cursor.delete();
                cursor.continue();
            } catch (error) {
                reject(error);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getPageChunkSummary(db: IDBDatabase): Promise<{ chunks: number; pages: number }> {
    if (!db.objectStoreNames.contains('pageChunks')) {
        return Promise.resolve({ chunks: 0, pages: 0 });
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('pageChunks', 'readonly');
        const request = transaction.objectStore('pageChunks').openCursor();
        let chunks = 0;
        let pages = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ chunks, pages });
                return;
            }

            const chunk = cursor.value as PageChunkRecord;
            chunks += 1;
            pages += chunk.count;
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

function getVisitChunkSummary(db: IDBDatabase): Promise<{ chunks: number; visits: number }> {
    if (!db.objectStoreNames.contains('visitChunks')) {
        return Promise.resolve({ chunks: 0, visits: 0 });
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('visitChunks', 'readonly');
        const request = transaction.objectStore('visitChunks').openCursor();
        let chunks = 0;
        let visits = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ chunks, visits });
                return;
            }

            const chunk = cursor.value as VisitChunkRecord;
            chunks += 1;
            visits += chunk.count;
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

async function synthesizePageChunksFromRecords(db: IDBDatabase): Promise<PageChunkRecord[]> {
    const pages = await readAllPages(db);
    return pages.map((page) => ({
        id: `page-record:${page.id}`,
        firstPageId: page.id,
        count: 1,
        urls: [page.url],
        normalizedUrls: [page.normalizedUrl],
        titles: [page.title],
        visitCounts: new Uint32Array([page.visitCount]),
        lastVisitTimes: new Float64Array([page.lastVisitTime]),
    }));
}

async function synthesizeVisitChunksFromRecords(db: IDBDatabase): Promise<VisitChunkRecord[]> {
    const [visits, pages] = await Promise.all([readAllVisits(db), readAllPages(db)]);
    if (visits.length === 0) return [];

    const pageTitles = new Map(pages.map((page) => [page.id, page.title]));
    visits.sort(
        (left, right) =>
            left.visitTime - right.visitTime ||
            left.pageId - right.pageId ||
            String(left.id).localeCompare(String(right.id)),
    );

    return visits.map((visit, index) => ({
        id: `visit-record:${index}`,
        minVisitTime: visit.visitTime,
        maxVisitTime: visit.visitTime,
        count: 1,
        pageIds: new Uint32Array([visit.pageId]),
        visitTimes: new Float64Array([visit.visitTime]),
        transitionCodes: new Uint8Array([encodeTransition(visit.transition)]),
        sourceIndexes: new Uint32Array([index]),
        titles: [pageTitles.get(visit.pageId) ?? ''],
        sourceKeys: [String(visit.id)],
    }));
}

async function readAllPages(db: IDBDatabase): Promise<PageRecord[]> {
    const transaction = db.transaction('pages', 'readonly');
    return await readCursor<PageRecord>(transaction.objectStore('pages'), undefined, {
        limit: Number.POSITIVE_INFINITY,
    });
}

async function readAllVisits(db: IDBDatabase): Promise<VisitRecord[]> {
    const transaction = db.transaction('visits', 'readonly');
    const index = transaction.objectStore('visits').index('visitTime');
    return await readCursor<VisitRecord>(index, undefined, {
        limit: Number.POSITIVE_INFINITY,
    });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

function readCursor<T>(
    source: IDBIndex | IDBObjectStore,
    range: IDBKeyRange | undefined,
    query: VisitRangeQuery,
): Promise<T[]> {
    const results: T[] = [];
    const direction = query.reverse ? 'prev' : 'next';
    const limit = query.limit ?? 1000;

    return new Promise((resolve, reject) => {
        const request = source.openCursor(range, direction);

        request.onsuccess = () => {
            const cursor = request.result;

            if (!cursor || results.length >= limit) {
                resolve(results);
                return;
            }

            results.push(cursor.value as T);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

function readFirstCursor<T>(
    source: IDBIndex | IDBObjectStore,
    range: IDBKeyRange | undefined,
    direction: IDBCursorDirection = 'next',
): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const request = source.openCursor(range, direction);

        request.onsuccess = () => resolve(request.result?.value as T | undefined);
        request.onerror = () => reject(request.error);
    });
}

function readOverlappingVisitChunks(store: IDBObjectStore, query: VisitRangeQuery): Promise<VisitChunkRecord[]> {
    const endTime = query.endTime ?? MAX_TIME;
    const startTime = query.startTime ?? 0;
    const range = IDBKeyRange.upperBound(endTime);
    const index = store.index('minVisitTime');

    return new Promise((resolve, reject) => {
        const chunks: VisitChunkRecord[] = [];
        const request = index.openCursor(range);

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(chunks);
                return;
            }

            const chunk = cursor.value as VisitChunkRecord;
            if (chunk.maxVisitTime >= startTime) {
                chunks.push(chunk);
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

function filterVisitChunksByTimeRange(chunks: VisitChunkRecord[], query: VisitRangeQuery): VisitChunkRecord[] {
    const startTime = query.startTime ?? 0;
    const endTime = query.endTime ?? MAX_TIME;
    return chunks.filter((chunk) => chunk.minVisitTime <= endTime && chunk.maxVisitTime >= startTime);
}

function decodePageChunkRow(chunk: PageChunkRecord, index: number): PageChunkRow {
    return {
        id: chunk.firstPageId + index,
        url: chunk.urls[index] ?? '',
        normalizedUrl: chunk.normalizedUrls[index] ?? '',
        title: chunk.titles[index] ?? '',
        visitCount: chunk.visitCounts[index] ?? 0,
        lastVisitTime: chunk.lastVisitTimes[index] ?? 0,
        chunkId: chunk.id,
        chunkIndex: index,
    };
}

function pageChunkRowToRecord(page: PageChunkRow): PageRecord {
    const parts = parseUrlParts(page.url);
    return {
        id: page.id,
        url: page.url,
        normalizedUrl: page.normalizedUrl,
        title: page.title,
        host: parts.host,
        domain: parts.domain,
        visitCount: page.visitCount,
        lastVisitTime: page.lastVisitTime,
        createdAt: 0,
        updatedAt: 0,
    };
}

function visitChunkRowToRecord(visit: VisitChunkRow): VisitRecord {
    return {
        id: visit.sourceKey ?? visit.id,
        pageId: visit.pageId,
        visitTime: visit.visitTime,
        transition: visit.transition,
    };
}

function makeVisitChunkRowId(pageId: number, visitTime: number, transitionCode: number, sourceIndex: number): string {
    return `chunk:${pageId}:${visitTime}:${transitionCode}:${sourceIndex}`;
}

function decodeTransition(code: number): string {
    switch (code) {
        case 0:
            return 'link';
        case 1:
            return 'typed';
        case 2:
            return 'auto_bookmark';
        case 3:
            return 'auto_subframe';
        case 4:
            return 'manual_subframe';
        case 5:
            return 'generated';
        case 6:
            return 'auto_toplevel';
        case 7:
            return 'form_submit';
        case 8:
            return 'reload';
        case 9:
            return 'keyword';
        case 10:
            return 'keyword_generated';
        default:
            return 'unknown';
    }
}

function encodeTransition(transition: string): number {
    switch (transition) {
        case 'link':
            return 0;
        case 'typed':
            return 1;
        case 'auto_bookmark':
            return 2;
        case 'auto_subframe':
            return 3;
        case 'manual_subframe':
            return 4;
        case 'generated':
            return 5;
        case 'auto_toplevel':
            return 6;
        case 'form_submit':
            return 7;
        case 'reload':
            return 8;
        case 'keyword':
            return 9;
        case 'keyword_generated':
            return 10;
        default:
            return 255;
    }
}

function timeKeyRange(query: VisitRangeQuery): IDBKeyRange {
    return IDBKeyRange.bound(query.startTime ?? 0, query.endTime ?? MAX_TIME);
}

function mergePageInputs(inputs: PageInput[]): PageInput[] {
    const byNormalizedUrl = new Map<string, PageInput>();

    for (const input of inputs) {
        const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
        const existing = byNormalizedUrl.get(normalizedUrl);

        if (!existing) {
            byNormalizedUrl.set(normalizedUrl, {
                ...input,
                normalizedUrl,
            });
            continue;
        }

        byNormalizedUrl.set(normalizedUrl, {
            ...existing,
            url: input.url,
            title: input.title ?? existing.title,
            visitCount: input.visitCount ?? existing.visitCount,
            lastVisitTime:
                input.lastVisitTime === undefined
                    ? existing.lastVisitTime
                    : Math.max(existing.lastVisitTime ?? 0, input.lastVisitTime),
            normalizedUrl,
        });
    }

    return [...byNormalizedUrl.values()];
}

export function normalizeHistoryUrl(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.href;
    } catch {
        return url.trim();
    }
}

function parseUrlParts(url: string): { host: string; domain: string } {
    try {
        const host = new URL(url).hostname.toLowerCase();
        const parts = host.split('.').filter(Boolean);
        const domain = parts.length >= 2 ? parts.slice(-2).join('.') : host;
        return { host, domain };
    } catch {
        return { host: '', domain: '' };
    }
}

function migrate(db: IDBDatabase, oldVersion: number) {
    if (oldVersion < 1) {
        createPagesStore(db);

        createVisitsStore(db);

        db.createObjectStore('jobs', {
            keyPath: 'id',
        });

        db.createObjectStore('searchSnapshot', {
            keyPath: 'key',
        });
    } else if (oldVersion < 2) {
        if (db.objectStoreNames.contains('visits')) {
            db.deleteObjectStore('visits');
        }
        createVisitsStore(db);
    }

    if (oldVersion < 3 && !db.objectStoreNames.contains('visitChunks')) {
        const visitChunks = db.createObjectStore('visitChunks', {
            keyPath: 'id',
        });
        visitChunks.createIndex('minVisitTime', 'minVisitTime');
        visitChunks.createIndex('maxVisitTime', 'maxVisitTime');
    }

    if (oldVersion >= 1 && oldVersion < 4) {
        if (db.objectStoreNames.contains('pages')) {
            db.deleteObjectStore('pages');
        }
        createPagesStore(db);
    }

    if (oldVersion < 5 && !db.objectStoreNames.contains('pageChunks')) {
        const pageChunks = db.createObjectStore('pageChunks', {
            keyPath: 'id',
        });
        pageChunks.createIndex('firstPageId', 'firstPageId');
    }

    if (oldVersion < 6) {
        if (!db.objectStoreNames.contains('historyMetadata')) {
            db.createObjectStore('historyMetadata', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('historyGenerations')) {
            const generations = db.createObjectStore('historyGenerations', { keyPath: 'id' });
            generations.createIndex('status', 'status');
            generations.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('generationPageChunks')) {
            const pageChunks = db.createObjectStore('generationPageChunks', { keyPath: 'id' });
            pageChunks.createIndex('generationId', 'generationId');
            pageChunks.createIndex('generationOrdinal', ['generationId', 'ordinal'], { unique: true });
        }
        if (!db.objectStoreNames.contains('generationVisitChunks')) {
            const visitChunks = db.createObjectStore('generationVisitChunks', { keyPath: 'id' });
            visitChunks.createIndex('generationId', 'generationId');
            visitChunks.createIndex('generationOrdinal', ['generationId', 'ordinal'], { unique: true });
            visitChunks.createIndex('generationMinVisitTime', ['generationId', 'minVisitTime']);
        }
        if (!db.objectStoreNames.contains('dirtyPages')) {
            const dirtyPages = db.createObjectStore('dirtyPages', { keyPath: 'pageId' });
            dirtyPages.createIndex('revision', 'revision');
            dirtyPages.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('historySources')) {
            const sources = db.createObjectStore('historySources', { keyPath: 'id' });
            sources.createIndex('kind', 'kind');
            sources.createIndex('fingerprint', 'fingerprint', { unique: false });
        }
        if (!db.objectStoreNames.contains('importBatches')) {
            const batches = db.createObjectStore('importBatches', { keyPath: 'id' });
            batches.createIndex('status', 'status');
            batches.createIndex('createdAt', 'createdAt');
        }
    }
}

function createPagesStore(db: IDBDatabase) {
    const pages = db.createObjectStore('pages', {
        keyPath: 'id',
        autoIncrement: true,
    });
    pages.createIndex('normalizedUrl', 'normalizedUrl', { unique: true });
}

function createVisitsStore(db: IDBDatabase) {
    const visits = db.createObjectStore('visits', {
        keyPath: 'id',
        autoIncrement: true,
    });
    visits.createIndex('visitTime', 'visitTime');
    visits.createIndex('pageTime', ['pageId', 'visitTime']);
    visits.createIndex('transitionTime', ['transition', 'visitTime']);
}
