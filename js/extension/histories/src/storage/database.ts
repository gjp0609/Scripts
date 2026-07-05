import {
  DATABASE_NAME,
  DATABASE_VERSION,
  type JobRecord,
  type PageInput,
  type PageRecord,
  type SearchSnapshotRecord,
  type VisitInput,
  type VisitRecord
} from './schema';

export type HistoriesDatabase = IDBDatabase;

const MAX_TIME = Number.MAX_SAFE_INTEGER;

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
      const id = Number(await requestToPromise(store.add(recordWithoutId)));
      results.push({
        id,
        ...recordWithoutId
      });
    }

    await transactionDone(transaction);
    return results;
  } finally {
    db.close();
  }
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
      store.put(visit);
    }

    await transactionDone(transaction);
    return visits.length;
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
  visits: number;
  jobs: number;
  hasSearchSnapshot: boolean;
};

export async function getDatabaseSummary(): Promise<DatabaseSummary> {
  const db = await openHistoriesDatabase();

  try {
    const [pages, visits, jobs, snapshots] = await Promise.all([
      countStore(db, 'pages'),
      countStore(db, 'visits'),
      countStore(db, 'jobs'),
      countStore(db, 'searchSnapshot')
    ]);

    return {
      pages,
      visits,
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
  source: IDBIndex,
  range: IDBKeyRange,
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
    const pages = db.createObjectStore('pages', {
      keyPath: 'id',
      autoIncrement: true
    });
    pages.createIndex('normalizedUrl', 'normalizedUrl', { unique: true });
    pages.createIndex('host', 'host');
    pages.createIndex('domain', 'domain');
    pages.createIndex('lastVisitTime', 'lastVisitTime');

    const visits = db.createObjectStore('visits', {
      keyPath: 'id'
    });
    visits.createIndex('visitTime', 'visitTime');
    visits.createIndex('pageTime', ['pageId', 'visitTime']);
    visits.createIndex('transitionTime', ['transition', 'visitTime']);

    db.createObjectStore('jobs', {
      keyPath: 'id'
    });

    db.createObjectStore('searchSnapshot', {
      keyPath: 'key'
    });
  }
}
