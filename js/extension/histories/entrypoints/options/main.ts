import '../../src/ui/base.css';
import './options.css';
import { createRuntimeAdapter } from '../../src/runtime/browser-adapter';
import {
    getActiveHistoryGeneration,
    getDatabaseSummary,
    getLatestSearchSnapshot,
    listJobs,
    putJob,
} from '../../src/storage/database';
import { ImportWorkerClient, type ImportWorkerJobUpdate } from '../../src/jobs/import-worker-client';
import { ExportWorkerClient, type ExportWorkerJobUpdate } from '../../src/jobs/export-worker-client';
import { createExportWorker, createImportWorker } from '../../src/jobs/worker-factories';
import {
    SearchRebuildWorkerClient,
    type SearchRebuildWorkerJobUpdate,
} from '../../src/jobs/search-rebuild-worker-client';
import type { JobRecord } from '../../src/storage/schema';
import { exportNativeHistoryBackup, restoreNativeHistoryBackup } from '../../src/export/native-backup';
import { renderSidebar } from '../../src/ui/navigation';
import { downloadBlobFile, downloadTextFile } from '../../src/ui/downloads';
import { formatBytes, formatCount, formatDateTime } from '../../src/ui/format';

const runtime = createRuntimeAdapter();
const importClient = new ImportWorkerClient({ workerFactory: createImportWorker });
const exportClient = new ExportWorkerClient({ workerFactory: createExportWorker });
const searchRebuildClient = new SearchRebuildWorkerClient();

const sidebar = document.querySelector<HTMLElement>('#sidebar');
const runtimeStatus = document.querySelector<HTMLElement>('#runtimeStatus');
const startPageSelect = document.querySelector<HTMLSelectElement>('#start_page');
const timeDisplaySelect = document.querySelector<HTMLSelectElement>('#time_display');
const openLinksNewTabInput = document.querySelector<HTMLInputElement>('#open_links_new_tab');
const frequentVisitThresholdInput = document.querySelector<HTMLInputElement>('#ignore_visits_duration');
const saveSyncSettingsButton = document.querySelector<HTMLButtonElement>('#saveSyncSettingsButton');
const pageCountStatus = document.querySelector<HTMLElement>('#pageCount');
const visitCountStatus = document.querySelector<HTMLElement>('#visitCount');
const storageStatus = document.querySelector<HTMLElement>('#storageStatus');
const snapshotStatus = document.querySelector<HTMLElement>('#snapshotStatus');
const indexStatus = document.querySelector<HTMLElement>('#indexStatus');
const lastSyncStatus = document.querySelector<HTMLElement>('#lastSyncStatus');
const resultSummary = document.querySelector<HTMLElement>('#resultSummary');
const jobStatus = document.querySelector<HTMLElement>('#jobStatus');
const jobsList = document.querySelector<HTMLElement>('#jobsList');
const importFile = document.querySelector<HTMLInputElement>('#importFile');
const importButton = document.querySelector<HTMLButtonElement>('#importButton');
const cancelImportButton = document.querySelector<HTMLButtonElement>('#cancelImportButton');
const importProgress = document.querySelector<HTMLElement>('#import_progress');
const importComplete = document.querySelector<HTMLElement>('#import_complete');
const importSuccessStats = document.querySelector<HTMLElement>('#import_success_stats');
const importErrorStats = document.querySelector<HTMLElement>('#import_error_stats');
const syncButton = document.querySelector<HTMLButtonElement>('#syncButton');
const cancelSyncButton = document.querySelector<HTMLButtonElement>('#cancelSyncButton');
const exportButton = document.querySelector<HTMLButtonElement>('#exportButton');
const cancelExportButton = document.querySelector<HTMLButtonElement>('#cancelExportButton');
const rebuildButton = document.querySelector<HTMLButtonElement>('#rebuildButton');
const cancelRebuildButton = document.querySelector<HTMLButtonElement>('#cancelRebuildButton');
const nativeExportButton = document.querySelector<HTMLButtonElement>('#nativeExportButton');
const nativeRestoreButton = document.querySelector<HTMLButtonElement>('#nativeRestoreButton');
const nativeRestoreFile = document.querySelector<HTMLInputElement>('#nativeRestoreFile');

