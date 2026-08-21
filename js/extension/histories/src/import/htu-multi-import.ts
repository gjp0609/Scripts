import { parseHtuTsv, type HtuParsedRow } from '../htu/tsv.js';
import {
    decodePageChunkRows,
    decodeVisitChunkRows,
    decodeVisitChunkSourceIds,
    getActiveHistoryGeneration,
    getPageChunks,
    getVisitChunks,
    publishHistoryGeneration,
    putHistorySource,
    putImportBatch,
} from '../storage/database';
import type { HistoryGenerationRecord, ImportBatchRecord, PageChunkRecord, VisitChunkRecord } from '../storage/schema';

const DEFAULT_PAGE_CHUNK_SIZE = 20_000;
const DEFAULT_VISIT_CHUNK_SIZE = 20_000;

export type HtuImportFileInput = {
    name: string;
    bytes: Uint8Array;
};

export type HtuFileReport = NonNullable<ImportBatchRecord['files']>[number];

export type PreflightedHtuFile = {
    input: HtuImportFileInput;
    sourceId: string;
    rows: HtuParsedRow[];
    report: HtuFileReport;
};

export type HtuMultiImportProgress = {
    stage: 'preflight' | 'merge' | 'publish' | 'done';
    files: number;
    processedFiles: number;
    inputRows: number;
    addedVisits: number;
    duplicateVisits: number;
    ignoredVisits: number;
};

export type HtuMultiImportResult = HtuMultiImportProgress & {
    batchId: string;
    generationId: string;
    pages: number;
    visits: number;
    reports: HtuFileReport[];
};

export type HtuMultiImportOptions = {
    batchId?: string;
    pageChunkSize?: number;
    visitChunkSize?: number;
    signal?: AbortSignal;
    beforeActivate?: (generationId: string) => void | Promise<void>;
    onProgress?: (progress: HtuMultiImportProgress) => void | Promise<void>;
};

export type HtuMergeResult = {
    pageChunks: PageChunkRecord[];
    visitChunks: VisitChunkRecord[];
    dirtyPages: NonNullable<HistoryGenerationRecord['dirtyPages']>;
    reports: HtuFileReport[];
    addedVisits: number;
    duplicateVisits: number;
    ignoredVisits: number;
};

export class HtuPreflightError extends Error {
    constructor(
        message: string,
        readonly reports: HtuFileReport[],
    ) {
        super(message);
        this.name = 'HtuPreflightError';
    }
}

export async function preflightHtuFiles(
    inputs: HtuImportFileInput[],
    options: Pick<HtuMultiImportOptions, 'signal' | 'onProgress'> = {},
): Promise<PreflightedHtuFile[]> {
    if (inputs.length === 0) throw new HtuPreflightError('No HTU files were selected.', []);
    const files: PreflightedHtuFile[] = [];

    for (let index = 0; index < inputs.length; index += 1) {
        throwIfAborted(options.signal);
        const input = inputs[index];
        const sha256 = await sha256Hex(input.bytes);
        const sourceId = `source:htu:${sha256}`;
        let rows: HtuParsedRow[] = [];
        let errorCount = 0;
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
            const parsed = parseHtuTsv(text);
            rows = parsed.rows;
            errorCount = parsed.errors.length;
        } catch {
            errorCount = 1;
        }
        const retainedRows = rows.filter((row) => !isDataImageUrl(row.url));
        const ignoredVisits = rows.length - retainedRows.length;
        let minVisitTime: number | undefined;
        let maxVisitTime: number | undefined;
        for (const row of retainedRows) {
            minVisitTime = minVisitTime === undefined ? row.visitTime : Math.min(minVisitTime, row.visitTime);
            maxVisitTime = maxVisitTime === undefined ? row.visitTime : Math.max(maxVisitTime, row.visitTime);
        }
        const report: HtuFileReport = {
            sourceId,
            name: input.name,
            sha256,
            format: [...new Set(rows.map((row) => row.fileType))].sort(),
            inputRows: rows.length + errorCount,
            addedVisits: 0,
            duplicateVisits: 0,
            ignoredVisits,
            errorCount,
            minVisitTime,
            maxVisitTime,
        };
        files.push({ input, sourceId, rows: retainedRows, report });
        await options.onProgress?.({
            stage: 'preflight',
            files: inputs.length,
            processedFiles: index + 1,
            inputRows: files.reduce((total, file) => total + file.report.inputRows, 0),
            addedVisits: 0,
            duplicateVisits: 0,
            ignoredVisits: files.reduce((total, file) => total + file.report.ignoredVisits, 0),
        });
    }

    const failed = files.filter((file) => file.report.errorCount > 0);
    if (failed.length > 0) {
        throw new HtuPreflightError(
            `${failed.length} HTU file(s) failed preflight; no history data was changed.`,
            files.map((file) => file.report),
        );
    }
    return files;
}

