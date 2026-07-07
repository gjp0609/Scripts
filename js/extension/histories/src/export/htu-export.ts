import { serializeArchivedRows } from '../htu/tsv.js';
import { decodePageChunkRows, getPageChunks, getVisitChunks } from '../storage/database';
import type { PageChunkRecord, VisitChunkRecord } from '../storage/schema';

export type HtuArchivedExportRow = {
  pageId: number;
  url: string;
  visitTime: number;
  transition: string;
  title: string | null;
  sourceIndex: number;
};

export type HtuExportProgress = {
  stage: 'loading' | 'serializing' | 'done';
  pages: number;
  visits: number;
  writtenRows: number;
  bytes: number;
};

export type ExportHtuArchivedOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: HtuExportProgress) => void | Promise<void>;
};

export async function exportHtuArchivedTsv(
  options: ExportHtuArchivedOptions = {}
): Promise<{ text: string; progress: HtuExportProgress }> {
  throwIfAborted(options.signal);
  const [pageChunks, visitChunks] = await Promise.all([getPageChunks(), getVisitChunks()]);
  const pages = pageChunks.reduce((total, chunk) => total + chunk.count, 0);
  const visits = visitChunks.reduce((total, chunk) => total + chunk.count, 0);

  await emitProgress(options, {
    stage: 'loading',
    pages,
    visits,
    writtenRows: 0,
    bytes: 0
  });
  throwIfAborted(options.signal);

  const text = serializeHtuArchivedRows(pageChunks, visitChunks);
  const progress = {
    stage: 'done' as const,
    pages,
    visits,
    writtenRows: visits,
    bytes: text.length
  };
  await emitProgress(options, {
    ...progress,
    stage: 'serializing'
  });
  throwIfAborted(options.signal);
  await emitProgress(options, progress);
  return { text, progress };
}

export function serializeHtuArchivedRows(
  pageChunks: PageChunkRecord[],
  visitChunks: VisitChunkRecord[]
): string {
  const rows = buildHtuArchivedRows(pageChunks, visitChunks);
  return serializeArchivedRows(rows);
}

export function buildHtuArchivedRows(
  pageChunks: PageChunkRecord[],
  visitChunks: VisitChunkRecord[]
): HtuArchivedExportRow[] {
  const pageById = new Map<number, { url: string; title: string }>();

  for (const chunk of pageChunks) {
    for (const row of decodePageChunkRows(chunk)) {
      pageById.set(row.id, {
        url: row.url,
        title: row.title
      });
    }
  }

  const rows: HtuArchivedExportRow[] = [];
  for (const chunk of visitChunks) {
    for (let index = 0; index < chunk.count; index += 1) {
      const pageId = chunk.pageIds[index];
      const page = pageById.get(pageId);
      if (!page) {
        throw new Error(`Missing page metadata for pageId ${pageId}`);
      }

      rows.push({
        pageId,
        url: page.url,
        visitTime: chunk.visitTimes[index] ?? 0,
        transition: decodeTransition(chunk.transitionCodes[index] ?? 255),
        title: chunk.titles?.[index] ?? page.title ?? '',
        sourceIndex: chunk.sourceIndexes[index] ?? rows.length
      });
    }
  }

  rows.sort(
    (left, right) =>
      left.sourceIndex - right.sourceIndex ||
      left.visitTime - right.visitTime ||
      left.pageId - right.pageId
  );

  return rows;
}

export function makeHtuBackupFilename(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  const hour = pad2(now.getHours());
  const minute = pad2(now.getMinutes());
  const second = pad2(now.getSeconds());
  return `htu_backup_${year}${month}${day}_${hour}${minute}${second}.tsv`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

async function emitProgress(
  options: ExportHtuArchivedOptions,
  progress: HtuExportProgress
): Promise<void> {
  throwIfAborted(options.signal);
  await options.onProgress?.(progress);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function decodeTransition(code: number): string {
  switch (code) {
    case 0:
      return 'link';
    case 1:
      return 'typed';
    case 2:
      return 'auto_bookmark';
    case 3:
      return 'auto_subframe';
    case 4:
      return 'manual_subframe';
    case 5:
      return 'generated';
    case 6:
      return 'auto_toplevel';
    case 7:
      return 'form_submit';
    case 8:
      return 'reload';
    case 9:
      return 'keyword';
    case 10:
      return 'keyword_generated';
    default:
      return 'unknown';
  }
}
