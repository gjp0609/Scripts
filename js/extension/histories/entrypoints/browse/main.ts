import '../../src/ui/base.css';
import './history.css';
import { createRuntimeAdapter } from '../../src/runtime/browser-adapter';
import { SearchEngine, type SearchCursor, type SearchResult } from '../../src/search/search-engine';
import { createIndexedDbSearchStorage } from '../../src/search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../../src/search/sqlite-wasm-runtime';
import { renderSidebar } from '../../src/ui/navigation';
import { renderResultsHtml } from '../../src/ui/result-row';
import {
    escapeHtml,
    formatCount,
    parseDatetimeLocal,
    toDatetimeLocalValue,
    type TimeDisplay,
} from '../../src/ui/format';

const runtime = createRuntimeAdapter();
const searchStorage = createIndexedDbSearchStorage();
const PAGE_SIZE = 50;

const sidebar = document.querySelector<HTMLElement>('#sidebar');
const runtimeStatus = document.querySelector<HTMLElement>('#runtimeStatus');
const searchForm = document.querySelector<HTMLFormElement>('#search_controls');
const keywordsInput = document.querySelector<HTMLInputElement>('#keywords');
const clearSearchButton = document.querySelector<HTMLButtonElement>('#clear_search');
const fromTimeInput = document.querySelector<HTMLInputElement>('#from_time');
const toTimeInput = document.querySelector<HTMLInputElement>('#to_time');
const alerts = document.querySelector<HTMLElement>('#alerts');
const resultsTable = document.querySelector<HTMLTableElement>('#results');
const topControls = document.querySelector<HTMLElement>('#search_result_controls_top');
const bottomControls = document.querySelector<HTMLElement>('#search_result_controls_bottom');
const waitingContainer = document.querySelector<HTMLElement>('#waiting_container');
const waitingProgress = document.querySelector<HTMLElement>('#waiting_progress');

const pagerButtons = {
    next: [
        document.querySelector<HTMLButtonElement>('#next_top'),
        document.querySelector<HTMLButtonElement>('#next_bottom'),
    ],
    previous: [
        document.querySelector<HTMLButtonElement>('#previous_top'),
        document.querySelector<HTMLButtonElement>('#previous_bottom'),
    ],
};

let searchRuntimePromise: ReturnType<typeof loadSqliteWasmSearchRuntime> | undefined;
let searchReader: SearchEngine | null = null;
let searchCheckpointTimer: number | undefined;
let timeDisplay: TimeDisplay = '24';
let openLinksInNewTab = true;

/**
 * 分页状态。pageCursors[i] 是渲染第 i 页所用的游标（第 0 页为 undefined），
 * 这样「上一页」只是回退下标，不需要重新推导游标。
 */
let pageCursors: Array<SearchCursor | undefined> = [undefined];
let pageIndex = 0;
/** 当前页返回的 nextCursor，用于前进到下一页。 */
let nextCursorForPage: SearchCursor | undefined;
let hasNextPage = false;
/**
 * 首次查询时冻结的水位。翻页期间新产生的访问不应改变结果集，
 * 否则「上一页」会看到与首次不同的内容。
 */
let searchWatermark = 0;

async function boot(): Promise<void> {
    renderSidebar(sidebar, 'browse.html', (page) => void runtime.openExtensionPage(page));
    [timeDisplay, openLinksInNewTab] = await Promise.all([runtime.getTimeDisplay(), runtime.getOpenLinksInNewTab()]);

    try {
        const response = await runtime.sendMessage<{ version?: string }>({ type: 'histories:ping' });
        if (runtimeStatus) runtimeStatus.textContent = response?.version ? `已连接 ${response.version}` : '已连接';
    } catch (error) {
        if (runtimeStatus) runtimeStatus.textContent = '后台未响应';
        console.error('[histories] runtime ping failed', error);
    }

    // 启动后立即展示最新记录，与 HTU 打开即出列表的行为一致。
    await startNewSearch();
}

searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void startNewSearch();
});

clearSearchButton?.addEventListener('click', () => {
    if (keywordsInput) keywordsInput.value = '';
    if (fromTimeInput) fromTimeInput.value = '';
    if (toTimeInput) toTimeInput.value = '';
    void startNewSearch();
});

for (const button of pagerButtons.next) {
    button?.addEventListener('click', () => void goToNextPage());
}
for (const button of pagerButtons.previous) {
    button?.addEventListener('click', () => void goToPreviousPage());
}

/** 输入内容变化时决定「清除」按钮是否可见。 */
function syncClearButton(): void {
    const hasInput = Boolean(keywordsInput?.value || fromTimeInput?.value || toTimeInput?.value);
    clearSearchButton?.classList.toggle('invisible', !hasInput);
}

for (const input of [keywordsInput, fromTimeInput, toTimeInput]) {
    input?.addEventListener('input', syncClearButton);
}

async function startNewSearch(): Promise<void> {
    pageCursors = [undefined];
    pageIndex = 0;
    searchWatermark = parseDatetimeLocal(toTimeInput?.value) ?? Date.now();
    await runSearch();
}

async function goToNextPage(): Promise<void> {
    if (!hasNextPage || !nextCursorForPage) return;
    pageCursors[pageIndex + 1] = nextCursorForPage;
    pageIndex += 1;
    await runSearch();
}

async function goToPreviousPage(): Promise<void> {
    if (pageIndex === 0) return;
    pageIndex -= 1;
    await runSearch();
}

