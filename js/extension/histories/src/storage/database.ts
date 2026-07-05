import { DATABASE_NAME, DATABASE_VERSION } from './schema';

export type HistoriesDatabase = IDBDatabase;

export function openHistoriesDatabase(): Promise<HistoriesDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      migrate(request.result, request.oldVersion);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
