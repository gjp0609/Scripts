import {
    decodePageChunkRows,
    decodeVisitChunkRows,
    activateHistoryGeneration,
    claimJob,
    cleanupHistoryGenerations,
    clearDirtyPages,
    getActiveHistoryGeneration,
    getHistorySource,
    getOrCreateBrowserHistorySource,
    getImportBatch,
    getDatabaseSummary,
    getJob,
    getLatestSearchSnapshot,
    listJobs,
    listHistoryGenerations,
    listDirtyPages,
    listRecoverableJobs,
    getPageChunks,
    getPageById,
    getPageByNormalizedUrl,
    getPageFromChunksById,
    getPageVisitStatsFromChunksByTimeRange,
    getVisitChunks,
    getVisitChunksByTimeRange,
    getVisitsFromChunksByTimeRange,
    getVisitsByPageAndTimeRange,
    getVisitsByTimeRange,
    getVisitsByTransitionAndTimeRange,
    normalizeHistoryUrl,
    openHistoriesDatabase,
    putJob,
    putHistorySource,
    putImportBatch,
    putSearchSnapshot,
    putVisits,
    markDirtyPages,
    publishHistoryGeneration,
    stageHistoryGeneration,
    renewJobLease,
    upsertPage,
} from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';
import { importHtuText } from '../src/import/htu-import';
import { exportHtuArchivedTsv } from '../src/export/htu-export';
import { runHistorySyncJob } from '../src/jobs/history-sync-job';

type SmokeResult = {
    pageCount: number;
    visitCount: number;
    rangeIds: IDBValidKey[];
    pageRangeIds: IDBValidKey[];
    transitionRangeIds: IDBValidKey[];
    reverseIds: IDBValidKey[];
    importRows: number;
    importPages: number;
    importVisits: number;
};

declare global {
    interface Window {
        runHistoriesStorageSmoke: () => Promise<SmokeResult>;
    }
}

