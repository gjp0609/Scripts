import { parseHtuTsv } from '../htu/tsv.js';
import {
  normalizeHistoryUrl,
  putVisits,
  upsertPages
} from '../storage/database';
import type { PageInput, VisitInput } from '../storage/schema';

const DEFAULT_VISIT_CHUNK_SIZE = 5000;
const DEFAULT_PAGE_CHUNK_SIZE = 5000;

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
  visitChunkSize?: number;
  onProgress?: (progress: HtuImportProgress) => void | Promise<void>;
};

export async function importHtuText(
  text: string,
  options: HtuImportOptions = {}
): Promise<HtuImportResult> {
  const parsed = parseHtuTsv(text);
  if (parsed.errors.length > 0) {
    throw new Error(`HTU import failed: ${parsed.errors.length} invalid rows`);
  }

  const plan = planHtuImport(parsed.rows);
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
  let writtenPages = 0;

  for (let start = 0; start < plan.pages.length; start += pageChunkSize) {
    const pages = await upsertPages(plan.pages.slice(start, start + pageChunkSize));
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

  let writtenVisits = 0;
  const chunkSize = normalizeChunkSize(options.visitChunkSize, DEFAULT_VISIT_CHUNK_SIZE);

  for (let start = 0; start < plan.visits.length; start += chunkSize) {
    const chunk = plan.visits.slice(start, start + chunkSize).map((visit): VisitInput => {
      const pageId = pageIds.get(visit.normalizedUrl);
      if (pageId === undefined) {
        throw new Error(`Missing page id for normalized URL at row ${visit.sourceIndex}`);
      }

      return {
        id: makeHtuVisitId(pageId, visit.visitTime, visit.transition, visit.sourceIndex),
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
    const normalizedUrl = normalizeHistoryUrl(row.url);
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

async function emitProgress(options: HtuImportOptions, progress: HtuImportProgress) {
  await options.onProgress?.(progress);
}

function normalizeChunkSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}
