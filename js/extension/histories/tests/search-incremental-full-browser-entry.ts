import { loadSqliteWasmSearchRuntime } from '../src/search/sqlite-wasm-runtime';
import type { SqliteSearchDatabase, SqliteSearchStatement } from '../src/search/search-engine';

type ParsedRow = {
  url: string;
  title: string;
  visitTime: number;
  sourceIndex: number;
};

type PageState = {
  rowId: number;
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
};

type MutationSummary = {
  visits: number;
  existingPageUpdates: number;
  newPages: number;
  titleChanges: number;
  metadataOnlyFtsSkips: number;
};

type BenchmarkOptions = {
  backupUrl?: string;
  holdoutDays?: number;
  queryIterations?: number;
  interleavedSearchSamples?: number;
  updateMetadataInFts?: boolean;
};

declare global {
  interface Window {
    runHistoriesIncrementalBenchmark: (options?: BenchmarkOptions) => Promise<unknown>;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUERIES = ['github', 'google', 'ruan'];

window.runHistoriesIncrementalBenchmark = async (options: BenchmarkOptions = {}) => {
  const backupUrl = options.backupUrl ?? '/backup.tsv';
  const holdoutDays = normalizePositiveNumber(options.holdoutDays, 7);
  const queryIterations = normalizePositiveInteger(options.queryIterations, 12);
  const interleavedSearchSamples = normalizePositiveInteger(options.interleavedSearchSamples, 20);
  const updateMetadataInFts = options.updateMetadataInFts !== false;
  const totalStarted = performance.now();

  const scanStarted = performance.now();
  let sourceValidVisits = 0;
  let totalVisits = 0;
  let excludedDataImageVisits = 0;
  let maxVisitTime = 0;
  await streamRows(backupUrl, (row) => {
    sourceValidVisits += 1;
    if (isExcludedUrl(row.url)) {
      excludedDataImageVisits += 1;
      return;
    }
    totalVisits += 1;
    maxVisitTime = Math.max(maxVisitTime, row.visitTime);
  });
  const firstScanMs = performance.now() - scanStarted;
  if (totalVisits === 0 || maxVisitTime === 0) {
    throw new Error('The HTU backup did not contain valid visits.');
  }

  const cutoffTime = maxVisitTime - holdoutDays * DAY_MS;
  const baselinePages = new Map<string, Omit<PageState, 'rowId'>>();
  const heldoutRows: ParsedRow[] = [];
  let baselineVisits = 0;

  const partitionStarted = performance.now();
  await streamRows(backupUrl, (row) => {
    if (isExcludedUrl(row.url)) return;
    if (row.visitTime > cutoffTime) {
      heldoutRows.push(row);
      return;
    }
    baselineVisits += 1;
    upsertAggregatedPage(baselinePages, row);
  });
  heldoutRows.sort((left, right) => left.visitTime - right.visitTime || left.sourceIndex - right.sourceIndex);
  const partitionMs = performance.now() - partitionStarted;
  if (heldoutRows.length === 0) {
    throw new Error(`No visits were held out for the latest ${holdoutDays} days.`);
  }

  const heldoutUrls = new Set(heldoutRows.map((row) => row.url));
  const runtime = await loadSqliteWasmSearchRuntime({ scriptUrl: '/sqlite/sqlite3.js' });
  let database = runtime.openMemoryDatabase();
  createSchema(database);

  const baselineStates = new Map<string, PageState>();
  const buildStarted = performance.now();
  database.exec('BEGIN');
  const insert = database.prepare(
    'INSERT INTO pages_fts(rowid, search_text, url, title, visit_count, last_visit_time) VALUES(?, ?, ?, ?, ?, ?)'
  );
  let nextRowId = 0;
  try {
    for (const page of baselinePages.values()) {
      nextRowId += 1;
      executeStatement(
        insert,
        [
          nextRowId,
          normalizeSearchText(page.url, page.title),
          page.url,
          page.title,
          page.visitCount,
          page.lastVisitTime
        ]
      );
      if (heldoutUrls.has(page.url)) {
        baselineStates.set(page.url, { ...page, rowId: nextRowId });
      }
      if (nextRowId % 5000 === 0) await yieldToBrowser();
    }
  } finally {
    insert.finalize();
  }
  database.exec('COMMIT');
  const buildMs = performance.now() - buildStarted;
  const baselinePageCount = nextRowId;
  baselinePages.clear();

  const baselineQueries = measureQueries(database, DEFAULT_QUERIES, queryIterations);
  const snapshotDb = await openSnapshotDb();
  const baselineSnapshot = await saveSnapshot(runtime, database, snapshotDb, 'baseline');

  const gradualStates = cloneStates(baselineStates);
  const gradual = await applyGradually({
    database,
    rows: heldoutRows,
    states: gradualStates,
    nextRowId,
    queryTerms: DEFAULT_QUERIES,
    interleavedSearchSamples,
    updateMetadataInFts
  });
  nextRowId = gradual.nextRowId;
  const afterGradualQueries = measureQueries(database, DEFAULT_QUERIES, queryIterations);

  database.close();
  const baselineLoad = await loadSnapshot(runtime, snapshotDb, 'baseline');
  database = baselineLoad.database;
  const replayStates = cloneStates(baselineStates);
  const replay = applyBatch(database, heldoutRows, replayStates, baselinePageCount, updateMetadataInFts);
  const afterReplayQueries = measureQueries(database, DEFAULT_QUERIES, queryIterations);

  const checkpoint = await saveSnapshot(runtime, database, snapshotDb, 'checkpoint');
  database.close();
  const checkpointLoad = await loadSnapshot(runtime, snapshotDb, 'checkpoint');
  database = checkpointLoad.database;
  const afterCheckpointQueries = measureQueries(database, DEFAULT_QUERIES, queryIterations);
  const finalPageCount = selectCount(database, 'SELECT COUNT(*) FROM pages_fts');
  database.close();
  snapshotDb.close();

  return {
    dataset: {
      sourceValidVisits,
      totalVisits,
      excludedDataImageVisits,
      baselineVisits,
      baselinePages: baselinePageCount,
      heldoutVisits: heldoutRows.length,
      heldoutDistinctUrls: heldoutUrls.size,
      cutoffTime,
      maxVisitTime,
      holdoutDays
    },
    indexPolicy: {
      updateMetadataInFts
    },
    preparation: {
      firstScanMs,
      partitionMs,
      buildMs
    },
    baselineSnapshot,
    gradual: {
      totalMs: gradual.totalMs,
      perVisitMs: summarizeDurations(gradual.visitDurations),
      interleavedSearchMs: summarizeDurations(gradual.searchDurations),
      mutations: gradual.mutations
    },
    baselineLoad: withoutDatabase(baselineLoad),
    replay: {
      totalMs: replay.totalMs,
      perVisitMs: replay.totalMs / heldoutRows.length,
      mutations: replay.mutations
    },
    checkpoint,
    checkpointLoad: withoutDatabase(checkpointLoad),
    queries: {
      baseline: baselineQueries,
      afterGradual: afterGradualQueries,
      afterReplay: afterReplayQueries,
      afterCheckpoint: afterCheckpointQueries
    },
    finalPageCount,
    totalMs: performance.now() - totalStarted
  };
};

async function applyGradually(options: {
  database: SqliteSearchDatabase;
  rows: ParsedRow[];
  states: Map<string, PageState>;
  nextRowId: number;
  queryTerms: string[];
  interleavedSearchSamples: number;
  updateMetadataInFts: boolean;
}) {
  const statements = prepareMutationStatements(options.database);
  const visitDurations: number[] = [];
  const searchDurations: number[] = [];
  const mutations = emptyMutationSummary();
  const searchEvery = Math.max(1, Math.floor(options.rows.length / options.interleavedSearchSamples));
  let nextRowId = options.nextRowId;
  const started = performance.now();

  try {
    for (let index = 0; index < options.rows.length; index += 1) {
      const visitStarted = performance.now();
      nextRowId = applyVisit(
        options.rows[index],
        options.states,
        nextRowId,
        statements,
        mutations,
        options.updateMetadataInFts
      );
      visitDurations.push(performance.now() - visitStarted);

      if ((index + 1) % searchEvery === 0) {
        const query = options.queryTerms[Math.floor(index / searchEvery) % options.queryTerms.length];
        searchDurations.push(measureSingleQuery(options.database, query).ms);
        await yieldToBrowser();
      }
    }
  } finally {
    finalizeMutationStatements(statements);
  }

  return {
    totalMs: performance.now() - started,
    visitDurations,
    searchDurations,
    mutations,
    nextRowId
  };
}

function applyBatch(
  database: SqliteSearchDatabase,
  rows: ParsedRow[],
  states: Map<string, PageState>,
  nextRowId: number,
  updateMetadataInFts: boolean
) {
  const statements = prepareMutationStatements(database);
  const mutations = emptyMutationSummary();
  const started = performance.now();
  database.exec('BEGIN');
  try {
    for (const row of rows) {
      nextRowId = applyVisit(row, states, nextRowId, statements, mutations, updateMetadataInFts);
    }
  } finally {
    finalizeMutationStatements(statements);
  }
  database.exec('COMMIT');
  return { totalMs: performance.now() - started, mutations, nextRowId };
}

function applyVisit(
  row: ParsedRow,
  states: Map<string, PageState>,
  nextRowId: number,
  statements: ReturnType<typeof prepareMutationStatements>,
  mutations: MutationSummary,
  updateMetadataInFts: boolean
) {
  mutations.visits += 1;
  const existing = states.get(row.url);
  if (!existing) {
    const state: PageState = {
      rowId: nextRowId + 1,
      url: row.url,
      title: row.title || '',
      visitCount: 1,
      lastVisitTime: row.visitTime
    };
    executeStatement(statements.insert, [
      state.rowId,
      normalizeSearchText(state.url, state.title),
      state.url,
      state.title,
      state.visitCount,
      state.lastVisitTime
    ]);
    states.set(row.url, state);
    mutations.newPages += 1;
    return state.rowId;
  }

  existing.visitCount += 1;
  existing.lastVisitTime = Math.max(existing.lastVisitTime, row.visitTime);
  if (row.title && row.title !== existing.title) {
    existing.title = row.title;
    mutations.titleChanges += 1;
    executeStatement(statements.updateText, [
      normalizeSearchText(existing.url, existing.title),
      existing.url,
      existing.title,
      existing.visitCount,
      existing.lastVisitTime,
      existing.rowId
    ]);
  } else if (updateMetadataInFts) {
    executeStatement(statements.updateMetadata, [
      existing.visitCount,
      existing.lastVisitTime,
      existing.rowId
    ]);
  } else {
    mutations.metadataOnlyFtsSkips += 1;
  }
  mutations.existingPageUpdates += 1;
  return nextRowId;
}

function prepareMutationStatements(database: SqliteSearchDatabase) {
  return {
    insert: database.prepare(
      'INSERT INTO pages_fts(rowid, search_text, url, title, visit_count, last_visit_time) VALUES(?, ?, ?, ?, ?, ?)'
    ),
    updateMetadata: database.prepare(
      'UPDATE pages_fts SET visit_count = ?, last_visit_time = ? WHERE rowid = ?'
    ),
    updateText: database.prepare(
      'UPDATE pages_fts SET search_text = ?, url = ?, title = ?, visit_count = ?, last_visit_time = ? WHERE rowid = ?'
    )
  };
}

function finalizeMutationStatements(statements: ReturnType<typeof prepareMutationStatements>) {
  statements.insert.finalize();
  statements.updateMetadata.finalize();
  statements.updateText.finalize();
}

function measureQueries(database: SqliteSearchDatabase, terms: string[], iterations: number) {
  const durations: number[] = [];
  let returnedRows = 0;
  let totalMatches = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const term of terms) {
      const result = measureSingleQuery(database, term);
      durations.push(result.ms);
      returnedRows += result.returnedRows;
      totalMatches += result.totalMatches;
    }
  }
  return {
    samples: durations.length,
    durationsMs: summarizeDurations(durations),
    averageReturnedRows: returnedRows / durations.length,
    averageTotalMatches: totalMatches / durations.length
  };
}