let importJobId: string | null = null;
let syncJobId: string | null = null;
let exportJobId: string | null = null;
let rebuildJobId: string | null = null;
let pollHandle: number | undefined;
let nativeOperationRunning = false;

async function boot(): Promise<void> {
    renderSidebar(sidebar, 'options.html', (page) => void runtime.openExtensionPage(page));
    await recoverInterruptedPageJobs();

    try {
        const response = await runtime.sendMessage<{ version?: string }>({ type: 'histories:ping' });
        if (runtimeStatus) runtimeStatus.textContent = response?.version ? `已连接 ${response.version}` : '已连接';
    } catch (error) {
        if (runtimeStatus) runtimeStatus.textContent = '后台未响应';
        console.error('[histories] runtime ping failed', error);
    }

    const [startPage, timeDisplay, thresholdSeconds, openInNewTab] = await Promise.all([
        runtime.getStartPage(),
        runtime.getTimeDisplay(),
        runtime.getFrequentVisitThresholdSeconds(),
        runtime.getOpenLinksInNewTab(),
    ]);
    if (startPageSelect) startPageSelect.value = startPage === 'options' ? 'options' : 'history';
    if (timeDisplaySelect) timeDisplaySelect.value = timeDisplay;
    if (frequentVisitThresholdInput) frequentVisitThresholdInput.value = thresholdSeconds.toFixed(1);
    if (openLinksNewTabInput) openLinksNewTabInput.checked = openInNewTab;

    await refreshStatus();
    await refreshJobs();
    syncControls();
}

/**
 * 页面任务（导入/导出/重建）在标签页关闭时会中断。这里把超时仍标记为
 * running 的任务改为失败，主数据未受影响，用户可安全重试。
 */
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

startPageSelect?.addEventListener('change', () => {
    void runtime.setStartPage(startPageSelect.value);
    setResultSummary(`默认启动页已设为${startPageSelect.value === 'options' ? '设置页' : '历史页'}。`);
});

timeDisplaySelect?.addEventListener('change', () => {
    const value = timeDisplaySelect.value === '12' ? '12' : '24';
    void runtime.setTimeDisplay(value);
    setResultSummary(`时间显示已设为${value === '12' ? '12 小时制' : '24 小时制'}。`);
});

openLinksNewTabInput?.addEventListener('change', () => {
    void runtime.setOpenLinksInNewTab(openLinksNewTabInput.checked);
    setResultSummary(openLinksNewTabInput.checked ? '记录链接将在新标签页打开。' : '记录链接将在当前标签页打开。');
});

saveSyncSettingsButton?.addEventListener('click', () => {
    void saveSyncSettings();
});

async function saveSyncSettings(): Promise<void> {
    const value = Number(frequentVisitThresholdInput?.value);
    if (!Number.isFinite(value) || value < 0) {
        setResultSummary('忽略秒数必须是不小于 0 的数字。');
        return;
    }
    await runtime.setFrequentVisitThresholdSeconds(value);
    if (frequentVisitThresholdInput) frequentVisitThresholdInput.value = value.toFixed(1);
    setResultSummary(`已保存：忽略同一页面 ${value.toFixed(1)} 秒内的重复访问。`);
}

nativeExportButton?.addEventListener('click', () => void startNativeExport());
nativeRestoreButton?.addEventListener('click', () => void startNativeRestore());

importButton?.addEventListener('click', () => void startImport());
cancelImportButton?.addEventListener('click', () => {
    if (importJobId) importClient.cancelJob(importJobId);
});