export function mergeHtuFilesIntoChunks(options: {
    files: PreflightedHtuFile[];
    existingPageChunks?: PageChunkRecord[];
    existingVisitChunks?: VisitChunkRecord[];
    pageChunkSize?: number;
    visitChunkSize?: number;
}): HtuMergeResult {
    if ((options.existingPageChunks?.length ?? 0) === 0 && (options.existingVisitChunks?.length ?? 0) === 0) {
        return mergeHtuFilesIntoEmptyChunks(options);
    }
    const existingPages = (options.existingPageChunks ?? []).flatMap(decodePageChunkRows);
    const existingPageById = new Map(existingPages.map((page) => [page.id, page] as const));
    const pageByUrl = new Map(existingPages.map((page) => [page.url, page] as const));
    const visits = new Map<string, MergeVisit>();
    let maxSourceIndex = -1;

    for (const chunk of options.existingVisitChunks ?? []) {
        for (const row of decodeVisitChunkRows(chunk)) {
            const page = existingPageById.get(row.pageId);
            if (!page) continue;
            const title = chunk.titles?.[row.chunkIndex] ?? page.title;
            const visit: MergeVisit = {
                pageId: row.pageId,
                url: page.url,
                visitTime: row.visitTime,
                transition: row.transition,
                title,
                sourceIndex: row.sourceIndex,
                sourceKey: row.sourceKey,
                sourceIds: decodeVisitChunkSourceIds(chunk, row.chunkIndex),
            };
            visits.set(makeVisitKey(visit.url, visit.visitTime, visit.transition), visit);
            maxSourceIndex = Math.max(maxSourceIndex, row.sourceIndex);
        }
    }

    const reports = new Map<string, HtuFileReport>(options.files.map((file) => [file.sourceId, { ...file.report }]));
    const incoming = new Map<
        string,
        {
            url: string;
            visitTime: number;
            transition: string;
            title: string;
            firstSourceId: string;
            firstSourceCount: number;
            extraSourceCounts?: Map<string, number>;
        }
    >();

    for (const file of options.files) {
        for (const row of file.rows) {
            const key = makeVisitKey(row.url, row.visitTime, row.transition);
            const existing = visits.get(key);
            if (existing) {
                if (!existing.sourceIds.includes(file.sourceId)) existing.sourceIds.push(file.sourceId);
                existing.title = chooseTitle(existing.title, row.title ?? '');
                reports.get(file.sourceId)!.duplicateVisits += 1;
                continue;
            }
            const group = incoming.get(key) ?? {
                url: row.url,
                visitTime: row.visitTime,
                transition: row.transition,
                title: row.title ?? '',
                firstSourceId: file.sourceId,
                firstSourceCount: 0,
            };
            group.title = chooseTitle(group.title, row.title ?? '');
            if (file.sourceId === group.firstSourceId) {
                group.firstSourceCount += 1;
            } else {
                group.extraSourceCounts ??= new Map();
                group.extraSourceCounts.set(file.sourceId, (group.extraSourceCounts.get(file.sourceId) ?? 0) + 1);
            }
            incoming.set(key, group);
        }
    }

    const newUrls = [...new Set([...incoming.values()].map((visit) => visit.url))]
        .filter((url) => !pageByUrl.has(url))
        .sort();
    let nextPageId = existingPages.reduce((max, page) => Math.max(max, page.id), 0) + 1;
    for (const url of newUrls) {
        pageByUrl.set(url, {
            id: nextPageId++,
            url,
            normalizedUrl: url,
            title: '',
            visitCount: 0,
            lastVisitTime: 0,
            chunkId: '',
            chunkIndex: 0,
        });
    }

    const orderedNewVisits = [...incoming.values()].sort(compareIncomingVisits);
    for (const incomingVisit of orderedNewVisits) {
        const sourceIds = [incomingVisit.firstSourceId, ...(incomingVisit.extraSourceCounts?.keys() ?? [])].sort();
        const owner = sourceIds[0];
        for (const sourceId of sourceIds) {
            const occurrences =
                sourceId === incomingVisit.firstSourceId
                    ? incomingVisit.firstSourceCount
                    : (incomingVisit.extraSourceCounts?.get(sourceId) ?? 0);
            const report = reports.get(sourceId)!;
            if (sourceId === owner) {
                report.addedVisits += 1;
                report.duplicateVisits += Math.max(0, occurrences - 1);
            } else {
                report.duplicateVisits += occurrences;
            }
        }
        const page = pageByUrl.get(incomingVisit.url)!;
        maxSourceIndex += 1;
        const visit: MergeVisit = {
            pageId: page.id,
            url: incomingVisit.url,
            visitTime: incomingVisit.visitTime,
            transition: incomingVisit.transition,
            title: incomingVisit.title,
            sourceIndex: maxSourceIndex,
            sourceIds,
        };
        visits.set(makeVisitKey(visit.url, visit.visitTime, visit.transition), visit);
    }

    const visitRows = [...visits.values()].sort(
        (left, right) =>
            left.visitTime - right.visitTime || left.sourceIndex - right.sourceIndex || left.pageId - right.pageId,
    );
    const pageStats = new Map<number, { count: number; time: number; title: string }>();
    for (const visit of visitRows) {
        const stats = pageStats.get(visit.pageId);
        if (!stats) {
            pageStats.set(visit.pageId, { count: 1, time: visit.visitTime, title: visit.title });
        } else {
            stats.count += 1;
            if (visit.visitTime > stats.time) {
                stats.time = visit.visitTime;
                stats.title = visit.title;
            } else if (visit.visitTime === stats.time) {
                stats.title = chooseTitle(stats.title, visit.title);
            }
        }
    }

    const dirtyPages: HtuMergeResult['dirtyPages'] = [];
    const pageRows = [...pageByUrl.values()]
        .map((page) => {
            const stats = pageStats.get(page.id);
            const updated = {
                ...page,
                title: stats?.title || page.title,
                visitCount: stats?.count ?? page.visitCount,
                lastVisitTime: stats?.time ?? page.lastVisitTime,
            };
            const previous = existingPageById.get(page.id);
            if (!previous) dirtyPages.push({ pageId: page.id, reason: 'new-page' });
            else if (previous.title !== updated.title || previous.url !== updated.url) {
                dirtyPages.push({ pageId: page.id, reason: 'search-text-changed' });
            }
            return updated;
        })
        .sort((left, right) => left.id - right.id);
    const reportRows = [...reports.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    return {
        pageChunks: buildPageChunks(pageRows, options.pageChunkSize ?? DEFAULT_PAGE_CHUNK_SIZE),
        visitChunks: buildVisitChunks(visitRows, options.visitChunkSize ?? DEFAULT_VISIT_CHUNK_SIZE),
        dirtyPages,
        reports: reportRows,
        addedVisits: reportRows.reduce((total, report) => total + report.addedVisits, 0),
        duplicateVisits: reportRows.reduce((total, report) => total + report.duplicateVisits, 0),
        ignoredVisits: reportRows.reduce((total, report) => total + report.ignoredVisits, 0),
    };
}

function mergeHtuFilesIntoEmptyChunks(options: {
    files: PreflightedHtuFile[];
    pageChunkSize?: number;
    visitChunkSize?: number;
}): HtuMergeResult {
    const reports = new Map<string, HtuFileReport>(options.files.map((file) => [file.sourceId, { ...file.report }]));
    const rows = options.files.flatMap((file) =>
        file.rows.map((row) => ({
            sourceId: file.sourceId,
            url: row.url,
            visitTime: row.visitTime,
            transition: row.transition,
            title: row.title ?? '',
        })),
    );
    rows.sort(compareFlatImportRows);

    const compactVisits: Array<{
        url: string;
        visitTime: number;
        transition: string;
        title: string;
        sourceIds: string[];
    }> = [];
    for (let start = 0; start < rows.length; ) {
        let end = start + 1;
        let title = rows[start].title;
        while (
            end < rows.length &&
            rows[end].visitTime === rows[start].visitTime &&
            rows[end].url === rows[start].url &&
            rows[end].transition === rows[start].transition
        ) {
            title = chooseTitle(title, rows[end].title);
            end += 1;
        }
        const sourceCounts = new Map<string, number>();
        for (let index = start; index < end; index += 1) {
            sourceCounts.set(rows[index].sourceId, (sourceCounts.get(rows[index].sourceId) ?? 0) + 1);
        }
        const sourceIds = [...sourceCounts.keys()].sort(compareText);
        const owner = sourceIds[0];
        for (const sourceId of sourceIds) {
            const report = reports.get(sourceId)!;
            const count = sourceCounts.get(sourceId)!;
            if (sourceId === owner) {
                report.addedVisits += 1;
                report.duplicateVisits += count - 1;
            } else {
                report.duplicateVisits += count;
            }
        }
        compactVisits.push({
            url: rows[start].url,
            visitTime: rows[start].visitTime,
            transition: rows[start].transition,
            title,
            sourceIds,
        });
        start = end;
    }

    const urls = [...new Set(compactVisits.map((visit) => visit.url))].sort(compareText);
    const pageIds = new Map(urls.map((url, index) => [url, index + 1] as const));
    const visits: MergeVisit[] = compactVisits.map((visit, sourceIndex) => ({
        ...visit,
        pageId: pageIds.get(visit.url)!,
        sourceIndex,
    }));
    const pageStats = new Map<number, { count: number; time: number; title: string }>();
    for (const visit of visits) {
        const stats = pageStats.get(visit.pageId);
        if (!stats) {
            pageStats.set(visit.pageId, { count: 1, time: visit.visitTime, title: visit.title });
        } else {
            stats.count += 1;
            if (visit.visitTime > stats.time) {
                stats.time = visit.visitTime;
                stats.title = visit.title;
            } else if (visit.visitTime === stats.time) {
                stats.title = chooseTitle(stats.title, visit.title);
            }
        }
    }
    const pageRows = urls.map((url, index) => {
        const id = index + 1;
        const stats = pageStats.get(id)!;
        return {
            id,
            url,
            normalizedUrl: url,
            title: stats.title,
            visitCount: stats.count,
            lastVisitTime: stats.time,
        };
    });
    const reportRows = [...reports.values()].sort((left, right) => compareText(left.sourceId, right.sourceId));
    return {
        pageChunks: buildPageChunks(pageRows, options.pageChunkSize ?? DEFAULT_PAGE_CHUNK_SIZE),
        visitChunks: buildVisitChunks(visits, options.visitChunkSize ?? DEFAULT_VISIT_CHUNK_SIZE),
        // The first generation has no older search snapshot to replay; it always requires one full rebuild.
        dirtyPages: [],
        reports: reportRows,
        addedVisits: compactVisits.length,
        duplicateVisits: reportRows.reduce((total, report) => total + report.duplicateVisits, 0),
        ignoredVisits: reportRows.reduce((total, report) => total + report.ignoredVisits, 0),
    };
}

export async function importHtuFiles(
    inputs: HtuImportFileInput[],
    options: HtuMultiImportOptions = {},
): Promise<HtuMultiImportResult> {
    const batchId = options.batchId ?? `batch:htu:${crypto.randomUUID()}`;
    let batch: ImportBatchRecord | undefined;
    try {
        const files = await preflightHtuFiles(inputs, options);
        await yieldToEventLoop();
        throwIfAborted(options.signal);
        const [active, pageChunks, visitChunks] = await Promise.all([
            getActiveHistoryGeneration(),
            getPageChunks(),
            getVisitChunks(),
        ]);
        const merged = mergeHtuFilesIntoChunks({
            files,
            existingPageChunks: pageChunks,
            existingVisitChunks: visitChunks,
            pageChunkSize: options.pageChunkSize,
            visitChunkSize: options.visitChunkSize,
        });
        const inputRows = merged.reports.reduce((total, report) => total + report.inputRows, 0);
        await options.onProgress?.({
            stage: 'merge',
            files: files.length,
            processedFiles: files.length,
            inputRows,
            addedVisits: merged.addedVisits,
            duplicateVisits: merged.duplicateVisits,
            ignoredVisits: merged.ignoredVisits,
        });
        await yieldToEventLoop();
        throwIfAborted(options.signal);
        const now = Date.now();
        for (const file of files) {
            await putHistorySource({
                id: file.sourceId,
                kind: 'htu-file',
                label: file.input.name,
                fingerprint: file.report.sha256,
                createdAt: now,
                metadata: {
                    format: file.report.format,
                    inputRows: file.report.inputRows,
                    minVisitTime: file.report.minVisitTime,
                    maxVisitTime: file.report.maxVisitTime,
                },
            });
        }
        batch = {
            id: batchId,
            status: 'staging',
            sourceIds: files.map((file) => file.sourceId).sort(),
            createdAt: now,
            updatedAt: now,
            inputRows,
            addedVisits: merged.addedVisits,
            duplicateVisits: merged.duplicateVisits,
            ignoredVisits: merged.ignoredVisits,
            errorCount: 0,
            files: merged.reports,
        };
        await putImportBatch(batch);
        await options.onProgress?.({
            stage: 'publish',
            files: files.length,
            processedFiles: files.length,
            inputRows,
            addedVisits: merged.addedVisits,
            duplicateVisits: merged.duplicateVisits,
            ignoredVisits: merged.ignoredVisits,
        });
        throwIfAborted(options.signal);
        const generation = await publishHistoryGeneration({
            pageChunks: merged.pageChunks,
            visitChunks: merged.visitChunks,
            reason: 'htu-import',
            parentGenerationId: active?.id,
            sourceIds: [...new Set([...(active?.sourceIds ?? []), ...batch.sourceIds])].sort(),
            importBatchId: batchId,
            dirtyPages: merged.dirtyPages,
            signal: options.signal,
            beforeActivate: options.beforeActivate,
        });
        batch = { ...batch, status: 'complete', updatedAt: Date.now(), generationId: generation.id };
        await putImportBatch(batch);
        const result: HtuMultiImportResult = {
            stage: 'done',
            files: files.length,
            processedFiles: files.length,
            inputRows,
            addedVisits: merged.addedVisits,
            duplicateVisits: merged.duplicateVisits,
            ignoredVisits: merged.ignoredVisits,
            batchId,
            generationId: generation.id,
            pages: generation.pageCount,
            visits: generation.visitCount,
            reports: merged.reports,
        };
        await options.onProgress?.(result);
        return result;
    } catch (error) {
        if (!batch && error instanceof HtuPreflightError) {
            const reports = error.reports;
            const now = Date.now();
            batch = {
                id: batchId,
                status: 'failed',
                sourceIds: [...new Set(reports.map((report) => report.sourceId))].sort(),
                createdAt: now,
                updatedAt: now,
                inputRows: reports.reduce((total, report) => total + report.inputRows, 0),
                addedVisits: 0,
                duplicateVisits: 0,
                ignoredVisits: reports.reduce((total, report) => total + report.ignoredVisits, 0),
                errorCount: reports.reduce((total, report) => total + report.errorCount, 0),
                files: reports,
            };
            await putImportBatch(batch);
            throw error;
        }
        if (batch) {
            await putImportBatch({
                ...batch,
                status: isAbortError(error) ? 'cancelled' : 'failed',
                updatedAt: Date.now(),
                errorCount: batch.errorCount + (isAbortError(error) ? 0 : 1),
            });
        }
        throw error;
    }
}

type MergeVisit = {
    pageId: number;
    url: string;
    visitTime: number;
    transition: string;
    title: string;
    sourceIndex: number;
    sourceKey?: string;
    sourceIds: string[];
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function makeVisitKey(url: string, visitTime: number, transition: string): string {
    return `${url}\t${visitTime}\t${transition}`;
}

function chooseTitle(left: string, right: string): string {
    if (!left) return right;
    if (!right) return left;
    return left.localeCompare(right) >= 0 ? left : right;
}

function compareIncomingVisits(
    left: { visitTime: number; url: string; transition: string },
    right: { visitTime: number; url: string; transition: string },
): number {
    return (
        left.visitTime - right.visitTime ||
        left.url.localeCompare(right.url) ||
        left.transition.localeCompare(right.transition)
    );
}

function compareFlatImportRows(
    left: { visitTime: number; url: string; transition: string; sourceId: string; title: string },
    right: { visitTime: number; url: string; transition: string; sourceId: string; title: string },
): number {
    return (
        left.visitTime - right.visitTime ||
        compareText(left.url, right.url) ||
        compareText(left.transition, right.transition) ||
        compareText(left.sourceId, right.sourceId) ||
        compareText(left.title, right.title)
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function buildPageChunks(
    rows: Array<{
        id: number;
        url: string;
        normalizedUrl: string;
        title: string;
        visitCount: number;
        lastVisitTime: number;
    }>,
    chunkSize: number,
): PageChunkRecord[] {
    const chunks: PageChunkRecord[] = [];
    for (let start = 0; start < rows.length; start += normalizeChunkSize(chunkSize)) {
        const chunkRows = rows.slice(start, start + normalizeChunkSize(chunkSize));
        chunks.push({
            id: `page-chunk:${chunks.length}`,
            firstPageId: chunkRows[0]?.id ?? 1,
            count: chunkRows.length,
            urls: chunkRows.map((row) => row.url),
            normalizedUrls: chunkRows.map((row) => row.normalizedUrl),
            titles: chunkRows.map((row) => row.title),
            visitCounts: new Uint32Array(chunkRows.map((row) => row.visitCount)),
            lastVisitTimes: new Float64Array(chunkRows.map((row) => row.lastVisitTime)),
        });
    }
    return chunks;
}

function buildVisitChunks(rows: MergeVisit[], chunkSize: number): VisitChunkRecord[] {
    const chunks: VisitChunkRecord[] = [];
    for (let start = 0; start < rows.length; start += normalizeChunkSize(chunkSize)) {
        const chunkRows = rows.slice(start, start + normalizeChunkSize(chunkSize));
        const sourceIds = [...new Set(chunkRows.flatMap((row) => row.sourceIds))].sort();
        const sourceIdIndexes = new Map(sourceIds.map((sourceId, index) => [sourceId, index] as const));
        const sourceRefOffsets = new Uint32Array(chunkRows.length + 1);
        const sourceRefs: number[] = [];
        chunkRows.forEach((row, index) => {
            sourceRefOffsets[index] = sourceRefs.length;
            for (const sourceId of row.sourceIds.sort()) {
                sourceRefs.push(sourceIdIndexes.get(sourceId)!);
            }
        });
        sourceRefOffsets[chunkRows.length] = sourceRefs.length;
        chunks.push({
            id: `visit-chunk:${chunks.length}`,
            minVisitTime: chunkRows[0]?.visitTime ?? 0,
            maxVisitTime: chunkRows.at(-1)?.visitTime ?? 0,
            count: chunkRows.length,
            pageIds: new Uint32Array(chunkRows.map((row) => row.pageId)),
            visitTimes: new Float64Array(chunkRows.map((row) => row.visitTime)),
            transitionCodes: new Uint8Array(chunkRows.map((row) => encodeTransition(row.transition))),
            sourceIndexes: new Uint32Array(chunkRows.map((row) => row.sourceIndex)),
            titles: chunkRows.map((row) => row.title),
            sourceKeys: chunkRows.map((row) => row.sourceKey ?? ''),
            sourceIds,
            sourceRefOffsets,
            sourceRefs: new Uint32Array(sourceRefs),
        });
    }
    return chunks;
}

function encodeTransition(transition: string): number {
    const transitions = [
        'link',
        'typed',
        'auto_bookmark',
        'auto_subframe',
        'manual_subframe',
        'generated',
        'auto_toplevel',
        'form_submit',
        'reload',
        'keyword',
        'keyword_generated',
    ];
    const code = transitions.indexOf(transition);
    return code >= 0 ? code : 255;
}

function normalizeChunkSize(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_VISIT_CHUNK_SIZE;
}

function isDataImageUrl(url: string): boolean {
    return url.trimStart().toLowerCase().startsWith('data:image/');
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
