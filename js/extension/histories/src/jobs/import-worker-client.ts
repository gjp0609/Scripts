export type ImportWorkerClientOptions = {
  workerFactory?: () => Worker;
};

export type StartImportJobOptions = {
  text: string;
  pageChunkSize?: number;
  visitChunkSize?: number;
};

export type ImportWorkerJobUpdate = {
  type: 'job-update';
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  progress?: unknown;
  error?: string;
};

export class ImportWorkerClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<(update: ImportWorkerJobUpdate) => void>();

  constructor(options: ImportWorkerClientOptions = {}) {
    this.worker = (options.workerFactory ?? defaultImportWorkerFactory)();
    this.worker.addEventListener('message', (event: MessageEvent<ImportWorkerJobUpdate>) => {
      this.listeners.forEach((listener) => listener(event.data));
    });
  }

  startJob(options: StartImportJobOptions): string {
    const jobId = crypto.randomUUID();
    this.worker.postMessage({
      type: 'start',
      jobId,
      text: options.text,
      pageChunkSize: options.pageChunkSize,
      visitChunkSize: options.visitChunkSize
    });
    return jobId;
  }

  cancelJob(jobId: string): void {
    this.worker.postMessage({
      type: 'cancel',
      jobId
    });
  }

  subscribe(listener: (update: ImportWorkerJobUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}

function defaultImportWorkerFactory(): Worker {
  return new Worker(new URL('./import-worker.ts', import.meta.url), {
    type: 'module'
  });
}
