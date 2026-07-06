import { SearchEngine } from '../search/search-engine';
import { createIndexedDbSearchStorage } from '../search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../search/sqlite-wasm-runtime';
import { putJob } from '../storage/database';
import type { JobRecord } from '../storage/schema';

export type SearchRebuildJobOptions = {
  jobId: string;
  signal?: AbortSignal;
  scriptUrl?: string;
};

export async function runSearchRebuildJob(options: SearchRebuildJobOptions): Promise<void> {
  const startedAt = Date.now();
  await putJob({
    id: options.jobId,
    type: 'search-rebuild',
    status: 'queued',
    updatedAt: startedAt,
    progress: {
      stage: 'queued',
      pages: 0,
      writtenPages: 0
    }
  });

  try {
    const runtime = await loadSqliteWasmSearchRuntime({
      scriptUrl: options.scriptUrl
    });
    const storage = createIndexedDbSearchStorage();
    const engine = new SearchEngine({
      runtime,
      storage,
      signal: options.signal,
      onProgress(progress) {
        return putJob({
          id: options.jobId,
          type: 'search-rebuild',
          status: progress.stage === 'done' ? 'complete' : 'running',
          startedAt,
          updatedAt: Date.now(),
          progress
        });
      }
    });

    try {
      const result = await engine.rebuildSnapshot();
      await putJob({
        id: options.jobId,
        type: 'search-rebuild',
        status: 'complete',
        startedAt,
        updatedAt: Date.now(),
        progress: result
      });
    } finally {
      engine.close();
    }
  } catch (error) {
    const status = isAbortError(error) ? 'cancelled' : 'failed';
    const failedJob: JobRecord = {
      id: options.jobId,
      type: 'search-rebuild',
      status,
      startedAt,
      updatedAt: Date.now(),
      error: status === 'failed' ? toErrorMessage(error) : undefined
    };
    await putJob(failedJob);
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
