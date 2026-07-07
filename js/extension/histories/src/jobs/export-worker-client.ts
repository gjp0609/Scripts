export type ExportWorkerClientOptions = {
  workerFactory?: () => Worker;
};

export type ExportWorkerJobUpdate = {
  type: 'job-update';
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  progress?: unknown;
  error?: string;
  filename?: string;
  text?: string;
};

export class ExportWorkerClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<(update: ExportWorkerJobUpdate) => void>();

  constructor(options: ExportWorkerClientOptions = {}) {
    this.worker = (options.workerFactory ?? defaultExportWorkerFactory)();
    this.worker.addEventListener('message', (event: MessageEvent<ExportWorkerJobUpdate>) => {
      this.listeners.forEach((listener) => listener(event.data));
    });
  }

  startJob(): string {
    const jobId = crypto.randomUUID();
    this.worker.postMessage({
      type: 'start',
      jobId
    });
    return jobId;
  }

  cancelJob(jobId: string): void {
    this.worker.postMessage({
      type: 'cancel',
      jobId
    });
  }

  subscribe(listener: (update: ExportWorkerJobUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}

function defaultExportWorkerFactory(): Worker {
  return new Worker(new URL('./export-worker.ts', import.meta.url), {
    type: 'module'
  });
}