function measureSingleQuery(database: SqliteSearchDatabase, term: string) {
  const started = performance.now();
  const match = `"${term.replaceAll('"', '""')}"`;
  const rows = database.prepare(`
    SELECT rowid
    FROM pages_fts
    WHERE pages_fts MATCH ?
    ORDER BY CAST(last_visit_time AS REAL) DESC, rowid DESC
    LIMIT 50
  `);
  let returnedRows = 0;
  try {
    rows.bind([match]);
    while (rows.step()) returnedRows += 1;
  } finally {
    rows.finalize();
  }

  const count = database.prepare('SELECT COUNT(*) FROM pages_fts WHERE pages_fts MATCH ?');
  let totalMatches = 0;
  try {
    count.bind([match]);
    if (count.step()) totalMatches = Number(count.get([])[0] ?? 0);
  } finally {
    count.finalize();
  }
  return { ms: performance.now() - started, returnedRows, totalMatches };
}

async function saveSnapshot(
  runtime: Awaited<ReturnType<typeof loadSqliteWasmSearchRuntime>>,
  database: SqliteSearchDatabase,
  idb: IDBDatabase,
  key: string
) {
  const started = performance.now();
  const exportStarted = performance.now();
  const bytes = runtime.exportDatabase(database);
  const exportMs = performance.now() - exportStarted;
  const putStarted = performance.now();
  await idbPut(idb, { key, bytes });
  const putMs = performance.now() - putStarted;
  return { bytes: bytes.byteLength, exportMs, putMs, totalMs: performance.now() - started };
}

