import { normalizeHistoryUrl } from '../storage/database';
import type { PageChunkRow, VisitChunkRow } from '../storage/database';
import type { PageChunkRecord, PageInput, VisitChunkRecord, VisitInput } from '../storage/schema';

const DEFAULT_PAGE_BATCH_SIZE = 1000;
const DEFAULT_VISIT_BATCH_SIZE = 5000;
const DEFAULT_MAX_RESULTS = 1_000_000_000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export type BrowserHistoryItem = {
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
};

export type BrowserHistoryVisit = {
  visitId?: string | number;
  visitTime?: number;
  transition?: string;
  referringVisitId?: string | number;
};

export type BrowserHistoryReader = {
  search: (query: { text: string; startTime: number; maxResults: number }) => Promise<BrowserHistoryItem[]>;
  getVisits: (details: { url: string }) => Promise<BrowserHistoryVisit[]>;
};

export type HistorySyncProgress = {
  stage: 'search' | 'visits' | 'pages' | 'stored-visits' | 'chunks' | 'done';
  items: number;
  pages: number;
  visits: number;
  writtenPages: number;
  writtenVisits: number;
  maxVisitTime: number;
};

export type HistorySyncResult = HistorySyncProgress & {
  startTime: number;
  nextStartTime: number;
};

export type HistorySyncVisitDraft = {
  id: string;
  normalizedUrl: string;
  visitTime: number;
  transition: string;
  title: string;
};

export type HistorySyncPlan = {
  items: number;
  pages: PageInput[];
  visits: HistorySyncVisitDraft[];
  maxVisitTime: number;
  startTime: number;
};

export type HistorySyncStorage = {
  upsertPages: (inputs: PageInput[]) => Promise<Array<{ id: number; normalizedUrl: string }>>;
  putVisits: (visits: VisitInput[]) => Promise<number>;
};

export type HistorySyncOptions = {
  history: BrowserHistoryReader;
  storage: HistorySyncStorage;
  startTime?: number;
  maxResults?: number;
  pageBatchSize?: number;
  visitBatchSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: HistorySyncProgress) => void | Promise<void>;
};

export async function syncBrowserHistory(options: HistorySyncOptions): Promise<HistorySyncResult> {
  const plan = await collectBrowserHistorySyncPlan(options);
  return await storeBrowserHistorySyncPlan(options, plan);
}

