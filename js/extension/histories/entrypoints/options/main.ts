import './styles.css';
import { createRuntimeAdapter } from '../../src/runtime/browser-adapter';
import { getDatabaseSummary, listJobs, putJob } from '../../src/storage/database';
import { ImportWorkerClient, type ImportWorkerJobUpdate } from '../../src/jobs/import-worker-client';
import { ExportWorkerClient, type ExportWorkerJobUpdate } from '../../src/jobs/export-worker-client';
import { createExportWorker, createImportWorker } from '../../src/jobs/worker-factories';
import {
    SearchRebuildWorkerClient,
    type SearchRebuildWorkerJobUpdate,
} from '../../src/jobs/search-rebuild-worker-client';
import { SearchEngine, type SearchResult } from '../../src/search/search-engine';
import { createIndexedDbSearchStorage } from '../../src/search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../../src/search/sqlite-wasm-runtime';
import type { JobRecord } from '../../src/storage/schema';
import { exportNativeHistoryBackup, restoreNativeHistoryBackup } from '../../src/export/native-backup';

const runtime = createRuntimeAdapter();
const importClient = new ImportWorkerClient({ workerFactory: createImportWorker });
const exportClient = new ExportWorkerClient({ workerFactory: createExportWorker });
const searchRebuildClient = new SearchRebuildWorkerClient();

const runtimeStatus = document.querySelector<HTMLElement>('#runtimeStatus');
const storageStatus = document.querySelector<HTMLElement>('#storageStatus');
const snapshotStatus = document.querySelector<HTMLElement>('#snapshotStatus');
const quotaStatus = document.querySelector<HTMLElement>('#quotaStatus');
const resultSummary = document.querySelector<HTMLElement>('#resultSummary');
const jobStatus = document.querySelector<HTMLElement>('#jobStatus');
const jobsList = document.querySelector<HTMLElement>('#jobsList');
const importFile = document.querySelector<HTMLInputElement>('#importFile');
const importButton = document.querySelector<HTMLButtonElement>('#importButton');
const cancelImportButton = document.querySelector<HTMLButtonElement>('#cancelImportButton');
const syncButton = document.querySelector<HTMLButtonElement>('#syncButton');
const cancelSyncButton = document.querySelector<HTMLButtonElement>('#cancelSyncButton');
const frequentVisitThresholdInput = document.querySelector<HTMLInputElement>('#frequentVisitThreshold');
const saveSyncSettingsButton = document.querySelector<HTMLButtonElement>('#saveSyncSettingsButton');
const exportButton = document.querySelector<HTMLButtonElement>('#exportButton');
const cancelExportButton = document.querySelector<HTMLButtonElement>('#cancelExportButton');
const rebuildButton = document.querySelector<HTMLButtonElement>('#rebuildButton');
const cancelRebuildButton = document.querySelector<HTMLButtonElement>('#cancelRebuildButton');
const searchButton = document.querySelector<HTMLButtonElement>('#searchButton');
const nextPageButton = document.querySelector<HTMLButtonElement>('#nextPageButton');
const searchForm = document.querySelector<HTMLFormElement>('#searchForm');
const nativeExportButton = document.querySelector<HTMLButtonElement>('#nativeExportButton');
const nativeRestoreButton = document.querySelector<HTMLButtonElement>('#nativeRestoreButton');
const nativeRestoreFile = document.querySelector<HTMLInputElement>('#nativeRestoreFile');
const keywordInput = document.querySelector<HTMLInputElement>('#keyword');
const fromTimeInput = document.querySelector<HTMLInputElement>('#fromTime');
const toTimeInput = document.querySelector<HTMLInputElement>('#toTime');
const results = document.querySelector<HTMLElement>('#results');

