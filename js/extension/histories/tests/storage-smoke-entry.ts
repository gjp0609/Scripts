import {
  decodePageChunkRows,
  decodeVisitChunkRows,
  getDatabaseSummary,
  getJob,
  getLatestSearchSnapshot,
  listJobs,
  getPageChunks,
  getPageById,
  getPageByNormalizedUrl,
  getPageFromChunksById,
  getPageVisitStatsFromChunksByTimeRange,
  getVisitChunks,
  getVisitChunksByTimeRange,
  getVisitsFromChunksByTimeRange,
  getVisitsByPageAndTimeRange,
  getVisitsByTimeRange,
  getVisitsByTransitionAndTimeRange,
  normalizeHistoryUrl,
  openHistoriesDatabase,
  putJob,
  putSearchSnapshot,
  putVisits,
  upsertPage
} from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';
import { importHtuText } from '../src/import/htu-import';

type SmokeResult = {
  pageCount: number;
  visitCount: number;
  rangeIds: IDBValidKey[];
  pageRangeIds: IDBValidKey[];
  transitionRangeIds: IDBValidKey[];
  reverseIds: IDBValidKey[];
  importRows: number;
  importPages: number;
  importVisits: number;
};

declare global {
  interface Window {
    runHistoriesStorageSmoke: () => Promise<SmokeResult>;
  }
}

window.runHistoriesStorageSmoke = async () => {
  await deleteDatabase(DATABASE_NAME);

  const page = await upsertPage({
    url: 'https://example.com/docs/index.html#section',
    title: 'Original title',
    visitCount: 1,
    lastVisitTime: 1000
  });
  ensure(page.id > 0, 'page id should be generated');
  ensure(page.normalizedUrl === 'https://example.com/docs/index.html', 'hash should be removed');
  ensure(page.host === 'example.com', 'host should be derived');
  ensure(page.domain === 'example.com', 'domain should be derived');

  const updatedPage = await upsertPage({
    url: 'https://example.com/docs/index.html',
    title: 'Updated title',
    visitCount: 2,
    lastVisitTime: 3000
  });
  ensure(updatedPage.id === page.id, 'normalized url should upsert existing page');
  ensure(updatedPage.title === 'Updated title', 'page title should update');
  ensure(updatedPage.lastVisitTime === 3000, 'last visit time should advance');

  const otherPage = await upsertPage({
    url: 'https://sub.example.org/path',
    title: 'Other page',
    visitCount: 2,
    lastVisitTime: 4000
  });

  await putVisits([
    { id: 'v-1000-link', pageId: page.id, visitTime: 1000, transition: 'link' },
    { id: 'v-2000-typed', pageId: page.id, visitTime: 2000, transition: 'typed' },
    { id: 'v-3000-link', pageId: otherPage.id, visitTime: 3000, transition: 'link' },
    { id: 'v-4000-reload', pageId: otherPage.id, visitTime: 4000, transition: 'reload' }
  ]);

  const byId = await getPageById(page.id);
  ensure(byId?.title === 'Updated title', 'getPageById should read updated page');

  const byNormalizedUrl = await getPageByNormalizedUrl(normalizeHistoryUrl(page.url));
  ensure(byNormalizedUrl?.id === page.id, 'getPageByNormalizedUrl should use normalizedUrl index');

  const timeRange = await getVisitsByTimeRange({ startTime: 1500, endTime: 3500 });
  ensureIds(
    timeRange.map((visit) => visit.id),
    ['v-2000-typed', 'v-3000-link'],
    'visitTime range should return ordered inclusive matches'
  );

  const pageRange = await getVisitsByPageAndTimeRange(page.id, { startTime: 0, endTime: 2500 });
  ensureIds(
    pageRange.map((visit) => visit.id),
    ['v-1000-link', 'v-2000-typed'],
    'pageTime range should stay inside one page'
  );

  const transitionRange = await getVisitsByTransitionAndTimeRange('link', {
    startTime: 0,
    endTime: 3500
  });
  ensureIds(
    transitionRange.map((visit) => visit.id),
    ['v-1000-link', 'v-3000-link'],
    'transitionTime range should stay inside one transition'
  );

  const reverse = await getVisitsByTimeRange({ limit: 2, reverse: true });
  ensureIds(
    reverse.map((visit) => visit.id),
    ['v-4000-reload', 'v-3000-link'],
    'reverse limited scan should read newest visits first'
  );

  await putJob({
    id: 'job-1',
    type: 'htu-import',
    status: 'running',
    updatedAt: 5000,
    progress: { rows: 10 }
  });
  ensure((await getJob('job-1'))?.status === 'running', 'job should round-trip');
  ensure((await listJobs(5))[0]?.id === 'job-1', 'listJobs should return the newest job record');

  await putSearchSnapshot({
    key: 'latest',
    schemaVersion: 1,
    sqliteVersion: '3.46.1',
    createdAt: 6000,
    sourceRevision: 'smoke',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 2,
    snapshotSize: 3
  });
  ensure((await getLatestSearchSnapshot())?.snapshotSize === 3, 'snapshot should round-trip');

  const summary = await getDatabaseSummary();
  ensure(summary.pages === 2, 'summary should count pages');
  ensure(summary.visits === 4, 'summary should count visits');
  ensure(summary.jobs === 1, 'summary should count jobs');
  ensure(summary.hasSearchSnapshot, 'summary should report snapshot');

  const db = await openHistoriesDatabase();
  db.close();

  return {
    pageCount: summary.pages,
    visitCount: summary.visits,
    rangeIds: timeRange.map((visit) => visit.id),
    pageRangeIds: pageRange.map((visit) => visit.id),
    transitionRangeIds: transitionRange.map((visit) => visit.id),
    reverseIds: reverse.map((visit) => visit.id),
    ...(await runImportSmoke())
  };
};

