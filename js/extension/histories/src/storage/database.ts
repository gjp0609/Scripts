import {
  DATABASE_NAME,
  DATABASE_VERSION,
  type JobRecord,
  type PageChunkRecord,
  type PageInput,
  type PageRecord,
  type SearchSnapshotRecord,
  type VisitChunkRecord,
  type VisitInput,
  type VisitRecord
} from './schema';

export type HistoriesDatabase = IDBDatabase;

const MAX_TIME = Number.MAX_SAFE_INTEGER;

export type PageChunkRow = {
  id: number;
  url: string;
  normalizedUrl: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
  chunkId: string;
  chunkIndex: number;
};

export type VisitChunkRow = {
  id: string;
  pageId: number;
  visitTime: number;
  transition: string;
  sourceIndex: number;
  chunkId: string;
  chunkIndex: number;
};

export type PageVisitStats = {
  pageId: number;
  matchedVisitCount: number;
  matchedVisitTime: number;
};

export function openHistoriesDatabase(): Promise<HistoriesDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      migrate(request.result, event.oldVersion);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function upsertPage(input: PageInput): Promise<PageRecord> {
  const [record] = await upsertPages([input]);
  return record;
}

export async function addPages(inputs: PageInput[]): Promise<PageRecord[]> {
  if (inputs.length === 0) return [];

  const mergedInputs = mergePageInputs(inputs);
  const db = await openHistoriesDatabase();

  try {
    const now = Date.now();
    const transaction = db.transaction('pages', 'readwrite');
    const store = transaction.objectStore('pages');
    const pendingAdds: Array<{
      recordWithoutId: Omit<PageRecord, 'id'>;
      idPromise: Promise<IDBValidKey>;
    }> = [];

    for (const input of mergedInputs) {
      const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
      const urlParts = parseUrlParts(input.url);
      const recordWithoutId = {
        url: input.url,
        normalizedUrl,
        title: input.title ?? '',
        host: urlParts.host,
        domain: urlParts.domain,
        visitCount: input.visitCount ?? 0,
        lastVisitTime: input.lastVisitTime ?? 0,
        createdAt: now,
        updatedAt: now
      };
      pendingAdds.push({
        recordWithoutId,
        idPromise: requestToPromise(store.add(recordWithoutId))
      });
    }

    const results: PageRecord[] = [];
    for (const pendingAdd of pendingAdds) {
      results.push({
        id: Number(await pendingAdd.idPromise),
        ...pendingAdd.recordWithoutId
      });
    }

    await transactionDone(transaction);
    return results;
  } finally {
    db.close();
  }
}

export async function upsertPages(inputs: PageInput[]): Promise<PageRecord[]> {
  if (inputs.length === 0) return [];

  const mergedInputs = mergePageInputs(inputs);
  const db = await openHistoriesDatabase();

  try {
    const now = Date.now();
    const transaction = db.transaction('pages', 'readwrite');
    const store = transaction.objectStore('pages');
    const index = store.index('normalizedUrl');
    const existingRecords = await Promise.all(
      mergedInputs.map((input) =>
        requestToPromise(index.get(input.normalizedUrl ?? normalizeHistoryUrl(input.url)))
      )
    );
    const results: PageRecord[] = [];
    const pendingAdds: Array<{
      recordWithoutId: Omit<PageRecord, 'id'>;
      idPromise: Promise<IDBValidKey>;
      resultIndex: number;
    }> = [];

    for (let indexOffset = 0; indexOffset < mergedInputs.length; indexOffset += 1) {
      const input = mergedInputs[indexOffset];
      const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
      const urlParts = parseUrlParts(input.url);
      const existing = existingRecords[indexOffset] as PageRecord | undefined;

      if (existing) {
        const nextRecord: PageRecord = {
          ...existing,
          url: input.url,
          normalizedUrl,
          title: input.title ?? existing.title,
          host: urlParts.host,
          domain: urlParts.domain,
          visitCount: input.visitCount ?? existing.visitCount,
          lastVisitTime:
            input.lastVisitTime === undefined
              ? existing.lastVisitTime
              : Math.max(existing.lastVisitTime, input.lastVisitTime),
          updatedAt: now
        };

        store.put(nextRecord);
        results.push(nextRecord);
        continue;
      }

      const recordWithoutId = {
        url: input.url,
        normalizedUrl,
        title: input.title ?? '',
        host: urlParts.host,
        domain: urlParts.domain,
        visitCount: input.visitCount ?? 0,
        lastVisitTime: input.lastVisitTime ?? 0,
        createdAt: now,
        updatedAt: now
      };
      const resultIndex = results.length;
      results.push(undefined as unknown as PageRecord);
      pendingAdds.push({
        recordWithoutId,
        idPromise: requestToPromise(store.add(recordWithoutId)),
        resultIndex
      });
    }

    for (const pendingAdd of pendingAdds) {
      const id = Number(await pendingAdd.idPromise);
      results[pendingAdd.resultIndex] = {
        id,
        ...pendingAdd.recordWithoutId
      };
    }

    await transactionDone(transaction);
    return results;
  } finally {
    db.close();
  }
}

