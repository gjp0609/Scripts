import {
  decodePageChunkRows,
  getDatabaseSummary,
  getJob,
  getPageChunks,
  getVisitChunks,
  listJobs,
  putJob,
  putVisits,
  replacePageChunks,
  replaceVisitChunks,
  upsertPages
} from '../storage/database';
import type { JobRecord } from '../storage/schema';
import type {
  BrowserHistoryReader,
  ExistingChunkVisitRow,
  HistorySyncProgress
} from '../sync/history-sync';
import {
  collectBrowserHistorySyncPlan,
  mergeHistorySyncPlanIntoChunks,
  storeBrowserHistorySyncPlan
} from '../sync/history-sync';

export type StartHistorySyncJobOptions = {
  jobId: string;
  history: BrowserHistoryReader;
  signal?: AbortSignal;
  mode?: 'full' | 'incremental';
};

export async function runHistorySyncJob(options: StartHistorySyncJobOptions): Promise<void> {
  const startedAt = Date.now();
  const startTime = options.mode === 'full' ? 0 : await resolveHistorySyncStartTime();
  const summary = await getDatabaseSummary();
  const useChunkMerge = summary.pageChunks > 0 || summary.visitChunks > 0;

  await putJob({
    id: options.jobId,
    type: 'history-sync',
    status: 'queued',
    updatedAt: startedAt,
    cursor: {
      mode: options.mode ?? 'incremental',
      startTime
    },
    progress: {
      stage: 'queued',
      items: 0,
      pages: 0,
      visits: 0,
      writtenPages: 0,
      writtenVisits: 0,
      maxVisitTime: 0
    }
  });

  try {
    await putJob({
      id: options.jobId,
      type: 'history-sync',
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      cursor: {
        mode: options.mode ?? 'incremental',
        startTime
      },
      progress: {
        stage: 'starting',
        items: 0,
        pages: 0,
        visits: 0,
        writtenPages: 0,
        writtenVisits: 0,
        maxVisitTime: 0
      }
    });

    const plan = await collectBrowserHistorySyncPlan({
      history: options.history,
      startTime,
      signal: options.signal,
      onProgress(progress) {
        return updateProgress(options.jobId, startedAt, options.mode ?? 'incremental', startTime, progress);
      }
    });

    const result = useChunkMerge
      ? await syncChunkBackedHistory({
          plan,
          signal: options.signal,
          onProgress(progress) {
            return updateProgress(options.jobId, startedAt, options.mode ?? 'incremental', startTime, progress);
          }
        })
      : await storeBrowserHistorySyncPlan(
          {
            storage: {
              upsertPages,
              putVisits
            },
            signal: options.signal,
            onProgress(progress) {
              return updateProgress(
                options.jobId,
                startedAt,
                options.mode ?? 'incremental',
                startTime,
                progress
              );
            }
          },
          plan
        );

    await putJob({
      id: options.jobId,
      type: 'history-sync',
      status: 'complete',
      startedAt,
      updatedAt: Date.now(),
      cursor: {
        mode: options.mode ?? 'incremental',
        startTime,
        nextStartTime: result.nextStartTime
      },
      progress: result
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
      error: status === 'failed' ? toErrorMessage(error) : undefined
    });
    throw error;
  }
}

async function resolveHistorySyncStartTime(): Promise<number> {
  const jobs = await listJobs(50);
  const latest = jobs.find((job) => job.type === 'history-sync' && job.status === 'complete');
  const nextStartTime = Number((latest?.cursor as { nextStartTime?: number } | undefined)?.nextStartTime);
  return Number.isFinite(nextStartTime) ? nextStartTime : 0;
}

async function updateProgress(
  jobId: string,
  startedAt: number,
  mode: 'full' | 'incremental',
  startTime: number,
  progress: HistorySyncProgress
): Promise<void> {
  const job: JobRecord = {
    id: jobId,
    type: 'history-sync',
    status: progress.stage === 'done' ? 'complete' : 'running',
    startedAt,
    updatedAt: Date.now(),
    cursor: {
      mode,
      startTime,
      nextStartTime: progress.maxVisitTime > 0 ? progress.maxVisitTime + 1 : startTime
    },
    progress
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
        sourceIndex: chunk.sourceIndexes[index],
        chunkId: chunk.id,
        chunkIndex: index
      });
    }
  }

  const merged = await mergeHistorySyncPlanIntoChunks({
    plan: options.plan,
    existingPages: pageRows,
    existingVisits: visitRows,
    signal: options.signal,
    onProgress: options.onProgress
  });
  await replacePageChunks(merged.pageChunks);
  await replaceVisitChunks(merged.visitChunks);
  return merged;
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
