import { importHtuText, type HtuImportProgress } from '../import/htu-import';
import { getJob, putJob } from '../storage/database';
import type { JobRecord } from '../storage/schema';

type StartImportMessage = {
  type: 'start';
  jobId: string;
  text: string;
  pageChunkSize?: number;
  visitChunkSize?: number;
};

type CancelImportMessage = {
  type: 'cancel';
  jobId: string;
};

type ImportWorkerMessage = StartImportMessage | CancelImportMessage;

const activeJobs = new Map<string, AbortController>();

self.addEventListener('message', (event: MessageEvent<ImportWorkerMessage>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: ImportWorkerMessage): Promise<void> {
  if (message.type === 'start') {
    await startImportJob(message);
    return;
  }

  if (message.type === 'cancel') {
    activeJobs.get(message.jobId)?.abort();
  }
}

async function startImportJob(message: StartImportMessage): Promise<void> {
  const existing = activeJobs.get(message.jobId);
  if (existing) return;

  const controller = new AbortController();
  activeJobs.set(message.jobId, controller);
  const queuedAt = Date.now();

  await putJob({
    id: message.jobId,
    type: 'htu-import',
    status: 'queued',
    updatedAt: queuedAt,
    progress: {
      stage: 'queued',
      rows: 0,
      pages: 0,
      visits: 0,
      writtenPages: 0,
      writtenVisits: 0
    }
  });
  postMessage({
    type: 'job-update',
    jobId: message.jobId,
    status: 'queued'
  });

  try {
    await putJob({
      id: message.jobId,
      type: 'htu-import',
      status: 'running',
      startedAt: queuedAt,
      updatedAt: queuedAt,
      progress: {
        stage: 'starting',
        rows: 0,
        pages: 0,
        visits: 0,
        writtenPages: 0,
        writtenVisits: 0
      }
    });

    const result = await importHtuText(message.text, {
      signal: controller.signal,
      pageChunkSize: message.pageChunkSize,
      visitChunkSize: message.visitChunkSize,
      onProgress(progress) {
        return updateProgress(message.jobId, queuedAt, progress);
      }
    });

    const completedAt = Date.now();
    await putJob({
      id: message.jobId,
      type: 'htu-import',
      status: 'complete',
      startedAt: queuedAt,
      updatedAt: completedAt,
      progress: result
    });
    postMessage({
      type: 'job-update',
      jobId: message.jobId,
      status: 'complete',
      progress: result
    });
  } catch (error) {
    const updatedAt = Date.now();
    const status = isAbortError(error) ? 'cancelled' : 'failed';
    const progress = (await getJob(message.jobId))?.progress;
    await putJob({
      id: message.jobId,
      type: 'htu-import',
      status,
      startedAt: queuedAt,
      updatedAt,
      progress,
      error: status === 'failed' ? toErrorMessage(error) : undefined
    });
    postMessage({
      type: 'job-update',
      jobId: message.jobId,
      status,
      error: status === 'failed' ? toErrorMessage(error) : undefined
    });
  } finally {
    activeJobs.delete(message.jobId);
  }
}

async function updateProgress(
  jobId: string,
  startedAt: number,
  progress: HtuImportProgress
): Promise<void> {
  const job: JobRecord = {
    id: jobId,
    type: 'htu-import',
    status: progress.stage === 'done' ? 'complete' : 'running',
    startedAt,
    updatedAt: Date.now(),
    progress
  };
  await putJob(job);
  postMessage({
    type: 'job-update',
    jobId,
    status: job.status,
    progress
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
