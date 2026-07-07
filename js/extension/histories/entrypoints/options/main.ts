import './styles.css';
import { createRuntimeAdapter } from '../../src/runtime/browser-adapter';
import {
  getDatabaseSummary,
  listJobs
} from '../../src/storage/database';
import { ImportWorkerClient, type ImportWorkerJobUpdate } from '../../src/jobs/import-worker-client';
import { ExportWorkerClient, type ExportWorkerJobUpdate } from '../../src/jobs/export-worker-client';
import {
  SearchRebuildWorkerClient,
  type SearchRebuildWorkerJobUpdate
} from '../../src/jobs/search-rebuild-worker-client';
import { SearchEngine, type SearchResult } from '../../src/search/search-engine';
import { createIndexedDbSearchStorage } from '../../src/search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../../src/search/sqlite-wasm-runtime';
import type { JobRecord } from '../../src/storage/schema';

const runtime = createRuntimeAdapter();
const importClient = new ImportWorkerClient();
const exportClient = new ExportWorkerClient();
const searchRebuildClient = new SearchRebuildWorkerClient();

const runtimeStatus = document.querySelector<HTMLElement>('#runtimeStatus');
const storageStatus = document.querySelector<HTMLElement>('#storageStatus');
const snapshotStatus = document.querySelector<HTMLElement>('#snapshotStatus');
const resultSummary = document.querySelector<HTMLElement>('#resultSummary');
const jobStatus = document.querySelector<HTMLElement>('#jobStatus');
const jobsList = document.querySelector<HTMLElement>('#jobsList');
const importFile = document.querySelector<HTMLInputElement>('#importFile');
const importButton = document.querySelector<HTMLButtonElement>('#importButton');
const cancelImportButton = document.querySelector<HTMLButtonElement>('#cancelImportButton');
const exportButton = document.querySelector<HTMLButtonElement>('#exportButton');
const cancelExportButton = document.querySelector<HTMLButtonElement>('#cancelExportButton');
const rebuildButton = document.querySelector<HTMLButtonElement>('#rebuildButton');
const cancelRebuildButton = document.querySelector<HTMLButtonElement>('#cancelRebuildButton');
const searchButton = document.querySelector<HTMLButtonElement>('#searchButton');
const keywordInput = document.querySelector<HTMLInputElement>('#keyword');
const fromTimeInput = document.querySelector<HTMLInputElement>('#fromTime');
const toTimeInput = document.querySelector<HTMLInputElement>('#toTime');
const results = document.querySelector<HTMLElement>('#results');

const searchStorage = createIndexedDbSearchStorage();
let importJobId: string | null = null;
let exportJobId: string | null = null;
let rebuildJobId: string | null = null;
let pollHandle: number | undefined;
let searchRuntimePromise: ReturnType<typeof loadSqliteWasmSearchRuntime> | undefined;
let searchReader: SearchEngine | null = null;

async function boot() {
  try {
    const response = await runtime.sendMessage<{ version?: string }>({ type: 'histories:ping' });
    if (runtimeStatus) {
      runtimeStatus.textContent = response?.version ? `Connected ${response.version}` : 'Connected';
    }
  } catch (error) {
    if (runtimeStatus) runtimeStatus.textContent = 'Unavailable';
    console.error('[histories] runtime ping failed', error);
  }

  try {
    const summary = await getDatabaseSummary();
    if (storageStatus) {
      storageStatus.textContent = `${summary.pages} pages / ${summary.visits} visits`;
    }
    if (snapshotStatus) {
      snapshotStatus.textContent = summary.hasSearchSnapshot ? 'Ready' : 'Missing';
    }
  } catch (error) {
    if (storageStatus) storageStatus.textContent = 'Unavailable';
    if (snapshotStatus) snapshotStatus.textContent = 'Unknown';
    console.error('[histories] database summary failed', error);
  }

  await refreshJobs();
  syncControls();
}

searchButton?.addEventListener('click', () => {
  void runSearch();
});

importButton?.addEventListener('click', () => {
  void startImport();
});

cancelImportButton?.addEventListener('click', () => {
  if (importJobId) importClient.cancelJob(importJobId);
});

exportButton?.addEventListener('click', () => {
  void startExport();
});

cancelExportButton?.addEventListener('click', () => {
  if (exportJobId) exportClient.cancelJob(exportJobId);
});

rebuildButton?.addEventListener('click', () => {
  void startSearchRebuild();
});

cancelRebuildButton?.addEventListener('click', () => {
  if (rebuildJobId) searchRebuildClient.cancelJob(rebuildJobId);
});

importClient.subscribe((update) => {
  handleImportWorkerUpdate(update);
});
exportClient.subscribe((update) => {
  handleExportWorkerUpdate(update);
});
searchRebuildClient.subscribe((update) => {
  handleSearchRebuildWorkerUpdate(update);
});

pollHandle = window.setInterval(() => {
  void refreshJobs();
}, 1000);