const searchStorage = createIndexedDbSearchStorage();
let importJobId: string | null = null;
let syncJobId: string | null = null;
let exportJobId: string | null = null;
let rebuildJobId: string | null = null;
let pollHandle: number | undefined;
let searchRuntimePromise: ReturnType<typeof loadSqliteWasmSearchRuntime> | undefined;
let searchReader: SearchEngine | null = null;
let searchCursor: Awaited<ReturnType<SearchEngine['searchPage']>>['nextCursor'];
let searchCheckpointTimer: number | undefined;
let nativeOperationRunning = false;

async function boot() {
    await recoverInterruptedPageJobs();
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
        const estimate = await navigator.storage?.estimate?.();
        if (quotaStatus) quotaStatus.textContent = formatStorageEstimate(estimate);
    } catch (error) {
        if (storageStatus) storageStatus.textContent = 'Unavailable';
        if (snapshotStatus) snapshotStatus.textContent = 'Unknown';
        console.error('[histories] database summary failed', error);
    }

    await refreshJobs();
    syncControls();
    if (frequentVisitThresholdInput) {
        frequentVisitThresholdInput.value = String(await runtime.getFrequentVisitThresholdSeconds());
    }
    void startHistoryCompensation();
}

async function recoverInterruptedPageJobs(): Promise<void> {
    const now = Date.now();
    const jobs = await listJobs(50);
    const pageTaskTypes = new Set<JobRecord['type']>(['htu-import', 'htu-export', 'search-rebuild']);
    await Promise.all(
        jobs
            .filter(
                (job) =>
                    job.status === 'running' &&
                    job.resumable === true &&
                    pageTaskTypes.has(job.type) &&
                    job.updatedAt < now - 30_000,
            )
            .map((job) =>
                putJob({
                    ...job,
                    status: 'failed',
                    updatedAt: now,
                    error: '页面任务已中断，已提交主数据未受影响，可安全重试。',
                }),
            ),
    );
}

saveSyncSettingsButton?.addEventListener('click', () => {
    void saveSyncSettings();
});

async function saveSyncSettings(): Promise<void> {
    const value = Number(frequentVisitThresholdInput?.value);
    if (!Number.isFinite(value) || value < 0) {
        setResultSummary('Ignore seconds must be a non-negative number.');
        return;
    }
    await runtime.setFrequentVisitThresholdSeconds(value);
    setResultSummary(`Saved frequent-visit threshold: ${value.toFixed(1)} seconds.`);
}

async function startHistoryCompensation(): Promise<void> {
    try {
        const response = await runtime.sendMessage<{ jobId?: string; error?: string }>({
            type: 'histories:history-sync-start',
            mode: 'incremental',
        });
        if (response?.error) {
            console.warn('[histories] compensation sync rejected', response.error);
        }
    } catch (error) {
        console.warn('[histories] compensation sync unavailable', error);
    }
}

searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchCursor = undefined;
    void runSearch();
});

nextPageButton?.addEventListener('click', () => {
    void runSearch();
});

nativeExportButton?.addEventListener('click', () => void startNativeExport());
nativeRestoreButton?.addEventListener('click', () => void startNativeRestore());

importButton?.addEventListener('click', () => {
    void startImport();
});

cancelImportButton?.addEventListener('click', () => {
    if (importJobId) importClient.cancelJob(importJobId);
});

syncButton?.addEventListener('click', () => {
    void startHistorySync();
});

cancelSyncButton?.addEventListener('click', () => {
    if (!syncJobId) return;
    void runtime.sendMessage({
        type: 'histories:history-sync-cancel',
        jobId: syncJobId,
    });
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
    if (searchCheckpointTimer !== undefined) window.clearTimeout(searchCheckpointTimer);
    importClient.terminate();
    exportClient.terminate();
    searchRebuildClient.terminate();
});

void boot();

async function startImport(): Promise<void> {
    const files = [...(importFile?.files ?? [])];
    if (files.length === 0) {
        setResultSummary('Select one or more HTU TSV files first.');
        return;
    }

    importJobId = importClient.startJob({
        files: await Promise.all(
            files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
        ),
    });
    setJobStatus(`Importing ${files.length} HTU file(s)`);
    syncControls();
    await refreshJobs();
}

