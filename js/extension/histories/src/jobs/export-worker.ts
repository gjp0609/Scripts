import { exportHtuArchivedTsv, makeHtuBackupFilename, type HtuExportProgress } from '../export/htu-export';
import { getJob, putJob } from '../storage/database';
import type { JobRecord } from '../storage/schema';

type StartExportMessage = {
  type: 'start';
  jobId: string;
};

type CancelExportMessage = {
  type: 'cancel';
  jobId: string;
};

type ExportWorkerMessage = StartExportMessage | CancelExportMessage;

const activeJobs = new Map<string, AbortController>();

self.addEventListener('message', (event: MessageEvent<ExportWorkerMessage>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: ExportWorkerMessage): Promise<void> {
  if (message.type === 'start') {
    await startExportJob(message);
    return;
  }

  if (message.type === 'cancel') {
    activeJobs.get(message.jobId)?.abort();
  }
}

async function startExportJob(message: StartExportMessage): Promise<void> {
  if (activeJobs.has(message.jobId)) return;

  const controller = new AbortController();
  activeJobs.set(message.jobId, controller);
  const startedAt = Date.now();

  await putJob({
    id: message.jobId,
    type: 'htu-export',
    status: 'queued',
    updatedAt: startedAt,
    progress: {
      stage: 'queued',
      pages: 0,
      visits: 0,
      writtenRows: 0,
      bytes: 0
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
      type: 'htu-export',
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      progress: {
        stage: 'starting',
        pages: 0,
        visits: 0,
        writtenRows: 0,
        bytes: 0
      }
    });

    const { text, progress } = await exportHtuArchivedTsv({
      signal: controller.signal,
      onProgress(nextProgress) {
        return updateProgress(message.jobId, startedAt, nextProgress);
      }
    });
    const filename = makeHtuBackupFilename();
    const completedAt = Date.now();

    await putJob({
      id: message.jobId,
      type: 'htu-export',
      status: 'complete',
      startedAt,
      updatedAt: completedAt,
      progress: {
        ...progress,
        stage: 'done'
      }
    });
    postMessage({
      type: 'job-update',
      jobId: message.jobId,
      status: 'complete',
      progress: {
        ...progress,
        stage: 'done'
      },
      filename,
      text
    });
  } catch (error) {
    const updatedAt = Date.now();
    const status = isAbortError(error) ? 'cancelled' : 'failed';
    const progress = (await getJob(message.jobId))?.progress;
    await putJob({
      id: message.jobId,
      type: 'htu-export',
      status,
      startedAt,
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
  progress: HtuExportProgress
): Promise<void> {
  const job: JobRecord = {
    id: jobId,
    type: 'htu-export',
    status: 'running',
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