syncButton?.addEventListener('click', () => void startHistorySync());
cancelSyncButton?.addEventListener('click', () => {
    if (!syncJobId) return;
    void runtime.sendMessage({ type: 'histories:history-sync-cancel', jobId: syncJobId });
});

exportButton?.addEventListener('click', () => void startExport());
cancelExportButton?.addEventListener('click', () => {
    if (exportJobId) exportClient.cancelJob(exportJobId);
});

rebuildButton?.addEventListener('click', () => void startSearchRebuild());
cancelRebuildButton?.addEventListener('click', () => {
    if (rebuildJobId) searchRebuildClient.cancelJob(rebuildJobId);
});

importClient.subscribe((update) => handleImportWorkerUpdate(update));
exportClient.subscribe((update) => handleExportWorkerUpdate(update));
searchRebuildClient.subscribe((update) => handleSearchRebuildWorkerUpdate(update));

pollHandle = window.setInterval(() => void refreshJobs(), 1000);

window.addEventListener('beforeunload', () => {
    if (pollHandle !== undefined) window.clearInterval(pollHandle);
    importClient.terminate();
    exportClient.terminate();
    searchRebuildClient.terminate();
});

void boot();

async function startImport(): Promise<void> {
    const files = [...(importFile?.files ?? [])];
    if (files.length === 0) {
        setResultSummary('请先选择一个或多个 HTU TSV 文件。');
        return;
    }

    if (importProgress) importProgress.style.display = '';
    if (importProgress) importProgress.textContent = `正在导入 ${files.length} 个文件…`;
    if (importComplete) importComplete.style.display = 'none';

    importJobId = importClient.startJob({
        files: await Promise.all(
            files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
        ),
    });
    setJobStatus(`正在导入 ${files.length} 个文件`);
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
        setResultSummary('无法启动历史补全。');
        return;
    }

    syncJobId = response.jobId;
    setJobStatus('正在补全浏览器历史');
    setResultSummary('已开始补全浏览器历史。');
    syncControls();
    await refreshJobs();
}

async function startSearchRebuild(): Promise<void> {
    if (rebuildJobId) return;

    rebuildJobId = searchRebuildClient.startJob();
    syncControls();
    setJobStatus('正在重建搜索索引');
    setResultSummary('正在重建搜索索引…');
    await refreshJobs();
}

async function startExport(): Promise<void> {
    if (exportJobId || importJobId || rebuildJobId) return;

    exportJobId = exportClient.startJob();
    syncControls();
    setJobStatus('正在导出');
    setResultSummary('正在生成 HTU 导出文件…');
    await refreshJobs();
}

