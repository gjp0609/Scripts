import { parseHtuTsv } from '../htu/tsv.js';
import {
  addPages,
  normalizeHistoryUrl,
  putVisits,
  replacePageChunks,
  replaceVisitChunks,
  upsertPages
} from '../storage/database';
import type { PageChunkRecord, PageInput, VisitChunkRecord, VisitInput } from '../storage/schema';

const DEFAULT_VISIT_CHUNK_SIZE = 20000;
const DEFAULT_PAGE_CHUNK_SIZE = 20000;
const DEFAULT_VISIT_STORAGE = 'chunks';
const DEFAULT_PAGE_STORAGE = 'chunks';
const DEFAULT_PAGE_ARRAY_CHUNK_SIZE = 8192;
const DEFAULT_VISIT_ARRAY_CHUNK_SIZE = 8192;

export type HtuImportRow = {
  url: string;
  visitTime: number;
  transition: string;
  title: string | null;
};

export type HtuImportVisitDraft = {
  normalizedUrl: string;
  visitTime: number;
  transition: string;
  title: string | null;
  sourceIndex: number;
};

export type HtuImportPlan = {
  pages: PageInput[];
  visits: HtuImportVisitDraft[];
};

export type HtuImportProgress = {
  stage: 'parsed' | 'pages' | 'visits' | 'done';
  rows: number;
  pages: number;
  visits: number;
  writtenPages: number;
  writtenVisits: number;
};

export type HtuImportResult = HtuImportProgress & {
  errors: number;
};

export type HtuImportOptions = {
  pageChunkSize?: number;
  pageStorage?: 'chunks' | 'records';
  pageWriteMode?: 'insert' | 'upsert';
  visitChunkSize?: number;
  visitStorage?: 'chunks' | 'records';
  signal?: AbortSignal;
  onProgress?: (progress: HtuImportProgress) => void | Promise<void>;
};

export async function importHtuText(
  text: string,
  options: HtuImportOptions = {}
): Promise<HtuImportResult> {
  throwIfAborted(options.signal);
  const parsed = parseHtuTsv(text);
  if (parsed.errors.length > 0) {
    throw new Error(`HTU import failed: ${parsed.errors.length} invalid rows`);
  }

  const plan = planHtuImport(parsed.rows);
  throwIfAborted(options.signal);
  await emitProgress(options, {
    stage: 'parsed',
    rows: parsed.rows.length,
    pages: plan.pages.length,
    visits: plan.visits.length,
    writtenPages: 0,
    writtenVisits: 0
  });

  const pageIds = new Map<string, number>();
  const pageChunkSize = normalizeChunkSize(options.pageChunkSize, DEFAULT_PAGE_CHUNK_SIZE);
  const pageStorage = options.pageStorage ?? DEFAULT_PAGE_STORAGE;
  let writtenPages = 0;

  if (pageStorage === 'chunks') {
    throwIfAborted(options.signal);
    plan.pages.forEach((page, index) => {
      pageIds.set(page.normalizedUrl ?? normalizeHistoryUrl(page.url), index + 1);
    });
    writtenPages = await replacePageChunks(buildPageChunks(plan.pages, pageChunkSize));
    throwIfAborted(options.signal);
    await emitProgress(options, {
      stage: 'pages',
      rows: parsed.rows.length,
      pages: plan.pages.length,
      visits: plan.visits.length,
      writtenPages,
      writtenVisits: 0
    });
  } else {
    const writePages = options.pageWriteMode === 'upsert' ? upsertPages : addPages;

    for (let start = 0; start < plan.pages.length; start += pageChunkSize) {
      throwIfAborted(options.signal);
      const pages = await writePages(plan.pages.slice(start, start + pageChunkSize));
      for (const page of pages) {
        pageIds.set(page.normalizedUrl, page.id);
      }
      writtenPages += pages.length;
      await emitProgress(options, {
        stage: 'pages',
        rows: parsed.rows.length,
        pages: plan.pages.length,
        visits: plan.visits.length,
        writtenPages,
        writtenVisits: 0
      });
    }
  }

  let writtenVisits = 0;
  const visitStorage = options.visitStorage ?? DEFAULT_VISIT_STORAGE;

  if (visitStorage === 'chunks') {
    const chunkSize = normalizeChunkSize(options.visitChunkSize, DEFAULT_VISIT_CHUNK_SIZE);
    throwIfAborted(options.signal);
    writtenVisits = await replaceVisitChunks(buildVisitChunks(plan.visits, pageIds, chunkSize));
    throwIfAborted(options.signal);
    await emitProgress(options, {
      stage: 'visits',
      rows: parsed.rows.length,
      pages: plan.pages.length,
      visits: plan.visits.length,
      writtenPages,
      writtenVisits
    });
  } else {
    const chunkSize = normalizeChunkSize(options.visitChunkSize, DEFAULT_VISIT_CHUNK_SIZE);

    for (let start = 0; start < plan.visits.length; start += chunkSize) {
      throwIfAborted(options.signal);
      const chunk = plan.visits.slice(start, start + chunkSize).map((visit): VisitInput => {
        const pageId = pageIds.get(visit.normalizedUrl);
        if (pageId === undefined) {
          throw new Error(`Missing page id for normalized URL at row ${visit.sourceIndex}`);
        }

        return {
          pageId,
          visitTime: visit.visitTime,
          transition: visit.transition
        };
      });

      writtenVisits += await putVisits(chunk);
      await emitProgress(options, {
        stage: 'visits',
        rows: parsed.rows.length,
        pages: plan.pages.length,
        visits: plan.visits.length,
        writtenPages,
        writtenVisits
      });
    }
  }

  const result = {
    stage: 'done' as const,
    rows: parsed.rows.length,
    pages: plan.pages.length,
    visits: plan.visits.length,
    writtenPages,
    writtenVisits,
    errors: 0
  };
  await emitProgress(options, result);
  return result;
}

