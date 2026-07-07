import { normalizeHistoryUrl } from '../storage/database';
import type { PageInput, VisitInput } from '../storage/schema';

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
  stage: 'search' | 'visits' | 'pages' | 'stored-visits' | 'done';
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
  const startTime = Math.max(0, Math.floor(options.startTime ?? 0));
  const maxResults = normalizeBatchSize(options.maxResults, DEFAULT_MAX_RESULTS);
  const pageBatchSize = normalizeBatchSize(options.pageBatchSize, DEFAULT_PAGE_BATCH_SIZE);
  const visitBatchSize = normalizeBatchSize(options.visitBatchSize, DEFAULT_VISIT_BATCH_SIZE);
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
  const visitDrafts: Array<{
    id: string;
    normalizedUrl: string;
    visitTime: number;
    transition: string;
  }> = [];
  let maxVisitTime = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    throwIfAborted(options.signal);
    const item = items[itemIndex];
    if (!item.url) continue;

    const normalizedUrl = normalizeHistoryUrl(item.url);
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
        transition
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

    const existing = pagesByNormalizedUrl.get(normalizedUrl);
    const title = item.title ?? existing?.title ?? '';
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

  const pages = [...pagesByNormalizedUrl.values()];
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
      items: items.length,
      pages: pages.length,
      visits: visitDrafts.length,
      writtenPages,
      writtenVisits: 0,
      maxVisitTime
    });
  }

  let writtenVisits = 0;
  for (let start = 0; start < visitDrafts.length; start += visitBatchSize) {
    throwIfAborted(options.signal);
    const visitBatch = visitDrafts.slice(start, start + visitBatchSize).map((visit): VisitInput => {
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
      items: items.length,
      pages: pages.length,
      visits: visitDrafts.length,
      writtenPages,
      writtenVisits,
      maxVisitTime
    });
  }

  const result = {
    stage: 'done' as const,
    items: items.length,
    pages: pages.length,
    visits: visitDrafts.length,
    writtenPages,
    writtenVisits,
    maxVisitTime,
    startTime,
    nextStartTime: maxVisitTime > 0 ? maxVisitTime + 1 : startTime
  };
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
  options: HistorySyncOptions,
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