window.runHistoriesStorageSmoke = async () => {
    await deleteDatabase(DATABASE_NAME);
    await createLegacyV5Database();
    const migrated = await openHistoriesDatabase();
    ensure(migrated.version === 6, 'legacy database should migrate to version 6');
    ensure(migrated.objectStoreNames.contains('historyGenerations'), 'migration should create generation store');
    ensure(migrated.objectStoreNames.contains('dirtyPages'), 'migration should create dirty page store');
    migrated.close();
    ensure(
        (await getPageChunks())[0]?.urls[0] === 'https://legacy.example/',
        'legacy page chunk should remain readable',
    );
    ensure((await getVisitChunks())[0]?.visitTimes[0] === 500, 'legacy visit chunk should remain readable');
    await deleteDatabase(DATABASE_NAME);

    const page = await upsertPage({
        url: 'https://example.com/docs/index.html#section',
        title: 'Original title',
        visitCount: 1,
        lastVisitTime: 1000,
    });
    ensure(page.id > 0, 'page id should be generated');
    ensure(page.normalizedUrl === 'https://example.com/docs/index.html', 'hash should be removed');
    ensure(page.host === 'example.com', 'host should be derived');
    ensure(page.domain === 'example.com', 'domain should be derived');

    const updatedPage = await upsertPage({
        url: 'https://example.com/docs/index.html',
        title: 'Updated title',
        visitCount: 2,
        lastVisitTime: 3000,
    });
    ensure(updatedPage.id === page.id, 'normalized url should upsert existing page');
    ensure(updatedPage.title === 'Updated title', 'page title should update');
    ensure(updatedPage.lastVisitTime === 3000, 'last visit time should advance');

    const otherPage = await upsertPage({
        url: 'https://sub.example.org/path',
        title: 'Other page',
        visitCount: 2,
        lastVisitTime: 4000,
    });

    await putVisits([
        { id: 'v-1000-link', pageId: page.id, visitTime: 1000, transition: 'link' },
        { id: 'v-2000-typed', pageId: page.id, visitTime: 2000, transition: 'typed' },
        { id: 'v-3000-link', pageId: otherPage.id, visitTime: 3000, transition: 'link' },
        { id: 'v-4000-reload', pageId: otherPage.id, visitTime: 4000, transition: 'reload' },
    ]);

    const byId = await getPageById(page.id);
    ensure(byId?.title === 'Updated title', 'getPageById should read updated page');

    const byNormalizedUrl = await getPageByNormalizedUrl(normalizeHistoryUrl(page.url));
    ensure(byNormalizedUrl?.id === page.id, 'getPageByNormalizedUrl should use normalizedUrl index');

    const timeRange = await getVisitsByTimeRange({ startTime: 1500, endTime: 3500 });
    ensureIds(
        timeRange.map((visit) => visit.id),
        ['v-2000-typed', 'v-3000-link'],
        'visitTime range should return ordered inclusive matches',
    );

    const pageRange = await getVisitsByPageAndTimeRange(page.id, { startTime: 0, endTime: 2500 });
    ensureIds(
        pageRange.map((visit) => visit.id),
        ['v-1000-link', 'v-2000-typed'],
        'pageTime range should stay inside one page',
    );

    const transitionRange = await getVisitsByTransitionAndTimeRange('link', {
        startTime: 0,
        endTime: 3500,
    });
    ensureIds(
        transitionRange.map((visit) => visit.id),
        ['v-1000-link', 'v-3000-link'],
        'transitionTime range should stay inside one transition',
    );

    const reverse = await getVisitsByTimeRange({ limit: 2, reverse: true });
    ensureIds(
        reverse.map((visit) => visit.id),
        ['v-4000-reload', 'v-3000-link'],
        'reverse limited scan should read newest visits first',
    );

    const fallbackPageChunks = await getPageChunks();
    ensure(fallbackPageChunks.length === 2, 'record-backed page fallback should synthesize chunks');
    ensureIds(
        decodePageChunkRows(fallbackPageChunks[0]).map((row) => row.id),
        [page.id],
        'record-backed page fallback should preserve page ids',
    );

    const fallbackVisitChunks = await getVisitChunks();
    ensure(fallbackVisitChunks.length === 4, 'record-backed visit fallback should synthesize chunks');
    ensureIds(
        decodeVisitChunkRows(fallbackVisitChunks[0]).map((row) => row.visitTime),
        [1000],
        'record-backed visit fallback should preserve visit times',
    );

    const fallbackRangedVisitChunks = await getVisitChunksByTimeRange({ startTime: 1500, endTime: 3500 });
    ensure(
        fallbackRangedVisitChunks.length === 2,
        'record-backed visit range fallback should prefilter synthesized chunks',
    );

    const fallbackChunkTimeRange = await getVisitsFromChunksByTimeRange({ startTime: 1500, endTime: 3500 });
    ensureIds(
        fallbackChunkTimeRange.map((visit) => visit.visitTime),
        [2000, 3000],
        'record-backed chunk time range should scan synthesized visits',
    );

    const fallbackPageVisitStats = await getPageVisitStatsFromChunksByTimeRange({ startTime: 1500, endTime: 3500 }, [
        page.id,
        otherPage.id,
    ]);
    ensureIds(
        fallbackPageVisitStats.map((item) => item.pageId),
        [page.id, otherPage.id],
        'record-backed page visit stats should aggregate synthesized visits',
    );

    await putJob({
        id: 'job-1',
        type: 'htu-import',
        status: 'running',
        updatedAt: 5000,
        progress: { rows: 10 },
    });
    ensure((await getJob('job-1'))?.status === 'running', 'job should round-trip');
    ensure((await listJobs(5))[0]?.id === 'job-1', 'listJobs should return the newest job record');

    await putSearchSnapshot({
        key: 'latest',
        schemaVersion: 1,
        sqliteVersion: '3.46.1',
        createdAt: 6000,
        sourceRevision: 'smoke',
        bytes: new Uint8Array([1, 2, 3]),
        pageCount: 2,
        snapshotSize: 3,
    });
    ensure((await getLatestSearchSnapshot())?.snapshotSize === 3, 'snapshot should round-trip');

    const summary = await getDatabaseSummary();
    ensure(summary.pages === 2, 'summary should count pages');
    ensure(summary.visits === 4, 'summary should count visits');
    ensure(summary.jobs === 1, 'summary should count jobs');
    ensure(summary.hasSearchSnapshot, 'summary should report snapshot');

    const db = await openHistoriesDatabase();
    db.close();

    return {
        pageCount: summary.pages,
        visitCount: summary.visits,
        rangeIds: timeRange.map((visit) => visit.id),
        pageRangeIds: pageRange.map((visit) => visit.id),
        transitionRangeIds: transitionRange.map((visit) => visit.id),
        reverseIds: reverse.map((visit) => visit.id),
        ...(await runImportSmoke()),
    };
};