export async function collectBrowserHistorySyncPlan(
  options: Pick<
    HistorySyncOptions,
    'history' | 'startTime' | 'maxResults' | 'signal' | 'onProgress'
  >
): Promise<HistorySyncPlan> {
  const startTime = Math.max(0, Math.floor(options.startTime ?? 0));
  const maxResults = normalizeBatchSize(options.maxResults, DEFAULT_MAX_RESULTS);
  const now = Date.now();

  throwIfAborted(options.signal);
  const items = await options.history.search({
    text: '',
    startTime,
    maxResults
  });

  await emitProgress(options, {
    stage: 'search',
    items: items.length,
    pages: 0,
    visits: 0,
    writtenPages: 0,
    writtenVisits: 0,
    maxVisitTime: 0
  });

  const pagesByNormalizedUrl = new Map<string, PageInput>();
  const visitDrafts: HistorySyncVisitDraft[] = [];
  let maxVisitTime = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    throwIfAborted(options.signal);
    const item = items[itemIndex];
    if (!item.url) continue;

    const normalizedUrl = normalizeHistoryUrl(item.url);
    const existing = pagesByNormalizedUrl.get(normalizedUrl);
    const title = item.title ?? existing?.title ?? '';
    const visits = await options.history.getVisits({ url: item.url });
    let pageVisitCount = 0;
    let pageLastVisitTime = 0;

    visits.forEach((visit, visitIndex) => {
      const visitTime = Number(visit.visitTime);
      if (!Number.isFinite(visitTime) || visitTime < startTime || visitTime > now + FUTURE_SKEW_MS) {
        return;
      }

      const transition = normalizeTransition(visit.transition);
      visitDrafts.push({
        id: makeBrowserVisitId(normalizedUrl, visit, visitTime, visitIndex),
        normalizedUrl,
        visitTime,
        transition,
        title
      });
      pageVisitCount += 1;
      pageLastVisitTime = Math.max(pageLastVisitTime, visitTime);
      if (visitTime <= now) {
        maxVisitTime = Math.max(maxVisitTime, visitTime);
      }
    });

    if (pageVisitCount === 0 && Number(item.lastVisitTime) >= startTime && Number(item.lastVisitTime) <= now) {
      pageLastVisitTime = Number(item.lastVisitTime);
      maxVisitTime = Math.max(maxVisitTime, pageLastVisitTime);
    }

    const candidate: PageInput = {
      url: item.url,
      normalizedUrl,
      title,
      visitCount: Math.max(Number(item.visitCount) || 0, pageVisitCount, existing?.visitCount ?? 0),
      lastVisitTime: Math.max(Number(item.lastVisitTime) || 0, pageLastVisitTime, existing?.lastVisitTime ?? 0)
    };

    pagesByNormalizedUrl.set(normalizedUrl, {
      ...existing,
      ...candidate,
      title: title || existing?.title || ''
    });

    await emitProgress(options, {
      stage: 'visits',
      items: items.length,
      pages: pagesByNormalizedUrl.size,
      visits: visitDrafts.length,
      writtenPages: 0,
      writtenVisits: 0,
      maxVisitTime
    });
  }

  return {
    items: items.length,
    pages: [...pagesByNormalizedUrl.values()],
    visits: visitDrafts,
    maxVisitTime,
    startTime
  };
}

export async function storeBrowserHistorySyncPlan(
  options: Pick<
    HistorySyncOptions,
    'storage' | 'pageBatchSize' | 'visitBatchSize' | 'signal' | 'onProgress'
  >,
  plan: HistorySyncPlan
): Promise<HistorySyncResult> {
  const pageBatchSize = normalizeBatchSize(options.pageBatchSize, DEFAULT_PAGE_BATCH_SIZE);
  const visitBatchSize = normalizeBatchSize(options.visitBatchSize, DEFAULT_VISIT_BATCH_SIZE);
  const pages = plan.pages;
  const pageIds = new Map<string, number>();
  let writtenPages = 0;

  for (let start = 0; start < pages.length; start += pageBatchSize) {
    throwIfAborted(options.signal);
    const pageBatch = pages.slice(start, start + pageBatchSize);
    const storedPages = await options.storage.upsertPages(pageBatch);
    storedPages.forEach((page) => pageIds.set(page.normalizedUrl, page.id));
    writtenPages += storedPages.length;

    await emitProgress(options, {
      stage: 'pages',
      items: plan.items,
      pages: pages.length,
      visits: plan.visits.length,
      writtenPages,
      writtenVisits: 0,
      maxVisitTime: plan.maxVisitTime
    });
  }

  let writtenVisits = 0;
  for (let start = 0; start < plan.visits.length; start += visitBatchSize) {
    throwIfAborted(options.signal);
    const visitBatch = plan.visits.slice(start, start + visitBatchSize).map((visit): VisitInput => {
      const pageId = pageIds.get(visit.normalizedUrl);
      if (pageId === undefined) {
        throw new Error(`Missing page id for normalized URL: ${visit.normalizedUrl}`);
      }

      return {
        id: visit.id,
        pageId,
        visitTime: visit.visitTime,
        transition: visit.transition
      };
    });

    writtenVisits += await options.storage.putVisits(visitBatch);
    await emitProgress(options, {
      stage: 'stored-visits',
      items: plan.items,
      pages: pages.length,
      visits: plan.visits.length,
      writtenPages,
      writtenVisits,
      maxVisitTime: plan.maxVisitTime
    });
  }

  const result = {
    stage: 'done' as const,
    items: plan.items,
    pages: pages.length,
    visits: plan.visits.length,
    writtenPages,
    writtenVisits,
    maxVisitTime: plan.maxVisitTime,
    startTime: plan.startTime,
    nextStartTime: plan.maxVisitTime > 0 ? plan.maxVisitTime + 1 : plan.startTime
  };
  await emitProgress(options, result);
  return result;
}