window.addEventListener('beforeunload', () => {
  if (pollHandle !== undefined) window.clearInterval(pollHandle);
  searchReader?.close();
  importClient.terminate();
  exportClient.terminate();
  searchRebuildClient.terminate();
});

void boot();

async function startImport(): Promise<void> {
  const file = importFile?.files?.[0];
  if (!file) {
    setResultSummary('Select an HTU TSV file first.');
    return;
  }

  const text = await file.text();
  importJobId = importClient.startJob({
    text
  });
  setJobStatus(`Importing ${file.name}`);
  syncControls();
  await refreshJobs();
}

async function startSearchRebuild(): Promise<void> {
  if (rebuildJobId) return;

  rebuildJobId = searchRebuildClient.startJob();
  searchReader?.close();
  searchReader = null;
  syncControls();
  setJobStatus('Rebuilding snapshot');
  await refreshJobs();
}

async function startExport(): Promise<void> {
  if (exportJobId || importJobId || rebuildJobId) return;

  exportJobId = exportClient.startJob();
  syncControls();
  setJobStatus('Exporting');
  setResultSummary('Building HTU backup export...');
  await refreshJobs();
}

async function runSearch(): Promise<void> {
  const keyword = keywordInput?.value ?? '';
  if (!keyword.trim()) {
    setResultSummary('Enter a keyword to search.');
    return;
  }

  try {
    const engine = await ensureSearchReader();
    const rows = await engine.search({
      keyword,
      startTime: parseDatetimeLocal(fromTimeInput?.value),
      endTime: parseDatetimeLocal(toTimeInput?.value),
      limit: 50
    });
    renderSearchResults(rows);
    setResultSummary(`Returned ${rows.length} results`);
  } catch (error) {
    renderEmptyResults('No snapshot is available. Import data and rebuild the snapshot first.');
    setResultSummary(error instanceof Error ? error.message : String(error));
  }
}

async function ensureSearchReader(): Promise<SearchEngine> {
  if (searchReader) return searchReader;

  const runtime = await getSearchRuntime();
  searchReader = new SearchEngine({
    runtime,
    storage: searchStorage
  });
  await searchReader.loadSnapshot();
  return searchReader;
}

function handleImportWorkerUpdate(update: ImportWorkerJobUpdate): void {
  if (update.jobId !== importJobId) return;

  if (update.status === 'complete') {
    importJobId = null;
    void refreshStatus();
    setResultSummary('HTU import completed.');
  } else if (update.status === 'failed') {
    importJobId = null;
    setResultSummary(update.error ?? 'HTU import failed.');
  } else if (update.status === 'cancelled') {
    importJobId = null;
    setResultSummary('HTU import cancelled.');
  }

  if (update.status !== 'queued' && update.status !== 'running') {
    if (importFile) importFile.value = '';
  }

  syncControls();
  void refreshJobs();
}

function handleSearchRebuildWorkerUpdate(update: SearchRebuildWorkerJobUpdate): void {
  if (update.jobId !== rebuildJobId) return;

  if (update.status === 'complete') {
    rebuildJobId = null;
    void refreshStatus();
    setResultSummary('Search snapshot rebuilt.');
  } else if (update.status === 'failed') {
    rebuildJobId = null;
    setResultSummary(update.error ?? 'Search snapshot rebuild failed.');
  } else if (update.status === 'cancelled') {
    rebuildJobId = null;
    setResultSummary('Search snapshot rebuild cancelled.');
  }

  syncControls();
  void refreshJobs();
}

function handleExportWorkerUpdate(update: ExportWorkerJobUpdate): void {
  if (update.jobId !== exportJobId) return;

  if (update.status === 'complete') {
    exportJobId = null;
    if (update.filename && update.text !== undefined) {
      downloadTextFile(update.filename, update.text);
      setResultSummary(`Exported ${update.text.length.toLocaleString('en-US')} bytes.`);
    } else {
      setResultSummary('HTU export completed.');
    }
  } else if (update.status === 'failed') {
    exportJobId = null;
    setResultSummary(update.error ?? 'HTU export failed.');
  } else if (update.status === 'cancelled') {
    exportJobId = null;
    setResultSummary('HTU export cancelled.');
  }

  syncControls();
  void refreshJobs();
}

async function refreshStatus(): Promise<void> {
  try {
    const summary = await getDatabaseSummary();
    if (storageStatus) {
      storageStatus.textContent = `${summary.pages} pages / ${summary.visits} visits`;
    }
    if (snapshotStatus) {
      snapshotStatus.textContent = summary.hasSearchSnapshot ? 'Ready' : 'Missing';
    }
  } catch (error) {
    if (storageStatus) storageStatus.textContent = 'Unavailable';
    if (snapshotStatus) snapshotStatus.textContent = 'Unknown';
    console.error('[histories] refreshStatus failed', error);
  }
}

async function refreshJobs(): Promise<void> {
  try {
    const jobs = await listJobs(8);
    renderJobs(jobs);
  } catch (error) {
    console.error('[histories] refreshJobs failed', error);
  }
}