async function runImportSmoke() {
    await deleteDatabase(DATABASE_NAME);

    const progressStages: string[] = [];
    const source = [
        'https://example.com/imported\tU1000\t0\tOld imported title',
        'https://example.com/imported\tU3000\t1\tNew imported title',
        'https://example.org/other\tU2000\t8\tOther imported title',
        '',
    ].join('\r\n');
    const result = await importHtuText(source, {
        pageChunkSize: 1,
        visitChunkSize: 2,
        onProgress(progress) {
            progressStages.push(progress.stage);
        },
    });
    ensureIds(progressStages, ['parsed', 'pages', 'visits', 'done'], 'import progress order');

    const summary = await getDatabaseSummary();
    ensure(summary.pages === 2, 'import should write aggregated pages');
    ensure(summary.pageChunks === 2, 'import should write page chunks');
    ensure(summary.visits === 3, 'import should write visits');
    ensure(summary.visitChunks === 2, 'import should write visit chunks');

    const pageChunks = await getPageChunks();
    ensure(pageChunks.length === 2, 'import should preserve page chunk count');
    ensureIds(
        decodePageChunkRows(pageChunks[0]).map((page) => page.id),
        [1],
        'page chunk rows should expose stable page ids',
    );

    const importedPage = await getPageFromChunksById(1);
    ensure(importedPage?.url === 'https://example.com/imported', 'page chunk lookup should find page 1');
    ensure(importedPage.visitCount === 2, 'page chunk lookup should expose visit count');
    ensure(importedPage.lastVisitTime === 3000, 'page chunk lookup should expose last visit time');
    ensure((await getPageFromChunksById(99)) === undefined, 'page chunk lookup should miss unknown page');

    const visitChunks = await getVisitChunks();
    ensure(visitChunks.length === 2, 'import should preserve visit chunk count');
    ensureIds(
        decodeVisitChunkRows(visitChunks[0]).map((visit) => visit.visitTime),
        [1000, 2000],
        'visit chunk rows should decode in time order',
    );
    ensureIds(
        visitChunks[0].titles ?? [],
        ['Old imported title', 'Other imported title'],
        'visit chunks should preserve visit-level titles for export',
    );

    const overlappingVisitChunks = await getVisitChunksByTimeRange({ startTime: 1500, endTime: 2500 });
    ensure(overlappingVisitChunks.length === 1, 'time range should prefilter overlapping visit chunks');
    ensure(overlappingVisitChunks[0].id === 'visit-chunk:0', 'time range should keep matching chunk id');

    const pageVisitStats = await getPageVisitStatsFromChunksByTimeRange({ startTime: 1500, endTime: 3500 }, [1, 2]);
    ensureIds(
        pageVisitStats.map((item) => item.pageId),
        [2, 1],
        'page visit stats should only include filtered pages with matching visits',
    );
    ensure(pageVisitStats[0].matchedVisitCount === 1, 'page visit stats should count matching visits');
    ensure(pageVisitStats[1].matchedVisitTime === 3000, 'page visit stats should track latest matching visit');

    const chunkTimeRange = await getVisitsFromChunksByTimeRange({ startTime: 1500, endTime: 3500 });
    ensureIds(
        chunkTimeRange.map((visit) => visit.visitTime),
        [2000, 3000],
        'chunk time range should return inclusive matches',
    );
    ensureIds(
        chunkTimeRange.map((visit) => visit.transition),
        ['reload', 'typed'],
        'chunk time range should decode transitions',
    );

    const reverseChunkTimeRange = await getVisitsFromChunksByTimeRange({ limit: 2, reverse: true });
    ensureIds(
        reverseChunkTimeRange.map((visit) => visit.visitTime),
        [3000, 2000],
        'reverse chunk time range should read newest visits first',
    );

    ensure(result.rows === 3, 'import result rows should match parsed rows');
    ensure(result.pages === 2, 'import result pages should match aggregated pages');
    ensure(result.visits === 3, 'import result visits should match planned visits');
    ensure(result.writtenVisits === 3, 'import result written visits should match storage writes');
    ensure((await exportHtuArchivedTsv()).text === source, 'archived export should round-trip imported HTU backup');

    const firstGeneration = await getActiveHistoryGeneration();
    ensure(firstGeneration?.status === 'active', 'default import should publish an active generation');
    ensure(firstGeneration?.revision === 1, 'first active generation should start at revision 1');
    ensure(firstGeneration?.dataFormatVersion === 1, 'generation should persist its data format version');
    const activePageChunks = await getPageChunks();
    const activeVisitChunks = await getVisitChunks();
    ensure(!('generationId' in activePageChunks[0]), 'public page chunks should hide generation internals');
    ensure(!('ordinal' in activeVisitChunks[0]), 'public visit chunks should hide generation internals');
    ensure(
        (await getPageById(1))?.url === 'https://example.com/imported',
        'page record API should read active generation',
    );
    ensure((await getVisitsByTimeRange()).length === 3, 'visit record API should read active generation');
    const staging = await stageHistoryGeneration({
        pageChunks: activePageChunks,
        visitChunks: activeVisitChunks,
        reason: 'compaction',
        parentGenerationId: firstGeneration.id,
    });
    ensure(
        (await getActiveHistoryGeneration())?.id === firstGeneration.id,
        'staging generation should remain invisible before activation',
    );
    await activateHistoryGeneration(staging.id);
    ensure(
        (await getActiveHistoryGeneration())?.id === staging.id,
        'activation should atomically switch the active generation',
    );
    ensure((await getActiveHistoryGeneration())?.revision === 2, 'generation revisions should increase on activation');

    const generationCountBeforeStageFailure = (await listHistoryGenerations()).length;
    await stageHistoryGeneration({
        pageChunks: activePageChunks,
        visitChunks: activeVisitChunks,
        reason: 'compaction',
        parentGenerationId: staging.id,
        beforeStageChunk(kind, ordinal) {
            if (kind === 'visit' && ordinal === 0) throw new Error('injected-stage-write');
        },
    }).then(
        () => {
            throw new Error('stage write interruption should fail');
        },
        (error) => ensure(String(error).includes('injected-stage-write'), 'expected stage write failure'),
    );
    ensure(
        (await listHistoryGenerations()).length === generationCountBeforeStageFailure,
        'interrupted staging transaction should not leave partial generation data',
    );

    let interruptedGenerationId = '';
    await publishHistoryGeneration({
        pageChunks: activePageChunks,
        visitChunks: activeVisitChunks,
        reason: 'compaction',
        parentGenerationId: staging.id,
        beforeActivate(generationId) {
            interruptedGenerationId = generationId;
            throw new Error('injected-before-activate');
        },
    }).then(
        () => {
            throw new Error('interrupted generation should not activate');
        },
        (error) => ensure(String(error).includes('injected-before-activate'), 'expected injected failure'),
    );
    ensure(
        (await getActiveHistoryGeneration())?.id === staging.id,
        'failed publication should preserve the previous active generation',
    );
    const generations = await listHistoryGenerations();
    ensure(
        generations.some((generation) => generation.id === interruptedGenerationId && generation.status === 'staging'),
        'failed publication should leave only an invisible staging generation',
    );
    const deletedGenerations = await cleanupHistoryGenerations({
        stagingOlderThan: 0,
        keepRetired: 0,
        now: Date.now() + 1,
    });
    ensure(deletedGenerations.includes(interruptedGenerationId), 'generation cleanup should delete stale staging data');
    ensure((await getActiveHistoryGeneration())?.id === staging.id, 'generation cleanup must preserve active data');

    const branchA = await stageHistoryGeneration({
        pageChunks: activePageChunks,
        visitChunks: activeVisitChunks,
        reason: 'compaction',
        parentGenerationId: staging.id,
    });
    const branchB = await stageHistoryGeneration({
        pageChunks: activePageChunks,
        visitChunks: activeVisitChunks,
        reason: 'compaction',
        parentGenerationId: staging.id,
    });
    await activateHistoryGeneration(branchA.id);
    await activateHistoryGeneration(branchB.id).then(
        () => {
            throw new Error('stale sibling generation should not activate');
        },
        (error) => ensure(String(error).includes('parent is stale'), 'expected stale generation rejection'),
    );
    ensure(
        (await getActiveHistoryGeneration())?.id === branchA.id,
        'compare-and-swap activation should preserve the winning generation',
    );

    await markDirtyPages([
        { pageId: 1, revision: 7, reason: 'new-page', updatedAt: 7000 },
        { pageId: 2, revision: 8, reason: 'search-text-changed', updatedAt: 8000 },
    ]);
    ensureIds(
        (await listDirtyPages()).map((item) => item.pageId),
        [1, 2],
        'dirty pages should persist',
    );
    await clearDirtyPages([1]);
    ensureIds(
        (await listDirtyPages()).map((item) => item.pageId),
        [2],
        'dirty page clear should commit',
    );

    await putHistorySource({
        id: 'source:test-browser',
        kind: 'browser-history',
        browser: 'chromium',
        createdAt: 9000,
    });
    ensure((await getHistorySource('source:test-browser'))?.browser === 'chromium', 'history source should round-trip');
    await putImportBatch({
        id: 'batch:test',
        status: 'complete',
        sourceIds: ['source:test-browser'],
        createdAt: 9000,
        updatedAt: 9100,
        inputRows: 3,
        addedVisits: 3,
        duplicateVisits: 0,
        ignoredVisits: 0,
        errorCount: 0,
        generationId: staging.id,
    });
    ensure((await getImportBatch('batch:test'))?.generationId === staging.id, 'import batch should round-trip');

    await putJob({
        id: 'lease-test',
        type: 'history-sync',
        status: 'queued',
        updatedAt: 10_000,
        resumable: true,
        retryCount: 0,
    });
    const firstClaim = await claimJob('lease-test', 'owner-a', 60_000);
    ensure(firstClaim?.ownerId === 'owner-a', 'queued job should be claimable');
    ensure((await claimJob('lease-test', 'owner-b', 60_000)) === undefined, 'active lease should prevent takeover');
    ensure(await renewJobLease('lease-test', 'owner-a', 60_000), 'owner should renew its lease');
    await putJob({ ...firstClaim, leaseUntil: 0, updatedAt: 10_001 });
    ensure(
        (await listRecoverableJobs()).some((job) => job.id === 'lease-test'),
        'expired resumable job should be discoverable',
    );
    const secondClaim = await claimJob('lease-test', 'owner-b', 60_000);
    ensure(secondClaim?.ownerId === 'owner-b' && secondClaim.retryCount === 1, 'expired job should be reclaimable');
    await putJob({ ...secondClaim, status: 'complete', updatedAt: 10_002 });
    const completedLeaseJob = await getJob('lease-test');
    ensure(completedLeaseJob?.ownerId === undefined, 'terminal jobs should release their owner');
    ensure(completedLeaseJob?.leaseUntil === undefined, 'terminal jobs should release their lease');

    const activeBeforeInterruptedSync = await getActiveHistoryGeneration();
    const syncHistory = {
        async search() {
            return [
                { url: 'https://sync.example/new', title: 'Synced', lastVisitTime: 6000, visitCount: 1 },
                { url: 'data:image/png;base64,ignored', title: 'Ignored', lastVisitTime: 7000, visitCount: 1 },
            ];
        },
        async getVisits({ url }: { url: string }) {
            ensure(!url.startsWith('data:image/'), 'browser sync should filter data images before getVisits');
            return [{ visitId: 'browser-visit-1', visitTime: 6000, transition: 'link' }];
        },
    };
    await runHistorySyncJob({
        jobId: 'sync-interrupted',
        history: syncHistory,
        mode: 'incremental',
        beforeActivate() {
            throw new Error('injected-sync-before-activate');
        },
    }).then(
        () => {
            throw new Error('interrupted sync should fail');
        },
        (error) => ensure(String(error).includes('injected-sync-before-activate'), 'expected sync publication failure'),
    );
    ensure(
        (await getActiveHistoryGeneration())?.id === activeBeforeInterruptedSync?.id,
        'sync failure before activation should preserve active history',
    );
    const interruptedSyncJob = await getJob('sync-interrupted');
    ensure(interruptedSyncJob?.status === 'failed', 'interrupted sync should remain recoverable as failed');
    ensure(
        (interruptedSyncJob?.cursor as { nextStartTime?: number } | undefined)?.nextStartTime === undefined,
        'interrupted sync must not advance the committed cursor',
    );
    ensure(interruptedSyncJob?.ownerId === undefined, 'failed sync should release its job owner');

    await runHistorySyncJob({ jobId: 'sync-retry', history: syncHistory, mode: 'incremental' });
    const completedSyncJob = await getJob('sync-retry');
    ensure(completedSyncJob?.status === 'complete', 'successful sync retry should complete');
    ensure(
        (completedSyncJob?.cursor as { nextStartTime?: number } | undefined)?.nextStartTime === 6001,
        'successful sync should advance its cursor only after publication',
    );
    const browserSource = await getOrCreateBrowserHistorySource();
    ensure(
        (await getOrCreateBrowserHistorySource()).id === browserSource.id,
        'local browser source should remain stable across calls',
    );
    const sourceInstanceId = String(browserSource?.metadata?.instanceId);
    const syncedSourceKeys = (await getVisitChunks()).flatMap((chunk) => chunk.sourceKeys ?? []);
    ensure(
        syncedSourceKeys.includes(`${sourceInstanceId}:browser-visit-1`),
        'browser visits should use stable source-instance and visit-id identity',
    );
    ensure(
        (await listDirtyPages()).some((page) => page.reason === 'new-page'),
        'successful sync activation should persist dirty pages',
    );

    return {
        importRows: result.rows,
        importPages: result.pages,
        importVisits: result.visits,
    };
}