async function startHistorySync(): Promise<void> {
    if (syncJobId || importJobId || exportJobId || rebuildJobId) return;

    const response = await runtime.sendMessage<{ jobId?: string; error?: string }>({
        type: 'histories:history-sync-start',
        mode: 'incremental',
    });
    if (response?.error) {
        setResultSummary(response.error);
        return;
    }
    if (!response?.jobId) {
        setResultSummary('Unable to start history sync.');
        return;
    }

    syncJobId = response.jobId;
    setJobStatus('Syncing');
    setResultSummary('Browser history sync started.');
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

async function startNativeExport(): Promise<void> {
    if (nativeOperationRunning || importJobId || exportJobId || syncJobId || rebuildJobId) return;
    nativeOperationRunning = true;
    syncControls();
    setJobStatus('正在导出完整备份');
    setResultSummary('正在校验并导出完整主数据...');
    try {
        const exported = await exportNativeHistoryBackup();
        downloadBlobFile(exported.filename, exported.blob);
        setResultSummary(
            `完整备份已导出：${exported.manifest.pageCount.toLocaleString('zh-CN')} 个页面，${exported.manifest.visitCount.toLocaleString('zh-CN')} 次访问。`,
        );
    } catch (error) {
        setResultSummary(error instanceof Error ? error.message : String(error));
    } finally {
        nativeOperationRunning = false;
        setJobStatus('空闲');
        syncControls();
    }
}

async function startNativeRestore(): Promise<void> {
    const file = nativeRestoreFile?.files?.[0];
    if (!file) {
        setResultSummary('请先选择 Histories 原生备份文件。');
        return;
    }
    if (nativeOperationRunning || importJobId || exportJobId || syncJobId || rebuildJobId) return;
    nativeOperationRunning = true;
    syncControls();
    setJobStatus('正在校验完整备份');
    try {
        const restored = await restoreNativeHistoryBackup(file);
        searchReader?.close();
        searchReader = null;
        if (nativeRestoreFile) nativeRestoreFile.value = '';
        setResultSummary(
            `恢复完成：${restored.pages.toLocaleString('zh-CN')} 个页面，${restored.visits.toLocaleString('zh-CN')} 次访问。请重建搜索索引。`,
        );
        await refreshStatus();
    } catch (error) {
        setResultSummary(error instanceof Error ? error.message : String(error));
    } finally {
        nativeOperationRunning = false;
        setJobStatus('空闲');
        syncControls();
    }
}

async function runSearch(): Promise<void> {
    const keyword = keywordInput?.value ?? '';
    try {
        const engine = await ensureSearchReader();
        const page = await engine.searchPage({
            keyword,
            startTime: parseDatetimeLocal(fromTimeInput?.value),
            endTime: parseDatetimeLocal(toTimeInput?.value),
            limit: 50,
            cursor: searchCursor,
        });
        searchCursor = page.nextCursor;
        if (nextPageButton) nextPageButton.disabled = !searchCursor;
        renderSearchResults(page.results);
        setResultSummary(`Returned ${page.results.length} results`);
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
        storage: searchStorage,
    });
    try {
        await searchReader.loadSnapshot();
        const incremental = await searchReader.refreshSnapshotIncremental({ checkpoint: false });
        if (incremental.updatedPages > 0) scheduleSearchCheckpoint();
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !/No latest search snapshot|Unsupported search snapshot|mismatch|not loaded/i.test(error.message)
        ) {
            throw error;
        }
        await searchReader.rebuildSnapshot();
    }
    return searchReader;
}