async function runSearch(): Promise<void> {
    syncClearButton();
    const keyword = keywordsInput?.value ?? '';
    const startTime = parseDatetimeLocal(fromTimeInput?.value);
    const cursor = pageCursors[pageIndex];

    setWaiting(true);
    setAlerts('');
    try {
        const engine = await ensureSearchReader();
        const page = await engine.searchPage({
            keyword,
            startTime,
            // 首屏传冻结水位；翻页只传游标，水位由游标自带，避免结果集漂移。
            endTime: cursor ? undefined : searchWatermark,
            limit: PAGE_SIZE,
            cursor,
        });
        nextCursorForPage = page.nextCursor;
        hasNextPage = Boolean(page.nextCursor);
        renderResults(page.results);
        renderPagination(page.results.length);
    } catch (error) {
        renderResults([]);
        setAlerts(error instanceof Error ? error.message : String(error), 'error');
        hidePagination();
    } finally {
        setWaiting(false);
    }
}

async function ensureSearchReader(): Promise<SearchEngine> {
    if (searchReader) return searchReader;

    const searchRuntime = await getSearchRuntime();
    searchReader = new SearchEngine({ runtime: searchRuntime, storage: searchStorage });
    try {
        await searchReader.loadSnapshot();
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !/No latest search snapshot|Unsupported search snapshot|mismatch|not loaded/i.test(error.message)
        ) {
            throw error;
        }
        if (waitingProgress) waitingProgress.textContent = '首次使用，正在建立搜索索引…';
        await searchReader.rebuildSnapshot();
        return searchReader;
    }

    // 后台同步可能已写入新数据，这里补一次增量刷新，否则刚访问的页面搜不到。
    try {
        const incremental = await searchReader.refreshSnapshotIncremental({ checkpoint: false });
        if (incremental.updatedPages > 0) scheduleSearchCheckpoint();
    } catch (error) {
        console.warn('[histories] incremental snapshot refresh failed', error);
    }
    return searchReader;
}

/** 增量刷新只改内存索引，延迟落盘避免每次搜索都写整份快照。 */
function scheduleSearchCheckpoint(): void {
    if (searchCheckpointTimer !== undefined) return;
    searchCheckpointTimer = window.setTimeout(() => {
        searchCheckpointTimer = undefined;
        void searchReader?.refreshSnapshotIncremental({ checkpoint: true }).catch((error) => {
            console.warn('[histories] deferred search checkpoint failed', error);
        });
    }, 30_000);
}

async function getSearchRuntime() {
    searchRuntimePromise ??= loadSqliteWasmSearchRuntime({
        scriptUrl: new URL('/sqlite/sqlite3.js', location.href).toString(),
    });
    return await searchRuntimePromise;
}

function renderResults(rows: SearchResult[]): void {
    if (!resultsTable) return;

    resultsTable.style.display = '';
    if (rows.length === 0) {
        resultsTable.innerHTML = `<tr><td colspan="3" id="no_results_text">没有匹配的记录。</td></tr>`;
        return;
    }

    resultsTable.innerHTML = renderResultsHtml(rows, {
        timeDisplay,
        openLinksInNewTab,
        faviconUrl: undefined,
    });
    // favicon 需按行取址，统一在插入 DOM 后填充，避免在纯渲染函数里访问扩展 API。
    for (const [index, row] of rows.entries()) {
        const url = runtime.faviconUrl(row.url);
        if (!url) continue;
        const cell = resultsTable.querySelectorAll('td.faviconColumn')[index];
        if (!cell) continue;
        const image = document.createElement('img');
        image.src = url;
        image.width = 16;
        image.height = 16;
        image.alt = '';
        cell.append(image);
    }
    bindDayDividers();
}

/** 点击日期分隔行按该日重新筛选，对应 HTU 的 dateSearchAction。 */
function bindDayDividers(): void {
    for (const link of resultsTable?.querySelectorAll<HTMLAnchorElement>('.new_day a') ?? []) {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const start = Number(link.dataset.dayStart);
            const end = Number(link.dataset.dayEnd);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return;
            if (fromTimeInput) fromTimeInput.value = toDatetimeLocalValue(start);
            if (toTimeInput) toTimeInput.value = toDatetimeLocalValue(end);
            void startNewSearch();
        });
    }
}

function renderPagination(resultCount: number): void {
    const text =
        resultCount === 0
            ? '没有结果'
            : `本页 ${formatCount(resultCount)} 条${hasNextPage ? '，还有更多结果' : '，已到末尾'}`;

    for (const span of document.querySelectorAll<HTMLElement>('.pagination')) {
        span.textContent = text;
    }

    if (topControls) topControls.style.display = '';
    if (bottomControls) bottomControls.style.display = '';
    for (const button of pagerButtons.next) {
        button?.classList.toggle('invisible', !hasNextPage);
    }
    for (const button of pagerButtons.previous) {
        button?.classList.toggle('invisible', pageIndex === 0);
    }
}

function hidePagination(): void {
    if (topControls) topControls.style.display = 'none';
    if (bottomControls) bottomControls.style.display = 'none';
}

function setWaiting(waiting: boolean): void {
    if (waitingContainer) waitingContainer.style.display = waiting ? '' : 'none';
}

function setAlerts(text: string, kind: 'error' | 'success' | 'info' = 'info'): void {
    if (!alerts) return;
    alerts.textContent = text;
    alerts.className = kind === 'error' ? 'alerts-error' : kind === 'success' ? 'alerts-success' : '';
}

window.addEventListener('beforeunload', () => {
    searchReader?.close();
    if (searchCheckpointTimer !== undefined) window.clearTimeout(searchCheckpointTimer);
});

void boot();