export function planHtuImport(rows: HtuImportRow[]): HtuImportPlan {
  const pages = new Map<string, PageInput>();
  const visits: HtuImportVisitDraft[] = [];

  rows.forEach((row, sourceIndex) => {
    const normalizedUrl = row.url;
    const existing = pages.get(normalizedUrl);
    const title = row.title ?? '';

    if (!existing) {
      pages.set(normalizedUrl, {
        url: row.url,
        normalizedUrl,
        title,
        visitCount: 1,
        lastVisitTime: row.visitTime
      });
    } else {
      const previousLastVisitTime = existing.lastVisitTime ?? 0;
      existing.visitCount = (existing.visitCount ?? 0) + 1;
      existing.lastVisitTime = Math.max(existing.lastVisitTime ?? 0, row.visitTime);
      if (row.visitTime >= previousLastVisitTime) {
        existing.url = row.url;
      }
      if (title && row.visitTime >= previousLastVisitTime) {
        existing.title = title;
      }
    }

    visits.push({
      normalizedUrl,
      visitTime: row.visitTime,
      transition: row.transition,
      title: row.title,
      sourceIndex
    });
  });

  return {
    pages: [...pages.values()],
    visits
  };
}

export function makeHtuVisitId(
  pageId: number,
  visitTime: number,
  transition: string,
  sourceIndex: number
): string {
  return `htu:${pageId}:${visitTime}:${transition}:${sourceIndex}`;
}

export function buildVisitChunks(
  visits: HtuImportVisitDraft[],
  pageIds: Map<string, number>,
  chunkSize = DEFAULT_VISIT_ARRAY_CHUNK_SIZE
): VisitChunkRecord[] {
  const rows = visits.map((visit) => {
    const pageId = pageIds.get(visit.normalizedUrl);
    if (pageId === undefined) {
      throw new Error(`Missing page id for normalized URL at row ${visit.sourceIndex}`);
    }

    return {
      pageId,
      visitTime: visit.visitTime,
      transitionCode: encodeTransition(visit.transition),
      title: visit.title ?? '',
      sourceIndex: visit.sourceIndex
    };
  });

  rows.sort((left, right) => left.visitTime - right.visitTime || left.sourceIndex - right.sourceIndex);

  const normalizedChunkSize = normalizeChunkSize(chunkSize, DEFAULT_VISIT_ARRAY_CHUNK_SIZE);
  const chunks: VisitChunkRecord[] = [];

  for (let start = 0; start < rows.length; start += normalizedChunkSize) {
    const rowsInChunk = rows.slice(start, start + normalizedChunkSize);
    const pageIdArray = new Uint32Array(rowsInChunk.length);
    const visitTimeArray = new Float64Array(rowsInChunk.length);
    const transitionCodeArray = new Uint8Array(rowsInChunk.length);
    const sourceIndexArray = new Uint32Array(rowsInChunk.length);
    const titles = new Array<string>(rowsInChunk.length);

    rowsInChunk.forEach((row, index) => {
      pageIdArray[index] = row.pageId;
      visitTimeArray[index] = row.visitTime;
      transitionCodeArray[index] = row.transitionCode;
      sourceIndexArray[index] = row.sourceIndex;
      titles[index] = row.title;
    });

    chunks.push({
      id: `visit-chunk:${chunks.length}`,
      minVisitTime: visitTimeArray[0] ?? 0,
      maxVisitTime: visitTimeArray[visitTimeArray.length - 1] ?? 0,
      count: rowsInChunk.length,
      pageIds: pageIdArray,
      visitTimes: visitTimeArray,
      transitionCodes: transitionCodeArray,
      sourceIndexes: sourceIndexArray,
      titles
    });
  }

  return chunks;
}

export function buildPageChunks(
  pages: PageInput[],
  chunkSize = DEFAULT_PAGE_ARRAY_CHUNK_SIZE
): PageChunkRecord[] {
  const normalizedChunkSize = normalizeChunkSize(chunkSize, DEFAULT_PAGE_ARRAY_CHUNK_SIZE);
  const chunks: PageChunkRecord[] = [];

  for (let start = 0; start < pages.length; start += normalizedChunkSize) {
    const pagesInChunk = pages.slice(start, start + normalizedChunkSize);
    const visitCounts = new Uint32Array(pagesInChunk.length);
    const lastVisitTimes = new Float64Array(pagesInChunk.length);

    pagesInChunk.forEach((page, index) => {
      visitCounts[index] = page.visitCount ?? 0;
      lastVisitTimes[index] = page.lastVisitTime ?? 0;
    });

    chunks.push({
      id: `page-chunk:${chunks.length}`,
      firstPageId: start + 1,
      count: pagesInChunk.length,
      urls: pagesInChunk.map((page) => page.url),
      normalizedUrls: pagesInChunk.map((page) => page.normalizedUrl ?? normalizeHistoryUrl(page.url)),
      titles: pagesInChunk.map((page) => page.title ?? ''),
      visitCounts,
      lastVisitTimes
    });
  }

  return chunks;
}

async function emitProgress(options: HtuImportOptions, progress: HtuImportProgress) {
  throwIfAborted(options.signal);
  await options.onProgress?.(progress);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function normalizeChunkSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
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
