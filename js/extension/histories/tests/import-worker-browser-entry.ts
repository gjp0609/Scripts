import { ImportWorkerClient } from '../src/jobs/import-worker-client';
import { getJob, getDatabaseSummary } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type ImportWorkerBrowserResult = {
  jobStatus: string;
  updates: string[];
  pages: number;
  visits: number;
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
        type: 'module'
      })
  });
  const updates: string[] = [];

  try {
    const complete = new Promise<string>((resolve, reject) => {
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
      text: [
        'https://example.com/imported\tU1000\t0\tImported',
        'https://example.com/imported\tU2000\t1\tImported New',
        'https://example.org/other\tU3000\t8\tOther',
        ''
      ].join('\r\n'),
      pageChunkSize: 1,
      visitChunkSize: 2
    });

    const finalStatus = await complete;
    const summary = await getDatabaseSummary();
    const job = await getJob(jobId);

    ensure(job?.status === 'complete', 'job record should be marked complete');
    ensure(finalStatus === 'complete', 'worker should report completion');
    ensure(summary.pages === 2, 'worker import should write pages');
    ensure(summary.visits === 3, 'worker import should write visits');

    return {
      jobStatus: job.status,
      updates,
      pages: summary.pages,
      visits: summary.visits
    };
  } finally {
    client.terminate();
  }
};

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
