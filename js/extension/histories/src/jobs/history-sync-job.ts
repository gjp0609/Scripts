import {
    decodePageChunkRows,
    decodeVisitChunkSourceIds,
    claimJob,
    getActiveHistoryGeneration,
    getOrCreateBrowserHistorySource,
    getJob,
    getPageChunks,
    getVisitChunks,
    listJobs,
    putJob,
    publishHistoryGeneration,
} from '../storage/database';
import type { JobRecord } from '../storage/schema';
import type {
    BrowserHistoryItem,
    BrowserHistoryReader,
    ExistingChunkVisitRow,
    HistorySyncProgress,
} from '../sync/history-sync';
import { collectBrowserHistorySyncPlan, mergeHistorySyncPlanIntoChunks } from '../sync/history-sync';

export type StartHistorySyncJobOptions = {
    jobId: string;
    history: BrowserHistoryReader;
    signal?: AbortSignal;
    mode?: 'full' | 'incremental';
    beforeActivate?: (generationId: string) => void | Promise<void>;
    items?: BrowserHistoryItem[];
    startTimeOverride?: number;
    frequentVisitThresholdMs?: number;
};

export async function runHistorySyncJob(options: StartHistorySyncJobOptions): Promise<void> {
    const startedAt = Date.now();
    const ownerId = `history-sync:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    const startTime = options.startTimeOverride ?? (options.mode === 'full' ? 0 : await resolveHistorySyncStartTime());
    const source = await getOrCreateBrowserHistorySource(detectBrowser());
    const sourceInstanceId = String(source.metadata?.instanceId ?? source.id);

    await putJob({
        id: options.jobId,
        type: 'history-sync',
        status: 'queued',
        updatedAt: startedAt,
        cursor: {
            mode: options.mode ?? 'incremental',
            startTime,
        },
        progress: {
            stage: 'queued',
            items: 0,
            pages: 0,
            visits: 0,
            writtenPages: 0,
            writtenVisits: 0,
            maxVisitTime: 0,
        },
        resumable: true,
        retryCount: 0,
    });

    try {
        const claimed = await claimJob(options.jobId, ownerId);
        if (!claimed) throw new Error(`History sync job could not be claimed: ${options.jobId}`);

        const plan = await collectBrowserHistorySyncPlan({
            history: options.history,
            items: options.items,
            sourceInstanceId,
            startTime,
            signal: options.signal,
            onProgress(progress) {
                return updateProgress(
                    options.jobId,
                    ownerId,
                    startedAt,
                    options.mode ?? 'incremental',
                    startTime,
                    progress,
                );
            },
        });

        const result = await syncChunkBackedHistory({
            plan,
            signal: options.signal,
            sourceId: source.id,
            frequentVisitThresholdMs: options.frequentVisitThresholdMs,
            beforeActivate: options.beforeActivate,
            onProgress(progress) {
                return updateProgress(
                    options.jobId,
                    ownerId,
                    startedAt,
                    options.mode ?? 'incremental',
                    startTime,
                    progress,
                );
            },
        });

        await putJob({
            id: options.jobId,
            type: 'history-sync',
            status: 'complete',
            startedAt,
            updatedAt: Date.now(),
            cursor: {
                mode: options.mode ?? 'incremental',
                startTime,
                nextStartTime: result.nextStartTime,
            },
            progress: result,
        });
    } catch (error) {
        const status = isAbortError(error) ? 'cancelled' : 'failed';
        const previous = await getJob(options.jobId);
        await putJob({
            id: options.jobId,
            type: 'history-sync',
            status,
            startedAt,
            updatedAt: Date.now(),
            cursor: previous?.cursor,
            progress: previous?.progress,
            error: status === 'failed' ? toErrorMessage(error) : undefined,
        });
        throw error;
    }
}

async function resolveHistorySyncStartTime(): Promise<number> {
    const jobs = await listJobs(50);
    const latest = jobs.find((job) => job.type === 'history-sync' && job.status === 'complete');
    const nextStartTime = Number((latest?.cursor as { nextStartTime?: number } | undefined)?.nextStartTime);
    return Number.isFinite(nextStartTime) ? Math.max(0, nextStartTime - 5_000) : 0;
}

async function updateProgress(
    jobId: string,
    ownerId: string,
    startedAt: number,
    mode: 'full' | 'incremental',
    startTime: number,
    progress: HistorySyncProgress,
): Promise<void> {
    const job: JobRecord = {
        id: jobId,
        type: 'history-sync',
        status: 'running',
        startedAt,
        updatedAt: Date.now(),
        cursor: {
            mode,
            startTime,
        },
        progress,
        ownerId,
        leaseUntil: Date.now() + 30_000,
        resumable: true,
    };
    await putJob(job);
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function syncChunkBackedHistory(options: {
    plan: Awaited<ReturnType<typeof collectBrowserHistorySyncPlan>>;
    signal?: AbortSignal;
    sourceId: string;
    frequentVisitThresholdMs?: number;
    beforeActivate?: (generationId: string) => void | Promise<void>;
    onProgress?: (progress: HistorySyncProgress) => void | Promise<void>;
}) {
    const pageChunks = await getPageChunks();
    const visitChunks = await getVisitChunks();
    const pageRows = pageChunks.flatMap((chunk) => decodePageChunkRows(chunk));
    const pageById = new Map(pageRows.map((page) => [page.id, page]));
    const visitRows: ExistingChunkVisitRow[] = [];

    for (const chunk of visitChunks) {
        for (let index = 0; index < chunk.count; index += 1) {
            const pageId = chunk.pageIds[index];
            const page = pageById.get(pageId);
            if (!page) continue;
            visitRows.push({
                id: `chunk:${pageId}:${chunk.visitTimes[index]}:${chunk.transitionCodes[index]}:${chunk.sourceIndexes[index]}`,
                pageId,
                normalizedUrl: page.normalizedUrl,
                visitTime: chunk.visitTimes[index],
                transition: decodeTransition(chunk.transitionCodes[index]),
                title: chunk.titles?.[index] ?? page.title ?? '',
                sourceKey: chunk.sourceKeys?.[index],
                sourceIds: decodeVisitChunkSourceIds(chunk, index),
                sourceIndex: chunk.sourceIndexes[index],
                chunkId: chunk.id,
                chunkIndex: index,
            });
        }
    }

    const merged = await mergeHistorySyncPlanIntoChunks({
        plan: options.plan,
        existingPages: pageRows,
        existingVisits: visitRows,
        sourceId: options.sourceId,
        frequentVisitThresholdMs: options.frequentVisitThresholdMs,
        signal: options.signal,
        onProgress: options.onProgress,
    });
    const parentGenerationId = (await getActiveHistoryGeneration())?.id;
    await publishHistoryGeneration({
        pageChunks: merged.pageChunks,
        visitChunks: merged.visitChunks,
        reason: 'browser-sync',
        parentGenerationId,
        sourceIds: [options.sourceId],
        dirtyPages: merged.dirtyPages,
        signal: options.signal,
        beforeActivate: options.beforeActivate,
    });
    return merged;
}

function detectBrowser(): 'chromium' | 'firefox' | 'unknown' {
    const userAgent = globalThis.navigator?.userAgent?.toLowerCase() ?? '';
    if (userAgent.includes('firefox')) return 'firefox';
    if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) {
        return 'chromium';
    }
    return 'unknown';
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
