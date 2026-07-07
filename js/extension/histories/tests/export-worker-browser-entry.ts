import { exportHtuArchivedTsv } from '../src/export/htu-export';
import { importHtuText } from '../src/import/htu-import';
import { ExportWorkerClient } from '../src/jobs/export-worker-client';
import { getJob } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type ExportWorkerBrowserResult = {
  jobStatus: string;
  updates: string[];
  bytes: number;
};

declare global {
  interface Window {
    runHistoriesExportWorkerBrowserSmoke: () => Promise<ExportWorkerBrowserResult>;
  }
}

window.runHistoriesExportWorkerBrowserSmoke = async () => {
  await deleteDatabase(DATABASE_NAME);
  const source = [
    'https://example.com/imported\tU1000\t0\tImported',
    'https://example.com/imported\tU2000\t1\tImported New',
    'https://example.org/other\tU3000\t8\tOther',
    ''
  ].join('\r\n');
  await importHtuText(source, {
    pageChunkSize: 1,
    visitChunkSize: 2
  });

  const client = new ExportWorkerClient({
    workerFactory: () =>
      new Worker(new URL('/src/jobs/export-worker.js', location.href), {
        type: 'module'
      })
  });
  const updates: string[] = [];

  try {
    const complete = new Promise<{ status: string; text: string }>((resolve, reject) => {
      const unsubscribe = client.subscribe((update) => {
        updates.push(update.status);
        if (update.status === 'complete') {
          unsubscribe();
          resolve({
            status: update.status,
            text: update.text ?? ''
          });
        } else if (update.status === 'cancelled') {
          unsubscribe();
          resolve({
            status: update.status,
            text: ''
          });
        } else if (update.status === 'failed') {
          unsubscribe();
          reject(new Error(update.error ?? 'worker export failed'));
        }
      });
    });

    const jobId = client.startJob();
    const finalUpdate = await complete;
    const job = await getJob(jobId);
    const direct = await exportHtuArchivedTsv();

    ensure(job?.status === 'complete', 'job record should be marked complete');
    ensure(finalUpdate.status === 'complete', 'worker should report completion');
    ensure(finalUpdate.text === source, 'worker export should preserve archived HTU bytes');
    ensure(direct.text === source, 'direct export should match worker export');

    return {
      jobStatus: job.status,
      updates,
      bytes: finalUpdate.text.length
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
