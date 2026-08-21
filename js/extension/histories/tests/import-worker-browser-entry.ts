import { ImportWorkerClient } from '../src/jobs/import-worker-client';
import { getJob, getDatabaseSummary, getImportBatch } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type ImportWorkerBrowserResult = {
    jobStatus: string;
    updates: string[];
    pages: number;
    visits: number;
    secondAddedVisits: number;
    failedStatus: string;
    failedReportCount: number;
    cancelledStatus: string;
};

declare global {
    interface Window {
        runHistoriesImportWorkerBrowserSmoke: () => Promise<ImportWorkerBrowserResult>;
    }
}

window.runHistoriesImportWorkerBrowserSmoke = async () => {
    await deleteDatabase(DATABASE_NAME);
    const client = new ImportWorkerClient({
        workerFactory: () =>
            new Worker(new URL('/src/jobs/import-worker.js', location.href), {
                type: 'module',
            }),
    });
    const updates: string[] = [];
    const encoder = new TextEncoder();
    const files = [
        {
            name: 'browser-a.tsv',
            bytes: encoder.encode(
                ['https://example.com/common\tU1000\t0\tCommon', 'https://example.com/a\tU2000\t1\tA', ''].join('\r\n'),
            ),
        },
        {
            name: 'browser-b.tsv',
            bytes: encoder.encode(
                [
                    'https://example.com/common\tU1000\t0\tCommon B',
                    'https://example.org/other\tU3000\t8\tOther',
                    '',
                ].join('\r\n'),
            ),
        },
    ];

    try {
        const firstComplete = new Promise<string>((resolve, reject) => {
            const unsubscribe = client.subscribe((update) => {
                updates.push(update.status);
                if (update.status === 'complete' || update.status === 'cancelled') {
                    unsubscribe();
                    resolve(update.status);
                } else if (update.status === 'failed') {
                    unsubscribe();
                    reject(new Error(update.error ?? 'worker import failed'));
                }
            });
        });

        const jobId = client.startJob({
            files,
            pageChunkSize: 1,
            visitChunkSize: 2,
        });

        const finalStatus = await firstComplete;
        const summary = await getDatabaseSummary();
        const job = await getJob(jobId);

        ensure(job?.status === 'complete', 'job record should be marked complete');
        ensure(finalStatus === 'complete', 'worker should report completion');
        ensure(summary.pages === 3, 'worker import should merge pages from both files');
        ensure(summary.visits === 3, 'worker import should write visits');

        const secondUpdate = await waitForJob(client, () =>
            client.startJob({ files, pageChunkSize: 1, visitChunkSize: 2 }),
        );
        const secondBatch = await getImportBatch(secondUpdate.jobId);
        ensure(secondUpdate.status === 'complete', 'repeated multi-file import should complete');
        ensure(secondBatch?.addedVisits === 0, 'repeated multi-file import should add no visits');
        ensure((await getDatabaseSummary()).visits === 3, 'repeated import should preserve visit count');

        const failedUpdate = await waitForJob(client, () =>
            client.startJob({
                files: [...files, { name: 'broken.tsv', bytes: encoder.encode('broken') }],
            }),
        );
        ensure(failedUpdate.status === 'failed', 'bad file should fail the entire worker batch');
        const failedBatch = await getImportBatch(failedUpdate.jobId);
        ensure(failedBatch?.files?.length === 3, 'failed preflight should persist file reports');
        ensure((await getDatabaseSummary()).visits === 3, 'failed preflight must not change history');

        const cancelledUpdate = await waitForCancelledJob(client, files);
        ensure(cancelledUpdate.status === 'cancelled', 'cancelled multi-file import should report cancellation');
        ensure((await getDatabaseSummary()).visits === 3, 'cancel before publish must not change history');

        return {
            jobStatus: job.status,
            updates,
            pages: summary.pages,
            visits: summary.visits,
            secondAddedVisits: secondBatch.addedVisits,
            failedStatus: failedUpdate.status,
            failedReportCount: failedBatch.files.length,
            cancelledStatus: cancelledUpdate.status,
        };
    } finally {
        client.terminate();
    }
};

function waitForJob(client: ImportWorkerClient, start: () => string): Promise<{ jobId: string; status: string }> {
    return new Promise((resolve) => {
        let jobId = '';
        const unsubscribe = client.subscribe((update) => {
            if (update.jobId !== jobId) return;
            if (!['complete', 'failed', 'cancelled'].includes(update.status)) return;
            unsubscribe();
            resolve({ jobId, status: update.status });
        });
        jobId = start();
    });
}

function waitForCancelledJob(
    client: ImportWorkerClient,
    files: Array<{ name: string; bytes: Uint8Array }>,
): Promise<{ jobId: string; status: string }> {
    return new Promise((resolve) => {
        let jobId = '';
        let cancellationSent = false;
        const unsubscribe = client.subscribe((update) => {
            if (update.jobId !== jobId) return;
            const stage = (update.progress as { stage?: string } | undefined)?.stage;
            if (!cancellationSent && update.status === 'running' && stage === 'preflight') {
                cancellationSent = true;
                client.cancelJob(jobId);
            }
            if (!['complete', 'failed', 'cancelled'].includes(update.status)) return;
            unsubscribe();
            resolve({ jobId, status: update.status });
        });
        jobId = client.startJob({ files });
    });
}

function ensure(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
    });
}