function renderJobs(jobs: JobRecord[]): void {
  if (!jobsList) return;

  if (jobs.length === 0) {
    jobsList.className = 'job-list empty-state';
    jobsList.textContent = 'No jobs yet.';
    if (!jobStatus) return;
    jobStatus.textContent = activeJobLabel();
    return;
  }

  jobsList.className = 'job-list';
  jobsList.innerHTML = jobs
    .map((job) => {
      const progressText = formatJobProgress(job);
      return `
        <article class="job-row">
          <div>
            <div class="job-status">${escapeHtml(job.status)}</div>
            <div class="job-type">${escapeHtml(job.type)}</div>
          </div>
          <div class="job-time">${formatTime(job.updatedAt)}</div>
          <div class="job-progress">${escapeHtml(progressText)}</div>
          <div>${escapeHtml(job.id.slice(0, 8))}</div>
        </article>
      `;
    })
    .join('');

  if (jobStatus) {
    jobStatus.textContent = activeJobLabel(jobs[0]);
  }
}

function renderSearchResults(rows: SearchResult[]): void {
  if (!results) return;

  if (rows.length === 0) {
    renderEmptyResults('No matching pages.');
    return;
  }

  results.className = 'result-list';
  results.innerHTML = rows
    .map(
      (row) => `
        <article class="result-row">
          <h3 class="result-title">${escapeHtml(row.title || row.url)}</h3>
          <p class="result-url">${escapeHtml(row.url)}</p>
          <p class="result-meta">${formatResultMeta(row)}</p>
        </article>
      `
    )
    .join('');
}

function renderEmptyResults(text: string): void {
  if (!results) return;
  results.className = 'empty-state';
  results.textContent = text;
}

function syncControls(): void {
  const importing = Boolean(importJobId);
  const exporting = Boolean(exportJobId);
  const rebuilding = Boolean(rebuildJobId);
  if (importButton) importButton.disabled = importing || rebuilding || exporting;
  if (cancelImportButton) cancelImportButton.disabled = !importing;
  if (exportButton) exportButton.disabled = importing || rebuilding || exporting;
  if (cancelExportButton) cancelExportButton.disabled = !exporting;
  if (rebuildButton) rebuildButton.disabled = importing || rebuilding || exporting;
  if (cancelRebuildButton) cancelRebuildButton.disabled = !rebuilding;
  if (searchButton) searchButton.disabled = rebuilding || exporting;
}

function activeJobLabel(latestJob?: JobRecord): string {
  if (exportJobId) return 'Exporting';
  if (rebuildJobId) return 'Rebuilding';
  if (importJobId) return 'Importing';
  return latestJob ? latestJob.status : 'Idle';
}

function setResultSummary(text: string): void {
  if (resultSummary) resultSummary.textContent = text;
}

function setJobStatus(text: string): void {
  if (jobStatus) jobStatus.textContent = text;
}

function parseDatetimeLocal(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function getSearchRuntime() {
  searchRuntimePromise ??= loadSqliteWasmSearchRuntime({
    scriptUrl: new URL('/sqlite/sqlite3.js', location.href).toString()
  });
  return await searchRuntimePromise;
}

function formatJobProgress(job: JobRecord): string {
  const progress = job.progress as
    | {
        stage?: string;
        rows?: number;
        pages?: number;
        visits?: number;
        writtenPages?: number;
        writtenVisits?: number;
        writtenRows?: number;
        pageCount?: number;
        bytes?: number;
      }
    | undefined;

  if (job.error) return job.error;
  if (!progress) return 'No progress';
  if (job.type === 'search-rebuild') {
    return `${progress.stage ?? 'unknown'} ${progress.writtenPages ?? progress.pageCount ?? 0}/${progress.pages ?? progress.pageCount ?? 0}`;
  }
  if (job.type === 'htu-export') {
    return `${progress.stage ?? 'unknown'} pages=${progress.pages ?? 0} visits=${progress.writtenRows ?? progress.visits ?? 0}/${progress.visits ?? 0} bytes=${progress.bytes ?? 0}`;
  }

  return `${progress.stage ?? 'unknown'} rows=${progress.rows ?? 0} pages=${progress.writtenPages ?? 0}/${progress.pages ?? 0} visits=${progress.writtenVisits ?? 0}/${progress.visits ?? 0}`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

function formatResultMeta(row: SearchResult): string {
  const parts = [
    `pageId=${row.pageId}`,
    `visits=${row.visitCount}`,
    `last=${formatDateTime(row.lastVisitTime)}`
  ];

  if (row.matchedVisitCount !== undefined) {
    parts.push(`rangeHits=${row.matchedVisitCount}`);
  }
  if (row.matchedVisitTime !== undefined) {
    parts.push(`rangeLast=${formatDateTime(row.matchedVisitTime)}`);
  }

  return parts.join(' ');
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