async function runImportSmoke() {
  await deleteDatabase(DATABASE_NAME);

  const progressStages: string[] = [];
  const source = [
    'https://example.com/imported\tU1000\t0\tOld imported title',
    'https://example.com/imported\tU3000\t1\tNew imported title',
    'https://example.org/other\tU2000\t8\tOther imported title',
    ''
  ].join('\r\n');
  const result = await importHtuText(source, {
    pageChunkSize: 1,
    visitChunkSize: 2,
    onProgress(progress) {
      progressStages.push(progress.stage);
    }
  });
  ensureIds(
    progressStages,
    ['parsed', 'pages', 'visits', 'done'],
    'import progress order'
  );

  const summary = await getDatabaseSummary();
  ensure(summary.pages === 2, 'import should write aggregated pages');
  ensure(summary.pageChunks === 2, 'import should write page chunks');
  ensure(summary.visits === 3, 'import should write visits');
  ensure(summary.visitChunks === 2, 'import should write visit chunks');

  const pageChunks = await getPageChunks();
  ensure(pageChunks.length === 2, 'import should preserve page chunk count');
  ensureIds(
    decodePageChunkRows(pageChunks[0]).map((page) => page.id),
    [1],
    'page chunk rows should expose stable page ids'
  );

  const importedPage = await getPageFromChunksById(1);
  ensure(importedPage?.url === 'https://example.com/imported', 'page chunk lookup should find page 1');
  ensure(importedPage.visitCount === 2, 'page chunk lookup should expose visit count');
  ensure(importedPage.lastVisitTime === 3000, 'page chunk lookup should expose last visit time');
  ensure((await getPageFromChunksById(99)) === undefined, 'page chunk lookup should miss unknown page');

  const visitChunks = await getVisitChunks();
  ensure(visitChunks.length === 2, 'import should preserve visit chunk count');
  ensureIds(
    decodeVisitChunkRows(visitChunks[0]).map((visit) => visit.visitTime),
    [1000, 2000],
    'visit chunk rows should decode in time order'
  );

  const overlappingVisitChunks = await getVisitChunksByTimeRange({ startTime: 1500, endTime: 2500 });
  ensure(overlappingVisitChunks.length === 1, 'time range should prefilter overlapping visit chunks');
  ensure(overlappingVisitChunks[0].id === 'visit-chunk:0', 'time range should keep matching chunk id');

  const pageVisitStats = await getPageVisitStatsFromChunksByTimeRange(
    { startTime: 1500, endTime: 3500 },
    [1, 2]
  );
  ensureIds(
    pageVisitStats.map((item) => item.pageId),
    [2, 1],
    'page visit stats should only include filtered pages with matching visits'
  );
  ensure(pageVisitStats[0].matchedVisitCount === 1, 'page visit stats should count matching visits');
  ensure(pageVisitStats[1].matchedVisitTime === 3000, 'page visit stats should track latest matching visit');

  const chunkTimeRange = await getVisitsFromChunksByTimeRange({ startTime: 1500, endTime: 3500 });
  ensureIds(
    chunkTimeRange.map((visit) => visit.visitTime),
    [2000, 3000],
    'chunk time range should return inclusive matches'
  );
  ensureIds(
    chunkTimeRange.map((visit) => visit.transition),
    ['reload', 'typed'],
    'chunk time range should decode transitions'
  );

  const reverseChunkTimeRange = await getVisitsFromChunksByTimeRange({ limit: 2, reverse: true });
  ensureIds(
    reverseChunkTimeRange.map((visit) => visit.visitTime),
    [3000, 2000],
    'reverse chunk time range should read newest visits first'
  );

  ensure(result.rows === 3, 'import result rows should match parsed rows');
  ensure(result.pages === 2, 'import result pages should match aggregated pages');
  ensure(result.visits === 3, 'import result visits should match planned visits');
  ensure(result.writtenVisits === 3, 'import result written visits should match storage writes');

  await deleteDatabase(DATABASE_NAME);

  return {
    importRows: result.rows,
    importPages: result.pages,
    importVisits: result.visits
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ensureIds(actual: IDBValidKey[], expected: IDBValidKey[], message: string) {
  ensure(actual.length === expected.length, `${message}: length mismatch`);

  for (let index = 0; index < expected.length; index += 1) {
    ensure(actual[index] === expected[index], `${message}: expected ${expected[index]} at ${index}`);
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
  });
}