async function startNativeExport(): Promise<void> {
    if (nativeOperationRunning || importJobId || exportJobId || syncJobId || rebuildJobId) return;
    nativeOperationRunning = true;
    syncControls();
    setJobStatus('正在导出完整备份');
    setResultSummary('正在校验并导出完整主数据…');
    try {
        const exported = await exportNativeHistoryBackup();
        downloadBlobFile(exported.filename, exported.blob);
        setResultSummary(
            `完整备份已导出：${formatCount(exported.manifest.pageCount)} 个页面，${formatCount(
                exported.manifest.visitCount,
            )} 次访问。`,
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
        if (nativeRestoreFile) nativeRestoreFile.value = '';
        setResultSummary(
            `恢复完成：${formatCount(restored.pages)} 个页面，${formatCount(
                restored.visits,
            )} 次访问。搜索索引需要重建，可在上方点击「重建搜索索引」。`,
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

function handleImportWorkerUpdate(update: ImportWorkerJobUpdate): void {
    if (update.jobId !== importJobId) return;

    if (update.status === 'complete') {
        importJobId = null;
        void refreshStatus();
        setResultSummary('HTU 数据导入完成。');
        if (importProgress) importProgress.style.display = 'none';
        if (importComplete) importComplete.style.display = '';
        if (importSuccessStats) importSuccessStats.textContent = '导入成功，数据已并入现有记录。';
        if (importErrorStats) importErrorStats.textContent = '';
    } else if (update.status === 'failed') {
        importJobId = null;
        setResultSummary(update.error ?? 'HTU 数据导入失败。');
        if (importProgress) importProgress.style.display = 'none';
        if (importComplete) importComplete.style.display = '';
        if (importSuccessStats) importSuccessStats.textContent = '';
        if (importErrorStats) importErrorStats.textContent = update.error ?? '导入失败。';
    } else if (update.status === 'cancelled') {
        importJobId = null;
        setResultSummary('HTU 数据导入已取消。');
        if (importProgress) importProgress.style.display = 'none';
        if (importComplete) importComplete.style.display = 'none';
    }

    if (update.status !== 'queued' && update.status !== 'running' && importFile) {
        importFile.value = '';
    }

    syncControls();
    void refreshJobs();
}

function handleSearchRebuildWorkerUpdate(update: SearchRebuildWorkerJobUpdate): void {
    if (update.jobId !== rebuildJobId) return;

    if (update.status === 'complete') {
        rebuildJobId = null;
        void refreshStatus();
        setResultSummary('搜索索引重建完成。');
    } else if (update.status === 'failed') {
        rebuildJobId = null;
        setResultSummary(update.error ?? '搜索索引重建失败。');
    } else if (update.status === 'cancelled') {
        rebuildJobId = null;
        setResultSummary('搜索索引重建已取消。');
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
            setResultSummary(`HTU 导出完成：${update.filename}`);
        } else {
            setResultSummary('HTU 导出完成。');
        }
    } else if (update.status === 'failed') {
        exportJobId = null;
        setResultSummary(update.error ?? 'HTU 导出失败。');
    } else if (update.status === 'cancelled') {
        exportJobId = null;
        setResultSummary('HTU 导出已取消。');
    }

    syncControls();
    void refreshJobs();
}

async function refreshStatus(): Promise<void> {
    try {
        const [summary, generation, snapshot, estimate] = await Promise.all([
            getDatabaseSummary(),
            getActiveHistoryGeneration(),
            getLatestSearchSnapshot(),
            navigator.storage?.estimate?.() ?? Promise.resolve(undefined),
        ]);

        if (pageCountStatus) pageCountStatus.textContent = formatCount(summary.pages);
        if (visitCountStatus) visitCountStatus.textContent = formatCount(summary.visits);

        // estimate.usage 是整个扩展占用的合计，减去索引快照才是主数据占用。
        const snapshotBytes = summary.hasSearchSnapshot ? (snapshot?.snapshotSize ?? 0) : 0;
        if (storageStatus) storageStatus.textContent = formatBytes(Math.max(0, (estimate?.usage ?? 0) - snapshotBytes));
        if (snapshotStatus) snapshotStatus.textContent = formatBytes(snapshotBytes);
        if (indexStatus) {
            indexStatus.textContent = summary.hasSearchSnapshot ? '已就绪' : '缺失，需要重建';
        }
        if (lastSyncStatus) {
            lastSyncStatus.textContent = generation?.committedAt ? formatDateTime(generation.committedAt) : '尚未同步';
        }
    } catch (error) {
        for (const element of [
            pageCountStatus,
            visitCountStatus,
            storageStatus,
            snapshotStatus,
            indexStatus,
            lastSyncStatus,
        ]) {
            if (element) element.textContent = '不可用';
        }
        console.error('[histories] refreshStatus failed', error);
    }
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
        jobsList.textContent = '暂无任务。';
        setJobStatus(activeJobLabel());
        return;
    }

    jobsList.className = 'job-list';
    jobsList.innerHTML = jobs
        .map(
            (job) => `
        <div class="job-row">
          <div class="job-status status-${job.status}">${escapeHtml(jobStatusLabel(job.status))}</div>
          <div class="job-detail">${escapeHtml(jobTypeLabel(job.type))} · ${escapeHtml(formatJobProgress(job))}</div>
          <div class="job-time">${escapeHtml(formatDateTime(job.updatedAt))}</div>
        </div>
      `,
        )
        .join('');

    setJobStatus(activeJobLabel(jobs[0]));
}

function syncControls(): void {
    const importing = Boolean(importJobId);
    const syncing = Boolean(syncJobId);
    const exporting = Boolean(exportJobId);
    const rebuilding = Boolean(rebuildJobId);
    const busy = importing || syncing || exporting || rebuilding;

    if (importButton) importButton.disabled = busy;
    if (cancelImportButton) cancelImportButton.disabled = !importing;
    if (syncButton) syncButton.disabled = busy;
    if (cancelSyncButton) cancelSyncButton.disabled = !syncing;
    if (exportButton) exportButton.disabled = busy;
    if (cancelExportButton) cancelExportButton.disabled = !exporting;
    if (rebuildButton) rebuildButton.disabled = busy;
    if (cancelRebuildButton) cancelRebuildButton.disabled = !rebuilding;
    if (nativeExportButton) nativeExportButton.disabled = nativeOperationRunning || busy;
    if (nativeRestoreButton) nativeRestoreButton.disabled = nativeOperationRunning || busy;
}

function activeJobLabel(latestJob?: JobRecord): string {
    if (syncJobId) return '正在补全浏览器历史';
    if (exportJobId) return '正在导出';
    if (rebuildJobId) return '正在重建搜索索引';
    if (importJobId) return '正在导入';
    return latestJob ? jobStatusLabel(latestJob.status) : '空闲';
}

function jobStatusLabel(status: JobRecord['status']): string {
    switch (status) {
        case 'queued':
            return '排队中';
        case 'running':
            return '运行中';
        case 'complete':
            return '已完成';
        case 'failed':
            return '失败';
        case 'cancelled':
            return '已取消';
        default:
            return status;
    }
}

function jobTypeLabel(type: JobRecord['type']): string {
    switch (type) {
        case 'history-sync':
            return '历史同步';
        case 'htu-import':
            return 'HTU 导入';
        case 'htu-export':
            return 'HTU 导出';
        case 'search-rebuild':
            return '搜索索引重建';
        case 'stats-build':
            return '统计构建';
        default:
            return type;
    }
}

function setResultSummary(text: string): void {
    if (resultSummary) resultSummary.textContent = text;
}

function setJobStatus(text: string): void {
    if (jobStatus) jobStatus.textContent = text;
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
    if (!progress) return '无进度信息';

    if (job.type === 'search-rebuild') {
        return `已处理 ${formatCount(progress.writtenPages ?? progress.pageCount ?? 0)} / ${formatCount(
            progress.pages ?? progress.pageCount ?? 0,
        )} 个页面`;
    }
    if (job.type === 'history-sync') {
        return `发现 ${formatCount(progress.items ?? 0)} 项，写入 ${formatCount(
            progress.writtenVisits ?? 0,
        )} / ${formatCount(progress.visits ?? 0)} 次访问`;
    }
    if (job.type === 'htu-export') {
        return `导出 ${formatCount(progress.pages ?? 0)} 个页面，${formatCount(
            progress.writtenRows ?? progress.visits ?? 0,
        )} 行，${formatBytes(progress.bytes ?? 0)}`;
    }

    return `读取 ${formatCount(progress.rows ?? 0)} 行，写入 ${formatCount(
        progress.writtenPages ?? 0,
    )} / ${formatCount(progress.pages ?? 0)} 个页面`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function reconcileActiveJobs(jobs: JobRecord[]): void {
    reconcileJob('history-sync', syncJobId, jobs, (job) => {
        syncJobId = null;
        if (job.status === 'complete') {
            void refreshStatus();
            setResultSummary('浏览器历史补全完成。');
        } else if (job.status === 'failed') {
            setResultSummary(job.error ?? '浏览器历史补全失败。');
        } else if (job.status === 'cancelled') {
            setResultSummary('浏览器历史补全已取消。');
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
