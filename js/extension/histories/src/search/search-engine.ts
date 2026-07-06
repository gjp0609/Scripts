export type SearchQuery = {
  keyword: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
};

export type SearchResult = {
  pageId: number;
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
};

export type SearchBuildProgress = {
  stage: 'reset' | 'pages' | 'snapshot' | 'done';
  pages: number;
  writtenPages: number;
};

export type SearchSnapshotInfo = {
  pageCount: number;
  snapshotSize: number;
  sqliteVersion: string;
};

export type SqliteSearchRuntime = {
  sqliteVersion: string;
  openMemoryDatabase: () => SqliteSearchDatabase;
  openSnapshotDatabase: (bytes: Uint8Array) => SqliteSearchDatabase;
  exportDatabase: (database: SqliteSearchDatabase) => Uint8Array;
};

export type SqliteSearchDatabase = {
  exec: (sql: string | string[]) => void;
  prepare: (sql: string) => SqliteSearchStatement;
  selectValue?: (sql: string) => unknown;
  close: () => void;
};

export type SqliteSearchStatement = {
  bind: (values: unknown[]) => SqliteSearchStatement;
  step: () => boolean;
  stepReset?: () => void;
  reset?: () => void;
  get: (target?: unknown[] | Record<string, unknown>) => unknown[];
  finalize: () => void;
};

export type SearchPageChunk = {
  id: string;
  firstPageId: number;
  count: number;
  urls: string[];
  normalizedUrls: string[];
  titles: string[];
  visitCounts: Uint32Array;
  lastVisitTimes: Float64Array;
};

export type SearchSnapshotRecord = {
  key: 'latest';
  schemaVersion: number;
  sqliteVersion: string;
  createdAt: number;
  sourceRevision: string;
  bytes: Uint8Array;
  pageCount: number;
  snapshotSize: number;
};

export type SearchStorage = {
  getPageChunks: () => Promise<SearchPageChunk[]>;
  putSearchSnapshot: (snapshot: SearchSnapshotRecord) => Promise<void>;
  getLatestSearchSnapshot: () => Promise<SearchSnapshotRecord | undefined>;
};

export type SearchEngineOptions = {
  storage: SearchStorage;
  runtime: SqliteSearchRuntime;
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (progress: SearchBuildProgress) => void | Promise<void>;
};

const SEARCH_SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 50;

export class SearchEngine {
  private database: SqliteSearchDatabase | undefined;
  private readonly storage: SearchStorage;
  private readonly runtime: SqliteSearchRuntime;
  private readonly now: () => number;
  private readonly signal?: AbortSignal;
  private readonly onProgress?: (progress: SearchBuildProgress) => void | Promise<void>;

  constructor(options: SearchEngineOptions) {
    this.storage = options.storage;
    this.runtime = options.runtime;
    this.now = options.now ?? Date.now;
    this.signal = options.signal;
    this.onProgress = options.onProgress;
  }

  async rebuildSnapshot(): Promise<SearchSnapshotInfo> {
    throwIfAborted(this.signal);
    this.createFreshDatabase(this.runtime.openMemoryDatabase());
    await this.emitProgress({ stage: 'reset', pages: 0, writtenPages: 0 });

    const pageChunks = await this.storage.getPageChunks();
    throwIfAborted(this.signal);
    const pageCount = pageChunks.reduce((total, chunk) => total + chunk.count, 0);
    const statement = this.requireDatabase().prepare(
      'INSERT INTO pages_fts(rowid, search_text, url, title, visit_count, last_visit_time) VALUES(?, ?, ?, ?, ?, ?)'
    );
    let writtenPages = 0;

    try {
      for (const chunk of pageChunks) {
        throwIfAborted(this.signal);
        for (let index = 0; index < chunk.count; index += 1) {
          throwIfAborted(this.signal);
          const pageId = chunk.firstPageId + index;
          const url = chunk.urls[index] ?? '';
          const title = chunk.titles[index] ?? '';
          executeInsert(
            statement.bind([
              pageId,
              normalizeSearchText(url, title),
              url,
              title,
              chunk.visitCounts[index] ?? 0,
              chunk.lastVisitTimes[index] ?? 0
            ])
          );
          writtenPages += 1;
        }

        await this.emitProgress({ stage: 'pages', pages: pageCount, writtenPages });
      }
    } finally {
      statement.finalize();
    }

    throwIfAborted(this.signal);
    const bytes = this.runtime.exportDatabase(this.requireDatabase());
    await this.emitProgress({ stage: 'snapshot', pages: pageCount, writtenPages });
    throwIfAborted(this.signal);
    await this.storage.putSearchSnapshot({
      key: 'latest',
      schemaVersion: SEARCH_SCHEMA_VERSION,
      sqliteVersion: this.runtime.sqliteVersion,
      createdAt: this.now(),
      sourceRevision: makeSourceRevision(pageChunks),
      bytes,
      pageCount,
      snapshotSize: bytes.byteLength
    });
    await this.emitProgress({ stage: 'done', pages: pageCount, writtenPages });

    return {
      pageCount,
      snapshotSize: bytes.byteLength,
      sqliteVersion: this.runtime.sqliteVersion
    };
  }