export type ExistingChunkVisitRow = VisitChunkRow & {
  normalizedUrl: string;
  title: string;
};

export type ChunkSyncMergeOptions = {
  plan: HistorySyncPlan;
  existingPages: PageChunkRow[];
  existingVisits: ExistingChunkVisitRow[];
  pageChunkSize?: number;
  visitChunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: HistorySyncProgress) => void | Promise<void>;
};

export type ChunkSyncMergeResult = HistorySyncResult & {
  pageChunks: PageChunkRecord[];
  visitChunks: VisitChunkRecord[];
};

export async function mergeHistorySyncPlanIntoChunks(
  options: ChunkSyncMergeOptions
): Promise<ChunkSyncMergeResult> {
  throwIfAborted(options.signal);
  const pageChunkSize = normalizeBatchSize(options.pageChunkSize, DEFAULT_PAGE_BATCH_SIZE);
  const visitChunkSize = normalizeBatchSize(options.visitChunkSize, DEFAULT_VISIT_BATCH_SIZE);

  const existingPagesByNormalizedUrl = new Map(
    options.existingPages.map((page) => [page.normalizedUrl, page] as const)
  );
  const pageRowsById = new Map<number, PageChunkRow>();
  options.existingPages.forEach((page) => {
    pageRowsById.set(page.id, { ...page });
  });

  const maxExistingPageId = options.existingPages.reduce((max, page) => Math.max(max, page.id), 0);
  let nextPageId = maxExistingPageId + 1;
  let nextSourceIndex =
    options.existingVisits.reduce((max, visit) => Math.max(max, visit.sourceIndex), -1) + 1;

  const pageIdsByNormalizedUrl = new Map<string, number>();
  options.existingPages.forEach((page) => pageIdsByNormalizedUrl.set(page.normalizedUrl, page.id));

  for (const pageInput of options.plan.pages) {
    const normalizedUrl = pageInput.normalizedUrl ?? normalizeHistoryUrl(pageInput.url);
    const existing = existingPagesByNormalizedUrl.get(normalizedUrl);
    if (existing) {
      const nextRow = pageRowsById.get(existing.id) ?? existing;
      const candidateLastVisitTime = Math.max(pageInput.lastVisitTime ?? 0, nextRow.lastVisitTime);
      pageRowsById.set(existing.id, {
        ...nextRow,
        url: candidateLastVisitTime >= nextRow.lastVisitTime ? pageInput.url : nextRow.url,
        title:
          pageInput.title && candidateLastVisitTime >= nextRow.lastVisitTime ? pageInput.title : nextRow.title,
        lastVisitTime: candidateLastVisitTime
      });
      pageIdsByNormalizedUrl.set(normalizedUrl, existing.id);
      continue;
    }

    const pageId = nextPageId;
    nextPageId += 1;
    pageRowsById.set(pageId, {
      id: pageId,
      url: pageInput.url,
      normalizedUrl,
      title: pageInput.title ?? '',
      visitCount: pageInput.visitCount ?? 0,
      lastVisitTime: pageInput.lastVisitTime ?? 0,
      chunkId: '',
      chunkIndex: 0
    });
    pageIdsByNormalizedUrl.set(normalizedUrl, pageId);
  }

  const existingVisitKeys = new Set(
    options.existingVisits.map((visit) => makeVisitDedupKey(visit.normalizedUrl, visit.visitTime, visit.transition))
  );
  const mergedVisits: ExistingChunkVisitRow[] = [...options.existingVisits];
  const pendingNewVisits: Array<Omit<ExistingChunkVisitRow, 'sourceIndex'>> = [];

  for (const visit of options.plan.visits) {
    throwIfAborted(options.signal);
    const visitKey = makeVisitDedupKey(visit.normalizedUrl, visit.visitTime, visit.transition);
    if (existingVisitKeys.has(visitKey)) continue;
    const pageId = pageIdsByNormalizedUrl.get(visit.normalizedUrl);
    if (pageId === undefined) {
      throw new Error(`Missing page id for normalized URL: ${visit.normalizedUrl}`);
    }

    pendingNewVisits.push({
      id: '',
      pageId,
      normalizedUrl: visit.normalizedUrl,
      visitTime: visit.visitTime,
      transition: visit.transition,
      title: visit.title,
      chunkId: '',
      chunkIndex: 0
    });
    existingVisitKeys.add(visitKey);
  }

  pendingNewVisits
    .sort((left, right) => left.visitTime - right.visitTime || left.pageId - right.pageId)
    .forEach((visit) => {
      mergedVisits.push({
        ...visit,
        id: `sync:${visit.pageId}:${visit.visitTime}:${nextSourceIndex}`,
        sourceIndex: nextSourceIndex
      });
      nextSourceIndex += 1;
    });

  mergedVisits.sort(
    (left, right) =>
      left.visitTime - right.visitTime ||
      left.sourceIndex - right.sourceIndex ||
      left.pageId - right.pageId
  );

  const visitStats = new Map<number, { visitCount: number; lastVisitTime: number }>();
  for (const visit of mergedVisits) {
    const existing = visitStats.get(visit.pageId);
    if (existing) {
      existing.visitCount += 1;
      existing.lastVisitTime = Math.max(existing.lastVisitTime, visit.visitTime);
    } else {
      visitStats.set(visit.pageId, {
        visitCount: 1,
        lastVisitTime: visit.visitTime
      });
    }
  }

  const orderedPages = [...pageRowsById.values()]
    .sort((left, right) => left.id - right.id)
    .map((page) => {
      const stats = visitStats.get(page.id);
      return {
        ...page,
        visitCount: stats?.visitCount ?? page.visitCount,
        lastVisitTime: stats?.lastVisitTime ?? page.lastVisitTime
      };
    });

  const pageChunks = buildPageChunksFromRows(orderedPages, pageChunkSize);
  const visitChunks = buildVisitChunksFromRows(mergedVisits, visitChunkSize);
  const result = {
    stage: 'done' as const,
    items: options.plan.items,
    pages: orderedPages.length,
    visits: mergedVisits.length,
    writtenPages: orderedPages.length,
    writtenVisits: mergedVisits.length,
    maxVisitTime: Math.max(
      options.plan.maxVisitTime,
      mergedVisits.reduce((max, visit) => Math.max(max, visit.visitTime), 0)
    ),
    startTime: options.plan.startTime,
    nextStartTime:
      Math.max(options.plan.maxVisitTime, mergedVisits.reduce((max, visit) => Math.max(max, visit.visitTime), 0)) > 0
        ? Math.max(options.plan.maxVisitTime, mergedVisits.reduce((max, visit) => Math.max(max, visit.visitTime), 0)) + 1
        : options.plan.startTime,
    pageChunks,
    visitChunks
  };

  await emitProgress(options, {
    stage: 'chunks',
    items: result.items,
    pages: result.pages,
    visits: result.visits,
    writtenPages: result.writtenPages,
    writtenVisits: result.writtenVisits,
    maxVisitTime: result.maxVisitTime
  });
  await emitProgress(options, result);
  return result;
}

