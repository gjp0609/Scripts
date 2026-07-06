const DATABASE_NAME = 'histories';
const DATABASE_VERSION = 5;
const SEARCH_SCHEMA_VERSION = 1;
const SQLITE_SCRIPT_URL = '/sqlite/sqlite3.js';

const activeJobs = new Map();
let sqlite3Promise;

importScripts(SQLITE_SCRIPT_URL);

self.addEventListener('message', (event) => {
  void handleMessage(event.data);
});

async function handleMessage(message) {
  if (message?.type === 'start') {
    await startJob(message.jobId);
    return;
  }

  if (message?.type === 'cancel') {
    const job = activeJobs.get(message.jobId);
    if (job) job.cancelled = true;
  }
}

async function startJob(jobId) {
  if (!jobId || activeJobs.has(jobId)) return;

  const job = { cancelled: false };
  activeJobs.set(jobId, job);
  const startedAt = Date.now();
  await putJob({
    id: jobId,
    type: 'search-rebuild',
    status: 'queued',
    updatedAt: startedAt,
    progress: {
      stage: 'queued',
      pages: 0,
      writtenPages: 0
    }
  });
  postJobUpdate(jobId, 'queued');

  try {
    await putJob({
      id: jobId,
      type: 'search-rebuild',
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      progress: {
        stage: 'reset',
        pages: 0,
        writtenPages: 0
      }
    });

    const sqlite3 = await ensureSqlite3();
    throwIfCancelled(job);
    const db = new sqlite3.oo1.DB(':memory:');

    try {
      db.exec([
        'PRAGMA temp_store = MEMORY;',
        'PRAGMA journal_mode = OFF;',
        'PRAGMA synchronous = OFF;',
        "CREATE VIRTUAL TABLE pages_fts USING fts5(search_text, url UNINDEXED, title UNINDEXED, visit_count UNINDEXED, last_visit_time UNINDEXED, tokenize='trigram');"
      ]);
      await updateProgress(jobId, startedAt, {
        stage: 'reset',
        pages: 0,
        writtenPages: 0
      });

      const pageChunks = await getAllFromStore('pageChunks');
      throwIfCancelled(job);
      const totalPages = pageChunks.reduce((total, chunk) => total + chunk.count, 0);
      const statement = db.prepare(
        'INSERT INTO pages_fts(rowid, search_text, url, title, visit_count, last_visit_time) VALUES(?, ?, ?, ?, ?, ?)'
      );
      let writtenPages = 0;

      try {
        for (const chunk of pageChunks) {
          throwIfCancelled(job);
          for (let index = 0; index < chunk.count; index += 1) {
            throwIfCancelled(job);
            const pageId = chunk.firstPageId + index;
            const url = chunk.urls[index] || '';
            const title = chunk.titles[index] || '';
            statement.bind([
              pageId,
              normalizeSearchText(url, title),
              url,
              title,
              chunk.visitCounts[index] || 0,
              chunk.lastVisitTimes[index] || 0
            ]);
            if (statement.stepReset) statement.stepReset();
            else {
              statement.step();
              if (statement.reset) statement.reset();
            }
            writtenPages += 1;
          }

          await updateProgress(jobId, startedAt, {
            stage: 'pages',
            pages: totalPages,
            writtenPages
          });
        }
      } finally {
        statement.finalize();
      }

      throwIfCancelled(job);
      const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
      await updateProgress(jobId, startedAt, {
        stage: 'snapshot',
        pages: totalPages,
        writtenPages
      });
      throwIfCancelled(job);

      await putSearchSnapshot({
        key: 'latest',
        schemaVersion: SEARCH_SCHEMA_VERSION,
        sqliteVersion: sqlite3.version.libVersion,
        createdAt: Date.now(),
        sourceRevision: makeSourceRevision(pageChunks),
        bytes,
        pageCount: totalPages,
        snapshotSize: bytes.byteLength
      });

      const result = {
        pageCount: totalPages,
        snapshotSize: bytes.byteLength,
        sqliteVersion: sqlite3.version.libVersion
      };
      await putJob({
        id: jobId,
        type: 'search-rebuild',
        status: 'complete',
        startedAt,
        updatedAt: Date.now(),
        progress: result
      });
      postJobUpdate(jobId, 'complete', result);
    } finally {
      db.close();
    }
  } catch (error) {
    const status = isCancelled(job, error) ? 'cancelled' : 'failed';
    const previous = await getFromStore('jobs', jobId);
    await putJob({
      id: jobId,
      type: 'search-rebuild',
      status,
      startedAt,
      updatedAt: Date.now(),
      progress: previous ? previous.progress : undefined,
      error: status === 'failed' ? toErrorMessage(error) : undefined
    });
    postJobUpdate(jobId, status, undefined, status === 'failed' ? toErrorMessage(error) : undefined);
  } finally {
    activeJobs.delete(jobId);
  }
}

async function ensureSqlite3() {
  sqlite3Promise ||= self.sqlite3InitModule();
  return await sqlite3Promise;
}

async function updateProgress(jobId, startedAt, progress) {
  const status = progress.stage === 'done' ? 'complete' : 'running';
  await putJob({
    id: jobId,
    type: 'search-rebuild',
    status,
    startedAt,
    updatedAt: Date.now(),
    progress
  });
  postJobUpdate(jobId, status, progress);
}

function postJobUpdate(jobId, status, progress, error) {
  self.postMessage({
    type: 'job-update',
    jobId,
    status,
    progress,
    error
  });
}

function normalizeSearchText(url, title) {
  return `${url} ${safeDecodeUrl(url)} ${title || ''}`.toLowerCase().normalize('NFKC');
}

function safeDecodeUrl(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function makeSourceRevision(chunks) {
  const pages = chunks.reduce((total, chunk) => total + chunk.count, 0);
  const lastVisitTime = chunks.reduce((max, chunk) => {
    const values = Array.from(chunk.lastVisitTimes || []);
    return Math.max(max, values.length ? Math.max(...values) : 0);
  }, 0);
  return `page-chunks:${chunks.length}:pages:${pages}:last:${lastVisitTime}`;
}

function throwIfCancelled(job) {
  if (job.cancelled) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function isCancelled(job, error) {
  return job.cancelled || (error instanceof DOMException && error.name === 'AbortError');
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function openDatabase() {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      reject(new Error('Histories database is not initialized yet.'));
    };
  });
}

async function getAllFromStore(storeName) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function getFromStore(storeName, key) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function putJob(job) {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('jobs', 'readwrite');
      tx.objectStore('jobs').put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function putSearchSnapshot(snapshot) {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('searchSnapshot', 'readwrite');
      tx.objectStore('searchSnapshot').put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