export async function replacePageChunks(chunks: PageChunkRecord[]): Promise<number> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('pageChunks', 'readwrite');
    const store = transaction.objectStore('pageChunks');
    store.clear();

    for (const chunk of chunks) {
      store.put(chunk);
    }

    await transactionDone(transaction);
    return chunks.reduce((total, chunk) => total + chunk.count, 0);
  } finally {
    db.close();
  }
}

export async function getPageChunks(): Promise<PageChunkRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('pageChunks', 'readonly');
    return await readCursor<PageChunkRecord>(transaction.objectStore('pageChunks'), undefined, {
      limit: Number.POSITIVE_INFINITY
    });
  } finally {
    db.close();
  }
}

export async function getPageFromChunksById(pageId: number): Promise<PageChunkRow | undefined> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('pageChunks', 'readonly');
    const index = transaction.objectStore('pageChunks').index('firstPageId');
    const chunk = (await readFirstCursor<PageChunkRecord>(
      index,
      IDBKeyRange.upperBound(pageId),
      'prev'
    )) as PageChunkRecord | undefined;

    if (!chunk || pageId < chunk.firstPageId || pageId >= chunk.firstPageId + chunk.count) {
      return undefined;
    }

    return decodePageChunkRow(chunk, pageId - chunk.firstPageId);
  } finally {
    db.close();
  }
}

export function decodePageChunkRows(chunk: PageChunkRecord): PageChunkRow[] {
  const rows: PageChunkRow[] = [];

  for (let index = 0; index < chunk.count; index += 1) {
    rows.push(decodePageChunkRow(chunk, index));
  }

  return rows;
}

export async function getPageById(id: number): Promise<PageRecord | undefined> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('pages', 'readonly');
    return (await requestToPromise(transaction.objectStore('pages').get(id))) as PageRecord | undefined;
  } finally {
    db.close();
  }
}

export async function getPageByNormalizedUrl(normalizedUrl: string): Promise<PageRecord | undefined> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('pages', 'readonly');
    return (await requestToPromise(
      transaction.objectStore('pages').index('normalizedUrl').get(normalizedUrl)
    )) as PageRecord | undefined;
  } finally {
    db.close();
  }
}

export async function putVisits(visits: VisitInput[]): Promise<number> {
  if (visits.length === 0) return 0;

  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visits', 'readwrite');
    const store = transaction.objectStore('visits');

    for (const visit of visits) {
      if (visit.id === undefined) {
        store.add(visit);
      } else {
        store.put(visit);
      }
    }

    await transactionDone(transaction);
    return visits.length;
  } finally {
    db.close();
  }
}

export async function replaceVisitChunks(chunks: VisitChunkRecord[]): Promise<number> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visitChunks', 'readwrite');
    const store = transaction.objectStore('visitChunks');
    store.clear();

    for (const chunk of chunks) {
      store.put(chunk);
    }

    await transactionDone(transaction);
    return chunks.reduce((total, chunk) => total + chunk.count, 0);
  } finally {
    db.close();
  }
}

export type VisitRangeQuery = {
  startTime?: number;
  endTime?: number;
  limit?: number;
  reverse?: boolean;
};

export async function getVisitChunks(): Promise<VisitChunkRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visitChunks', 'readonly');
    return await readCursor<VisitChunkRecord>(transaction.objectStore('visitChunks'), undefined, {
      limit: Number.POSITIVE_INFINITY
    });
  } finally {
    db.close();
  }
}

export async function getVisitChunksByTimeRange(
  query: VisitRangeQuery = {}
): Promise<VisitChunkRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visitChunks', 'readonly');
    return await readOverlappingVisitChunks(transaction.objectStore('visitChunks'), query);
  } finally {
    db.close();
  }
}

