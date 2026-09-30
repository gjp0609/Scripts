import { importHtuText } from '../src/import/htu-import';
import { SearchEngine } from '../src/search/search-engine';
import { loadSqliteWasmSearchRuntime } from '../src/search/sqlite-wasm-runtime';
import { createIndexedDbSearchStorage } from '../src/search/storage-adapter';
import {
    getDatabaseSummary,
    getLatestSearchSnapshot,
    openHistoriesDatabase,
    putSearchSnapshot,
} from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type QuotaBenchmarkOptions = {
    backupUrl: string;
    maxRows?: number;
    pagination?: boolean;
};

type ExtensionStorageEstimate = {
    usage?: number;
    quota?: number;
    persisted: boolean;
};

declare global {
    interface Window {
        runHistoriesExtensionQuotaBuild: (options: QuotaBenchmarkOptions) => Promise<unknown>;
        runHistoriesExtensionQuotaVerify: () => Promise<unknown>;
    }
}

window.runHistoriesExtensionQuotaBuild = async (options) => {
    await deleteDatabase(DATABASE_NAME);
    const before = await storageEstimate(true);
    const totalStarted = performance.now();
    const fetchStarted = performance.now();
    const response = await fetch(options.backupUrl);
    if (!response.ok) throw new Error(`Unable to fetch external HTU backup: ${response.status}`);
    let text = await response.text();
    if (options.maxRows !== undefined) text = limitRows(text, options.maxRows);
    const fetchMs = performance.now() - fetchStarted;
    console.info(`[histories-extension-quota] fetched input in ${Math.round(fetchMs)} ms`);

    const importStarted = performance.now();
    const imported = await importHtuText(text);
    text = '';
    const importMs = performance.now() - importStarted;
    console.info(
        `[histories-extension-quota] imported rows=${imported.rows} pages=${imported.pages} visits=${imported.visits} in ${Math.round(importMs)} ms`,
    );

    const runtime = await loadSqliteWasmSearchRuntime({ scriptUrl: extensionUrl('sqlite/sqlite3.js') });
    const storage = createIndexedDbSearchStorage();
    const engine = new SearchEngine({
        storage,
        runtime,
        onProgress(progress) {
            if (progress.stage !== 'pages' || progress.writtenPages === progress.pages) {
                console.info(
                    `[histories-extension-quota] ${progress.stage} ${progress.writtenPages}/${progress.pages}`,
                );
            }
        },
    });
    const rebuildStarted = performance.now();
    const rebuilt = await engine.rebuildSnapshot();
    const rebuildMs = performance.now() - rebuildStarted;
    const pagination = options.pagination ? await runPaginationBenchmark(engine, storage) : undefined;
    engine.close();

    const summary = await getDatabaseSummary();
    const after = await storageEstimate(false);
    return {
        imported: {
            rows: imported.rows,
            pages: imported.pages,
            visits: imported.visits,
            ignoredDataImages: imported.ignoredDataImages,
        },
        summary,
        snapshot: rebuilt,
        pagination,
        storage: { before, after },
        timings: {
            fetchMs,
            importMs,
            rebuildMs,
            totalMs: performance.now() - totalStarted,
        },
    };
};

window.runHistoriesExtensionQuotaVerify = async () => {
    const summaryBefore = await getDatabaseSummary();
    const snapshot = await getLatestSearchSnapshot();
    if (!snapshot?.bytes.byteLength) throw new Error('Persisted search snapshot is missing.');

    const runtime = await loadSqliteWasmSearchRuntime({ scriptUrl: extensionUrl('sqlite/sqlite3.js') });
    const engine = new SearchEngine({ storage: createIndexedDbSearchStorage(), runtime });
    const loadStarted = performance.now();
    await engine.loadSnapshot();
    const loadMs = performance.now() - loadStarted;
    engine.close();

    await putSearchSnapshot({ ...snapshot, bytes: new Uint8Array([0, 1, 2, 3]) });
    let corruptionRejected = false;
    try {
        await engine.loadSnapshot();
    } catch {
        corruptionRejected = true;
    } finally {
        engine.close();
    }
    if (!corruptionRejected) throw new Error('Corrupted search snapshot was accepted.');
    await putSearchSnapshot(snapshot);

    await deleteLatestSnapshot();
    const snapshotMissingAfterDelete = (await getLatestSearchSnapshot()) === undefined;
    const summaryAfterDelete = await getDatabaseSummary();
    await putSearchSnapshot(snapshot);

    const restoreStarted = performance.now();
    await engine.loadSnapshot();
    const restoreLoadMs = performance.now() - restoreStarted;
    engine.close();

    return {
        summaryBefore,
        summaryAfterDelete,
        snapshot: {
            pageCount: snapshot.pageCount,
            snapshotSize: snapshot.snapshotSize,
            sqliteVersion: snapshot.sqliteVersion,
        },
        storage: await storageEstimate(false),
        loadMs,
        restoreLoadMs,
        corruptionRejected,
        snapshotMissingAfterDelete,
    };
};