async function loadSnapshot(
  runtime: Awaited<ReturnType<typeof loadSqliteWasmSearchRuntime>>,
  idb: IDBDatabase,
  key: string
) {
  const started = performance.now();
  const getStarted = performance.now();
  const snapshot = await idbGet(idb, key);
  const getMs = performance.now() - getStarted;
  if (!snapshot?.bytes?.byteLength) throw new Error(`Missing ${key} snapshot.`);
  const openStarted = performance.now();
  const database = runtime.openSnapshotDatabase(snapshot.bytes);
  const pages = selectCount(database, 'SELECT COUNT(*) FROM pages_fts');
  const openMs = performance.now() - openStarted;
  return { database, bytes: snapshot.bytes.byteLength, pages, getMs, openMs, totalMs: performance.now() - started };
}

function withoutDatabase(result: Awaited<ReturnType<typeof loadSnapshot>>) {
  return {
    bytes: result.bytes,
    pages: result.pages,
    getMs: result.getMs,
    openMs: result.openMs,
    totalMs: result.totalMs
  };
}

async function streamRows(url: string, onRow: (row: ParsedRow) => void) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Unable to fetch HTU backup: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sourceIndex = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r\n|\n\r|\r|\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      const parsed = parseLine(line, sourceIndex);
      sourceIndex += 1;
      if (parsed) onRow(parsed);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseLine(buffer, sourceIndex);
    if (parsed) onRow(parsed);
  }
}

