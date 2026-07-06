import { importHtuText, type HtuImportProgress } from '../src/import/htu-import';
import { getDatabaseSummary } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type FullImportResult = {
  fetchMs: number;
  importMs: number;
  totalMs: number;
  rows: number;
  pages: number;
  visits: number;
  writtenPages: number;
  writtenVisits: number;
  summaryPages: number;
  summaryVisits: number;
  progressSamples: HtuImportProgress[];
};

type FullImportOptions = {
  maxRows?: number;
};

declare global {
  interface Window {
    runHistoriesFullImport: (options?: FullImportOptions) => Promise<FullImportResult>;
  }
}

window.runHistoriesFullImport = async (options: FullImportOptions = {}) => {
  await deleteDatabase(DATABASE_NAME);

  const totalStart = performance.now();
  const fetchStart = performance.now();
  const response = await fetch('/backup.tsv');
  if (!response.ok) {
    throw new Error(`Unable to fetch backup.tsv: ${response.status}`);
  }
  let text = await response.text();
  const fetchMs = performance.now() - fetchStart;
  console.info(`[histories-full-import] fetched ${text.length} chars in ${Math.round(fetchMs)} ms`);
  if (options.maxRows !== undefined) {
    text = limitRows(text, options.maxRows);
    console.info(`[histories-full-import] limited input to ${options.maxRows} rows`);
  }

  const progressSamples: HtuImportProgress[] = [];
  let lastSampleTime = 0;
  const importStart = performance.now();
  const result = await importHtuText(text, {
    onProgress(progress) {
      const now = performance.now();
      if (
        progress.stage === 'done' ||
        progressSamples.length === 0 ||
        now - lastSampleTime >= 1000
      ) {
        progressSamples.push({ ...progress });
        lastSampleTime = now;
        console.info(
          `[histories-full-import] ${progress.stage} rows=${progress.rows} pages=${progress.writtenPages}/${progress.pages} visits=${progress.writtenVisits}/${progress.visits}`
        );
      }
    }
  });
  const importMs = performance.now() - importStart;
  const totalMs = performance.now() - totalStart;
  const summary = await getDatabaseSummary();

  if (summary.pages !== result.pages) {
    throw new Error(`Imported page count mismatch: summary=${summary.pages}, result=${result.pages}`);
  }
  if (summary.visits !== result.visits) {
    throw new Error(
      `Imported visit count mismatch: summary=${summary.visits}, result=${result.visits}`
    );
  }

  return {
    fetchMs,
    importMs,
    totalMs,
    rows: result.rows,
    pages: result.pages,
    visits: result.visits,
    writtenPages: result.writtenPages,
    writtenVisits: result.writtenVisits,
    summaryPages: summary.pages,
    summaryVisits: summary.visits,
    progressSamples
  };
};

function limitRows(text: string, maxRows: number): string {
  if (!Number.isFinite(maxRows) || maxRows < 1) return text;

  let rows = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      rows += 1;
      if (rows >= maxRows) return text.slice(0, index + 1);
    }
  }

  return text;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
  });
}
