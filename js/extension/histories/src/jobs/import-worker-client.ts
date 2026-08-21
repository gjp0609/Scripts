export type ImportWorkerClientOptions = {
    workerFactory: () => Worker;
};

export type StartImportJobOptions = {
    text?: string;
    files?: Array<{ name: string; bytes: Uint8Array }>;
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

    constructor(options: ImportWorkerClientOptions) {
        this.worker = options.workerFactory();
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
            files: options.files,
            pageChunkSize: options.pageChunkSize,
            visitChunkSize: options.visitChunkSize,
        });
        return jobId;
    }

    cancelJob(jobId: string): void {
        this.worker.postMessage({
            type: 'cancel',
            jobId,
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