export function makeBrowserVisitId(
  normalizedUrl: string,
  visit: BrowserHistoryVisit,
  visitTime: number,
  visitIndex: number
): string {
  const visitIdPart = visit.visitId ?? 'na';
  const referringPart = visit.referringVisitId ?? 'na';
  const transitionPart = normalizeTransition(visit.transition);
  return `sync:${normalizedUrl}:${visitTime}:${visitIdPart}:${referringPart}:${transitionPart}:${visitIndex}`;
}

async function emitProgress(
  options: { signal?: AbortSignal; onProgress?: (progress: HistorySyncProgress) => void | Promise<void> },
  progress: HistorySyncProgress
): Promise<void> {
  throwIfAborted(options.signal);
  await options.onProgress?.(progress);
}

function normalizeTransition(transition: string | undefined): string {
  return typeof transition === 'string' && transition.length > 0 ? transition : 'link';
}

function normalizeBatchSize(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) < 1) return fallback;
  return Math.floor(value as number);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function makeVisitDedupKey(normalizedUrl: string, visitTime: number, transition: string): string {
  return `${normalizedUrl}\t${visitTime}\t${transition}`;
}

function buildPageChunksFromRows(rows: PageChunkRow[], chunkSize: number): PageChunkRecord[] {
  const chunks: PageChunkRecord[] = [];

  for (let start = 0; start < rows.length; start += chunkSize) {
    const rowsInChunk = rows.slice(start, start + chunkSize);
    const visitCounts = new Uint32Array(rowsInChunk.length);
    const lastVisitTimes = new Float64Array(rowsInChunk.length);

    rowsInChunk.forEach((row, index) => {
      visitCounts[index] = row.visitCount;
      lastVisitTimes[index] = row.lastVisitTime;
    });

    chunks.push({
      id: `page-chunk:${chunks.length}`,
      firstPageId: rowsInChunk[0]?.id ?? start + 1,
      count: rowsInChunk.length,
      urls: rowsInChunk.map((row) => row.url),
      normalizedUrls: rowsInChunk.map((row) => row.normalizedUrl),
      titles: rowsInChunk.map((row) => row.title),
      visitCounts,
      lastVisitTimes
    });
  }

  return chunks;
}