export async function getVisitsFromChunksByTimeRange(
  query: VisitRangeQuery = {}
): Promise<VisitChunkRow[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visitChunks', 'readonly');
    const chunks = await readOverlappingVisitChunks(transaction.objectStore('visitChunks'), query);
    const orderedChunks = query.reverse ? chunks.reverse() : chunks;
    const results: VisitChunkRow[] = [];
    const startTime = query.startTime ?? 0;
    const endTime = query.endTime ?? MAX_TIME;
    const limit = query.limit ?? 1000;

    for (const chunk of orderedChunks) {
      const rows = decodeVisitChunkRows(chunk);
      if (query.reverse) rows.reverse();

      for (const row of rows) {
        if (row.visitTime < startTime || row.visitTime > endTime) continue;
        results.push(row);
        if (results.length >= limit) return results;
      }
    }

    return results;
  } finally {
    db.close();
  }
}

export async function getPageVisitStatsFromChunksByTimeRange(
  query: VisitRangeQuery = {},
  pageIds?: Iterable<number>
): Promise<PageVisitStats[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visitChunks', 'readonly');
    const chunks = await readOverlappingVisitChunks(transaction.objectStore('visitChunks'), query);
    const startTime = query.startTime ?? 0;
    const endTime = query.endTime ?? MAX_TIME;
    const pageIdFilter = pageIds ? new Set(pageIds) : undefined;
    const stats = new Map<number, PageVisitStats>();

    for (const chunk of chunks) {
      for (let index = 0; index < chunk.count; index += 1) {
        const pageId = chunk.pageIds[index];
        const visitTime = chunk.visitTimes[index];
        if (visitTime < startTime || visitTime > endTime) continue;
        if (pageIdFilter && !pageIdFilter.has(pageId)) continue;

        const existing = stats.get(pageId);
        if (existing) {
          existing.matchedVisitCount += 1;
          existing.matchedVisitTime = Math.max(existing.matchedVisitTime, visitTime);
          continue;
        }

        stats.set(pageId, {
          pageId,
          matchedVisitCount: 1,
          matchedVisitTime: visitTime
        });
      }
    }

    return [...stats.values()];
  } finally {
    db.close();
  }
}

export function decodeVisitChunkRows(chunk: VisitChunkRecord): VisitChunkRow[] {
  const rows: VisitChunkRow[] = [];

  for (let index = 0; index < chunk.count; index += 1) {
    rows.push({
      id: makeVisitChunkRowId(
        chunk.pageIds[index],
        chunk.visitTimes[index],
        chunk.transitionCodes[index],
        chunk.sourceIndexes[index]
      ),
      pageId: chunk.pageIds[index],
      visitTime: chunk.visitTimes[index],
      transition: decodeTransition(chunk.transitionCodes[index]),
      sourceIndex: chunk.sourceIndexes[index],
      chunkId: chunk.id,
      chunkIndex: index
    });
  }

  return rows;
}

export async function getVisitsByTimeRange(query: VisitRangeQuery = {}): Promise<VisitRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visits', 'readonly');
    const index = transaction.objectStore('visits').index('visitTime');
    return await readCursor<VisitRecord>(index, timeKeyRange(query), query);
  } finally {
    db.close();
  }
}

export async function getVisitsByPageAndTimeRange(
  pageId: number,
  query: VisitRangeQuery = {}
): Promise<VisitRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visits', 'readonly');
    const index = transaction.objectStore('visits').index('pageTime');
    const startTime = query.startTime ?? 0;
    const endTime = query.endTime ?? MAX_TIME;
    return await readCursor<VisitRecord>(
      index,
      IDBKeyRange.bound([pageId, startTime], [pageId, endTime]),
      query
    );
  } finally {
    db.close();
  }
}

export async function getVisitsByTransitionAndTimeRange(
  transition: string,
  query: VisitRangeQuery = {}
): Promise<VisitRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('visits', 'readonly');
    const index = transaction.objectStore('visits').index('transitionTime');
    const startTime = query.startTime ?? 0;
    const endTime = query.endTime ?? MAX_TIME;
    return await readCursor<VisitRecord>(
      index,
      IDBKeyRange.bound([transition, startTime], [transition, endTime]),
      query
    );
  } finally {
    db.close();
  }
}