function parseLine(line: string, sourceIndex: number): ParsedRow | undefined {
  const columns = line.split('\t');
  if (columns.length !== 3 && columns.length !== 4 && columns.length !== 8) return undefined;
  const url = columns[0];
  const rawVisitTime = columns.length === 8 ? columns[3] : columns[1];
  const title = columns.length === 8 ? columns[7] : columns[3] ?? '';
  if (!url || !/^U?\d+(?:\.\d+)?$/.test(rawVisitTime)) return undefined;
  const visitTime = rawVisitTime.startsWith('U')
    ? Number.parseFloat(rawVisitTime.slice(1))
    : (Number(rawVisitTime) - 11644473600000000) / 1000;
  if (!Number.isFinite(visitTime)) return undefined;
  return { url, title, visitTime, sourceIndex };
}

function upsertAggregatedPage(pages: Map<string, Omit<PageState, 'rowId'>>, row: ParsedRow) {
  const existing = pages.get(row.url);
  if (!existing) {
    pages.set(row.url, {
      url: row.url,
      title: row.title || '',
      visitCount: 1,
      lastVisitTime: row.visitTime
    });
    return;
  }
  existing.visitCount += 1;
  if (row.visitTime >= existing.lastVisitTime) {
    existing.lastVisitTime = row.visitTime;
    if (row.title) existing.title = row.title;
  }
}

function createSchema(database: SqliteSearchDatabase) {
  database.exec([
    'PRAGMA temp_store = MEMORY;',
    'PRAGMA journal_mode = OFF;',
    'PRAGMA synchronous = OFF;',
    "CREATE VIRTUAL TABLE pages_fts USING fts5(search_text, url UNINDEXED, title UNINDEXED, visit_count UNINDEXED, last_visit_time UNINDEXED, tokenize='trigram');"
  ]);
}

function normalizeSearchText(url: string, title: string) {
  return `${url} ${safeDecodeUrl(url)} ${title}`.toLowerCase().normalize('NFKC');
}

function safeDecodeUrl(url: string) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function isExcludedUrl(url: string) {
  return url.trimStart().toLowerCase().startsWith('data:image/');
}

function executeStatement(statement: SqliteSearchStatement, values: unknown[]) {
  statement.bind(values);
  if (statement.stepReset) statement.stepReset();
  else {
    statement.step();
    statement.reset?.();
  }
}

function selectCount(database: SqliteSearchDatabase, sql: string) {
  const statement = database.prepare(sql);
  try {
    return statement.step() ? Number(statement.get([])[0] ?? 0) : 0;
  } finally {
    statement.finalize();
  }
}

function cloneStates(states: Map<string, PageState>) {
  return new Map([...states].map(([url, state]) => [url, { ...state }]));
}

function emptyMutationSummary(): MutationSummary {
  return {
    visits: 0,
    existingPageUpdates: 0,
    newPages: 0,
    titleChanges: 0,
    metadataOnlyFtsSkips: 0
  };
}

function summarizeDurations(values: number[]) {
  if (values.length === 0) return { samples: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length
  };
}

function percentile(sorted: number[], ratio: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Math.max(1, Math.floor(normalizePositiveNumber(value, fallback)));
}

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value as number) > 0 ? Number(value) : fallback;
}

function openSnapshotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('histories-incremental-index-benchmark-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('snapshots')) {
        request.result.createObjectStore('snapshots', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(idb: IDBDatabase, value: { key: string; bytes: Uint8Array }) {
  return new Promise<void>((resolve, reject) => {
    const transaction = idb.transaction('snapshots', 'readwrite', { durability: 'relaxed' });
    transaction.objectStore('snapshots').put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Snapshot write aborted.'));
  });
}

function idbGet(idb: IDBDatabase, key: string): Promise<{ key: string; bytes: Uint8Array } | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction('snapshots', 'readonly');
    const request = transaction.objectStore('snapshots').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export {};