function ensure(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function ensureIds(actual: IDBValidKey[], expected: IDBValidKey[], message: string) {
    ensure(actual.length === expected.length, `${message}: length mismatch`);

    for (let index = 0; index < expected.length; index += 1) {
        ensure(actual[index] === expected[index], `${message}: expected ${expected[index]} at ${index}`);
    }
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
    });
}

function createLegacyV5Database(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 5);
        request.onupgradeneeded = () => {
            const db = request.result;
            const pages = db.createObjectStore('pages', { keyPath: 'id', autoIncrement: true });
            pages.createIndex('normalizedUrl', 'normalizedUrl', { unique: true });
            const visits = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
            visits.createIndex('visitTime', 'visitTime');
            visits.createIndex('pageTime', ['pageId', 'visitTime']);
            visits.createIndex('transitionTime', ['transition', 'visitTime']);
            db.createObjectStore('jobs', { keyPath: 'id' });
            db.createObjectStore('searchSnapshot', { keyPath: 'key' });
            const visitChunks = db.createObjectStore('visitChunks', { keyPath: 'id' });
            visitChunks.createIndex('minVisitTime', 'minVisitTime');
            visitChunks.createIndex('maxVisitTime', 'maxVisitTime');
            const pageChunks = db.createObjectStore('pageChunks', { keyPath: 'id' });
            pageChunks.createIndex('firstPageId', 'firstPageId');
            pageChunks.put({
                id: 'page-chunk:0',
                firstPageId: 1,
                count: 1,
                urls: ['https://legacy.example/'],
                normalizedUrls: ['https://legacy.example/'],
                titles: ['Legacy'],
                visitCounts: new Uint32Array([1]),
                lastVisitTimes: new Float64Array([500]),
            });
            visitChunks.put({
                id: 'visit-chunk:0',
                minVisitTime: 500,
                maxVisitTime: 500,
                count: 1,
                pageIds: new Uint32Array([1]),
                visitTimes: new Float64Array([500]),
                transitionCodes: new Uint8Array([0]),
                sourceIndexes: new Uint32Array([0]),
                titles: ['Legacy'],
            });
        };
        request.onsuccess = () => {
            request.result.close();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}