  async loadSnapshot(): Promise<void> {
    const snapshot = await this.storage.getLatestSearchSnapshot();
    if (!snapshot?.bytes?.byteLength) {
      throw new Error('No latest search snapshot is available.');
    }

    this.setDatabase(this.runtime.openSnapshotDatabase(snapshot.bytes));
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const keyword = normalizeKeyword(query.keyword);
    if (!keyword) return [];

    const database = this.requireDatabase();
    const timeWhere = buildPageTimeWhere(query.startTime, query.endTime);
    const limit = normalizeLimit(query.limit);
    const statement = database.prepare(`
      SELECT rowid, url, title, visit_count, last_visit_time
      FROM pages_fts
      WHERE pages_fts MATCH ?
      ${timeWhere.sql}
      ORDER BY CAST(visit_count AS INTEGER) DESC, CAST(last_visit_time AS REAL) DESC
      LIMIT ?
    `);
    const rows: SearchResult[] = [];

    try {
      statement.bind([makeFtsMatchQuery(keyword), ...timeWhere.binds, limit]);
      while (statement.step()) {
        rows.push(searchResultFromRow(statement.get([])));
      }
    } finally {
      statement.finalize();
    }

    return rows;
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  private createFreshDatabase(database: SqliteSearchDatabase): void {
    this.setDatabase(database);
    database.exec([
      'PRAGMA temp_store = MEMORY;',
      'PRAGMA journal_mode = OFF;',
      'PRAGMA synchronous = OFF;',
      "CREATE VIRTUAL TABLE pages_fts USING fts5(search_text, url UNINDEXED, title UNINDEXED, visit_count UNINDEXED, last_visit_time UNINDEXED, tokenize='trigram');"
    ]);
  }

  private setDatabase(database: SqliteSearchDatabase): void {
    this.close();
    this.database = database;
  }

  private requireDatabase(): SqliteSearchDatabase {
    if (!this.database) {
      throw new Error('Search snapshot is not loaded. Call loadSnapshot() or rebuildSnapshot() first.');
    }

    return this.database;
  }

  private async emitProgress(progress: SearchBuildProgress): Promise<void> {
    throwIfAborted(this.signal);
    await this.onProgress?.(progress);
  }
}

export function normalizeSearchText(url: string, title = ''): string {
  return `${url} ${safeDecodeUrl(url)} ${title}`.toLowerCase().normalize('NFKC');
}

export function normalizeKeyword(keyword: string): string {
  return String(keyword ?? '').trim().toLowerCase().normalize('NFKC');
}

export function makeFtsMatchQuery(keyword: string): string {
  return `"${keyword.replace(/"/g, '""')}"`;
}

function buildPageTimeWhere(startTime?: number, endTime?: number): { sql: string; binds: number[] } {
  const clauses: string[] = [];
  const binds: number[] = [];

  if (Number.isFinite(startTime)) {
    clauses.push('CAST(last_visit_time AS REAL) >= ?');
    binds.push(startTime as number);
  }
  if (Number.isFinite(endTime)) {
    clauses.push('CAST(last_visit_time AS REAL) <= ?');
    binds.push(endTime as number);
  }

  return {
    sql: clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '',
    binds
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || (limit as number) < 1) return DEFAULT_LIMIT;
  return Math.floor(limit as number);
}

function searchResultFromRow(row: unknown[]): SearchResult {
  return {
    pageId: Number(row[0]),
    url: String(row[1] ?? ''),
    title: String(row[2] ?? ''),
    visitCount: Number(row[3] ?? 0),
    lastVisitTime: Number(row[4] ?? 0)
  };
}

function executeInsert(statement: SqliteSearchStatement): void {
  if (statement.stepReset) {
    statement.stepReset();
    return;
  }

  statement.step();
  statement.reset?.();
}

function makeSourceRevision(chunks: SearchPageChunk[]): string {
  const pages = chunks.reduce((total, chunk) => total + chunk.count, 0);
  const lastVisitTime = chunks.reduce((max, chunk) => {
    const chunkMax = chunk.lastVisitTimes.length
      ? Math.max(...chunk.lastVisitTimes)
      : 0;
    return Math.max(max, chunkMax);
  }, 0);

  return `page-chunks:${chunks.length}:pages:${pages}:last:${lastVisitTime}`;
}

function safeDecodeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}
