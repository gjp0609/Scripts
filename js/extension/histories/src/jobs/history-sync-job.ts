import { getJob, listJobs, putJob, putVisits, upsertPages } from '../storage/database';
import type { JobRecord } from '../storage/schema';
import type { BrowserHistoryReader, HistorySyncProgress } from '../sync/history-sync';
import { syncBrowserHistory } from '../sync/history-sync';

export type StartHistorySyncJobOptions = {
  jobId: string;
  history: BrowserHistoryReader;
  signal?: AbortSignal;
  mode?: 'full' | 'incremental';
};

export async function runHistorySyncJob(options: StartHistorySyncJobOptions): Promise<void> {
  const startedAt = Date.now();
  const startTime = options.mode === 'full' ? 0 : await resolveHistorySyncStartTime();

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

    const result = await syncBrowserHistory({
      history: options.history,
      storage: {
        upsertPages,
        putVisits
      },
      startTime,
      signal: options.signal,
      onProgress(progress) {
        return updateProgress(options.jobId, startedAt, options.mode ?? 'incremental', startTime, progress);
      }
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