async function runFromQueryString() {
    const query = new URLSearchParams(location.search);
    const resultUrl = query.get('resultUrl');
    const backupUrl = query.get('backupUrl');
    const mode = query.get('mode');
    if (!resultUrl || !mode) return;

    try {
        const result =
            mode === 'build'
                ? await window.runHistoriesExtensionQuotaBuild({
                      backupUrl: requireValue(backupUrl, 'backupUrl'),
                      maxRows: parseOptionalPositiveInteger(query.get('maxRows')),
                      pagination: query.get('pagination') === 'true',
                  })
                : await window.runHistoriesExtensionQuotaVerify();
        await postResult(resultUrl, { ok: true, result });
    } catch (error) {
        await postResult(resultUrl, {
            ok: false,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
    }
}

function extensionUrl(path: string): string {
    const extensionGlobal = globalThis as typeof globalThis & {
        browser?: { runtime?: { getURL?: (path: string) => string } };
        chrome?: { runtime?: { getURL?: (path: string) => string } };
    };
    const runtime =
        (
            globalThis as typeof globalThis & {
                browser?: { runtime?: { getURL?: (path: string) => string } };
                chrome?: { runtime?: { getURL?: (path: string) => string } };
            }
        ).browser?.runtime ?? extensionGlobal.chrome?.runtime;
    const getUrl = runtime?.getURL;
    if (!getUrl) throw new Error('Extension runtime URL API is unavailable.');
    return getUrl(path);
}

async function storageEstimate(requestPersistence: boolean): Promise<ExtensionStorageEstimate> {
    if (requestPersistence) await navigator.storage.persist?.();
    const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    return { usage: estimate.usage, quota: estimate.quota, persisted };
}

async function deleteLatestSnapshot(): Promise<void> {
    const db = await openHistoriesDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('searchSnapshot', 'readwrite');
            transaction.objectStore('searchSnapshot').delete('latest');
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error('Snapshot delete aborted.'));
        });
    } finally {
        db.close();
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

function limitRows(text: string, maxRows: number): string {
    let rows = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) !== 10) continue;
        rows += 1;
        if (rows >= maxRows) return text.slice(0, index + 1);
    }
    return text;
}

function parseOptionalPositiveInteger(value: string | null): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function requireValue(value: string | null, name: string): string {
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
}

async function postResult(url: string, body: unknown): Promise<void> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Unable to post benchmark result: ${response.status}`);
}

async function runPaginationBenchmark(engine: SearchEngine, storage: ReturnType<typeof createIndexedDbSearchStorage>) {
    const chunks = await storage.getPageChunks();
    const maxVisitTime = chunks.reduce((maximum, chunk) => {
        for (const value of chunk.lastVisitTimes) maximum = Math.max(maximum, value);
        return maximum;
    }, 0);
    const day = 24 * 60 * 60 * 1000;
    const scenarios = [
        { name: 'time-all', keyword: '', startTime: 0 },
        { name: 'time-7d', keyword: '', startTime: maxVisitTime - 7 * day },
        { name: 'github-all', keyword: 'github', startTime: 0 },
        { name: 'github-7d', keyword: 'github', startTime: maxVisitTime - 7 * day },
        { name: 'google-all', keyword: 'google', startTime: 0 },
        { name: 'ruan-all', keyword: 'ruan', startTime: 0 },
        { name: 'zero-all', keyword: 'histories-no-match-7f31d9', startTime: 0 },
    ];
    const firstPages = [];
    for (const scenario of scenarios) {
        const started = performance.now();
        const page = await engine.searchPage({
            keyword: scenario.keyword,
            startTime: scenario.startTime,
            endTime: maxVisitTime,
            limit: 50,
        });
        assertStableOrder(page.results);
        firstPages.push({
            name: scenario.name,
            ms: performance.now() - started,
            results: page.results.length,
            hasNext: Boolean(page.nextCursor),
        });
    }

    const sequentialDurations = [];
    const uniquePageIds = new Set<number>();
    let cursor: Awaited<ReturnType<SearchEngine['searchPage']>>['nextCursor'];
    let pages = 0;
    for (; pages < 10; pages += 1) {
        const started = performance.now();
        const page = await engine.searchPage({
            keyword: 'github',
            startTime: 0,
            endTime: maxVisitTime,
            limit: 50,
            cursor,
        });
        sequentialDurations.push(performance.now() - started);
        assertStableOrder(page.results);
        for (const row of page.results) {
            if (uniquePageIds.has(row.pageId)) throw new Error('Stable pagination returned a duplicate page.');
            uniquePageIds.add(row.pageId);
        }
        cursor = page.nextCursor;
        if (!cursor) {
            pages += 1;
            break;
        }
    }

    return {
        maxVisitTime,
        firstPages,
        sequential: {
            pages,
            uniqueResults: uniquePageIds.size,
            durationsMs: summarizeDurations(sequentialDurations),
        },
    };
}

function assertStableOrder(rows: Array<{ pageId: number; matchedVisitTime?: number }>) {
    for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        const previousTime = previous.matchedVisitTime ?? 0;
        const currentTime = current.matchedVisitTime ?? 0;
        if (currentTime > previousTime || (currentTime === previousTime && current.pageId > previous.pageId)) {
            throw new Error('Search page is not ordered by the stable time cursor key.');
        }
    }
}

function summarizeDurations(values: number[]) {
    const sorted = [...values].sort((left, right) => left - right);
    const percentile = (ratio: number) =>
        sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    return {
        samples: sorted.length,
        min: sorted[0] ?? 0,
        p50: percentile(0.5),
        p95: percentile(0.95),
        max: sorted.at(-1) ?? 0,
        mean: sorted.length ? sorted.reduce((total, value) => total + value, 0) / sorted.length : 0,
    };
}

void runFromQueryString();

export {};