function scheduleSearchCheckpoint(): void {
    if (searchCheckpointTimer !== undefined) return;
    searchCheckpointTimer = window.setTimeout(() => {
        searchCheckpointTimer = undefined;
        void searchReader?.refreshSnapshotIncremental({ checkpoint: true }).catch((error) => {
            console.warn('[histories] deferred search checkpoint failed', error);
        });
    }, 30_000);
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
        if (update.filename && (update.blob || update.text !== undefined)) {
            if (update.blob) downloadBlobFile(update.filename, update.blob);
            else downloadTextFile(update.filename, update.text ?? '');
            setResultSummary(`HTU 导出完成。`);
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
    const estimate = await navigator.storage?.estimate?.();
    if (quotaStatus) quotaStatus.textContent = formatStorageEstimate(estimate);
}

async function refreshJobs(): Promise<void> {
    try {
        const jobs = await listJobs(8);
        reconcileActiveJobs(jobs);
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
      `,
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
    const syncing = Boolean(syncJobId);
    const exporting = Boolean(exportJobId);
    const rebuilding = Boolean(rebuildJobId);
    if (importButton) importButton.disabled = importing || syncing || rebuilding || exporting;
    if (cancelImportButton) cancelImportButton.disabled = !importing;
    if (syncButton) syncButton.disabled = importing || syncing || rebuilding || exporting;
    if (cancelSyncButton) cancelSyncButton.disabled = !syncing;
    if (exportButton) exportButton.disabled = importing || syncing || rebuilding || exporting;
    if (cancelExportButton) cancelExportButton.disabled = !exporting;
    if (rebuildButton) rebuildButton.disabled = importing || syncing || rebuilding || exporting;
    if (cancelRebuildButton) cancelRebuildButton.disabled = !rebuilding;
    if (searchButton) searchButton.disabled = syncing || rebuilding || exporting;
    if (nativeExportButton)
        nativeExportButton.disabled = nativeOperationRunning || importing || syncing || rebuilding || exporting;
    if (nativeRestoreButton)
        nativeRestoreButton.disabled = nativeOperationRunning || importing || syncing || rebuilding || exporting;
}

function activeJobLabel(latestJob?: JobRecord): string {
    if (syncJobId) return 'Syncing';
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
        scriptUrl: new URL('/sqlite/sqlite3.js', location.href).toString(),
    });
    return await searchRuntimePromise;
}

function formatJobProgress(job: JobRecord): string {
    const progress = job.progress as
        | {
              stage?: string;
              items?: number;
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
    if (job.type === 'history-sync') {
        return `${progress.stage ?? 'unknown'} items=${progress.items ?? 0} pages=${progress.writtenPages ?? 0}/${progress.pages ?? 0} visits=${progress.writtenVisits ?? 0}/${progress.visits ?? 0}`;
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
        second: '2-digit',
    }).format(timestamp);
}

function formatResultMeta(row: SearchResult): string {
    const parts = [`pageId=${row.pageId}`, `visits=${row.visitCount}`, `last=${formatDateTime(row.lastVisitTime)}`];

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
        second: '2-digit',
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

function downloadBlobFile(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatStorageEstimate(estimate: StorageEstimate | undefined): string {
    if (!estimate?.usage || !estimate.quota) return '不可用';
    return `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function reconcileActiveJobs(jobs: JobRecord[]): void {
    reconcileJob('history-sync', syncJobId, jobs, (job) => {
        syncJobId = null;
        if (job.status === 'complete') {
            void refreshStatus();
            setResultSummary('Browser history sync completed.');
        } else if (job.status === 'failed') {
            setResultSummary(job.error ?? 'Browser history sync failed.');
        } else if (job.status === 'cancelled') {
            setResultSummary('Browser history sync cancelled.');
        }
    });

    syncControls();
}

function reconcileJob(
    type: JobRecord['type'],
    jobId: string | null,
    jobs: JobRecord[],
    onFinished: (job: JobRecord) => void,
): void {
    if (!jobId) return;
    const job = jobs.find((item) => item.id === jobId && item.type === type);
    if (!job) return;
    if (job.status === 'queued' || job.status === 'running') return;
    onFinished(job);
}
