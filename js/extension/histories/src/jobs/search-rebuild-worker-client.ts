export type SearchRebuildWorkerClientOptions = {
  workerFactory?: () => Worker;
};

export type SearchRebuildWorkerJobUpdate = {
  type: 'job-update';
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  progress?: unknown;
  error?: string;
};

export class SearchRebuildWorkerClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<(update: SearchRebuildWorkerJobUpdate) => void>();

  constructor(options: SearchRebuildWorkerClientOptions = {}) {
    this.worker = (options.workerFactory ?? defaultSearchRebuildWorkerFactory)();
    this.worker.addEventListener('message', (event: MessageEvent<SearchRebuildWorkerJobUpdate>) => {
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

  subscribe(listener: (update: SearchRebuildWorkerJobUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}

function defaultSearchRebuildWorkerFactory(): Worker {
  return new Worker(new URL('/search-rebuild-worker.js?sqlite3.dir=/sqlite', location.href), {
    type: 'classic'
  });
}