export async function putJob(job: JobRecord): Promise<void> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('jobs', 'readwrite');
    transaction.objectStore('jobs').put(job);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('jobs', 'readonly');
    return (await requestToPromise(transaction.objectStore('jobs').get(id))) as JobRecord | undefined;
  } finally {
    db.close();
  }
}

export async function listJobs(limit = 20): Promise<JobRecord[]> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('jobs', 'readonly');
    const results = await readCursor<JobRecord>(transaction.objectStore('jobs'), undefined, {
      limit: Number.POSITIVE_INFINITY
    });
    results.sort((left, right) => right.updatedAt - left.updatedAt);
    return results.slice(0, limit);
  } finally {
    db.close();
  }
}

export async function putSearchSnapshot(snapshot: SearchSnapshotRecord): Promise<void> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('searchSnapshot', 'readwrite');
    transaction.objectStore('searchSnapshot').put(snapshot);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function getLatestSearchSnapshot(): Promise<SearchSnapshotRecord | undefined> {
  const db = await openHistoriesDatabase();

  try {
    const transaction = db.transaction('searchSnapshot', 'readonly');
    return (await requestToPromise(
      transaction.objectStore('searchSnapshot').get('latest')
    )) as SearchSnapshotRecord | undefined;
  } finally {
    db.close();
  }
}

export type DatabaseSummary = {
  pages: number;
  pageChunks: number;
  visits: number;
  visitChunks: number;
  jobs: number;
  hasSearchSnapshot: boolean;
};

