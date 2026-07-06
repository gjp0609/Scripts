import { importHtuText } from '../src/import/htu-import';
import { SearchRebuildWorkerClient } from '../src/jobs/search-rebuild-worker-client';
import { SearchEngine } from '../src/search/search-engine';
import { createIndexedDbSearchStorage } from '../src/search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../src/search/sqlite-wasm-runtime';
import { getJob } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type SearchRebuildWorkerBrowserResult = {
  jobStatus: string;
  updates: string[];
  pageIds: number[];
};

declare global {
  interface Window {
    runHistoriesSearchRebuildWorkerBrowserSmoke: () => Promise<SearchRebuildWorkerBrowserResult>;
  }
}

window.runHistoriesSearchRebuildWorkerBrowserSmoke = async () => {
  await deleteDatabase(DATABASE_NAME);
  await importHtuText(
    [
      'https://www.ruanyifeng.com/blog/2025/07/example.html\tU1720000000000\t0\tRuanyifeng Example',
      'https://www.ruanyifeng.com/blog/2026/07/another.html\tU1780000000000\t1\tAnother Title',
      'https://example.com/other\tU1710000000000\t8\tOther Title',
      ''
    ].join('\r\n'),
    {
      pageChunkSize: 2,
      visitChunkSize: 2
    }
  );

  const client = new SearchRebuildWorkerClient({
    workerFactory: () =>
      new Worker(new URL('/search-rebuild-worker.js?sqlite3.dir=/sqlite', location.href), {
        type: 'classic'
      })
  });
  const updates: string[] = [];

  try {
    const completion = new Promise<string>((resolve, reject) => {
      const unsubscribe = client.subscribe((update) => {
        updates.push(update.status);
        if (update.status === 'complete' || update.status === 'cancelled') {
          unsubscribe();
          resolve(update.status);
        } else if (update.status === 'failed') {
          unsubscribe();
          reject(new Error(update.error ?? 'search rebuild worker failed'));
        }
      });
    });

    const jobId = client.startJob();
    const finalStatus = await completion;
    const job = await getJob(jobId);
    ensure(job?.status === 'complete', 'search rebuild job should complete');
    ensure(finalStatus === 'complete', 'worker should report completion');

    const runtime = await loadSqliteWasmSearchRuntime({
      scriptUrl: new URL('/sqlite/sqlite3.js', location.href).toString()
    });
    const engine = new SearchEngine({
      runtime,
      storage: createIndexedDbSearchStorage()
    });

    try {
      await engine.loadSnapshot();
      const rows = await engine.search({ keyword: 'ifen', limit: 10 });
      ensure(rows.length === 2, 'worker-built snapshot should be searchable');
      return {
        jobStatus: job.status,
        updates,
        pageIds: rows.map((row) => row.pageId)
      };
    } finally {
      engine.close();
    }
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