function buildVisitChunksFromRows(rows: ExistingChunkVisitRow[], chunkSize: number): VisitChunkRecord[] {
  const chunks: VisitChunkRecord[] = [];

  for (let start = 0; start < rows.length; start += chunkSize) {
    const rowsInChunk = rows.slice(start, start + chunkSize);
    const pageIds = new Uint32Array(rowsInChunk.length);
    const visitTimes = new Float64Array(rowsInChunk.length);
    const transitionCodes = new Uint8Array(rowsInChunk.length);
    const sourceIndexes = new Uint32Array(rowsInChunk.length);
    const titles = new Array<string>(rowsInChunk.length);

    rowsInChunk.forEach((row, index) => {
      pageIds[index] = row.pageId;
      visitTimes[index] = row.visitTime;
      transitionCodes[index] = encodeTransition(row.transition);
      sourceIndexes[index] = row.sourceIndex;
      titles[index] = row.title;
    });

    chunks.push({
      id: `visit-chunk:${chunks.length}`,
      minVisitTime: rowsInChunk[0]?.visitTime ?? 0,
      maxVisitTime: rowsInChunk[rowsInChunk.length - 1]?.visitTime ?? 0,
      count: rowsInChunk.length,
      pageIds,
      visitTimes,
      transitionCodes,
      sourceIndexes,
      titles
    });
  }

  return chunks;
}

function encodeTransition(transition: string): number {
  switch (transition) {
    case 'link':
      return 0;
    case 'typed':
      return 1;
    case 'auto_bookmark':
      return 2;
    case 'auto_subframe':
      return 3;
    case 'manual_subframe':
      return 4;
    case 'generated':
      return 5;
    case 'auto_toplevel':
      return 6;
    case 'form_submit':
      return 7;
    case 'reload':
      return 8;
    case 'keyword':
      return 9;
    case 'keyword_generated':
      return 10;
    default:
      return 255;
  }
}