export async function getDatabaseSummary(): Promise<DatabaseSummary> {
  const db = await openHistoriesDatabase();

  try {
    const [pages, pageChunkSummary, visits, chunkSummary, jobs, snapshots] = await Promise.all([
      countStore(db, 'pages'),
      getPageChunkSummary(db),
      countStore(db, 'visits'),
      getVisitChunkSummary(db),
      countStore(db, 'jobs'),
      countStore(db, 'searchSnapshot')
    ]);

    return {
      pages: pages + pageChunkSummary.pages,
      pageChunks: pageChunkSummary.chunks,
      visits: visits + chunkSummary.visits,
      visitChunks: chunkSummary.chunks,
      jobs,
      hasSearchSnapshot: snapshots > 0
    };
  } finally {
    db.close();
  }
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPageChunkSummary(db: IDBDatabase): Promise<{ chunks: number; pages: number }> {
  if (!db.objectStoreNames.contains('pageChunks')) {
    return Promise.resolve({ chunks: 0, pages: 0 });
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pageChunks', 'readonly');
    const request = transaction.objectStore('pageChunks').openCursor();
    let chunks = 0;
    let pages = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ chunks, pages });
        return;
      }

      const chunk = cursor.value as PageChunkRecord;
      chunks += 1;
      pages += chunk.count;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function getVisitChunkSummary(db: IDBDatabase): Promise<{ chunks: number; visits: number }> {
  if (!db.objectStoreNames.contains('visitChunks')) {
    return Promise.resolve({ chunks: 0, visits: 0 });
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('visitChunks', 'readonly');
    const request = transaction.objectStore('visitChunks').openCursor();
    let chunks = 0;
    let visits = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ chunks, visits });
        return;
      }

      const chunk = cursor.value as VisitChunkRecord;
      chunks += 1;
      visits += chunk.count;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function readCursor<T>(
  source: IDBIndex | IDBObjectStore,
  range: IDBKeyRange | undefined,
  query: VisitRangeQuery
): Promise<T[]> {
  const results: T[] = [];
  const direction = query.reverse ? 'prev' : 'next';
  const limit = query.limit ?? 1000;

  return new Promise((resolve, reject) => {
    const request = source.openCursor(range, direction);

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }

      results.push(cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function readFirstCursor<T>(
  source: IDBIndex | IDBObjectStore,
  range: IDBKeyRange | undefined,
  direction: IDBCursorDirection = 'next'
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = source.openCursor(range, direction);

    request.onsuccess = () => resolve(request.result?.value as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function readOverlappingVisitChunks(
  store: IDBObjectStore,
  query: VisitRangeQuery
): Promise<VisitChunkRecord[]> {
  const endTime = query.endTime ?? MAX_TIME;
  const startTime = query.startTime ?? 0;
  const range = IDBKeyRange.upperBound(endTime);
  const index = store.index('minVisitTime');

  return new Promise((resolve, reject) => {
    const chunks: VisitChunkRecord[] = [];
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(chunks);
        return;
      }

      const chunk = cursor.value as VisitChunkRecord;
      if (chunk.maxVisitTime >= startTime) {
        chunks.push(chunk);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function decodePageChunkRow(chunk: PageChunkRecord, index: number): PageChunkRow {
  return {
    id: chunk.firstPageId + index,
    url: chunk.urls[index] ?? '',
    normalizedUrl: chunk.normalizedUrls[index] ?? '',
    title: chunk.titles[index] ?? '',
    visitCount: chunk.visitCounts[index] ?? 0,
    lastVisitTime: chunk.lastVisitTimes[index] ?? 0,
    chunkId: chunk.id,
    chunkIndex: index
  };
}

function makeVisitChunkRowId(
  pageId: number,
  visitTime: number,
  transitionCode: number,
  sourceIndex: number
): string {
  return `chunk:${pageId}:${visitTime}:${transitionCode}:${sourceIndex}`;
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

function timeKeyRange(query: VisitRangeQuery): IDBKeyRange {
  return IDBKeyRange.bound(query.startTime ?? 0, query.endTime ?? MAX_TIME);
}

function mergePageInputs(inputs: PageInput[]): PageInput[] {
  const byNormalizedUrl = new Map<string, PageInput>();

  for (const input of inputs) {
    const normalizedUrl = input.normalizedUrl ?? normalizeHistoryUrl(input.url);
    const existing = byNormalizedUrl.get(normalizedUrl);

    if (!existing) {
      byNormalizedUrl.set(normalizedUrl, {
        ...input,
        normalizedUrl
      });
      continue;
    }

    byNormalizedUrl.set(normalizedUrl, {
      ...existing,
      url: input.url,
      title: input.title ?? existing.title,
      visitCount: input.visitCount ?? existing.visitCount,
      lastVisitTime:
        input.lastVisitTime === undefined
          ? existing.lastVisitTime
          : Math.max(existing.lastVisitTime ?? 0, input.lastVisitTime),
      normalizedUrl
    });
  }

  return [...byNormalizedUrl.values()];
}

export function normalizeHistoryUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url.trim();
  }
}

function parseUrlParts(url: string): { host: string; domain: string } {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split('.').filter(Boolean);
    const domain = parts.length >= 2 ? parts.slice(-2).join('.') : host;
    return { host, domain };
  } catch {
    return { host: '', domain: '' };
  }
}

function migrate(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    createPagesStore(db);

    createVisitsStore(db);

    db.createObjectStore('jobs', {
      keyPath: 'id'
    });

    db.createObjectStore('searchSnapshot', {
      keyPath: 'key'
    });
  } else if (oldVersion < 2) {
    if (db.objectStoreNames.contains('visits')) {
      db.deleteObjectStore('visits');
    }
    createVisitsStore(db);
  }

  if (oldVersion < 3 && !db.objectStoreNames.contains('visitChunks')) {
    const visitChunks = db.createObjectStore('visitChunks', {
      keyPath: 'id'
    });
    visitChunks.createIndex('minVisitTime', 'minVisitTime');
    visitChunks.createIndex('maxVisitTime', 'maxVisitTime');
  }

  if (oldVersion >= 1 && oldVersion < 4) {
    if (db.objectStoreNames.contains('pages')) {
      db.deleteObjectStore('pages');
    }
    createPagesStore(db);
  }

  if (oldVersion < 5 && !db.objectStoreNames.contains('pageChunks')) {
    const pageChunks = db.createObjectStore('pageChunks', {
      keyPath: 'id'
    });
    pageChunks.createIndex('firstPageId', 'firstPageId');
  }
}

function createPagesStore(db: IDBDatabase) {
  const pages = db.createObjectStore('pages', {
    keyPath: 'id',
    autoIncrement: true
  });
  pages.createIndex('normalizedUrl', 'normalizedUrl', { unique: true });
}

function createVisitsStore(db: IDBDatabase) {
  const visits = db.createObjectStore('visits', {
    keyPath: 'id',
    autoIncrement: true
  });
  visits.createIndex('visitTime', 'visitTime');
  visits.createIndex('pageTime', ['pageId', 'visitTime']);
  visits.createIndex('transitionTime', ['transition', 'visitTime']);
}
